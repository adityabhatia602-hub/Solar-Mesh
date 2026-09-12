"""Wallet and ledger endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user, require_admin
from app.models import LedgerEntry, LedgerEntryType, User
from app.schemas import DepositRequest, LedgerEntryOut, TransferRequest, WalletOut
from app.services.wallet_service import apply_ledger_entry, get_or_create_wallet

router = APIRouter(prefix="/api/wallet", tags=["wallet"])


@router.get("", response_model=WalletOut)
@router.get("/me", response_model=WalletOut)
def get_wallet(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    wallet = get_or_create_wallet(db, user.id)
    db.commit()
    return wallet


@router.post("/transfer", response_model=WalletOut)
def transfer_funds(
    payload: TransferRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Transfer funds directly from current user's wallet to another peer by email."""
    target_email = payload.recipient_email.lower().strip()
    if target_email == user.email.lower().strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot transfer funds to your own account",
        )

    recipient = db.query(User).filter(User.email == target_email).first()
    if recipient is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Recipient user '{payload.recipient_email}' not found",
        )

    sender_wallet = get_or_create_wallet(db, user.id, for_update=True)
    recipient_wallet = get_or_create_wallet(db, recipient.id, for_update=True)

    available = round(float(sender_wallet.balance) - float(sender_wallet.reserved), 6)
    if available < payload.amount:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Insufficient funds: available ₹{available:.2f} is less than ₹{payload.amount:.2f}",
        )

    memo_sender = payload.memo or f"Transfer to {recipient.full_name} ({recipient.email})"
    memo_recipient = payload.memo or f"Transfer from {user.full_name} ({user.email})"

    try:
        apply_ledger_entry(
            db,
            sender_wallet,
            LedgerEntryType.TRANSFER_OUT,
            -payload.amount,
            reference=recipient.id,
            memo=memo_sender,
        )
        apply_ledger_entry(
            db,
            recipient_wallet,
            LedgerEntryType.TRANSFER_IN,
            payload.amount,
            reference=user.id,
            memo=memo_recipient,
        )
        db.commit()
        db.refresh(sender_wallet)
        return sender_wallet
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Transfer could not be processed: {str(e)}",
        )


@router.get("/ledger", response_model=list[LedgerEntryOut])
def get_ledger(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    wallet = get_or_create_wallet(db, user.id)
    entries = (
        db.query(LedgerEntry)
        .filter(LedgerEntry.wallet_id == wallet.id)
        .order_by(LedgerEntry.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    return entries


@router.post("/deposit", response_model=WalletOut)
def deposit(
    payload: DepositRequest,
    target_user_id: str | None = Query(default=None, alias="user_id"),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admin-only test faucet: credit a user's wallet via ?user_id= or the admin's own wallet."""
    target_id = target_user_id if target_user_id else user.id
    target_user = db.get(User, target_id)
    if target_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target user not found")
    return _apply_adjustment(payload, target_user, db)



@router.post("/deposit/self", response_model=WalletOut)
def deposit_self(
    payload: DepositRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Hackathon faucet: any user can credit their own wallet for testing."""
    return _apply_adjustment(payload, user, db)


def _apply_adjustment(payload: DepositRequest, user: User, db: Session) -> WalletOut:
    wallet = get_or_create_wallet(db, user.id)
    try:
        apply_ledger_entry(
            db,
            wallet,
            LedgerEntryType.DEPOSIT,
            payload.amount,
            memo="Deposit (hackathon faucet)",
        )
    except Exception:
        db.rollback()
        raise
    db.commit()
    db.refresh(wallet)
    return wallet
