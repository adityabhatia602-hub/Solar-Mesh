"""Telemetry provider abstraction.

The market engine never generates or consumes readings directly — it talks to a
TelemetryProvider. Today the only implementation is the simulation provider
below; a future MQTTTelemetryProvider / SmartMeterTelemetryProvider can replace
it without touching market, matching, or settlement code.
"""
from __future__ import annotations

import math
import random
from abc import ABC, abstractmethod
from dataclasses import dataclass

# Peak solar window: sunrise ~06:00, sunset ~19:00, peak midday. Deterministic
# bell curve with small controlled noise, bounded by device capacity.
_SUNRISE = 6.0
_SUNSET = 19.0

# Weather multiplier options per time band (stable within a band, varies across).
_WEATHER_OPTIONS = [1.0, 0.85, 0.7, 0.95]


@dataclass
class SimulatedReading:
    """One simulated telemetry sample for a device."""

    production_kw: float
    consumption_kw: float
    battery_soc: float
    battery_kw: float
    voltage: float
    current: float
    power_kw: float


class TelemetryProvider(ABC):
    """Source of live device readings. Implement this to plug in real hardware."""

    @abstractmethod
    def generate(
        self,
        *,
        device_type: str,
        capacity_kwh: float,
        hour: float,
        prev_soc: float,
        tick_seconds: float,
    ) -> SimulatedReading:
        raise NotImplementedError


def _solar_curve(hour: float, capacity_kw: float, weather: float) -> float:
    """Deterministic bell-curve solar output for an hour of day, in kW."""
    if hour < _SUNRISE or hour > _SUNSET or capacity_kw <= 0:
        return 0.0
    x = (hour - _SUNRISE) / (_SUNSET - _SUNRISE)  # 0..1 across the day
    elevation = math.sin(math.pi * x) ** 1.5
    return capacity_kw * elevation * weather


def _consumption_curve(hour: float, base_kw: float) -> float:
    """Realistic household load: low at night, morning + evening peaks."""
    if base_kw <= 0:
        return 0.0
    morning = math.exp(-((hour - 7.5) ** 2) / 3.0)
    evening = math.exp(-((hour - 19.0) ** 2) / 4.0)
    baseline = 0.55 + 0.1 * math.sin(math.pi * ((hour + 4) % 24) / 12.0)
    profile = morning * 0.9 + evening * 1.35 + baseline
    return base_kw * profile


# Battery power limits as fractions of capacity (kWh rating):
# a 10 kWh home battery charges at <= 1.5 kW and discharges at <= 3 kW.
# Bounded power (not energy-per-tick) keeps a visible share of surplus flowing
# to the market instead of the battery absorbing everything.
_MAX_CHARGE_FRACTION = 0.15
_MAX_DISCHARGE_FRACTION = 0.30


class SimulationTelemetryProvider(TelemetryProvider):
    """Generates realistic, correlated telemetry from device + battery state.

    Successive ticks differ slightly (inverter noise, load jitter) but values
    stay on deterministic physical curves and respect device capacity.
    """

    def __init__(self, seed: int | None = None) -> None:
        self._rng = random.Random(seed)

    def _weather_for_hour(self, hour: float) -> float:
        band = int(hour // 2)
        band_rng = random.Random(band * 7919 + 104729)
        return band_rng.choice(_WEATHER_OPTIONS)

    def generate(
        self,
        *,
        device_type: str,
        capacity_kwh: float,
        hour: float,
        prev_soc: float,
        tick_seconds: float,
    ) -> SimulatedReading:
        hour = hour % 24.0

        # --- Solar generation ---
        if device_type == "solar_panel":
            weather = self._weather_for_hour(hour)
            base = _solar_curve(hour, capacity_kwh, weather)
            noise = 1.0 + self._rng.uniform(-0.06, 0.06)
            production_kw = max(0.0, min(capacity_kwh, base * noise))
        else:
            production_kw = 0.0

        # --- Consumption (any occupied premises) ---
        if device_type in ("meter", "solar_panel"):
            base_load = max(0.8, capacity_kwh * 0.28) if capacity_kwh > 0 else 1.2
            consumption_kw = max(0.05, _consumption_curve(hour, base_load))
            consumption_kw *= 1.0 + self._rng.uniform(-0.08, 0.08)
        else:
            consumption_kw = 0.0
        consumption_kw = max(0.0, consumption_kw)

        # --- Battery model: bounded power charge/discharge, SOC 0-100 ---
        # Surplus charges the battery (up to its power limit); the remaining
        # surplus reaches the market. Deficit discharges first; the remaining
        # deficit becomes a market buy requirement.
        soc = prev_soc
        battery_kw = 0.0
        net = production_kw - consumption_kw
        if capacity_kwh > 0 and device_type in ("solar_panel", "battery"):
            hours_per_tick = max(tick_seconds / 3600.0, 1e-6)
            max_charge_kw = capacity_kwh * _MAX_CHARGE_FRACTION
            max_discharge_kw = capacity_kwh * _MAX_DISCHARGE_FRACTION
            if net > 0 and soc < 99.5:
                charge_kwh = min(
                    net * hours_per_tick,
                    max_charge_kw * hours_per_tick,
                    (100.0 - soc) / 100.0 * capacity_kwh,
                )
                soc += charge_kwh / capacity_kwh * 100.0
                battery_kw = charge_kwh / hours_per_tick  # positive = charging
            elif net < 0 and soc > 0.5:
                available_kwh = soc / 100.0 * capacity_kwh
                discharge_kwh = min(
                    -net * hours_per_tick,
                    max_discharge_kw * hours_per_tick,
                    available_kwh,
                )
                soc -= discharge_kwh / capacity_kwh * 100.0
                battery_kw = -discharge_kwh / hours_per_tick  # negative = discharging

        soc = min(100.0, max(0.0, round(soc, 2)))
        battery_kw = round(battery_kw, 3)

        # Net grid exchange after battery action: + means exportable surplus.
        grid_net = round(net - battery_kw, 3)

        # --- Electrical characteristics around 230 V nominal ---
        voltage = round(230.0 + self._rng.uniform(-4.0, 4.0) - (2.0 if grid_net < -2.0 else 0.0), 1)
        current = round(abs(grid_net) * 1000.0 / max(voltage, 1.0), 2)

        return SimulatedReading(
            production_kw=round(production_kw, 3),
            consumption_kw=round(consumption_kw, 3),
            battery_soc=soc,
            battery_kw=battery_kw,
            voltage=voltage,
            current=current,
            power_kw=grid_net,
        )
