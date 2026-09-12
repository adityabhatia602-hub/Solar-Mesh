#!/usr/bin/env python3
"""SolarMesh Reliability, Outage Recovery & Idempotency Audit Script.

Executes the PRACTICAL CHECK:
'Imagine your database or payment provider goes down for 10 minutes right now.
What does the user actually see? What happens to their request?'
"""

import sys
import uuid
import httpx

BASE_URL = "http://127.0.0.1:8000"


def run_reliability_audit():
    client = httpx.Client(base_url=BASE_URL, timeout=15.0)

    print("=" * 75)
    print("SOLARMESH RELIABILITY & OUTAGE RECOVERY AUDIT (PRACTICAL CHECK)")
    print("=" * 75)

    # =========================================================================
    # SCENARIO 1: DATABASE OR SERVICE OUTAGE
    # What does the user actually see? What happens to their request?
    # =========================================================================
    print("\n[!] SCENARIO 1: Database or service goes down...")
    print("    -> Simulating active database drop on user request...")

    r_outage = client.post("/api/monitoring/chaos/trigger?error_type=database_failure")

    print("\n" + "-" * 75)
    print("WHAT HAPPENS TO THEIR REQUEST?")
    print(f"  • HTTP Status Code:     {r_outage.status_code} Service Unavailable (NOT 500 Internal Server Error)")
    print(f"  • Retry-After Header:   {r_outage.headers.get('Retry-After')} seconds (informs client when to retry)")
    print(f"  • Error-Code Header:    {r_outage.headers.get('X-Error-Code')}")
    print(f"  • Tracking Request ID:  {r_outage.headers.get('X-Request-ID')}")
    print("-" * 75)

    assert r_outage.status_code == 503, f"Expected 503 Service Unavailable, got {r_outage.status_code}"
    assert r_outage.headers.get("Retry-After") == "5", "Missing Retry-After header!"

    body = r_outage.json()
    print("\nWHAT DOES THE USER ACTUALLY SEE?")
    print(f"  • Friendly Message:     \"{body.get('detail')}\"")
    print(f"  • Error Code:           {body.get('error_code')}")
    print(f"  • Retry After Seconds:  {body.get('retry_after_seconds')}s")
    print(f"  • Support Request ID:   {body.get('request_id')}")
    print("-" * 75)

    assert "temporarily unavailable" in body["detail"]
    assert body["error_code"] == "DATABASE_UNAVAILABLE"
    print("  [PASS] User sees a polite, non-technical explanation with automatic retry guidance.")

    # Check alert was generated
    print("\n[+] Checking automated alerting for the outage...")
    r_alerts = client.get("/api/monitoring/alerts")
    alerts = r_alerts.json()
    db_alert = next((a for a in alerts if a.get("alert_type") in ("DATABASE_OUTAGE", "DATABASE_TIMEOUT")), None)
    assert db_alert is not None, "Alert was not triggered for database outage!"
    print(f"  [PASS] Operational Alert Fired: [{db_alert['severity']}] {db_alert['title']}")
    print(f"         {db_alert['message']}")

    # =========================================================================
    # SCENARIO 2: USER RETRIES AN ACTION THAT FAILED HALFWAY (IDEMPOTENCY)
    # What happens when a network drops after processing a payment/transfer?
    # =========================================================================
    print("\n[!] SCENARIO 2: User's connection drops halfway through a transfer...")
    uid = uuid.uuid4().hex[:6]
    alice_email = f"alice_{uid}@rel.io"
    bob_email = f"bob_{uid}@rel.io"
    pwd = "SecurePassword123!"

    r_alice = client.post("/api/auth/register", json={"email": alice_email, "password": pwd, "full_name": "Alice R", "role": "prosumer"})
    r_bob = client.post("/api/auth/register", json={"email": bob_email, "password": pwd, "full_name": "Bob R", "role": "consumer"})
    alice_token = r_alice.json()["access_token"]
    alice_headers = {"Authorization": f"Bearer {alice_token}"}

    # Fund Alice with ₹1,000
    client.post("/api/wallet/deposit/self", headers=alice_headers, json={"amount": 1000.0})

    idem_key = f"idem-transfer-{uuid.uuid4().hex}"
    transfer_headers = {**alice_headers, "X-Idempotency-Key": idem_key}

    print(f"    -> Alice submits transfer of ₹350 with Idempotency-Key: {idem_key[:16]}...")
    r_tx1 = client.post("/api/wallet/transfer", headers=transfer_headers, json={
        "recipient_email": bob_email,
        "amount": 350.0,
        "memo": "P2P Solar Settlement",
    })
    assert r_tx1.status_code == 200, f"Transfer failed: {r_tx1.text}"
    alice_balance_after_1 = r_tx1.json()["balance"]
    print(f"    -> Transfer 1 Processed. Alice Balance: ₹{alice_balance_after_1:.2f}")

    # SIMULATE NETWORK DROP & CLIENT RETRY
    print("    -> Network drops before confirmation reaches mobile device. Client retries transfer...")
    r_tx2 = client.post("/api/wallet/transfer", headers=transfer_headers, json={
        "recipient_email": bob_email,
        "amount": 350.0,
        "memo": "P2P Solar Settlement",
    })
    assert r_tx2.status_code == 200, f"Retry failed: {r_tx2.text}"
    assert r_tx2.headers.get("X-Idempotent-Replay") == "true", "Expected idempotent replay header!"
    alice_balance_after_2 = r_tx2.json()["balance"]

    print(f"    -> Transfer 2 Replayed. Server returned X-Idempotent-Replay: true")
    print(f"    -> Alice Balance After Retry: ₹{alice_balance_after_2:.2f}")

    assert alice_balance_after_1 == alice_balance_after_2 == 650.0, (
        f"DOUBLE DEBIT DETECTED! Expected ₹650.0, got {alice_balance_after_2}"
    )
    print("  [PASS] SAFE RETRY VERIFIED: Zero double-debiting! Exactly ₹350 deducted total.")

    print("\n" + "=" * 75)
    print("ALL RELIABILITY & RECOVERY SCENARIOS PASSED WITH 100% INTEGRITY!")
    print("=" * 75)


if __name__ == "__main__":
    run_reliability_audit()
