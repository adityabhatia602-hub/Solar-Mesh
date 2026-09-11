"""Wallet operations: atomic balance mutation with ledger entries.

All money flows in SolarMesh pass through `apply_ledger_entry`, which mutates
the wallet balance and writes an immutable ledger row in the same transaction.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import LedgerEntry, LedgerEntryType, Wallet


class WalletError(Exception):
    pass


class InsufficientFunds(WalletError):
    pass


class WalletNotFound(WalletError):
    pass


def get_or_create_wallet(db: Session, user_id: str, for_update: bool = False) -> Wallet:
    q = db.query(Wallet).filter(Wallet.user_id == user_id)
    if for_update:
        q = q.with_for_update()
    wallet = q.first()
    if wallet is None:
        wallet = Wallet(user_id=user_id, balance=0.0, reserved=0.0)
        db.add(wallet)
        db.flush()
    return wallet


def apply_ledger_entry(
    db: Session,
    wallet: Wallet,
    entry_type: LedgerEntryType,
    amount: float,
    reference: str | None = None,
    memo: str | None = None,
) -> LedgerEntry:
    """Apply a signed amount to the wallet and record a ledger entry.

    Raises InsufficientFunds if the resulting balance would be negative.
    The caller owns the transaction (commit happens at request boundary).
    """
    new_balance = round(float(wallet.balance) + float(amount), 6)
    if new_balance < 0:
        raise InsufficientFunds(
            f"Wallet {wallet.id} balance would go negative: {float(wallet.balance):.4f} + {amount:.4f}"
        )
    wallet.balance = new_balance
    entry = LedgerEntry(
        wallet_id=wallet.id,
        entry_type=entry_type,
        amount=round(amount, 6),
        balance_after=new_balance,
        reference=reference,
        memo=memo,
    )
    db.add(entry)
    db.flush()
    return entry


def reserve_funds(db: Session, wallet: Wallet, amount: float, reference: str | None = None) -> None:
    available = round(float(wallet.balance) - float(wallet.reserved), 6)
    if available < amount:
        raise InsufficientFunds(
            f"Available balance {available:.4f} < {amount:.4f}"
        )
    wallet.reserved = round(float(wallet.reserved) + amount, 6)


def release_reservation(db: Session, wallet: Wallet, amount: float) -> None:
    wallet.reserved = max(0.0, round(float(wallet.reserved) - amount, 6))

