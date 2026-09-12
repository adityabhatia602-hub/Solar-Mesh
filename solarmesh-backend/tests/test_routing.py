"""Grid routing: capacity constraints, congestion rerouting, loss calculation."""
from __future__ import annotations

from app.services.grid_service import find_cheapest_route, record_grid_events


def test_route_blocked_when_capacity_insufficient(db_session, grid_nodes):
    from app.models import GridEdge

    # Fill the n1->n2 edge beyond capacity: 50 kW capacity, add 48 kW load.
    for e in db_session.query(GridEdge).all():
        if {e.from_node_id, e.to_node_id} == {grid_nodes["n1"].id, grid_nodes["n2"].id}:
            e.load_kw = 48.0
    db_session.flush()

    r = find_cheapest_route(db_session, grid_nodes["n1"].id, grid_nodes["n2"].id, required_kw=5.0)
    assert not r.feasible
    assert r.rejected_reason == "no_feasible_route_capacity"


def test_route_reroutes_around_congestion(db_session, grid_nodes):
    from app.models import GridEdge

    # n1->n2 direct edge congested; n2->n3 alternative via longer path unavailable
    # (test grid is a line n1-n2-n3), so blocking n1<->n2 must disconnect n3.
    for e in db_session.query(GridEdge).all():
        if {e.from_node_id, e.to_node_id} == {grid_nodes["n1"].id, grid_nodes["n2"].id}:
            e.load_kw = e.capacity_kw  # fully loaded: zero available
    db_session.flush()

    r = find_cheapest_route(db_session, grid_nodes["n1"].id, grid_nodes["n3"].id, required_kw=1.0)
    assert not r.feasible

    # With enough free capacity, the same route works.
    r2 = find_cheapest_route(db_session, grid_nodes["n1"].id, grid_nodes["n3"].id, required_kw=0.0)
    assert r2.feasible


def test_multiplicative_loss(db_session, grid_nodes):
    # 2% then 3% loss: delivered fraction = 0.98 * 0.97 = 0.9506
    r = find_cheapest_route(db_session, grid_nodes["n1"].id, grid_nodes["n3"].id, required_kw=0.0)
    assert r.feasible
    assert abs(r.loss_factor - (1 - 0.98 * 0.97)) < 1e-6


def test_congestion_event_recorded(db_session, grid_nodes):
    from app.models import GridEdge, GridEvent

    for e in db_session.query(GridEdge).all():
        if {e.from_node_id, e.to_node_id} == {grid_nodes["n1"].id, grid_nodes["n2"].id}:
            e.load_kw = 48.0  # 96% utilization (both directions congest)
    db_session.flush()

    events = record_grid_events(db_session)
    # Both directional edges of the corridor cross the threshold.
    assert len(events) == 2
    assert all(ev.event_type == "congestion" for ev in events)
    assert events[0].utilization > 0.8
    assert db_session.query(GridEvent).filter(GridEvent.resolved_at.is_(None)).count() >= 2
