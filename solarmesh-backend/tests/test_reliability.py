"""Reliability, Idempotency, and Failure Recovery Tests."""
from __future__ import annotations

from unittest.mock import patch
import pytest
import requests

from app.idempotency import idempotency_manager
from app.monitoring import alert_manager
from app.models import Order, User, UserRole
from app.security import hash_password


def test_idempotency_prevents_duplicate_transfers(client, db_session):
    idempotency_manager.clear()

    # User A (Alice) and User B (Bob)
    alice = User(email="alice.idem@test.io", full_name="Alice Idem", hashed_password=hash_password("pw123"), role=UserRole.PROSUMER)
    bob = User(email="bob.idem@test.io", full_name="Bob Idem", hashed_password=hash_password("pw123"), role=UserRole.CONSUMER)
    db_session.add_all([alice, bob])
    db_session.flush()

    r_login = client.post("/api/auth/login-json", json={"email": "alice.idem@test.io", "password": "pw123"})
    token = r_login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Deposit ₹1000 into Alice's wallet
    client.post("/api/wallet/deposit/self", headers=headers, json={"amount": 1000.0})

    # Step 1: Initial Transfer with Idempotency Key
    idem_key = "transfer-unique-key-101"
    headers_with_idem = {**headers, "X-Idempotency-Key": idem_key}

    r1 = client.post("/api/wallet/transfer", headers=headers_with_idem, json={
        "recipient_email": "bob.idem@test.io",
        "amount": 200.0,
        "memo": "Idempotent energy payment",
    })
    assert r1.status_code == 200
    assert r1.json()["balance"] == 800.0
    assert "X-Idempotent-Replay" not in r1.headers

    # Step 2: Client re-submits exact same request (simulated network retry halfway)
    r2 = client.post("/api/wallet/transfer", headers=headers_with_idem, json={
        "recipient_email": "bob.idem@test.io",
        "amount": 200.0,
        "memo": "Idempotent energy payment",
    })
    assert r2.status_code == 200
    assert r2.headers.get("X-Idempotent-Replay") == "true"
    assert r2.json()["balance"] == 800.0

    # Step 3: Verify Alice was NOT charged twice
    r_wallet = client.get("/api/wallet/me", headers=headers)
    assert r_wallet.json()["balance"] == 800.0


def test_idempotency_payload_mismatch_rejected(client, db_session):
    idempotency_manager.clear()

    u = User(email="user.mismatch@test.io", full_name="User Mismatch", hashed_password=hash_password("pw123"), role=UserRole.PROSUMER)
    db_session.add(u)
    db_session.flush()

    r_login = client.post("/api/auth/login-json", json={"email": "user.mismatch@test.io", "password": "pw123"})
    headers = {"Authorization": f"Bearer {r_login.json()['access_token']}", "X-Idempotency-Key": "key-shared-001"}

    # Deposit with key
    r1 = client.post("/api/wallet/deposit/self", headers=headers, json={"amount": 100.0})
    assert r1.status_code == 200

    # Try to reuse same key with different amount (₹500 instead of ₹100)
    r2 = client.post("/api/wallet/deposit/self", headers=headers, json={"amount": 500.0})
    assert r2.status_code == 422
    assert "reuse with different request payload" in r2.json()["detail"]


def test_database_disconnect_graceful_503(client):
    alert_manager.recent_alerts.clear()

    # Trigger simulated database failure
    r = client.post("/api/monitoring/chaos/trigger?error_type=database_failure")
    assert r.status_code == 503
    assert r.headers.get("Retry-After") == "5"
    assert r.headers.get("X-Error-Code") == "DATABASE_UNAVAILABLE"

    body = r.json()
    assert body["error_code"] == "DATABASE_UNAVAILABLE"
    assert "temporarily unavailable" in body["detail"]
    assert body["retry_after_seconds"] == 5

    # Confirm critical alert fired
    r_alerts = client.get("/api/monitoring/alerts")
    alerts = r_alerts.json()
    db_alert = next((a for a in alerts if a.get("alert_type") in ("DATABASE_OUTAGE", "DATABASE_TIMEOUT")), None)
    assert db_alert is not None
    assert db_alert["severity"] == "CRITICAL"


def test_external_auth_timeout_returns_504(client):
    with patch("google.oauth2.id_token.verify_oauth2_token", side_effect=requests.exceptions.Timeout("Read timeout")):
        r = client.post("/api/auth/google", json={"token": "mock-token", "role": "consumer"})
        assert r.status_code == 504
        assert "timed out" in r.json()["detail"]
