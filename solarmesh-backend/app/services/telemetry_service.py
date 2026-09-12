"""Telemetry services: ingestion, simulation tick generation, surplus/deficit detection.

TelemetryIn payloads may come from the simulator OR a real device — both flow
through the same pipeline: save reading → update device state → compute
surplus/deficit → auto orders → grid load updates.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import Device, Telemetry
from app.providers.telemetry_provider import SimulationTelemetryProvider, SimulatedReading
from app.routers.telemetry import event_bus
from app.services import market_service
from app.services.grid_service import record_grid_events, update_node_congestion

logger = logging.getLogger("solarmesh.telemetry")

# Module-level simulator instance keeps battery SOC continuity across ticks.
simulator = SimulationTelemetryProvider(seed=42)


def _get_battery_soc(db: Session, device: Device) -> float:
    latest = (
        db.query(Telemetry)
        .filter(Telemetry.device_id == device.id)
        .order_by(Telemetry.recorded_at.desc())
        .first()
    )
    return float(latest.battery_soc) if latest else 50.0


def save_reading(
    db: Session,
    device: Device,
    *,
    production_kw: float,
    consumption_kw: float,
    battery_soc: float,
    battery_kw: float,
    voltage: float,
    current: float,
    power_kw: float,
) -> Telemetry:
    """Persist one telemetry reading, publish WS events, update grid state."""
    reading = Telemetry(
        device_id=device.id,
        node_id=device.node_id,
        production_kw=max(0.0, production_kw),
        consumption_kw=max(0.0, consumption_kw),
        battery_soc=min(100.0, max(0.0, battery_soc)),
        battery_kw=battery_kw,
        voltage=voltage,
        current=current,
        power_kw=power_kw,
    )
    db.add(reading)
    db.flush()

    node_load_delta = reading.power_kw
    _apply_node_load(db, device.node_id, node_load_delta)

    reading_dict = reading.to_dict()
    event_bus.publish_threadsafe("telemetry", {"type": "telemetry", "data": reading_dict})
    event_bus.publish_threadsafe(f"node:{device.node_id}", {"type": "telemetry", "data": reading_dict})
    event_bus.publish_threadsafe("grid", {"type": "grid_update", "node_id": device.node_id})
    return reading


def _apply_node_load(db: Session, node_id: str, delta_kw: float) -> None:
    """Distribute a node's net load onto its grid edges (digital-twin loads).

    Household consumption increases line loading; solar export reduces it.
    Loads are spread across edges adjacent to the node proportionally.
    """
    from app.models import GridEdge

    edges = (
        db.query(GridEdge)
        .filter(
            GridEdge.is_active.is_(True),
            (GridEdge.from_node_id == node_id) | (GridEdge.to_node_id == node_id),
        )
        .all()
    )
    if not edges:
        return
    per_edge = delta_kw / len(edges)
    for edge in edges:
        edge.load_kw = max(0.0, round(edge.load_kw + per_edge, 4))


def generate_and_record(db: Session, tick_seconds: float) -> list[Telemetry]:
    """One simulation tick: generate readings for every active device."""
    devices = db.query(Device).filter(Device.is_active.is_(True)).all()
    now = datetime.now(timezone.utc)
    readings: list[Telemetry] = []

    for device in devices:
        if device.status == "offline":
            continue
        prev_soc = _get_battery_soc(db, device)
        hour = now.hour + now.minute / 60.0 + now.second / 3600.0
        sim: SimulatedReading = simulator.generate(
            device_type=device.device_type,
            capacity_kwh=device.capacity_kwh,
            hour=hour,
            prev_soc=prev_soc,
            tick_seconds=tick_seconds,
        )
        reading = save_reading(
            db, device,
            production_kw=sim.production_kw,
            consumption_kw=sim.consumption_kw,
            battery_soc=sim.battery_soc,
            battery_kw=sim.battery_kw,
            voltage=sim.voltage,
            current=sim.current,
            power_kw=sim.power_kw,
        )
        readings.append(reading)

    _detect_surplus_and_deficit(db, readings)
    record_grid_events(db)
    update_node_congestion(db)
    return readings


def _detect_surplus_and_deficit(db: Session, readings: list[Telemetry]) -> None:
    """Create/refresh auto market orders from current surplus and deficit."""
    by_device: dict[str, Telemetry] = {r.device_id: r for r in readings}
    devices = {d.id: d for d in db.query(Device).filter(Device.id.in_(list(by_device.keys()))).all()}

    for device_id, reading in by_device.items():
        device = devices.get(device_id)
        if device is None:
            continue
        owner_id = device.owner_id
        surplus = reading.power_kw  # net exportable after battery
        deficit = -surplus if surplus < 0 else 0.0

        if surplus > market_service.SURPLUS_THRESHOLD_KW:
            market_service.upsert_auto_order(
                db, owner_id, device.node_id, "offer",
                quantity_kwh=surplus,
                price_per_kwh=0.12,
                device_id=device.id,
            )
        elif deficit > market_service.SURPLUS_THRESHOLD_KW:
            market_service.upsert_auto_order(
                db, owner_id, device.node_id, "bid",
                quantity_kwh=deficit,
                price_per_kwh=0.30,
                device_id=device.id,
            )
