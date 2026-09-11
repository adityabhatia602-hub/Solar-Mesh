"""Wallet and ledger endpoint tests."""
from __future__ import annotations


def _auth_header(client, email):
    r = client.post("/api/auth/register", json={
        "email": email, "password": "password123", "full_name": "W U",
    })
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_new_wallet_zero_balance(client):
    h = _auth_header(client, "wallet1@test.io")
    r = client.get("/api/wallet", headers=h)
    assert r.status_code == 200
    body = r.json()
    assert body["balance"] == 0.0
    assert body["available"] == 0.0


def test_deposit_and_ledger(client):
    h = _auth_header(client, "wallet2@test.io")
    r = client.post("/api/wallet/deposit/self", json={"amount": 250.0}, headers=h)
    assert r.status_code == 200, r.text
    assert r.json()["balance"] == 250.0

    r2 = client.post("/api/wallet/deposit/self", json={"amount": 100.0}, headers=h)
    assert r2.json()["balance"] == 350.0

    r3 = client.get("/api/wallet/ledger", headers=h)
    entries = r3.json()
    assert len(entries) == 2
    assert all(e["entry_type"] == "deposit" for e in entries)
    assert entries[0]["balance_after"] == 350.0  # newest first


def test_deposit_rejects_negative(client):
    h = _auth_header(client, "wallet3@test.io")
    r = client.post("/api/wallet/deposit/self", json={"amount": -5}, headers=h)
    assert r.status_code == 422


def test_admin_deposit_target_user(client, db_session):
    from app.models import User, UserRole
    from app.security import create_access_token, hash_password

    admin = User(
        email="admin_wallet@test.io",
        full_name="Admin Wallet",
        hashed_password=hash_password("password123"),
        role=UserRole.ADMIN,
    )
    target = User(
        email="target_user@test.io",
        full_name="Target User",
        hashed_password=hash_password("password123"),
        role=UserRole.PROSUMER,
    )
    db_session.add_all([admin, target])
    db_session.flush()

    admin_h = {"Authorization": f"Bearer {create_access_token(admin.id)}"}
    target_h = {"Authorization": f"Bearer {create_access_token(target.id)}"}

    # Deposit into target user's wallet using user_id query param
    r = client.post(f"/api/wallet/deposit?user_id={target.id}", json={"amount": 150.0}, headers=admin_h)
    assert r.status_code == 200, r.text
    assert r.json()["user_id"] == target.id
    assert r.json()["balance"] == 150.0

    # Target user sees the updated balance
    r_target = client.get("/api/wallet", headers=target_h)
    assert r_target.status_code == 200
    assert r_target.json()["balance"] == 150.0

