"""Market operations: order placement, order book, and the matching engine.

Matching is network-aware: for each bid we search offers ordered by
(delivered cost = price + network cost), maximizing surplus for both sides
while charging the buyer the network delivery cost of the cheapest route.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    GridEdge,
    LedgerEntryType,
    Order,
    OrderSide,
    OrderStatus,
    Trade,
    TradeStatus,
    Wallet,
)
from app.schemas import OrderCreate
from app.services.grid_service import find_cheapest_route
from app.services.wallet_service import (
    InsufficientFunds,
    apply_ledger_entry,
    get_or_create_wallet,
    release_reservation,
    reserve_funds,
)
from app.routers.telemetry import event_bus


class MarketError(Exception):
    pass


def place_order(db: Session, user, payload: OrderCreate) -> Order:
    """Create an offer or bid. Bids reserve funds immediately."""
    from app.models import GridNode

    node = db.get(GridNode, payload.node_id)
    if node is None:
        raise MarketError("Grid node not found")

    expires_at = datetime.now(timezone.utc) + timedelta(hours=payload.expires_in_hours)
    order = Order(
        side=OrderSide(payload.side),
        user_id=user.id,
        node_id=payload.node_id,
        price_per_kwh=payload.price_per_kwh,
        quantity_kwh=payload.quantity_kwh,
        expires_at=expires_at,
    )

    if order.side == OrderSide.BID:
        reserve = round(payload.price_per_kwh * payload.quantity_kwh, 6)
        wallet = get_or_create_wallet(db, user.id, for_update=True)
        try:
            reserve_funds(db, wallet, reserve)
        except InsufficientFunds as e:
            raise MarketError(str(e)) from e

    db.add(order)
    db.commit()
    db.refresh(order)
    event_bus.publish_threadsafe("orders", {"type": "order_created", "data": order.to_dict()})
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


def _clamp_price(price: float) -> float:
    return round(min(settings.ENERGY_PRICE_CEIL, max(settings.ENERGY_PRICE_FLOOR, price)), 4)


def run_matching(db: Session) -> dict:
    """Match open bids with feasible offers, network-aware, surplus-maximizing.

    Buyer pays: ask price + network cost (delivery).
    Seller receives: ask price.
    Platform/grid: network cost margin (retained as congestion revenue).
    """
    expire_stale_orders(db)

    bids = (
        db.query(Order)
        .filter(Order.side == OrderSide.BID, Order.status.in_([OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED]))
        .order_by(Order.price_per_kwh.desc(), Order.created_at.asc())
        .with_for_update()
        .all()
    )
    offers = (
        db.query(Order)
        .filter(Order.side == OrderSide.OFFER, Order.status.in_([OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED]))
        .order_by(Order.price_per_kwh.asc(), Order.created_at.asc())
        .with_for_update()
        .all()
    )
    if not bids or not offers:
        return {"matched_trades": 0, "total_volume_kwh": 0.0, "total_value": 0.0, "trades": []}

    # Cache routes between node pairs
    route_cache: dict[tuple[str, str], object] = {}
    trades: list[Trade] = []
    total_volume = 0.0
    total_value = 0.0

    for bid in bids:
        bid_wallet = get_or_create_wallet(db, bid.user_id, for_update=True)

        # Rank offers by delivered cost = ask + network cost to buyer's node
        ranked: list[tuple[float, Order, object]] = []
        for offer in offers:
            if offer.remaining_kwh <= 0:
                continue
            if offer.user_id == bid.user_id:
                continue  # no self-trading
            if float(offer.price_per_kwh) > float(bid.price_per_kwh):
                continue  # bid must cover ask price at minimum
            key = (offer.node_id, bid.node_id)
            if key not in route_cache:
                route_cache[key] = find_cheapest_route(db, offer.node_id, bid.node_id)
            route = route_cache[key]
            if not route.feasible:
                continue
            delivered = float(offer.price_per_kwh) + route.total_network_cost_per_kwh
            if delivered > float(bid.price_per_kwh):
                continue  # even with network cost the buyer won't pay it
            ranked.append((delivered, offer, route))

        ranked.sort(key=lambda t: (t[0], t[1].created_at))

        if not ranked:
            continue

        remaining_bid = bid.remaining_kwh

        for delivered_cost, offer, route in ranked:
            if remaining_bid <= 0:
                break
            qty = min(remaining_bid, offer.remaining_kwh)
            gross = round(qty * float(offer.price_per_kwh), 6)
            network_cost = round(qty * route.total_network_cost_per_kwh, 6)
            buyer_pays = round(gross + network_cost, 6)

            try:
                apply_ledger_entry(
                    db, bid_wallet, LedgerEntryType.TRADE_PAYMENT,
                    -buyer_pays, reference=offer.id, memo=f"Energy purchase {qty} kWh",
                )
                offer_wallet = get_or_create_wallet(db, offer.user_id, for_update=True)
                apply_ledger_entry(
                    db, offer_wallet, LedgerEntryType.TRADE_RECEIPT,
                    gross, reference=bid.id, memo=f"Energy sale {qty} kWh",
                )
                # Safely release only the portion reserved for the filled quantity
                release_reservation(db, bid_wallet, round(qty * float(bid.price_per_kwh), 6))
                bid_wallet.energy_kwh_bought = round(float(bid_wallet.energy_kwh_bought) + qty, 4)
                offer_wallet.energy_kwh_sold = round(float(offer_wallet.energy_kwh_sold) + qty, 4)
            except InsufficientFunds:
                remaining_bid = 0
                break

            trade = Trade(
                offer_id=offer.id,
                bid_id=bid.id,
                seller_id=offer.user_id,
                buyer_id=bid.user_id,
                quantity_kwh=qty,
                price_per_kwh=float(offer.price_per_kwh),
                network_cost_per_kwh=route.total_network_cost_per_kwh,
                total_amount=buyer_pays,
                path_nodes=",".join(route.path_node_ids),
                status=TradeStatus.SETTLED,
            )
            db.add(trade)
            db.flush()

            offer.filled_kwh = float(offer.filled_kwh) + qty
            bid.filled_kwh = float(bid.filled_kwh) + qty
            remaining_bid -= qty
            total_volume += qty
            total_value += buyer_pays
            trades.append(trade)

            if offer.remaining_kwh <= 0:
                offer.status = OrderStatus.FILLED
            else:
                offer.status = OrderStatus.PARTIALLY_FILLED

        if remaining_bid > 0:
            bid.status = OrderStatus.OPEN if bid.filled_kwh == 0 else OrderStatus.PARTIALLY_FILLED
        else:
            bid.status = OrderStatus.FILLED

    db.commit()

    for trade in trades:
        t_dict = trade.to_dict()
        event_bus.publish_threadsafe("trades", {"type": "trade", "data": t_dict})
        event_bus.publish_threadsafe(f"user:{trade.buyer_id}", {"type": "trade", "data": t_dict})
        event_bus.publish_threadsafe(f"user:{trade.seller_id}", {"type": "trade", "data": t_dict})
        event_bus.publish_threadsafe("grid", {"type": "trade_settled", "data": t_dict})

    from app.schemas import TradeOut

    return {
        "matched_trades": len(trades),
        "total_volume_kwh": round(total_volume, 4),
        "total_value": round(total_value, 6),
        "trades": [TradeOut.model_validate(t) for t in trades],
    }

