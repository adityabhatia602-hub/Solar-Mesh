"""Structured Request Logging & Performance Middleware.

Attaches unique correlation IDs (X-Request-ID), computes precise execution latency,
detects and logs slow requests, records metrics, and captures server errors.
"""
from __future__ import annotations

import logging
import time
import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.config import settings
from app.monitoring import alert_manager, metrics_collector

logger = logging.getLogger("solarmesh.http")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware for structured request tracing, latency tracking, and error capture."""

    async def dispatch(self, request: Request, call_next) -> Response:
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:12]
        request.state.request_id = request_id

        # Determine client IP (support reverse proxies like Vercel / Cloudflare)
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            client_ip = forwarded.split(",")[0].strip()
        else:
            client_ip = request.client.host if request.client else "127.0.0.1"

        start_time = time.perf_counter()

        try:
            response = await call_next(request)
            duration_ms = (time.perf_counter() - start_time) * 1000.0

            # Attach observability headers to response
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Response-Time"] = f"{duration_ms:.2f}ms"

            # Record metrics
            metrics_collector.record_request(
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                duration_ms=duration_ms,
                client_ip=client_ip,
                request_id=request_id,
            )

            # Contextual structured logging
            if response.status_code >= 500:
                logger.error(
                    "[%s] %s %s - %d (%.1fms) | IP: %s",
                    request_id,
                    request.method,
                    request.url.path,
                    response.status_code,
                    duration_ms,
                    client_ip,
                )
            elif duration_ms >= settings.SLOW_REQUEST_THRESHOLD_MS:
                logger.warning(
                    "[%s] SLOW REQUEST: %s %s - %d took %.1fms (threshold: %.0fms) | IP: %s",
                    request_id,
                    request.method,
                    request.url.path,
                    response.status_code,
                    duration_ms,
                    settings.SLOW_REQUEST_THRESHOLD_MS,
                    client_ip,
                )
            else:
                logger.info(
                    "[%s] %s %s - %d in %.1fms",
                    request_id,
                    request.method,
                    request.url.path,
                    response.status_code,
                    duration_ms,
                )

            return response

        except Exception as exc:
            duration_ms = (time.perf_counter() - start_time) * 1000.0

            # Capture error details and notify alert manager
            err_entry = metrics_collector.record_error(
                request_id=request_id,
                method=request.method,
                path=request.url.path,
                status_code=500,
                exc=exc,
                client_ip=client_ip,
            )
            alert_manager.check_error_burst(err_entry)

            metrics_collector.record_request(
                method=request.method,
                path=request.url.path,
                status_code=500,
                duration_ms=duration_ms,
                client_ip=client_ip,
                request_id=request_id,
            )

            logger.exception(
                "[%s] UNHANDLED ERROR on %s %s in %.1fms: %s (at %s:%d in %s)",
                request_id,
                request.method,
                request.url.path,
                duration_ms,
                exc,
                err_entry["file"],
                err_entry["line"],
                err_entry["function"],
            )

            from starlette.responses import JSONResponse
            return JSONResponse(
                status_code=500,
                headers={
                    "X-Request-ID": request_id,
                    "X-Response-Time": f"{duration_ms:.2f}ms",
                },
                content={
                    "detail": f"Internal Server Error: {str(exc)}",
                    "request_id": request_id,
                    "error_type": type(exc).__name__,
                },
            )
