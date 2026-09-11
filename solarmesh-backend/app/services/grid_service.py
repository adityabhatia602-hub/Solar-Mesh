"""Grid network topology, routing and network-cost calculation.

The grid is modelled as a directed graph of nodes (households/transformers)
connected by edges (lines) with capacity, load and loss characteristics.
Network cost for delivering energy between two nodes combines:
  - cumulative line losses along the cheapest path (Dijkstra on loss+congestion)
  - a congestion penalty when lines are heavily loaded
"""
from __future__ import annotations

import heapq
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.config import settings
from app.models import GridEdge, GridNode


@dataclass
class RouteResult:
    from_node_id: str
    to_node_id: str
    feasible: bool
    path_node_ids: list[str] = field(default_factory=list)
    path_loss: float = 0.0
    congestion_penalty: float = 0.0
    total_network_cost_per_kwh: float = 0.0


def load_graph(db: Session) -> tuple[dict[str, list[tuple[str, float, float]]], set[str]]:
    """Build adjacency list: node -> [(neighbor, loss_factor, utilization), ...]."""
    adjacency: dict[str, list[tuple[str, float, float]]] = {}
    nodes: set[str] = set()
    edges = db.query(GridEdge).filter(GridEdge.is_active.is_(True)).all()
    for edge in edges:
        nodes.add(edge.from_node_id)
        nodes.add(edge.to_node_id)
        util = (edge.load_kw / edge.capacity_kw) if edge.capacity_kw > 0 else 0.0
        adjacency.setdefault(edge.from_node_id, []).append((edge.to_node_id, edge.loss_factor, util))
    return adjacency, nodes


def _edge_cost(loss_factor: float, utilization: float) -> float:
    """Per-edge routing cost: line loss plus a congestion surcharge."""
    congestion_component = settings.CONGESTION_PENALTY * max(0.0, utilization - 0.7) / 0.3
    return loss_factor + min(1.0, max(0.0, congestion_component))


def find_cheapest_route(db: Session, from_node_id: str, to_node_id: str) -> RouteResult:
    """Dijkstra over grid edges minimizing loss+congestion cost."""
    adjacency, nodes = load_graph(db)
    if from_node_id not in nodes or to_node_id not in nodes:
        return RouteResult(from_node_id, to_node_id, feasible=False)

    dist: dict[str, float] = {from_node_id: 0.0}
    prev: dict[str, str] = {}
    visited: set[str] = set()
    heap: list[tuple[float, str]] = [(0.0, from_node_id)]

    while heap:
        d, u = heapq.heappop(heap)
        if u in visited:
            continue
        visited.add(u)
        if u == to_node_id:
            break
        for v, loss, util in adjacency.get(u, []):
            nd = d + _edge_cost(loss, util)
            if nd < dist.get(v, float("inf")):
                dist[v] = nd
                prev[v] = u
                heapq.heappush(heap, (nd, v))

    if to_node_id not in visited and to_node_id != from_node_id:
        return RouteResult(from_node_id, to_node_id, feasible=False)

    # Reconstruct path
    path = [to_node_id]
    while path[-1] != from_node_id:
        p = prev.get(path[-1])
        if p is None:
            return RouteResult(from_node_id, to_node_id, feasible=False)
        path.append(p)
    path.reverse()

    total_cost = dist.get(to_node_id, float("inf"))
    if total_cost == float("inf"):
        return RouteResult(from_node_id, to_node_id, feasible=False)

    # Split into loss portion and congestion portion for reporting
    congestion = 0.0
    loss = 0.0
    for a, b in zip(path, path[1:]):
        for v, lo, ut in adjacency.get(a, []):
            if v == b:
                loss += lo
                congestion += settings.CONGESTION_PENALTY * max(0.0, ut - 0.7) / 0.3
                break

    return RouteResult(
        from_node_id=from_node_id,
        to_node_id=to_node_id,
        feasible=True,
        path_node_ids=path,
        path_loss=round(loss, 6),
        congestion_penalty=round(congestion, 6),
        total_network_cost_per_kwh=round(total_cost, 6),
    )


def update_node_congestion(db: Session) -> None:
    """Recompute per-node congestion from average utilization of connected edges."""
    nodes = db.query(GridNode).all()
    edges = db.query(GridEdge).all()
    by_node: dict[str, list[float]] = {}
    for e in edges:
        if e.capacity_kw > 0:
            util = min(1.0, e.load_kw / e.capacity_kw)
            by_node.setdefault(e.from_node_id, []).append(util)
            by_node.setdefault(e.to_node_id, []).append(util)
    for n in nodes:
        utils = by_node.get(n.id)
        n.congestion_level = round(sum(utils) / len(utils), 4) if utils else 0.0
    db.flush()
