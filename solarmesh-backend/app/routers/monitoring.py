"""Monitoring and Observability endpoints.

Exposes system metrics, failed API traces, slow request profiles,
automated alerts, and a controlled diagnostic crash trigger for the practical check.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any
from fastapi import APIRouter, HTTPException, Query, status

from app.monitoring import alert_manager, metrics_collector

router = APIRouter(prefix="/api/monitoring", tags=["monitoring"])


@router.get("/metrics")
def get_metrics() -> dict[str, Any]:
    """Summary of request volumes, latency distributions, error rates, and system uptime."""
    return metrics_collector.get_summary()


@router.get("/errors")
def get_recent_errors(limit: int = Query(default=50, ge=1, le=100)) -> list[dict[str, Any]]:
    """List recent application errors with exact file, line number, and stack traces."""
    errors = list(metrics_collector.recent_errors)
    return errors[:limit]


@router.get("/slow-requests")
def get_slow_requests(limit: int = Query(default=50, ge=1, le=100)) -> list[dict[str, Any]]:
    """List recent slow requests that exceeded the latency threshold."""
    slow = list(metrics_collector.slow_requests)
    return slow[:limit]


@router.get("/alerts")
def get_recent_alerts(limit: int = Query(default=50, ge=1, le=100)) -> list[dict[str, Any]]:
    """List recent triggered alerts (e.g. error bursts, database issues)."""
    alerts = list(alert_manager.recent_alerts)
    return alerts[:limit]


@router.post("/chaos/trigger")
async def trigger_chaos(
    error_type: str = Query(default="division_by_zero", description="division_by_zero | database_failure | custom"),
    simulate_slow: bool = Query(default=False, description="Simulate a slow request before erroring"),
    delay_seconds: float = Query(default=0.6, ge=0.0, le=5.0),
):
    """PRACTICAL CHECK ENDPOINT: Trigger an intentional failure or high latency.

    Used to verify that the monitoring system immediately captures what broke,
    the exact file, and the line number within seconds.
    """
    if simulate_slow:
        await asyncio.sleep(delay_seconds)

    if error_type == "division_by_zero":
        # Deliberate ZeroDivisionError on line 58
        result = 100 / 0
        return {"result": result}

    if error_type == "database_failure":
        # Deliberate database failure simulation
        alert_manager.trigger_alert(
            alert_type="DATABASE_TIMEOUT",
            severity="CRITICAL",
            title="Simulated Database Timeout",
            message="Database query failed to respond within 5000ms",
        )
        raise RuntimeError("Simulated database connection pool exhaustion")

    raise ValueError(f"Intentional chaos test exception: {error_type}")
