"""Rate limiting utilities for SolarMesh sensitive endpoints.

Provides sliding-window in-memory rate limiting to prevent brute-force login attacks,
spam registrations, and automated wallet drain attempts.
"""
import time
from collections import defaultdict
from fastapi import HTTPException, status
from starlette.requests import Request


class RateLimiter:
    """Sliding-window in-memory rate limiter per IP or user key."""

    def __init__(self, requests_limit: int, time_window_seconds: int, scope: str = "default") -> None:
        self.requests_limit = requests_limit
        self.time_window_seconds = time_window_seconds
        self.scope = scope
        self._records: dict[str, list[float]] = defaultdict(list)

    def _get_key(self, request: Request) -> str:
        # Check standard reverse proxy headers (e.g., Vercel, Cloudflare, AWS)
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
        else:
            ip = request.client.host if request.client else "127.0.0.1"
        return f"{self.scope}:{ip}"

    def reset(self, request: Request | None = None, key: str | None = None) -> None:
        """Reset records for testing purposes."""
        if key:
            self._records.pop(key, None)
        elif request:
            self._records.pop(self._get_key(request), None)
        else:
            self._records.clear()

    async def __call__(self, request: Request) -> None:
        now = time.time()
        key = self._get_key(request)
        timestamps = self._records[key]

        # Evict timestamps older than the sliding window
        cutoff = now - self.time_window_seconds
        while timestamps and timestamps[0] <= cutoff:
            timestamps.pop(0)

        if len(timestamps) >= self.requests_limit:
            oldest = timestamps[0]
            retry_after = max(1, int(self.time_window_seconds - (now - oldest)) + 1)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded for {self.scope}. Please try again in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)},
            )

        timestamps.append(now)
