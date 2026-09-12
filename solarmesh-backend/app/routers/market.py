"""Market endpoints: orders, order book, trades, matching."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user
from app.models import Order, OrderStatus, Trade, User
from app.schemas import MatchResult, OrderBookOut, OrderCreate, OrderOut, TradeOut
from app.services import market_service

router = APIRouter(prefix="/api/market", tags=["market"])


@router.post("/orders", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
def place_order(payload: OrderCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        order = market_service.place_order(db, user, payload)
        try:
            market_service.run_matching(db)
            db.refresh(order)
        except Exception:
            pass
        return order
    except market_service.MarketError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/orders", response_model=list[OrderOut])
def list_my_orders(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Order).filter(Order.user_id == user.id)
    if status_filter:
        try:
            q = q.filter(Order.status == OrderStatus(status_filter))
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown status: {status_filter}")
    return q.order_by(Order.created_at.desc()).offset(offset).limit(limit).all()


@router.get("/orders/open", response_model=list[OrderOut])
def list_open_orders(
    side: str | None = None,
    node_id: str | None = None,
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """All currently-open orders (public marketplace view)."""
    q = db.query(Order).filter(Order.status.in_([OrderStatus.OPEN, OrderStatus.PARTIALLY_FILLED]))
    if side:
        try:
            from app.models import OrderSide

            q = q.filter(Order.side == OrderSide(side))
        except ValueError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown side: {side}")
    if node_id:
        q = q.filter(Order.node_id == node_id)
    return q.order_by(Order.created_at.desc()).offset(offset).limit(limit).all()


@router.get("/orderbook", response_model=OrderBookOut)
def get_order_book(node_id: str | None = None, db: Session = Depends(get_db)):
    return market_service.get_order_book(db, node_id)


@router.get("/trades", response_model=list[TradeOut])
def list_trades(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Trades the current user participates in (kept for API compatibility)."""
    return (
        db.query(Trade)
        .filter((Trade.seller_id == user.id) | (Trade.buyer_id == user.id))
        .order_by(Trade.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.post("/match", response_model=MatchResult)
@router.post("/clear", response_model=MatchResult)
def trigger_matching(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Run the matching engine across all open orders."""
    return market_service.run_matching(db)


@router.delete("/orders/{order_id}", response_model=OrderOut)
def cancel_order(order_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        return market_service.cancel_order(db, user, order_id)
    except market_service.MarketError as e:
        code = status.HTTP_404_NOT_FOUND if "not found" in str(e) else status.HTTP_400_BAD_REQUEST
        raise HTTPException(status_code=code, detail=str(e))
