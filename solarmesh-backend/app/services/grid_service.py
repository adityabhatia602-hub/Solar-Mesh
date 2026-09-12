"""Grid network topology, routing and network-cost calculation.

The grid is modelled as a directed graph of nodes (substations/feeders/household
blocks) connected by edges (lines) with capacity, load and loss characteristics.
Dijkstra minimizes loss + congestion cost, but an edge is only usable if it has
enough spare capacity for the requested transfer — infeasible requests fall back
to longer alternative routes, or fail with no silent capacity violation.
"""
from __future__ import annotations

import heapq
from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.config import settings
from app.models import GridEdge, GridEvent, GridNode

# Utilization above which an edge counts as congested for routing cost.
_CONGESTION_THRESHOLD = 0.7


@dataclass
class RouteResult:
    from_node_id: str
    to_node_id: str
    feasible: bool
    path_node_ids: list[str] = field(default_factory=list)
    path_edge_ids: list[str] = field(default_factory=list)
    path_loss: float = 0.0
    congestion_penalty: float = 0.0
    total_network_cost_per_kwh: float = 0.0
    min_available_capacity_kw: float = 0.0
    required_kw: float = 0.0
    loss_factor: float = 0.0
    rejected_reason: str | None = None

    def to_dict(self) -> dict:
        return {
            "from_node_id": self.from_node_id,
            "to_node_id": self.to_node_id,
            "feasible": self.feasible,
            "path_node_ids": self.path_node_ids,
            "path_loss": self.path_loss,
            "congestion_penalty": self.congestion_penalty,
            "total_network_cost_per_kwh": self.total_network_cost_per_kwh,
            "min_available_capacity_kw": self.min_available_capacity_kw,
            "required_kw": self.required_kw,
            "loss_factor": self.loss_factor,
            "rejected_reason": self.rejected_reason,
        }


def load_graph(
    db: Session,
    required_kw: float = 0.0,
) -> dict[str, list[dict]]:
    """Build adjacency list, optionally excluding edges without spare capacity.

    Each entry: {neighbor, loss_factor, utilization, available_kw, edge_id}.
    An edge with available capacity below `required_kw` is excluded so Dijkstra
    can reroute around congested corridors instead of exceeding them.
    """
    adjacency: dict[str, list[dict]] = {}
    edges = db.query(GridEdge).filter(GridEdge.is_active.is_(True)).all()
    for edge in edges:
        available = max(0.0, edge.capacity_kw - edge.load_kw)
        if required_kw > 0 and available < required_kw:
            continue
        util = (edge.load_kw / edge.capacity_kw) if edge.capacity_kw > 0 else 0.0
        adjacency.setdefault(edge.from_node_id, []).append(
            {
                "neighbor": edge.to_node_id,
                "loss_factor": edge.loss_factor,
                "utilization": util,
                "available_kw": available,
                "edge_id": edge.id,
            }
        )
    return adjacency


def _edge_cost(loss_factor: float, utilization: float) -> float:
    """Per-edge routing cost: line loss plus a congestion surcharge."""
    congestion_component = settings.CONGESTION_PENALTY * max(0.0, utilization - _CONGESTION_THRESHOLD) / 0.3
    return loss_factor + min(1.0, max(0.0, congestion_component))


def find_cheapest_route(
    db: Session,
    from_node_id: str,
    to_node_id: str,
    required_kw: float = 0.0,
) -> RouteResult:
    """Dijkstra over grid edges minimizing loss+congestion cost.

    When `required_kw` is set, edges with insufficient spare capacity are
    excluded from the graph so the returned path (if any) can physically carry
    the requested power. Self-loops (same source and target) are trivially
    feasible with zero loss.
    """
    if from_node_id == to_node_id:
        return RouteResult(
            from_node_id=from_node_id,
            to_node_id=to_node_id,
            feasible=True,
            path_node_ids=[from_node_id],
            required_kw=required_kw,
            min_available_capacity_kw=float("inf"),
        )

    adjacency = load_graph(db, required_kw=required_kw)
    nodes: set[str] = set(adjacency.keys())
    for entries in adjacency.values():
        for e in entries:
            nodes.add(e["neighbor"])
    if from_node_id not in nodes or to_node_id not in nodes:
        # Distinguish "endpoint genuinely off-grid" from "capacity filter removed edges".
        unfiltered = load_graph(db, required_kw=0.0)
        unfiltered_nodes: set[str] = set(unfiltered.keys())
        for entries in unfiltered.values():
            for e in entries:
                unfiltered_nodes.add(e["neighbor"])
        reason = "node_off_grid" if (from_node_id not in unfiltered_nodes or to_node_id not in unfiltered_nodes) \
            else "no_feasible_route_capacity"
        return RouteResult(from_node_id, to_node_id, feasible=False, required_kw=required_kw,
                           rejected_reason=reason)

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
        for entry in adjacency.get(u, []):
            v = entry["neighbor"]
            nd = d + _edge_cost(entry["loss_factor"], entry["utilization"])
            if nd < dist.get(v, float("inf")):
                dist[v] = nd
                prev[v] = u
                heapq.heappush(heap, (nd, v))

    if to_node_id not in visited:
        return RouteResult(from_node_id, to_node_id, feasible=False, required_kw=required_kw,
                           rejected_reason="no_feasible_route_capacity")

    # Reconstruct path
    path = [to_node_id]
    while path[-1] != from_node_id:
        p = prev.get(path[-1])
        if p is None:
            return RouteResult(from_node_id, to_node_id, feasible=False, required_kw=required_kw,
                               rejected_reason="no_feasible_route_capacity")
        path.append(p)
    path.reverse()

    total_cost = dist[to_node_id]
    congestion = 0.0
    loss = 0.0
    min_available = float("inf")
    product_keep = 1.0
    edge_ids: list[str] = []
    for a, b in zip(path, path[1:]):
        for entry in adjacency.get(a, []):
            if entry["neighbor"] == b:
                loss += entry["loss_factor"]
                product_keep *= 1.0 - entry["loss_factor"]
                congestion += settings.CONGESTION_PENALTY * max(0.0, entry["utilization"] - _CONGESTION_THRESHOLD) / 0.3
                min_available = min(min_available, entry["available_kw"])
                edge_ids.append(entry["edge_id"])
                break

    return RouteResult(
        from_node_id=from_node_id,
        to_node_id=to_node_id,
        feasible=True,
        path_node_ids=path,
        path_edge_ids=edge_ids,
        path_loss=round(loss, 6),
        congestion_penalty=round(congestion, 6),
        total_network_cost_per_kwh=round(total_cost, 6),
        min_available_capacity_kw=round(min_available, 4) if min_available != float("inf") else 0.0,
        required_kw=required_kw,
        loss_factor=round(1.0 - product_keep, 6),
    )


def record_grid_events(db: Session) -> list[GridEvent]:
    """Update edge statuses and write congestion/recovery events.

    Emits a `congestion` GridEvent when an edge crosses 80% utilization and a
    `recovery` event when it drops back. Returns events created this pass.
    """
    edges = db.query(GridEdge).all()
    new_events: list[GridEvent] = []
    for edge in edges:
        if not edge.is_active:
            continue
        util = (edge.load_kw / edge.capacity_kw) if edge.capacity_kw > 0 else 0.0
        congested = util > 0.8

        open_event = (
            db.query(GridEvent)
            .filter(
                GridEvent.edge_id == edge.id,
                GridEvent.event_type == "congestion",
                GridEvent.resolved_at.is_(None),
            )
            .first()
        )

        previous_status = edge.status
        edge.status = "congested" if congested else "normal"

        if congested and open_event is None:
            from_code = db.get(GridNode, edge.from_node_id)
            to_code = db.get(GridNode, edge.to_node_id)
            ev = GridEvent(
                edge_id=edge.id,
                event_type="congestion",
                utilization=round(util, 4),
                detail=(
                    f"{from_code.code if from_code else edge.from_node_id} -> "
                    f"{to_code.code if to_code else edge.to_node_id} at {util * 100:.0f}% utilization"
                ),
            )
            db.add(ev)
            new_events.append(ev)
        elif not congested and open_event is not None:
            from app.models import utcnow

            open_event.resolved_at = utcnow()
    db.flush()
    return new_events


def add_edge_load(db: Session, edge_id: str, delta_kw: float) -> None:
    """Increase/decrease an edge's load, clamped to capacity (defensive)."""
    edge = db.get(GridEdge, edge_id)
    if edge is None:
        return
    edge.load_kw = max(0.0, round(edge.load_kw + delta_kw, 4))
    if edge.load_kw > edge.capacity_kw:
        edge.load_kw = edge.capacity_kw
    db.flush()


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
