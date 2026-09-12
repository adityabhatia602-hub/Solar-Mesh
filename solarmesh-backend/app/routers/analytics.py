"""Analytics endpoints: dashboard metrics, grid analytics, market analytics.

All values are computed live from database data — nothing hardcoded.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user
from app.models import (
    Device,
    GridEvent,
    GridNode,
    LedgerEntryType,
    Order,
    OrderSide,
    OrderStatus,
    Telemetry,
    Trade,
    User,
)

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/dashboard")
def dashboard_analytics(
    hours: int = Query(default=24, ge=1, le=720),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Platform-wide energy and market metrics (no personally identifiable data)."""
    from datetime import datetime, timedelta, timezone

    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    total_generation_kw = db.query(func.sum(Telemetry.production_kw)).filter(Telemetry.recorded_at >= since).scalar() or 0.0
    total_consumption_kw = db.query(func.sum(Telemetry.consumption_kw)).filter(Telemetry.recorded_at >= since).scalar() or 0.0

    total_traded = db.query(func.sum(Trade.quantity_kwh)).scalar() or 0.0
    total_delivered = db.query(func.sum(Trade.delivered_kwh)).scalar() or 0.0
    total_loss = db.query(func.sum(Trade.energy_loss_kwh)).scalar() or 0.0
    trade_count = db.query(func.count(Trade.id)).scalar() or 0
    avg_price = db.query(func.avg(Trade.price_per_kwh)).scalar() or 0.0
    total_network_fees = db.query(func.sum(Trade.quantity_kwh * Trade.network_cost_per_kwh)).scalar() or 0.0

    active_offers = (
        db.query(func.count(Order.id))
        .filter(Order.side == OrderSide.OFFER, Order.status.in_([OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED]))
        .scalar() or 0
    )
    active_bids = (
        db.query(func.count(Order.id))
        .filter(Order.side == OrderSide.BID, Order.status.in_([OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED]))
        .scalar() or 0
    )
    congestion_events = (
        db.query(func.count(GridEvent.id))
        .filter(GridEvent.event_type == "congestion", GridEvent.created_at >= since)
        .scalar() or 0
    )

    # Hourly generation vs consumption for charts.
    rows = (
        db.query(Telemetry.recorded_at, Telemetry.production_kw, Telemetry.consumption_kw)
        .filter(Telemetry.recorded_at >= since)
        .order_by(Telemetry.recorded_at.asc())
        .limit(2000)
        .all()
    )
    hourly: dict[str, dict[str, float]] = {}
    for recorded_at, prod, cons in rows:
        if recorded_at is None:
            continue
        bucket = recorded_at.strftime("%H:%M")
        entry = hourly.setdefault(bucket, {"time": bucket, "generation": 0.0, "consumption": 0.0, "count": 0})
        entry["generation"] += float(prod or 0.0)
        entry["consumption"] += float(cons or 0.0)
        entry["count"] += 1
    timeseries = []
    for entry in hourly.values():
        n = max(1, entry.pop("count"))
        timeseries.append({
            "time": entry["time"],
            "generation": round(entry["generation"] / n, 3),
            "consumption": round(entry["consumption"] / n, 3),
        })
    timeseries.sort(key=lambda x: x["time"])

    return {
        "total_generation_kwh": round(total_generation_kw, 3),
        "total_consumption_kwh": round(total_consumption_kw, 3),
        "total_energy_traded_kwh": round(total_traded, 3),
        "total_energy_delivered_kwh": round(total_delivered, 3),
        "total_energy_lost_kwh": round(total_loss, 3),
        "average_trade_price": round(float(avg_price), 4),
        "trade_count": trade_count,
        "active_offers": active_offers,
        "active_bids": active_bids,
        "congestion_events": congestion_events,
        "total_network_fees": round(float(total_network_fees), 4),
        "timeseries": timeseries,
    }


@router.get("/grid")
def grid_analytics(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Grid health: loads, congestion, losses."""
    from app.models import GridEdge

    edges = db.query(GridEdge).all()
    if not edges:
        return {
            "total_load_kw": 0, "total_capacity_kw": 0, "highest_load_edge": None,
            "congested_edges": [], "average_loss_factor": 0, "congestion_events": [],
        }

    total_load = sum(e.load_kw for e in edges)
    total_capacity = sum(e.capacity_kw for e in edges)
    highest = max(edges, key=lambda e: e.utilization)

    def edge_label(e) -> dict:
        frm = db.get(GridNode, e.from_node_id)
        to = db.get(GridNode, e.to_node_id)
        return {
            "edge_id": e.id,
            "from_code": frm.code if frm else e.from_node_id,
            "to_code": to.code if to else e.to_node_id,
            "load_kw": round(e.load_kw, 3),
            "capacity_kw": e.capacity_kw,
            "utilization": round(e.utilization, 4),
            "status": e.edge_status,
        }

    congested = [edge_label(e) for e in edges if e.edge_status == "congested"]
    events = (
        db.query(GridEvent)
        .order_by(GridEvent.created_at.desc())
        .limit(20)
        .all()
    )

    return {
        "total_load_kw": round(total_load, 3),
        "total_capacity_kw": round(total_capacity, 3),
        "highest_load_edge": edge_label(highest),
        "congested_edges": congested,
        "average_loss_factor": round(sum(e.loss_factor for e in edges) / len(edges), 4),
        "congestion_events": [ev.to_dict() for ev in events],
    }


@router.get("/market")
def market_analytics(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Market-wide volumes and pricing."""
    buy_volume = (
        db.query(func.sum(Order.quantity_kwh))
        .filter(Order.side == OrderSide.BID, Order.status.in_([OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED, OrderStatus.FILLED]))
        .scalar() or 0.0
    )
    sell_volume = (
        db.query(func.sum(Order.quantity_kwh))
        .filter(Order.side == OrderSide.OFFER, Order.status.in_([OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED, OrderStatus.FILLED]))
        .scalar() or 0.0
    )
    matched_volume = db.query(func.sum(Trade.quantity_kwh)).scalar() or 0.0
    avg_price = db.query(func.avg(Trade.price_per_kwh)).scalar() or 0.0
    avg_loss = db.query(func.avg(Trade.energy_loss_kwh)).scalar() or 0.0
    network_fees = db.query(func.sum(Trade.quantity_kwh * Trade.network_cost_per_kwh)).scalar() or 0.0
    trade_count = db.query(func.count(Trade.id)).scalar() or 0

    return {
        "buy_volume_kwh": round(float(buy_volume), 3),
        "sell_volume_kwh": round(float(sell_volume), 3),
        "matched_volume_kwh": round(float(matched_volume), 3),
        "average_price": round(float(avg_price), 4),
        "average_loss_kwh": round(float(avg_loss), 4),
        "total_network_fees": round(float(network_fees), 4),
        "trade_count": trade_count,
    }
