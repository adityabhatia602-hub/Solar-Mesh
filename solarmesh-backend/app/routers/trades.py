"""Trade listing and detail endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user, require_admin
from app.models import Trade, User
from app.schemas import TradeOut

router = APIRouter(prefix="/api/trades", tags=["trades"])


@router.get("", response_model=list[TradeOut])
def list_trades(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """All trades the current user participates in (admins see everything)."""
    q = db.query(Trade)
    if user.role.value != "admin":
        q = q.filter((Trade.seller_id == user.id) | (Trade.buyer_id == user.id))
    return q.order_by(Trade.created_at.desc()).offset(offset).limit(limit).all()


@router.get("/all", response_model=list[TradeOut])
def list_all_trades(
    limit: int = Query(default=100, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin: every trade on the platform."""
    return db.query(Trade).order_by(Trade.created_at.desc()).offset(offset).limit(limit).all()


@router.get("/{trade_id}", response_model=TradeOut)
def get_trade(
    trade_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    trade = db.get(Trade, trade_id)
    if trade is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Trade not found")
    if user.role.value != "admin" and user.id not in (trade.seller_id, trade.buyer_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a party to this trade")
    return trade
