"""SolarMesh Monitoring, Metrics Collector, and Alert Manager.

Provides real-time visibility into application health, error tracking,
latency metrics, slow query detection, and automated alerting.
"""
from __future__ import annotations

import asyncio
import logging
import threading
import time
import traceback
from collections import deque
from datetime import datetime, timezone
from typing import Any

from app.config import settings

logger = logging.getLogger("solarmesh.monitoring")


class MetricsCollector:
    """Collects system-wide HTTP request metrics, error traces, and latency profiles."""

    def __init__(self, max_errors: int = 100, max_slow: int = 50) -> None:
        self.start_time = datetime.now(timezone.utc)
        self.total_requests = 0
        self.status_2xx = 0
        self.status_3xx = 0
        self.status_4xx = 0
        self.status_5xx = 0

        self._latencies_ms: deque[float] = deque(maxlen=1000)
        self.recent_errors: deque[dict[str, Any]] = deque(maxlen=max_errors)
        self.slow_requests: deque[dict[str, Any]] = deque(maxlen=max_slow)
        self._lock = threading.Lock()

    def record_request(
        self,
        method: str,
        path: str,
        status_code: int,
        duration_ms: float,
        client_ip: str,
        request_id: str,
    ) -> None:
        with self._lock:
            self.total_requests += 1
            if 200 <= status_code < 300:
                self.status_2xx += 1
            elif 300 <= status_code < 400:
                self.status_3xx += 1
            elif 400 <= status_code < 500:
                self.status_4xx += 1
            elif status_code >= 500:
                self.status_5xx += 1

            self._latencies_ms.append(duration_ms)

            if duration_ms >= settings.SLOW_REQUEST_THRESHOLD_MS:
                self.slow_requests.appendleft({
                    "request_id": request_id,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "method": method,
                    "path": path,
                    "duration_ms": round(duration_ms, 2),
                    "status_code": status_code,
                    "client_ip": client_ip,
                })

    def record_error(
        self,
        request_id: str,
        method: str,
        path: str,
        status_code: int,
        exc: Exception,
        client_ip: str,
    ) -> dict[str, Any]:
        tb = traceback.extract_tb(exc.__traceback__)
        last_frame = tb[-1] if tb else None
        file_name = last_frame.filename if last_frame else "unknown"
        line_no = last_frame.lineno if last_frame else 0
        func_name = last_frame.name if last_frame else "unknown"

        error_entry = {
            "request_id": request_id,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "method": method,
            "path": path,
            "status_code": status_code,
            "error_type": type(exc).__name__,
            "error_message": str(exc),
            "file": file_name,
            "line": line_no,
            "function": func_name,
            "traceback": traceback.format_exc(),
            "client_ip": client_ip,
        }

        with self._lock:
            self.recent_errors.appendleft(error_entry)

        return error_entry

    def get_summary(self) -> dict[str, Any]:
        with self._lock:
            uptime_seconds = (datetime.now(timezone.utc) - self.start_time).total_seconds()
            latencies = sorted(self._latencies_ms)
            count = len(latencies)

            avg_latency = round(sum(latencies) / count, 2) if count > 0 else 0.0
            p50_latency = round(latencies[int(count * 0.50)], 2) if count > 0 else 0.0
            p95_latency = round(latencies[int(count * 0.95)], 2) if count > 0 else 0.0
            p99_latency = round(latencies[int(count * 0.99)], 2) if count > 0 else 0.0

            error_rate = (
                round((self.status_5xx / self.total_requests) * 100, 2)
                if self.total_requests > 0
                else 0.0
            )

            return {
                "uptime_seconds": round(uptime_seconds, 1),
                "total_requests": self.total_requests,
                "status_breakdown": {
                    "2xx": self.status_2xx,
                    "3xx": self.status_3xx,
                    "4xx": self.status_4xx,
                    "5xx": self.status_5xx,
                },
                "error_rate_percent": error_rate,
                "latency_ms": {
                    "avg": avg_latency,
                    "p50": p50_latency,
                    "p95": p95_latency,
                    "p99": p99_latency,
                },
                "slow_requests_count": len(self.slow_requests),
                "recent_errors_count": len(self.recent_errors),
            }


class AlertManager:
    """Manages automated incident alerts, error burst detection, and webhook notifications."""

    def __init__(self, max_alerts: int = 50) -> None:
        self.recent_alerts: deque[dict[str, Any]] = deque(maxlen=max_alerts)
        self._error_timestamps: deque[float] = deque(maxlen=100)
        self._lock = threading.Lock()

    def trigger_alert(
        self,
        alert_type: str,
        severity: str,
        title: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        alert = {
            "id": f"alert-{int(time.time() * 1000)}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "alert_type": alert_type,
            "severity": severity.upper(),  # INFO, WARNING, CRITICAL
            "title": title,
            "message": message,
            "details": details or {},
        }

        with self._lock:
            self.recent_alerts.appendleft(alert)

        logger.warning(
            "[ALERT %s] %s: %s | %s",
            alert["severity"],
            alert["alert_type"],
            alert["title"],
            alert["message"],
        )

        # Broadcast via telemetry live event bus if available
        try:
            from app.routers.telemetry import event_bus
            event_bus.publish_threadsafe("alerts", {"type": "system_alert", "data": alert})
        except Exception:
            pass

        # Dispatch async webhook if configured
        if settings.ALERT_WEBHOOK_URL:
            self._dispatch_webhook_background(alert)

        return alert

    def check_error_burst(self, exc_entry: dict[str, Any]) -> dict[str, Any] | None:
        """Evaluate if recent errors exceed the burst threshold."""
        now = time.time()
        with self._lock:
            self._error_timestamps.append(now)
            cutoff = now - settings.ERROR_BURST_WINDOW_SECONDS
            recent_burst = [t for t in self._error_timestamps if t >= cutoff]

        if len(recent_burst) >= settings.ERROR_BURST_THRESHOLD:
            return self.trigger_alert(
                alert_type="ERROR_BURST",
                severity="CRITICAL",
                title="Application Error Spike Detected",
                message=(
                    f"Detected {len(recent_burst)} server errors within {settings.ERROR_BURST_WINDOW_SECONDS}s. "
                    f"Latest: {exc_entry.get('error_type')} at {exc_entry.get('path')}"
                ),
                details={
                    "error_count": len(recent_burst),
                    "window_seconds": settings.ERROR_BURST_WINDOW_SECONDS,
                    "latest_request_id": exc_entry.get("request_id"),
                    "latest_error": exc_entry.get("error_message"),
                },
            )
        return None

    def _dispatch_webhook_background(self, alert: dict[str, Any]) -> None:
        def _send():
            try:
                import requests
                requests.post(settings.ALERT_WEBHOOK_URL, json=alert, timeout=5.0)
            except Exception as e:
                logger.error("Failed to deliver alert webhook: %s", e)

        thread = threading.Thread(target=_send, daemon=True)
        thread.start()


# Global singletons for use throughout the application
metrics_collector = MetricsCollector()
alert_manager = AlertManager()
