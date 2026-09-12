"""Unit and integration tests for monitoring, structured logging, and alerting."""
from __future__ import annotations

from app.monitoring import alert_manager, metrics_collector


def test_x_request_id_attached_to_response(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert "X-Request-ID" in r.headers
    assert "X-Response-Time" in r.headers
    assert len(r.headers["X-Request-ID"]) > 0


def test_metrics_summary_endpoint(client):
    r = client.get("/api/monitoring/metrics")
    assert r.status_code == 200
    data = r.json()
    assert "uptime_seconds" in data
    assert "total_requests" in data
    assert "status_breakdown" in data
    assert "latency_ms" in data
    assert "2xx" in data["status_breakdown"]


def test_slow_request_tracking(client):
    # Simulate a slow request that exceeds 500ms threshold
    metrics_collector.slow_requests.clear()
    r = client.post("/api/monitoring/chaos/trigger?simulate_slow=true&delay_seconds=0.55&error_type=none")
    # Will fail with 500 from ValueError("Intentional chaos...") or 422 if param invalid
    assert r.status_code in (500, 422)

    r_slow = client.get("/api/monitoring/slow-requests")
    assert r_slow.status_code == 200
    slow_entries = r_slow.json()
    assert len(slow_entries) > 0
    assert slow_entries[0]["duration_ms"] >= 500.0


def test_error_tracking_and_chaos_endpoint(client):
    # Clear previous error traces
    metrics_collector.recent_errors.clear()

    # Trigger intentional division by zero
    r = client.post("/api/monitoring/chaos/trigger?error_type=division_by_zero")
    assert r.status_code == 500
    body = r.json()
    assert body["error_type"] == "ZeroDivisionError"
    req_id = r.headers["X-Request-ID"]

    # Verify error is immediately captured in /api/monitoring/errors
    r_err = client.get("/api/monitoring/errors")
    assert r_err.status_code == 200
    errors = r_err.json()
    assert len(errors) > 0

    latest = errors[0]
    assert latest["request_id"] == req_id
    assert latest["error_type"] == "ZeroDivisionError"
    assert "division by zero" in latest["error_message"]
    assert "monitoring.py" in latest["file"]
    assert latest["line"] > 0
    assert "ZeroDivisionError" in latest["traceback"]
    assert "trigger_chaos" in latest["traceback"]


def test_alert_manager_error_burst(client):
    alert_manager.recent_alerts.clear()
    alert_manager._error_timestamps.clear()

    # Trigger 3 consecutive errors to breach burst threshold
    for _ in range(3):
        client.post("/api/monitoring/chaos/trigger?error_type=division_by_zero")

    r_alerts = client.get("/api/monitoring/alerts")
    assert r_alerts.status_code == 200
    alerts = r_alerts.json()
    assert len(alerts) > 0
    burst_alert = next((a for a in alerts if a["alert_type"] == "ERROR_BURST"), None)
    assert burst_alert is not None
    assert burst_alert["severity"] == "CRITICAL"
