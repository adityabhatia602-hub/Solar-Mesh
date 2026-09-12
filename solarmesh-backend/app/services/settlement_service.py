"""Settlement: atomic wallet movements for executed trades.

All money flows pass through `apply_ledger_entry` (balance mutation + immutable
ledger row in the same DB transaction). Higher-level trade settlement lives in
market_service._settle_trade; this module exposes reusable primitives.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import LedgerEntryType
from app.services.wallet_service import InsufficientFunds, apply_ledger_entry, get_or_create_wallet


def settle_trade_amounts(
    db: Session,
    *,
    buyer_id: str,
    seller_id: str,
    gross_amount: float,
    network_fee: float,
    trade_reference: str,
) -> tuple[float, float]:
    """Debit buyer (energy + network fee), credit seller. Returns (buyer_paid, seller_received).

    Raises InsufficientFunds without partial application — the caller rolls back.
    """
    buyer_pays = round(gross_amount + network_fee, 6)

    buyer_wallet = get_or_create_wallet(db, buyer_id, for_update=True)
    apply_ledger_entry(
        db, buyer_wallet, LedgerEntryType.TRADE_PAYMENT,
        -buyer_pays, reference=trade_reference, memo="Trade settlement",
    )

    seller_wallet = get_or_create_wallet(db, seller_id, for_update=True)
    apply_ledger_entry(
        db, seller_wallet, LedgerEntryType.TRADE_RECEIPT,
        round(gross_amount, 6), reference=trade_reference, memo="Trade settlement",
    )

    return buyer_pays, round(gross_amount, 6)
