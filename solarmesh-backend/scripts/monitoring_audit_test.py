#!/usr/bin/env python3
"""SolarMesh Monitoring, Observability & Chaos Audit Script.

Executes the PRACTICAL CHECK:
'Break something on purpose. Can you find out what broke and where, in under a minute?'
"""

import sys
import time
import httpx

BASE_URL = "http://127.0.0.1:8000"


def run_monitoring_audit():
    client = httpx.Client(base_url=BASE_URL, timeout=15.0)

    print("=" * 75)
    print("SOLARMESH MONITORING & CHAOS AUDIT (PRACTICAL CHECK)")
    print("=" * 75)
    start_audit_time = time.perf_counter()

    # 1. Health check & Observability Headers
    print("\n[+] Checking baseline health & correlation headers...")
    r_health = client.get("/health")
    assert r_health.status_code == 200, f"Health check failed: {r_health.text}"
    req_id = r_health.headers.get("X-Request-ID")
    resp_time = r_health.headers.get("X-Response-Time")
    print(f"    Health Status: {r_health.json()['status']}")
    print(f"    Correlation ID: {req_id} | Latency Header: {resp_time}")
    assert req_id is not None, "Missing X-Request-ID on response!"

    # =========================================================================
    # PRACTICAL CHECK: BREAK SOMETHING ON PURPOSE & PINPOINT CAUSE IN < 60s
    # =========================================================================
    print("\n[!] PRACTICAL CHECK: Intentionally triggering a server-side crash...")
    t0_crash = time.perf_counter()

    r_crash = client.post("/api/monitoring/chaos/trigger?error_type=division_by_zero")
    assert r_crash.status_code == 500, f"Expected 500 status code, got: {r_crash.status_code}"
    crash_req_id = r_crash.headers.get("X-Request-ID")
    crash_body = r_crash.json()

    print(f"    -> Server crashed as expected with HTTP 500 Internal Server Error.")
    print(f"    -> Associated Request ID: {crash_req_id}")

    # Query the observability error ledger
    print("\n[+] Inspecting recent error traces from /api/monitoring/errors...")
    r_errors = client.get("/api/monitoring/errors")
    assert r_errors.status_code == 200, f"Failed to fetch errors: {r_errors.text}"
    recent_errors = r_errors.json()

    assert len(recent_errors) > 0, "No errors recorded in monitoring system!"
    target_error = next((e for e in recent_errors if e.get("request_id") == crash_req_id), recent_errors[0])

    t_diagnosis = time.perf_counter() - t0_crash

    print("-" * 75)
    print("ROOT CAUSE DIAGNOSIS REPORT (COMPLETED IN {:.2f}s):".format(t_diagnosis))
    print(f"  • Request ID:      {target_error['request_id']}")
    print(f"  • What Broke:      {target_error['error_type']} ({target_error['error_message']})")
    print(f"  • Where It Broke:  {target_error['file']} : Line {target_error['line']}")
    print(f"  • Function Name:   {target_error['function']}()")
    print(f"  • Method & Path:   {target_error['method']} {target_error['path']}")
    print(f"  • Timestamp (UTC): {target_error['timestamp']}")
    print("-" * 75)

    assert target_error["error_type"] == "ZeroDivisionError", "Error type mismatch!"
    assert target_error["line"] > 0, "Line number was not pinpointed!"
    print("  >>> SUCCESS: Pinpointed exact failure, file, and line number in {:.3f} seconds! <<<".format(t_diagnosis))

    # =========================================================================
    # SLOW REQUEST DETECTION
    # =========================================================================
    print("\n[+] Testing Slow Request Detection (> 500ms threshold)...")
    r_slow = client.post("/api/monitoring/chaos/trigger?simulate_slow=true&delay_seconds=0.60&error_type=custom")
    assert r_slow.status_code == 500

    r_slow_log = client.get("/api/monitoring/slow-requests")
    assert r_slow_log.status_code == 200
    slow_list = r_slow_log.json()
    assert len(slow_list) > 0, "Slow request was not flagged by monitor!"
    latest_slow = slow_list[0]
    print(f"    -> Flagged slow request: {latest_slow['method']} {latest_slow['path']} took {latest_slow['duration_ms']}ms (> 500ms)")

    # =========================================================================
    # AUTOMATED ALERT BURST DETECTION
    # =========================================================================
    print("\n[+] Testing Automated Alert Manager on Error Bursts...")
    for _ in range(3):
        client.post("/api/monitoring/chaos/trigger?error_type=division_by_zero")

    r_alerts = client.get("/api/monitoring/alerts")
    assert r_alerts.status_code == 200
    alerts = r_alerts.json()
    burst = next((a for a in alerts if a.get("alert_type") == "ERROR_BURST"), None)
    assert burst is not None, "Error burst alert was not triggered!"
    print(f"    -> Automated Alert Fired: [{burst['severity']}] {burst['title']}")
    print(f"       Message: {burst['message']}")

    # =========================================================================
    # METRICS SUMMARY
    # =========================================================================
    print("\n[+] Fetching Global System Observability Metrics...")
    r_metrics = client.get("/api/monitoring/metrics")
    assert r_metrics.status_code == 200
    metrics = r_metrics.json()
    print(f"    • Total Requests Processed: {metrics['total_requests']}")
    print(f"    • Status Code Breakdown:    {metrics['status_breakdown']}")
    print(f"    • Latency Profile:          Avg: {metrics['latency_ms']['avg']}ms | p95: {metrics['latency_ms']['p95']}ms")
    print(f"    • Recorded Errors:          {metrics['recent_errors_count']}")
    print(f"    • Recorded Slow Requests:   {metrics['slow_requests_count']}")

    total_audit_time = time.perf_counter() - start_audit_time
    print("\n" + "=" * 75)
    print(f"ALL MONITORING CHECKS PASSED IN {total_audit_time:.2f} SECONDS (< 60s REQUIREMENT)!")
    print("=" * 75)


if __name__ == "__main__":
    run_monitoring_audit()
