"""Market: order placement, order book, and matching engine tests."""
from __future__ import annotations

from app.models import LedgerEntryType, OrderSide
from app.schemas import OrderCreate
from app.services import market_service
from app.services.wallet_service import apply_ledger_entry, get_or_create_wallet


def _make_user(db, email):
    from app.models import User, UserRole
    from app.security import hash_password

    u = User(email=email, full_name=email, hashed_password=hash_password("pw"), role=UserRole.PROSUMER)
    db.add(u)
    db.flush()
    w = get_or_create_wallet(db, u.id)
    apply_ledger_entry(db, w, LedgerEntryType.DEPOSIT, 1000.0, memo="test funds")
    return u


def test_place_bid_reserves_funds(client, db_session, grid_nodes, test_user):
    r = client.post("/api/auth/register", json={
        "email": "bidder@test.io", "password": "password123", "full_name": "B",
    })
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    # Note: register creates wallet with 0 balance; bid should fail without funds
    resp = client.post("/api/market/orders", json={
        "side": "bid", "price_per_kwh": 0.2, "quantity_kwh": 10, "node_id": grid_nodes["n2"].id,
    }, headers=h)
    assert resp.status_code == 400  # insufficient funds
    assert "negative" in resp.json()["detail"].lower() or "balance" in resp.json()["detail"].lower()


def test_matching_full_flow(db_session, grid_nodes):
    seller = _make_user(db_session, "seller@test.io")
    buyer = _make_user(db_session, "buyer@test.io")

    offer = market_service.place_order(db_session, seller, OrderCreate(
        side="offer", price_per_kwh=0.10, quantity_kwh=10, node_id=grid_nodes["n1"].id,
    ))
    bid = market_service.place_order(db_session, buyer, OrderCreate(
        side="bid", price_per_kwh=0.20, quantity_kwh=5, node_id=grid_nodes["n3"].id,
    ))

    result = market_service.run_matching(db_session)
    assert result["matched_trades"] == 1
    assert result["total_volume_kwh"] == 5.0

    trade = result["trades"][0]
    assert trade.price_per_kwh == 0.10
    assert trade.total_amount > 5 * 0.10  # includes network cost
    assert len(trade.path_nodes) == 3  # n1 -> n2 -> n3

    # Seller credited gross, buyer paid gross + network
    seller_wallet = get_or_create_wallet(db_session, seller.id)
    buyer_wallet = get_or_create_wallet(db_session, buyer.id)
    assert float(seller_wallet.balance) > 1000.0
    assert float(buyer_wallet.balance) < 1000.0
    assert float(buyer_wallet.reserved) == 0.0  # fully settled
    assert bid.status.value == "filled"
    assert offer.status.value == "partially_filled"  # 10 kWh offer, 5 consumed


def test_partial_fill(db_session, grid_nodes):
    seller = _make_user(db_session, "pseller@test.io")
    buyer = _make_user(db_session, "pbuyer@test.io")

    market_service.place_order(db_session, seller, OrderCreate(
        side="offer", price_per_kwh=0.10, quantity_kwh=3, node_id=grid_nodes["n1"].id,
    ))
    bid = market_service.place_order(db_session, buyer, OrderCreate(
        side="bid", price_per_kwh=0.20, quantity_kwh=10, node_id=grid_nodes["n1"].id,
    ))
    result = market_service.run_matching(db_session)
    assert result["matched_trades"] == 1
    assert bid.status.value == "partially_filled"


def test_no_match_when_price_too_high(db_session, grid_nodes):
    seller = _make_user(db_session, "expensive@test.io")
    buyer = _make_user(db_session, "cheap@test.io")
    market_service.place_order(db_session, seller, OrderCreate(
        side="offer", price_per_kwh=0.50, quantity_kwh=5, node_id=grid_nodes["n1"].id,
    ))
    market_service.place_order(db_session, buyer, OrderCreate(
        side="bid", price_per_kwh=0.15, quantity_kwh=5, node_id=grid_nodes["n1"].id,
    ))
    result = market_service.run_matching(db_session)
    assert result["matched_trades"] == 0


def test_orderbook_levels(client, db_session, grid_nodes):
    seller = _make_user(db_session, "obseller@test.io")
    market_service.place_order(db_session, seller, OrderCreate(
        side="offer", price_per_kwh=0.10, quantity_kwh=5, node_id=grid_nodes["n1"].id,
    ))
    market_service.place_order(db_session, seller, OrderCreate(
        side="offer", price_per_kwh=0.12, quantity_kwh=7, node_id=grid_nodes["n1"].id,
    ))
    book = market_service.get_order_book(db_session, grid_nodes["n1"].id)
    assert len(book["offers"]) == 2
    assert book["offers"][0]["price_per_kwh"] == 0.10  # sorted ascending
    assert book["bids"] == []
