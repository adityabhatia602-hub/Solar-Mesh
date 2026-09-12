"""Idempotency Manager for SolarMesh Financial & Order Operations.

Prevents double-transfers, duplicate wallet charges, and repeated order placements
when network drops or client retries happen halfway.
"""
from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from typing import Any
from fastapi import HTTPException, status

logger = logging.getLogger("solarmesh.idempotency")


class IdempotencyRecord:
    """Represents a cached idempotent operation."""

    def __init__(self, key: str, user_id: str, endpoint: str, request_hash: str) -> None:
        self.key = key
        self.user_id = user_id
        self.endpoint = endpoint
        self.request_hash = request_hash
        self.status_code: int = 200
        self.response_body: Any = None
        self.is_completed: bool = False
        self.created_at: float = time.time()


class IdempotencyManager:
    """Thread-safe in-memory cache for idempotency tracking with TTL expiration."""

    def __init__(self, ttl_seconds: int = 86400) -> None:
        self.ttl_seconds = ttl_seconds
        self._records: dict[str, IdempotencyRecord] = {}
        self._lock = threading.Lock()

    def _composite_key(self, user_id: str, endpoint: str, key: str) -> str:
        return f"{user_id}:{endpoint}:{key.strip()}"

    def _hash_payload(self, payload: Any) -> str:
        if payload is None:
            return ""
        if isinstance(payload, (dict, list)):
            serialized = json.dumps(payload, sort_keys=True, default=str)
        else:
            serialized = str(payload)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    def check_or_lock(
        self,
        user_id: str,
        endpoint: str,
        key: str,
        payload: Any = None,
    ) -> tuple[bool, Any | None, int | None]:
        """Check if an idempotency key exists or lock it for ongoing execution.

        Returns:
            (is_hit, cached_response, cached_status_code)
        Raises:
            HTTPException(409): If an identical request is currently processing.
            HTTPException(422): If the key is reused with a completely different payload.
        """
        comp_key = self._composite_key(user_id, endpoint, key)
        payload_hash = self._hash_payload(payload)
        now = time.time()

        with self._lock:
            # Clean expired records occasionally
            cutoff = now - self.ttl_seconds
            expired = [k for k, rec in self._records.items() if rec.created_at < cutoff]
            for exp_key in expired:
                del self._records[exp_key]

            record = self._records.get(comp_key)
            if record:
                # Key was already processed
                if record.is_completed:
                    if record.request_hash and payload_hash and record.request_hash != payload_hash:
                        raise HTTPException(
                            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Idempotency key reuse with different request payload is not allowed.",
                        )
                    logger.info("Idempotency HIT: Replaying cached response for %s", comp_key)
                    return True, record.response_body, record.status_code

                # Key is currently in-flight
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="A request with this idempotency key is already processing. Please wait.",
                )

            # Register as in-flight
            new_record = IdempotencyRecord(key, user_id, endpoint, payload_hash)
            self._records[comp_key] = new_record
            return False, None, None

    def complete(self, user_id: str, endpoint: str, key: str, response_body: Any, status_code: int = 200) -> None:
        """Mark the operation as successfully finished and save the cached response."""
        comp_key = self._composite_key(user_id, endpoint, key)
        with self._lock:
            record = self._records.get(comp_key)
            if record:
                record.response_body = response_body
                record.status_code = status_code
                record.is_completed = True

    def abort(self, user_id: str, endpoint: str, key: str) -> None:
        """Release lock on failure so the client can safely retry."""
        comp_key = self._composite_key(user_id, endpoint, key)
        with self._lock:
            self._records.pop(comp_key, None)

    def clear(self) -> None:
        """Clear cache for test suites."""
        with self._lock:
            self._records.clear()


# Global singleton
idempotency_manager = IdempotencyManager()
