"""
ResQMesh — Privacy-Minimized Structured Observability Logger

Implements structured, privacy-minimized logging for all observability events.
Per: docs/TEAM_TASK_DIVISION.md §Member 5 Phase 4
Per: docs/12_RELIABILITY_AND_RUNBOOKS.md §Observability requirements
Per: docs/04_DATA_AND_PRIVACY.md §Privacy controls

Rules enforced:
  - No plaintext sensitive data (exact location, phone, name) in any log label
  - Internal stack traces NEVER in client error responses
  - REJECTED is the terminal state for any validation failure
  - Captures: queue_age, relay_receipt, duplicate_suppression, api_receipt,
    projection_lag per TEAM_TASK_DIVISION.md §Phase 4

Log fields always present: request_id, event schema_version, region_bucket,
software version (per 12_RELIABILITY_AND_RUNBOOKS.md §Observability requirements).

Privacy rule: exact location_geohash is NEVER logged — only the first-4-char
region_bucket (coarse). No name, phone, or raw PII in any log entry.
"""

from __future__ import annotations

import json
import logging
import time
import traceback
from enum import Enum
from typing import Any, Optional

# ─── Software version (update on each release) ───────────────────────────────
SOFTWARE_VERSION = "0.1.0"

# ─── Logger setup ────────────────────────────────────────────────────────────
# Use JSON-structured output for machine-readable observability.
_logger = logging.getLogger("resqmesh.observability")


class LogEvent(str, Enum):
    """Structured log event types per observability requirements."""
    # Local persistence
    QUEUE_ACCEPT = "QUEUE_ACCEPT"
    QUEUE_REJECT = "QUEUE_REJECT"
    QUEUE_FULL = "QUEUE_FULL"

    # Relay
    RELAY_RECEIPT = "RELAY_RECEIPT"
    RELAY_DUPLICATE_SUPPRESSED = "RELAY_DUPLICATE_SUPPRESSED"
    RELAY_TTL_EXPIRED = "RELAY_TTL_EXPIRED"
    RELAY_REJECTED = "RELAY_REJECTED"

    # API ingestion
    API_RECEIPT = "API_RECEIPT"
    API_DUPLICATE = "API_DUPLICATE"
    API_SIGNATURE_INVALID = "API_SIGNATURE_INVALID"
    API_SCHEMA_INVALID = "API_SCHEMA_INVALID"
    API_TTL_EXPIRED = "API_TTL_EXPIRED"
    API_RATE_LIMITED = "API_RATE_LIMITED"
    API_PAYLOAD_TOO_LARGE = "API_PAYLOAD_TOO_LARGE"

    # Projection
    PROJECTION_LAG = "PROJECTION_LAG"
    TRUST_CONFLICT = "TRUST_CONFLICT"
    TRUST_CORROBORATED = "TRUST_CORROBORATED"

    # Assignment
    ASSIGNMENT_CREATED = "ASSIGNMENT_CREATED"
    ASSIGNMENT_UPDATED = "ASSIGNMENT_UPDATED"
    ASSIGNMENT_REJECTED = "ASSIGNMENT_REJECTED"

    # Security
    KEY_EVENT = "KEY_EVENT"


def _sanitize_region_bucket(geohash: Optional[str]) -> Optional[str]:
    """
    Extract the first-4-char region bucket for logging.
    NEVER log the full 6-char geohash (too precise — privacy rule).
    Per: 04_DATA_AND_PRIVACY.md §Approximate locality/geohash
    """
    if not geohash:
        return None
    return geohash[:4]


def _make_log_record(
    event: LogEvent,
    request_id: str,
    schema_version: int = 1,
    region_bucket: Optional[str] = None,
    **extra: Any,
) -> dict[str, Any]:
    """
    Build a structured log record with required base fields.
    Per: 12_RELIABILITY_AND_RUNBOOKS.md §Observability requirements
    All records contain: request_id, event, schema_version, region_bucket,
    software_version, timestamp_ms.
    """
    record: dict[str, Any] = {
        "event": event.value,
        "request_id": request_id,
        "schema_version": schema_version,
        "software_version": SOFTWARE_VERSION,
        "timestamp_ms": int(time.time() * 1000),
    }
    if region_bucket:
        record["region_bucket"] = region_bucket
    # Add extra fields — caller is responsible for privacy (no PII)
    record.update(extra)
    return record


def _emit(record: dict[str, Any], level: int = logging.INFO) -> None:
    """Emit a structured log record as a JSON line."""
    _logger.log(level, json.dumps(record, default=str))


# ─── Queue observability ─────────────────────────────────────────────────────

def log_queue_accept(
    request_id: str,
    event_id: str,
    event_type: str,
    queue_age_ms: int,
    priority: str,
    region_geohash: Optional[str] = None,
) -> None:
    """
    Log successful local queue accept.
    Emitted when: IndexedDB accepts an event (SAVED_LOCAL state).
    Per: 12_RELIABILITY_AND_RUNBOOKS.md — local persistence healthy
    """
    _emit(_make_log_record(
        LogEvent.QUEUE_ACCEPT,
        request_id=request_id,
        schema_version=1,
        region_bucket=_sanitize_region_bucket(region_geohash),
        event_id=event_id,
        event_type=event_type,
        queue_age_ms=queue_age_ms,
        priority=priority,
        # NOT logging: exact geohash, name, phone, full location
    ))


def log_queue_reject(
    request_id: str,
    error_code: str,
    reason: str,
    priority: Optional[str] = None,
) -> None:
    """
    Log queue rejection (schema error, size limit, etc).
    No sensitive content in reason — caller must not pass PII.
    """
    _emit(_make_log_record(
        LogEvent.QUEUE_REJECT,
        request_id=request_id,
        error_code=error_code,
        reason=reason,
        priority=priority,
    ), level=logging.WARNING)


def log_queue_full(request_id: str, queue_size: int, priority: Optional[str] = None) -> None:
    """Log queue capacity exceeded (MAX_QUEUE_EVENTS = 200)."""
    _emit(_make_log_record(
        LogEvent.QUEUE_FULL,
        request_id=request_id,
        queue_size=queue_size,
        priority=priority,
    ), level=logging.WARNING)


# ─── Relay observability ─────────────────────────────────────────────────────

def log_relay_receipt(
    request_id: str,
    event_id: str,
    event_type: str,
    hop_count: int,
    peer_id_hint: Optional[str] = None,
    region_geohash: Optional[str] = None,
) -> None:
    """
    Log relay frame receipt.
    Per: 12_RELIABILITY_AND_RUNBOOKS.md §Observability requirements
    NOTE: peer_id_hint is a short opaque identifier, never a full user identity.
    """
    _emit(_make_log_record(
        LogEvent.RELAY_RECEIPT,
        request_id=request_id,
        region_bucket=_sanitize_region_bucket(region_geohash),
        event_id=event_id,
        event_type=event_type,
        hop_count=hop_count,
        # Peer ID hint only — not the full origin identity
        peer_hint=peer_id_hint[:8] if peer_id_hint else None,
    ))


def log_relay_duplicate_suppressed(
    request_id: str,
    event_id: str,
    hop_count: int,
) -> None:
    """Log duplicate suppression at relay layer."""
    _emit(_make_log_record(
        LogEvent.RELAY_DUPLICATE_SUPPRESSED,
        request_id=request_id,
        event_id=event_id,
        hop_count=hop_count,
    ))


def log_relay_ttl_expired(
    request_id: str,
    event_id: str,
    created_at: str,
    ttl_seconds: int,
) -> None:
    """Log TTL expiry at relay layer. Event must NOT be forwarded."""
    _emit(_make_log_record(
        LogEvent.RELAY_TTL_EXPIRED,
        request_id=request_id,
        event_id=event_id,
        created_at=created_at,
        ttl_seconds=ttl_seconds,
    ), level=logging.WARNING)


def log_relay_rejected(
    request_id: str,
    event_id: Optional[str],
    reason: str,
) -> None:
    """Log relay rejection (oversize frame, hop limit, etc.)."""
    _emit(_make_log_record(
        LogEvent.RELAY_REJECTED,
        request_id=request_id,
        event_id=event_id,
        reason=reason,
    ), level=logging.WARNING)


# ─── API ingestion observability ──────────────────────────────────────────────

def log_api_receipt(
    request_id: str,
    event_id: str,
    event_type: str,
    queue_age_ms: Optional[int],
    region_geohash: Optional[str] = None,
    is_duplicate: bool = False,
) -> None:
    """
    Log API event receipt.
    queue_age_ms: time from event created_at to API receipt (observability metric).
    """
    log_event = LogEvent.API_DUPLICATE if is_duplicate else LogEvent.API_RECEIPT
    _emit(_make_log_record(
        log_event,
        request_id=request_id,
        region_bucket=_sanitize_region_bucket(region_geohash),
        event_id=event_id,
        event_type=event_type,
        queue_age_ms=queue_age_ms,
    ))


def log_api_signature_invalid(
    request_id: str,
    event_id: Optional[str],
    key_id_hint: Optional[str],
    reason: str,
) -> None:
    """
    Log signature validation failure.
    NEVER log the full public key or private key material.
    key_id_hint: first 8 chars of key_id only, for diagnostic correlation.
    """
    _emit(_make_log_record(
        LogEvent.API_SIGNATURE_INVALID,
        request_id=request_id,
        event_id=event_id,
        # Short hint only — never full key material
        key_id_hint=key_id_hint[:8] if key_id_hint else None,
        reason=reason,
    ), level=logging.WARNING)


def log_api_schema_invalid(
    request_id: str,
    error_code: str,
    reason: str,
    event_type: Optional[str] = None,
) -> None:
    """Log schema validation failure. No raw body content in logs."""
    _emit(_make_log_record(
        LogEvent.API_SCHEMA_INVALID,
        request_id=request_id,
        error_code=error_code,
        reason=reason,
        event_type=event_type,
    ), level=logging.WARNING)


def log_api_ttl_expired(
    request_id: str,
    event_id: Optional[str],
    created_at: str,
    ttl_seconds: int,
) -> None:
    """Log TTL expiry at API layer."""
    _emit(_make_log_record(
        LogEvent.API_TTL_EXPIRED,
        request_id=request_id,
        event_id=event_id,
        created_at=created_at,
        ttl_seconds=ttl_seconds,
    ), level=logging.WARNING)


def log_api_rate_limited(request_id: str, retry_after: int) -> None:
    """Log rate limit hit. No origin IP or user identity logged."""
    _emit(_make_log_record(
        LogEvent.API_RATE_LIMITED,
        request_id=request_id,
        retry_after_seconds=retry_after,
    ), level=logging.WARNING)


def log_api_payload_too_large(request_id: str, size_bytes: int) -> None:
    """Log payload size rejection."""
    _emit(_make_log_record(
        LogEvent.API_PAYLOAD_TOO_LARGE,
        request_id=request_id,
        size_bytes=size_bytes,
    ), level=logging.WARNING)


# ─── Projection observability ─────────────────────────────────────────────────

def log_projection_lag(
    request_id: str,
    event_id: str,
    event_type: str,
    lag_ms: int,
    region_geohash: Optional[str] = None,
) -> None:
    """
    Log async projection lag (time from API receipt to projection write).
    Per: 12_RELIABILITY_AND_RUNBOOKS.md §Observability requirements
    """
    _emit(_make_log_record(
        LogEvent.PROJECTION_LAG,
        request_id=request_id,
        region_bucket=_sanitize_region_bucket(region_geohash),
        event_id=event_id,
        event_type=event_type,
        lag_ms=lag_ms,
    ))


def log_trust_conflict(
    request_id: str,
    subject_id: str,
    region_geohash: Optional[str] = None,
    distinct_key_count: int = 0,
) -> None:
    """
    Log trust conflict detection.
    subject_id: road segment or resource identifier (not a person identifier).
    """
    _emit(_make_log_record(
        LogEvent.TRUST_CONFLICT,
        request_id=request_id,
        region_bucket=_sanitize_region_bucket(region_geohash),
        subject_id=subject_id,
        distinct_key_count=distinct_key_count,
    ), level=logging.WARNING)


def log_trust_corroborated(
    request_id: str,
    subject_id: str,
    region_geohash: Optional[str] = None,
    distinct_key_count: int = 0,
) -> None:
    """Log corroboration event."""
    _emit(_make_log_record(
        LogEvent.TRUST_CORROBORATED,
        request_id=request_id,
        region_bucket=_sanitize_region_bucket(region_geohash),
        subject_id=subject_id,
        distinct_key_count=distinct_key_count,
    ))


# ─── Assignment observability ─────────────────────────────────────────────────

def log_assignment_created(
    request_id: str,
    assignment_id: str,
    need_event_id: str,
    resource_id: str,
    region_geohash: Optional[str] = None,
) -> None:
    """Log assignment creation. No responder PII in logs."""
    _emit(_make_log_record(
        LogEvent.ASSIGNMENT_CREATED,
        request_id=request_id,
        region_bucket=_sanitize_region_bucket(region_geohash),
        assignment_id=assignment_id,
        need_event_id=need_event_id,
        resource_id=resource_id,
    ))


def log_assignment_updated(
    request_id: str,
    assignment_id: str,
    new_state: str,
) -> None:
    """Log assignment state update."""
    _emit(_make_log_record(
        LogEvent.ASSIGNMENT_UPDATED,
        request_id=request_id,
        assignment_id=assignment_id,
        new_state=new_state,
    ))


def log_assignment_rejected(
    request_id: str,
    assignment_id: Optional[str],
    reason: str,
) -> None:
    """Log assignment rejection (unavailable/stale resource, role check failure)."""
    _emit(_make_log_record(
        LogEvent.ASSIGNMENT_REJECTED,
        request_id=request_id,
        assignment_id=assignment_id,
        reason=reason,
    ), level=logging.WARNING)


# ─── Safe error response helper ───────────────────────────────────────────────

def safe_error_details(exception: Exception, include_type: bool = True) -> dict[str, Any]:
    """
    Create safe error details for client responses.
    NEVER include stack traces or internal state in client responses.
    Per: 12_RELIABILITY_AND_RUNBOOKS.md — internal stack traces never in client errors
    Per: TEAM_TASK_DIVISION.md §Member 5 Phase 4

    Stack traces should only go to server-side structured logs, never to the client.
    """
    details: dict[str, Any] = {}
    if include_type:
        details["error_type"] = type(exception).__name__
    # Log the stack trace server-side only
    _logger.error(
        json.dumps({
            "event": "INTERNAL_ERROR",
            "error_type": type(exception).__name__,
            "software_version": SOFTWARE_VERSION,
            "stacktrace": traceback.format_exc(),  # Server-side only, never in client response
        })
    )
    return details
