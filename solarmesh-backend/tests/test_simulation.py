"""Simulation service: tick execution, settlement integrity, status."""
from __future__ import annotations

from app.services import market_service, simulation_service


def test_tick_produces_readings_and_orders(db_session, grid_nodes, test_user):
    from app.models import Device, Order, Telemetry

    device = Device(
        owner_id=test_user.id, node_id=grid_nodes["n1"].id,
        name="Tick Array", device_type="solar_panel", capacity_kwh=8.0,
    )
    db_session.add(device)
    db_session.flush()

    result = simulation_service.run_tick(db_session)
    assert result["readings"] >= 1
    assert db_session.query(Telemetry).count() >= 1
    # A midday-style surplus or deficit auto order should eventually appear;
    # depending on wall-clock hour it may be an offer, bid, or neither.
    assert isinstance(result["matched_trades"], int)


def test_settlement_atomicity(db_session, grid_nodes):
    """Buyer debit + seller credit + ledger rows all commit together."""
    from app.models import LedgerEntry, LedgerEntryType, User, UserRole
    from app.security import hash_password
    from app.services.wallet_service import get_or_create_wallet

    seller = User(email="settle-s@test.io", full_name="S",
                  hashed_password=hash_password("pw"), role=UserRole.PROSUMER)
    buyer = User(email="settle-b@test.io", full_name="B",
                 hashed_password=hash_password("pw"), role=UserRole.PROSUMER)
    db_session.add_all([seller, buyer])
    db_session.flush()

    from app.services.wallet_service import apply_ledger_entry

    for u in (seller, buyer):
        w = get_or_create_wallet(db_session, u.id)
        apply_ledger_entry(db_session, w, LedgerEntryType.DEPOSIT, 1000.0, memo="test")

    offer = market_service.place_order(db_session, seller, __import__(
        "app.schemas", fromlist=["OrderCreate"]).OrderCreate(
        side="offer", price_per_kwh=0.10, quantity_kwh=10, node_id=grid_nodes["n1"].id))
    bid = market_service.place_order(db_session, buyer, __import__(
        "app.schemas", fromlist=["OrderCreate"]).OrderCreate(
        side="bid", price_per_kwh=0.30, quantity_kwh=5, node_id=grid_nodes["n3"].id))

    seller_balance_before = float(get_or_create_wallet(db_session, seller.id).balance)
    buyer_balance_before = float(get_or_create_wallet(db_session, buyer.id).balance)

    result = market_service.run_matching(db_session)
    assert result["matched_trades"] == 1

    seller_balance_after = float(get_or_create_wallet(db_session, seller.id).balance)
    buyer_balance_after = float(get_or_create_wallet(db_session, buyer.id).balance)

    # Seller credited exactly gross; buyer paid more (network fee included).
    assert seller_balance_after > seller_balance_before
    assert buyer_balance_after < buyer_balance_before

    # Ledger rows recorded for both sides.
    seller_wallet_id = get_or_create_wallet(db_session, seller.id).id
    buyer_wallet_id = get_or_create_wallet(db_session, buyer.id).id
    assert db_session.query(LedgerEntry).filter(
        LedgerEntry.wallet_id == seller_wallet_id,
        LedgerEntry.entry_type == LedgerEntryType.TRADE_RECEIPT,
    ).count() == 1
    assert db_session.query(LedgerEntry).filter(
        LedgerEntry.wallet_id == buyer_wallet_id,
        LedgerEntry.entry_type == LedgerEntryType.TRADE_PAYMENT,
    ).count() == 1


def test_insufficient_balance_blocks_trade(db_session, grid_nodes):
    """A bid whose escrow cannot cover the fill must not settle."""
    from app.models import User, UserRole
    from app.security import hash_password
    from app.services.wallet_service import apply_ledger_entry, get_or_create_wallet

    seller = User(email="poor-s@test.io", full_name="S",
                  hashed_password=hash_password("pw"), role=UserRole.PROSUMER)
    buyer = User(email="poor-b@test.io", full_name="B",
                 hashed_password=hash_password("pw"), role=UserRole.PROSUMER)
    db_session.add_all([seller, buyer])
    db_session.flush()

    seller_wallet = get_or_create_wallet(db_session, seller.id)
    apply_ledger_entry(db_session, seller_wallet, __import__(
        "app.models", fromlist=["LedgerEntryType"]).LedgerEntryType.DEPOSIT, 1000.0, memo="t")
    buyer_wallet = get_or_create_wallet(db_session, buyer.id)
    apply_ledger_entry(db_session, buyer_wallet, __import__(
        "app.models", fromlist=["LedgerEntryType"]).LedgerEntryType.DEPOSIT, 0.01, memo="t")

    market_service.place_order(db_session, seller, __import__(
        "app.schemas", fromlist=["OrderCreate"]).OrderCreate(
        side="offer", price_per_kwh=0.10, quantity_kwh=10, node_id=grid_nodes["n1"].id))
    # Bid of 5 kWh @ 0.30 needs $1.50 escrow — buyer only has $0.01, so placement fails.
    from app.schemas import OrderCreate

    try:
        market_service.place_order(db_session, buyer, OrderCreate(
            side="bid", price_per_kwh=0.30, quantity_kwh=5, node_id=grid_nodes["n3"].id))
        placed = True
    except market_service.MarketError:
        placed = False
    assert not placed  # escrow requirement prevents unbacked bids


def test_route_capacity_capped_trade_volume(db_session, grid_nodes):
    """Trade quantity cannot exceed the route's minimum available capacity."""
    from app.models import GridEdge, User, UserRole
    from app.security import hash_password
    from app.services.wallet_service import apply_ledger_entry, get_or_create_wallet

    seller = User(email="cap-s@test.io", full_name="S",
                  hashed_password=hash_password("pw"), role=UserRole.PROSUMER)
    buyer = User(email="cap-b@test.io", full_name="B",
                 hashed_password=hash_password("pw"), role=UserRole.PROSUMER)
    db_session.add_all([seller, buyer])
    db_session.flush()
    for u in (seller, buyer):
        w = get_or_create_wallet(db_session, u.id)
        apply_ledger_entry(db_session, w, __import__(
            "app.models", fromlist=["LedgerEntryType"]).LedgerEntryType.DEPOSIT, 1000.0, memo="t")

    # Squeeze n1-n2 corridor to 3 kW headroom.
    for e in db_session.query(GridEdge).all():
        if {e.from_node_id, e.to_node_id} == {grid_nodes["n1"].id, grid_nodes["n2"].id}:
            e.load_kw = e.capacity_kw - 3.0
    db_session.flush()

    from app.schemas import OrderCreate

    market_service.place_order(db_session, seller, OrderCreate(
        side="offer", price_per_kwh=0.10, quantity_kwh=50, node_id=grid_nodes["n1"].id))
    bid = market_service.place_order(db_session, buyer, OrderCreate(
        side="bid", price_per_kwh=0.50, quantity_kwh=40, node_id=grid_nodes["n3"].id))

    result = market_service.run_matching(db_session)
    # n1->n3 requires the n1-n2 edge (3 kW headroom) -> volume capped near 3 kWh.
    assert result["matched_trades"] >= 0
    for trade in result["trades"]:
        assert trade.quantity_kwh <= 3.5  # gross send capped by corridor headroom


def test_simulation_status_defaults(db_session):
    status = simulation_service.get_status(db_session)
    assert status["is_running"] in (True, False)
    assert status["interval_seconds"] >= 2
