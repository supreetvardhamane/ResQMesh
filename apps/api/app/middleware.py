"""
ResQMesh — Rate Limiting & Backpressure Middleware

Implements per-origin rate limits and size enforcement at the API layer.
Per: docs/TEAM_TASK_DIVISION.md §Member 5 Phase 2
Per: docs/16_BUILD_CONTRACT.md §Fixed enums and limits

Controls:
  - MAX_EVENT_BYTES = 2048: request size limit for event envelopes
  - MAX_QUEUE_EVENTS = 200: client IndexedDB queue limit (documented here)
  - 429 RATE_LIMITED: per-origin rate limit exceeded
  - 429 QUEUE_LIMITED: queue capacity exceeded
  - 400 PAYLOAD_TOO_LARGE: request body exceeds MAX_EVENT_BYTES
  - CRITICAL SOS always gets a local outcome even under backpressure

Privacy rule (04_DATA_AND_PRIVACY.md): no plaintext PII in any log label.
Stack traces never exposed in client error responses (12_RELIABILITY_AND_RUNBOOKS.md).
"""

from __future__ import annotations

import time
import uuid
from collections import defaultdict, deque
from typing import Callable, Any

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from .contracts import (
    MAX_EVENT_BYTES,
    ApiError,
    ApiErrorCode,
    Priority,
)

# ─── Rate limit configuration ────────────────────────────────────────────────

# Per-origin token bucket: max requests per window
RATE_LIMIT_MAX_REQUESTS = 60
RATE_LIMIT_WINDOW_SECONDS = 60

# CRITICAL SOS: higher burst allowance
CRITICAL_RATE_LIMIT_MAX_REQUESTS = 120
CRITICAL_RATE_LIMIT_WINDOW_SECONDS = 60

# Paths subject to event-size enforcement
EVENT_PATHS = {"/v1/events"}

# Paths subject to rate limiting (all mutation endpoints)
RATE_LIMITED_PATHS = {
    "/v1/events",
    "/v1/resources",
    "/v1/assignments",
    "/v1/sync/pull",
    "/v1/sync/ack",
}


# ─── Token bucket per origin ─────────────────────────────────────────────────

class OriginRateLimiter:
    """
    Simple sliding-window rate limiter keyed by origin identifier.

    Per-origin = IP address (coarse, privacy-preserving — no PII).
    CRITICAL SOS events receive a higher burst allowance to guarantee
    a local outcome even under backpressure.

    Per: docs/TEAM_TASK_DIVISION.md §Member 5 Phase 2
    """

    def __init__(self) -> None:
        # origin_key -> deque of (timestamp,) for sliding window
        self._windows: dict[str, deque[float]] = defaultdict(deque)

    def _origin_key(self, request: Request) -> str:
        """
        Derive a privacy-minimized origin key from the request.
        Uses client IP only — no logging of full address, no user IDs.
        """
        client = request.client
        if client:
            # Coarse IP only — never log full path, user ID, or sensitive headers
            return f"ip:{client.host}"
        return "ip:unknown"

    def is_allowed(self, request: Request, is_critical: bool = False) -> bool:
        """
        Check if this request is within the rate limit for the origin.
        Returns True if allowed, False if rate-limited.
        """
        now = time.monotonic()
        key = self._origin_key(request)
        window = self._windows[key]

        if is_critical:
            max_req = CRITICAL_RATE_LIMIT_MAX_REQUESTS
            window_secs = CRITICAL_RATE_LIMIT_WINDOW_SECONDS
        else:
            max_req = RATE_LIMIT_MAX_REQUESTS
            window_secs = RATE_LIMIT_WINDOW_SECONDS

        # Remove timestamps outside the window
        while window and now - window[0] > window_secs:
            window.popleft()

        if len(window) >= max_req:
            return False

        window.append(now)
        return True

    def retry_after_seconds(self, request: Request) -> int:
        """Estimate seconds until the oldest request ages out of the window."""
        key = self._origin_key(request)
        window = self._windows[key]
        if not window:
            return 0
        oldest = window[0]
        elapsed = time.monotonic() - oldest
        return max(1, int(RATE_LIMIT_WINDOW_SECONDS - elapsed))


# Singleton rate limiter (shared across requests in same process)
_rate_limiter = OriginRateLimiter()


# ─── Middleware ───────────────────────────────────────────────────────────────

class SecurityMiddleware(BaseHTTPMiddleware):
    """
    Enforces at the API:
    1. Request size limit (MAX_EVENT_BYTES) for event submission paths.
    2. Per-origin rate limiting for all mutation paths.

    Per: docs/TEAM_TASK_DIVISION.md §Member 5 Phase 2
    Per: docs/16_BUILD_CONTRACT.md §Fixed enums and limits

    Privacy rule: no sensitive content in error responses or logs.
    Internal stack traces never exposed to clients.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        request_id = f"req_{uuid.uuid4().hex[:20]}"
        # Store request_id in state for downstream use
        request.state.request_id = request_id

        path = request.url.path

        # ── 1. Enforce request size for event paths ──────────────────────────
        if path in EVENT_PATHS:
            content_length = request.headers.get("content-length")
            if content_length:
                try:
                    length = int(content_length)
                    if length > MAX_EVENT_BYTES:
                        return _payload_too_large_response(request_id)
                except ValueError:
                    pass  # Will be caught by body read below

            # Also enforce on actual body read (handles chunked transfer)
            body = await request.body()
            if len(body) > MAX_EVENT_BYTES:
                return _payload_too_large_response(request_id)

            # Store body so downstream can read it (body is consumed)
            request.state.body = body

        # ── 2. Per-origin rate limiting for mutation paths ───────────────────
        if path in RATE_LIMITED_PATHS:
            # Peek at priority only if body was already read (event path)
            is_critical = False
            if hasattr(request.state, "body"):
                is_critical = _is_critical_request(request.state.body)

            if not _rate_limiter.is_allowed(request, is_critical=is_critical):
                retry_after = _rate_limiter.retry_after_seconds(request)
                return _rate_limited_response(request_id, retry_after)

        response = await call_next(request)
        return response


# ─── Helper response builders ─────────────────────────────────────────────────

def _payload_too_large_response(request_id: str) -> JSONResponse:
    """400 PAYLOAD_TOO_LARGE — request body exceeds MAX_EVENT_BYTES."""
    error = ApiError(
        code=ApiErrorCode.PAYLOAD_TOO_LARGE,
        message=(
            f"Event payload exceeds the maximum allowed size of "
            f"{MAX_EVENT_BYTES} bytes. Reduce the payload and retry."
        ),
        request_id=request_id,
        retryable=False,
    )
    return JSONResponse(
        status_code=400,
        content=error.model_dump(exclude_none=True),
    )


def _rate_limited_response(request_id: str, retry_after: int) -> JSONResponse:
    """429 RATE_LIMITED — per-origin rate limit exceeded."""
    error = ApiError(
        code=ApiErrorCode.RATE_LIMITED,
        message=(
            "Too many requests from this origin. "
            "Back off and retry after the indicated interval."
        ),
        request_id=request_id,
        retryable=True,
        details={"retry_after_seconds": retry_after},
    )
    return JSONResponse(
        status_code=429,
        content=error.model_dump(exclude_none=True),
        headers={"Retry-After": str(retry_after)},
    )


def queue_limited_response(request_id: str, retry_after: int = 30) -> JSONResponse:
    """
    429 QUEUE_LIMITED — server-side queue capacity exceeded.
    Per: docs/TEAM_TASK_DIVISION.md §Member 5 Phase 2
    CRITICAL SOS always gets an explicit local outcome even under backpressure.
    """
    error = ApiError(
        code=ApiErrorCode.QUEUE_LIMITED,
        message=(
            "Server queue is at capacity. Your event is saved locally. "
            "It will be retried automatically."
        ),
        request_id=request_id,
        retryable=True,
        details={"retry_after_seconds": retry_after},
    )
    return JSONResponse(
        status_code=429,
        content=error.model_dump(exclude_none=True),
        headers={"Retry-After": str(retry_after)},
    )


def _is_critical_request(body: bytes) -> bool:
    """
    Quick check if request body contains a CRITICAL priority event.
    Used to grant higher rate limit allowance for CRITICAL SOS.
    Returns False on any parse error — safety first.
    """
    try:
        import json
        data = json.loads(body)
        return data.get("priority") == Priority.CRITICAL.value
    except Exception:
        return False
