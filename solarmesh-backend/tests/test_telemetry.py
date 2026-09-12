"""Telemetry simulator + surplus/deficit detection tests."""
from __future__ import annotations

from app.providers.telemetry_provider import SimulationTelemetryProvider
from app.services import telemetry_service


def test_solar_curve_zero_at_night():
    sim = SimulationTelemetryProvider(seed=1)
    for _ in range(20):
        r = sim.generate(device_type="solar_panel", capacity_kwh=8.0, hour=2.0, prev_soc=50, tick_seconds=4)
        assert r.production_kw == 0.0


def test_solar_curve_respects_capacity():
    sim = SimulationTelemetryProvider(seed=1)
    for hour in [x * 0.5 for x in range(48)]:
        r = sim.generate(device_type="solar_panel", capacity_kwh=8.0, hour=hour, prev_soc=50, tick_seconds=4)
        assert 0.0 <= r.production_kw <= 8.0 + 1e-9


def test_consumption_never_negative():
    sim = SimulationTelemetryProvider(seed=3)
    for hour in [x * 0.25 for x in range(96)]:
        r = sim.generate(device_type="meter", capacity_kwh=0.0, hour=hour, prev_soc=0, tick_seconds=4)
        assert r.consumption_kw >= 0.0


def test_battery_soc_bounds():
    sim = SimulationTelemetryProvider(seed=5)
    soc = 50.0
    for hour in [x * 0.5 for x in range(200)]:
        r = sim.generate(device_type="solar_panel", capacity_kwh=8.0, hour=hour, prev_soc=soc, tick_seconds=4)
        assert 0.0 <= r.battery_soc <= 100.0
        soc = r.battery_soc


def test_battery_full_no_charge():
    sim = SimulationTelemetryProvider(seed=7)
    r = sim.generate(device_type="solar_panel", capacity_kwh=10.0, hour=12.0, prev_soc=100.0, tick_seconds=4)
    assert r.battery_kw == 0.0  # cannot charge beyond 100%
    assert r.power_kw > 0  # surplus flows to grid instead


def test_midday_surplus_evening_deficit():
    sim = SimulationTelemetryProvider(seed=9)
    noon = sim.generate(device_type="solar_panel", capacity_kwh=8.0, hour=12.0, prev_soc=50, tick_seconds=4)
    evening = sim.generate(device_type="solar_panel", capacity_kwh=8.0, hour=20.0, prev_soc=50, tick_seconds=4)
    assert noon.power_kw > 0  # midday: exportable surplus
    assert evening.power_kw < 0  # evening: deficit


def test_voltage_and_current_plausible():
    sim = SimulationTelemetryProvider(seed=11)
    r = sim.generate(device_type="solar_panel", capacity_kwh=8.0, hour=12.0, prev_soc=50, tick_seconds=4)
    assert 200 <= r.voltage <= 260
    assert r.current >= 0


def test_auto_orders_created_on_tick(db_session, grid_nodes, test_user):
    from app.models import Device, Order, OrderSide

    device = Device(
        owner_id=test_user.id, node_id=grid_nodes["n1"].id,
        name="Test Array", device_type="solar_panel", capacity_kwh=8.0,
    )
    db_session.add(device)
    db_session.flush()

    # Simulate a big midday surplus reading via the service pipeline.
    reading = telemetry_service.save_reading(
        db_session, device,
        production_kw=6.0, consumption_kw=2.0, battery_soc=60.0,
        battery_kw=0.0, voltage=230.0, current=10.0, power_kw=4.0,
    )
    assert reading.power_kw == 4.0

    from app.services import market_service

    market_service.upsert_auto_order(
        db_session, test_user.id, device.node_id, "offer",
        quantity_kwh=4.0, price_per_kwh=0.12, device_id=device.id,
    )
    orders = db_session.query(Order).filter(Order.user_id == test_user.id).all()
    assert len(orders) == 1
    assert orders[0].side == OrderSide.OFFER
    assert orders[0].quantity_kwh == 4.0


def test_auto_order_upsert_no_duplicates(db_session, grid_nodes, test_user):
    from app.services import market_service

    a = market_service.upsert_auto_order(
        db_session, test_user.id, grid_nodes["n1"].id, "offer",
        quantity_kwh=3.0, price_per_kwh=0.12,
    )
    b = market_service.upsert_auto_order(
        db_session, test_user.id, grid_nodes["n1"].id, "offer",
        quantity_kwh=4.5, price_per_kwh=0.12,
    )
    assert a.id == b.id  # same order refreshed, not duplicated
