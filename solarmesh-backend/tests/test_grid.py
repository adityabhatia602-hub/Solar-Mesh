"""Grid routing service tests."""
from __future__ import annotations

from app.services.grid_service import find_cheapest_route


def test_direct_route(db_session, grid_nodes):
    r = find_cheapest_route(db_session, grid_nodes["n1"].id, grid_nodes["n2"].id)
    assert r.feasible
    assert r.path_node_ids == [grid_nodes["n1"].id, grid_nodes["n2"].id]
    assert 0 < r.total_network_cost_per_kwh < 0.5


def test_multihop_route_uses_dijkstra(db_session, grid_nodes):
    # n1 -> n3 requires n1 -> n2 -> n3
    r = find_cheapest_route(db_session, grid_nodes["n1"].id, grid_nodes["n3"].id)
    assert r.feasible
    assert len(r.path_node_ids) == 3
    assert r.path_loss > 0


def test_unreachable_node(db_session, grid_nodes):
    lonely = __import__("app.models", fromlist=["GridNode"]).GridNode(
        code="TISO", name="Islanded", node_type="household", region="test"
    )
    db_session.add(lonely)
    db_session.flush()
    r = find_cheapest_route(db_session, grid_nodes["n1"].id, lonely.id)
    assert not r.feasible
