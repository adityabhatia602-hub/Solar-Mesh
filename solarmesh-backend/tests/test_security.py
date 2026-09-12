"""Security, IDOR, and Rate-Limiting Regression Tests."""
from __future__ import annotations

import pytest
from app.models import Device, GridNode, Order, OrderSide, OrderStatus, User, UserRole
from app.security import hash_password


def test_idor_telemetry_access_blocked(client, db_session, grid_nodes):
    # User A (victim)
    user_a = User(email="victim@sec.io", full_name="Victim", hashed_password=hash_password("pw123"), role=UserRole.PROSUMER)
    # User B (attacker)
    user_b = User(email="attacker@sec.io", full_name="Attacker", hashed_password=hash_password("pw123"), role=UserRole.CONSUMER)
    db_session.add_all([user_a, user_b])
    db_session.flush()

    node = grid_nodes["n1"]
    dev_a = Device(owner_id=user_a.id, node_id=node.id, name="Solar Array", device_type="solar_panel", capacity_kwh=20.0)
    db_session.add(dev_a)
    db_session.flush()

    # Login attacker
    r_login = client.post("/api/auth/login-json", json={"email": "attacker@sec.io", "password": "pw123"})
    assert r_login.status_code == 200
    token_b = r_login.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # 1. Attacker tries to read victim's device telemetry
    r_history = client.get(f"/api/telemetry/device/{dev_a.id}", headers=headers_b)
    assert r_history.status_code == 403
    assert "Not your device" in r_history.json()["detail"]

    # 2. Attacker tries to query latest telemetry by victim's device ID
    r_latest = client.get(f"/api/telemetry/latest?device_id={dev_a.id}", headers=headers_b)
    assert r_latest.status_code == 403

    # 3. Attacker tries to inject telemetry into victim's device
    r_inject = client.post("/api/telemetry", headers=headers_b, json={
        "device_id": dev_a.id,
        "production_kw": 50.0,
    })
    assert r_inject.status_code == 403


def test_idor_order_cancel_blocked(client, db_session, grid_nodes):
    user_a = User(email="seller@sec.io", full_name="Seller", hashed_password=hash_password("pw123"), role=UserRole.PROSUMER)
    user_b = User(email="badguy@sec.io", full_name="Bad Guy", hashed_password=hash_password("pw123"), role=UserRole.CONSUMER)
    db_session.add_all([user_a, user_b])
    db_session.flush()

    node = grid_nodes["n1"]
    order_a = Order(
        user_id=user_a.id, node_id=node.id, side=OrderSide.OFFER,
        price_per_kwh=0.15, quantity_kwh=10.0, status=OrderStatus.OPEN,
    )
    db_session.add(order_a)
    db_session.flush()

    r_login = client.post("/api/auth/login-json", json={"email": "badguy@sec.io", "password": "pw123"})
    token_b = r_login.json()["access_token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Attacker tries to cancel User A's order
    r_cancel = client.delete(f"/api/market/orders/{order_a.id}", headers=headers_b)
    assert r_cancel.status_code == 403
    assert "Not your order" in r_cancel.json()["detail"]


def test_rbac_admin_routes_forbidden_for_consumers(client, db_session):
    regular_user = User(email="regular@sec.io", full_name="Regular", hashed_password=hash_password("pw123"), role=UserRole.CONSUMER)
    db_session.add(regular_user)
    db_session.flush()

    r_login = client.post("/api/auth/login-json", json={"email": "regular@sec.io", "password": "pw123"})
    token = r_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Admin global trade audit
    r_trades = client.get("/api/trades/all", headers=headers)
    assert r_trades.status_code == 403

    # Admin faucet
    r_deposit = client.post("/api/wallet/deposit", headers=headers, json={"amount": 100.0})
    assert r_deposit.status_code == 403


def test_server_input_boundaries(client, db_session):
    u = User(email="bounds@sec.io", full_name="Bounds", hashed_password=hash_password("pw123"), role=UserRole.CONSUMER)
    db_session.add(u)
    db_session.flush()

    r_login = client.post("/api/auth/login-json", json={"email": "bounds@sec.io", "password": "pw123"})
    headers = {"Authorization": f"Bearer {r_login.json()['access_token']}"}

    # Negative transfer
    r_neg_transfer = client.post("/api/wallet/transfer", headers=headers, json={
        "recipient_email": "other@sec.io",
        "amount": -20.0,
    })
    assert r_neg_transfer.status_code == 422

    # Negative faucet deposit
    r_neg_deposit = client.post("/api/wallet/deposit/self", headers=headers, json={"amount": -100.0})
    assert r_neg_deposit.status_code == 422


def test_rate_limiting_triggers_429(client):
    from app.routers.auth import login_limiter
    login_limiter.reset()

    responses = []
    for _ in range(6):
        r = client.post("/api/auth/login-json", json={"email": "ratelimit@sec.io", "password": "wrong"})
        responses.append(r.status_code)

    assert 429 in responses
    login_limiter.reset()
