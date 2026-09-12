"""Market operations: order placement, order book, matching engine, auto-orders.

Matching is network-aware: for each bid we search offers ranked by delivered
cost (ask price + network cost of the cheapest feasible route). Line losses are
computed multiplicatively along the path, capacity is reserved on every edge of
the route, and each trade carries an explainable match breakdown.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    Device,
    GridNode,
    LedgerEntryType,
    Order,
    OrderSide,
    OrderStatus,
    Trade,
    TradeStatus,
)
from app.schemas import OrderCreate
from app.services.grid_service import find_cheapest_route, add_edge_load
from app.services.wallet_service import (
    InsufficientFunds,
    apply_ledger_entry,
    get_or_create_wallet,
    release_reservation,
    reserve_funds,
)
from app.routers.telemetry import event_bus

logger = logging.getLogger("solarmesh.market")

SURPLUS_THRESHOLD_KW = 0.1


class MarketError(Exception):
    pass


# ---------------------------------------------------------------- manual orders

def place_order(db: Session, user, payload: OrderCreate) -> Order:
    """Create an offer or bid. Bids reserve funds immediately.

    When `device_id` is provided the order is anchored to that device; sellers
    must own it and offers are checked against the device's surplus headroom.
    """
    node = db.get(GridNode, payload.node_id)
    if node is None:
        raise MarketError("Grid node not found")

    device = None
    if payload.device_id:
        device = db.get(Device, payload.device_id)
        if device is None:
            raise MarketError("Device not found")
        if device.owner_id != user.id and user.role.value != "admin":
            raise MarketError("Not your device")

    if payload.side == "offer":
        # A seller may only offer energy backed by device capacity minus what
        # their other open offers at this node already promise.
        if device is not None:
            capacity = float(device.capacity_kwh)
        else:
            owned = (
                db.query(Device)
                .filter(Device.owner_id == user.id, Device.node_id == node.id)
                .all()
            )
            capacity = sum(float(d.capacity_kwh) for d in owned)
        committed = _open_offer_quantity(db, user.id, node.id)
        available = max(0.0, capacity - committed)
        if capacity > 0 and payload.quantity_kwh > available + 0.001:
            raise MarketError(
                f"Offer exceeds available energy: {available:.2f} kWh uncommitted at this node"
            )
    else:
        wallet = get_or_create_wallet(db, user.id, for_update=True)
        reserve = round(payload.price_per_kwh * payload.quantity_kwh, 6)
        try:
            reserve_funds(db, wallet, reserve)
        except InsufficientFunds as e:
            raise MarketError(f"Insufficient wallet balance: {e}") from e

    expires_at = datetime.now(timezone.utc) + timedelta(hours=payload.expires_in_hours)
    order = Order(
        side=OrderSide(payload.side),
        user_id=user.id,
        node_id=payload.node_id,
        price_per_kwh=payload.price_per_kwh,
        quantity_kwh=payload.quantity_kwh,
        expires_at=expires_at,
    )
    db.add(order)
    db.commit()
    db.refresh(order)
    event_bus.publish_threadsafe("orders", {"type": "order_created", "data": order.to_dict()})
    return order


def _open_offer_quantity(db: Session, user_id: str, node_id: str) -> float:
    orders = (
        db.query(Order)
        .filter(
            Order.side == OrderSide.OFFER,
            Order.user_id == user_id,
            Order.node_id == node_id,
            Order.status.in_([OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED]),
        )
        .all()
    )
    return sum(o.remaining_kwh for o in orders)


# ---------------------------------------------------------------- auto orders

def upsert_auto_order(
    db: Session,
    user_id: str,
    node_id: str,
    side: str,
    quantity_kwh: float,
    price_per_kwh: float,
    device_id: str | None = None,
) -> Order | None:
    """Create or refresh the single auto order per (user, node, side).

    Called from the simulation tick. Keeps quantity in sync with current
    surplus/deficit and never duplicates orders. Returns None below threshold.
    """
    if quantity_kwh <= SURPLUS_THRESHOLD_KW:
        return None
    quantity_kwh = round(min(quantity_kwh, 50.0), 3)

    existing = (
        db.query(Order)
        .filter(
            Order.user_id == user_id,
            Order.node_id == node_id,
            Order.side == OrderSide(side),
            Order.status.in_([OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED]),
        )
        .order_by(Order.created_at.desc())
        .first()
    )

    if existing is not None:
        if existing.price_per_kwh != price_per_kwh or abs(existing.quantity_kwh - quantity_kwh) > 0.05:
            existing.quantity_kwh = max(quantity_kwh, existing.filled_kwh)
            existing.price_per_kwh = price_per_kwh
            db.flush()
        return existing

    # New order; bids escrow funds.
    order = Order(
        side=OrderSide(side),
        user_id=user_id,
        node_id=node_id,
        price_per_kwh=price_per_kwh,
        quantity_kwh=quantity_kwh,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=settings.MAX_ORDER_AGE_HOURS),
    )
    if side == "bid":
        wallet = get_or_create_wallet(db, user_id, for_update=True)
        reserve = round(price_per_kwh * quantity_kwh, 6)
        try:
            reserve_funds(db, wallet, reserve)
        except InsufficientFunds:
            logger.info("Auto-bid skipped for %s: insufficient funds", user_id)
            return None
    db.add(order)
    db.flush()
    db.refresh(order)
    event_bus.publish_threadsafe("orders", {"type": "order_created", "data": order.to_dict()})
    logger.info("Auto %s order created: %.2f kWh @ %.3f (user=%s node=%s)", side, quantity_kwh, price_per_kwh, user_id, node_id)
    return order


def cancel_order(db: Session, user, order_id: str) -> Order:
    order = db.get(Order, order_id)
    if order is None:
        raise MarketError("Order not found")
    if order.user_id != user.id:
        raise MarketError("Not your order")
    if order.status not in (OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED):
        raise MarketError(f"Cannot cancel order in status {order.status.value}")

    if order.side == OrderSide.BID:
        remaining_value = round(order.remaining_kwh * float(order.price_per_kwh), 6)
        wallet = get_or_create_wallet(db, user.id, for_update=True)
        release_reservation(db, wallet, remaining_value)

    order.status = OrderStatus.CANCELLED
    db.commit()
    db.refresh(order)
    event_bus.publish_threadsafe("orders", {"type": "order_cancelled", "data": order.to_dict()})
    return order


# ---------------------------------------------------------------- order book

def get_order_book(db: Session, node_id: str | None = None) -> dict:
    """Aggregate open orders into price levels."""
    q = db.query(Order).filter(Order.status.in_([OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED]))
    if node_id:
        q = q.filter(Order.node_id == node_id)
    orders = q.all()

    def aggregate(side: OrderSide) -> list[dict]:
        levels: dict[float, float] = {}
        counts: dict[float, int] = {}
        for o in orders:
            if o.side != side:
                continue
            price = round(float(o.price_per_kwh), 4)
            levels[price] = levels.get(price, 0.0) + o.remaining_kwh
            counts[price] = counts.get(price, 0) + 1
        result = [
            {"price_per_kwh": p, "quantity_kwh": round(qty, 4), "order_count": counts[p]}
            for p, qty in levels.items()
        ]
        result.sort(key=lambda x: x["price_per_kwh"], reverse=(side == OrderSide.BID))
        return result

    bids = aggregate(OrderSide.BID)
    offers = aggregate(OrderSide.OFFER)
    best_bid = bids[0]["price_per_kwh"] if bids else 0.0
    best_offer = offers[0]["price_per_kwh"] if offers else 0.0
    spread = round(best_offer - best_bid, 4) if bids and offers else 0.0
    midpoint = round((best_bid + best_offer) / 2, 4) if bids and offers else 0.0
    return {"bids": bids, "offers": offers, "spread": spread, "midpoint": midpoint}


def expire_stale_orders(db: Session) -> int:
    now = datetime.now(timezone.utc)
    stale = (
        db.query(Order)
        .filter(
            Order.status.in_([OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED]),
            Order.expires_at.isnot(None),
            Order.expires_at < now,
        )
        .all()
    )
    count = 0
    for order in stale:
        if order.side == OrderSide.BID:
            remaining_value = order.remaining_kwh * float(order.price_per_kwh)
            wallet = get_or_create_wallet(db, order.user_id)
            release_reservation(db, wallet, remaining_value)
        order.status = OrderStatus.EXPIRED
        count += 1
    if count:
        db.commit()
    return count


# ---------------------------------------------------------------- matching engine

def _build_explanation(
    bid: Order,
    offer: Order,
    route,
    qty: float,
    delivered: float,
    loss_kwh: float,
    buyer_pays: float,
    network_cost: float,
) -> dict:
    return {
        "price_check": float(bid.price_per_kwh) >= float(offer.price_per_kwh) + route.total_network_cost_per_kwh,
        "seller_has_energy": offer.remaining_kwh > 0,
        "route_exists": route.feasible and len(route.path_node_ids) > 0,
        "capacity_ok": route.feasible,
        "loss_factor": route.loss_factor,
        "energy_sent_kwh": round(qty, 4),
        "energy_delivered_kwh": round(delivered, 4),
        "energy_loss_kwh": round(loss_kwh, 4),
        "network_cost_total": round(network_cost, 4),
        "buyer_total": round(buyer_pays, 4),
        "reason": (
            f"Buyer bid ${float(bid.price_per_kwh):.2f}/kWh covered the seller ask "
            f"${float(offer.price_per_kwh):.2f}/kWh plus ${route.total_network_cost_per_kwh:.4f}/kWh "
            f"network delivery over {len(route.path_node_ids) - 1} hop(s); the path had sufficient spare capacity."
        ),
    }


def _settle_trade(
    db: Session,
    bid: Order,
    offer: Order,
    route,
    qty: float,
) -> Trade:
    """Create, settle, and record a single trade atomically (caller commits)."""
    ask = float(offer.price_per_kwh)
    gross = round(qty * ask, 6)
    network_cost = round(qty * route.total_network_cost_per_kwh, 6)
    buyer_pays = round(gross + network_cost, 6)

    # Multiplicative line loss: delivered = sent * product(1 - loss_edge)
    loss_factor = route.loss_factor
    delivered = round(qty * (1.0 - loss_factor), 4)
    loss_kwh = round(qty - delivered, 4)

    bid_wallet = get_or_create_wallet(db, bid.user_id, for_update=True)
    try:
        apply_ledger_entry(
            db, bid_wallet, LedgerEntryType.TRADE_PAYMENT,
            -buyer_pays, reference=offer.id, memo=f"Energy purchase {qty} kWh (incl. network fee)",
        )
    except InsufficientFunds:
        raise

    offer_wallet = get_or_create_wallet(db, offer.user_id, for_update=True)
    apply_ledger_entry(
        db, offer_wallet, LedgerEntryType.TRADE_RECEIPT,
        gross, reference=bid.id, memo=f"Energy sale {qty} kWh",
    )
    if network_cost > 0:
        apply_ledger_entry(
            db, bid_wallet, LedgerEntryType.NETWORK_FEE,
            0.0, reference=None, memo=f"Network fee ${network_cost:.4f} included in payment",
        )

    # Release the escrowed portion this fill consumes.
    release_reservation(db, bid_wallet, round(qty * float(bid.price_per_kwh), 6))
    bid_wallet.energy_kwh_bought = round(float(bid_wallet.energy_kwh_bought) + delivered, 4)
    offer_wallet.energy_kwh_sold = round(float(offer_wallet.energy_kwh_sold) + qty, 4)

    # Reserve capacity on every edge of the route.
    for edge_id in route.path_edge_ids:
        add_edge_load(db, edge_id, qty)

    trade = Trade(
        offer_id=offer.id,
        bid_id=bid.id,
        seller_id=offer.user_id,
        buyer_id=bid.user_id,
        quantity_kwh=qty,
        delivered_kwh=delivered,
        energy_loss_kwh=loss_kwh,
        price_per_kwh=ask,
        network_cost_per_kwh=route.total_network_cost_per_kwh,
        total_amount=buyer_pays,
        path_nodes=",".join(route.path_node_ids),
        explanation=_build_explanation(bid, offer, route, qty, delivered, loss_kwh, buyer_pays, network_cost),
        status=TradeStatus.SETTLED,
    )
    db.add(trade)
    db.flush()

    offer.filled_kwh = float(offer.filled_kwh) + qty
    bid.filled_kwh = float(bid.filled_kwh) + delivered  # buyer receives net energy
    if offer.remaining_kwh <= 0:
        offer.status = OrderStatus.FILLED
    else:
        offer.status = OrderStatus.PARTIALLY_FILLED

    return trade


def run_matching(db: Session) -> dict:
    """Match open bids with feasible offers, network-aware, surplus-maximizing.

    Buyer pays: ask price + network cost (delivery).
    Seller receives: ask price.
    Buyer receives: energy net of multiplicative line losses.
    """
    expire_stale_orders(db)

    bids = (
        db.query(Order)
        .filter(Order.side == OrderSide.BID, Order.status.in_([OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED]))
        .order_by(Order.price_per_kwh.desc(), Order.created_at.asc())
        .all()
    )
    offers = (
        db.query(Order)
        .filter(Order.side == OrderSide.OFFER, Order.status.in_([OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED]))
        .order_by(Order.price_per_kwh.asc(), Order.created_at.asc())
        .all()
    )
    if not bids or not offers:
        return {"matched_trades": 0, "total_volume_kwh": 0.0, "total_value": 0.0, "total_loss_kwh": 0.0, "trades": []}

    route_cache: dict[tuple[str, str, float], object] = {}
    trades: list[Trade] = []
    total_volume = 0.0
    total_value = 0.0
    total_loss = 0.0

    for bid in bids:
        bid_wallet = get_or_create_wallet(db, bid.user_id, for_update=True)
        remaining_bid = bid.remaining_kwh

        # Rank offers by delivered cost = ask + network cost to buyer's node.
        ranked: list[tuple[float, object, object]] = []
        for offer in offers:
            if offer.remaining_kwh <= 0:
                continue
            if offer.user_id == bid.user_id:
                continue  # no self-trading
            ask = float(offer.price_per_kwh)
            if ask > float(bid.price_per_kwh):
                continue  # bid must cover ask price at minimum
            required_kw = min(remaining_bid, offer.remaining_kwh)
            key = (offer.node_id, bid.node_id, round(required_kw, 2))
            if key not in route_cache:
                route_cache[key] = find_cheapest_route(db, offer.node_id, bid.node_id, required_kw=required_kw)
            route = route_cache[key]
            if not route.feasible:
                continue
            delivered_cost = ask + route.total_network_cost_per_kwh
            if delivered_cost > float(bid.price_per_kwh):
                continue
            ranked.append((delivered_cost, offer, route))

        ranked.sort(key=lambda t: (t[0], t[1].created_at))

        for delivered_cost, offer, route in ranked:
            if remaining_bid <= 0:
                break
            # Buyer wants net delivered energy; seller must send gross to cover losses.
            loss_factor = route.loss_factor
            gross_needed = remaining_bid / max(1.0 - loss_factor, 0.01)
            qty = min(gross_needed, offer.remaining_kwh)
            # Cap by available route capacity (kw == kwh over the tick window).
            if route.min_available_capacity_kw > 0:
                qty = min(qty, route.min_available_capacity_kw)
            if qty <= SURPLUS_THRESHOLD_KW:
                continue

            try:
                trade = _settle_trade(db, bid, offer, route, round(qty, 4))
            except InsufficientFunds:
                remaining_bid = 0
                break

            remaining_bid -= trade.delivered_kwh
            total_volume += float(trade.quantity_kwh)
            total_value += float(trade.total_amount)
            total_loss += float(trade.energy_loss_kwh)
            trades.append(trade)

        if remaining_bid > 0 and bid.filled_kwh > 0:
            bid.status = OrderStatus.PARTIALLY_FILLED
        elif remaining_bid > 0:
            bid.status = OrderStatus.OPEN
        else:
            bid.status = OrderStatus.FILLED

    db.commit()

    # Refresh node congestion + emit events for each new trade.
    from app.services.grid_service import update_node_congestion

    update_node_congestion(db)
    db.commit()

    from app.schemas import TradeOut

    for trade in trades:
        t_dict = trade.to_dict()
        event_bus.publish_threadsafe("trades", {"type": "trade", "data": t_dict})
        event_bus.publish_threadsafe(f"user:{trade.buyer_id}", {"type": "trade", "data": t_dict})
        event_bus.publish_threadsafe(f"user:{trade.seller_id}", {"type": "trade", "data": t_dict})
        event_bus.publish_threadsafe("grid", {"type": "trade_settled", "data": t_dict})
        event_bus.publish_threadsafe("grid", {"type": "grid_update"})

    logger.info("Matching cycle: %d trades, %.2f kWh, $%.4f, loss %.3f kWh",
                len(trades), total_volume, total_value, total_loss)
    return {
        "matched_trades": len(trades),
        "total_volume_kwh": round(total_volume, 4),
        "total_value": round(total_value, 6),
        "total_loss_kwh": round(total_loss, 4),
        "trades": [TradeOut.model_validate(t) for t in trades],
    }
