"""
ResQMesh — Event Ingestion Service

Implements the core event ingestion logic:
  POST /v1/events → 201 new, 200 byte-identical replay, 409 conflict

Per: docs/16_BUILD_CONTRACT.md §P0 HTTP endpoints and fixtures
Per: docs/05_API_CONTRACT.md §Request validation order

Validation order (steps 2-7, step 1 handled by middleware):
  2. Parse JSON and validate API/event schema version
  3. (P0: no auth required for event submission via bridge)
  4. Check event_id, TTL, and replay/duplicate policy
  5. Validate signature
  6. Persist canonical event transactionally
  7. Return receipt with request_id
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..contracts import (
    ApiError,
    ApiErrorCode,
    EventEnvelope,
    EventType,
    MAX_EVENT_BYTES,
)
from ..db.models import EventModel
from ..observability import (
    log_api_receipt,
    log_api_schema_invalid,
    log_api_signature_invalid,
    log_api_ttl_expired,
)
from ..security import verify_envelope_signature


class EventIngestionResult:
    """Result of event ingestion attempt."""

    def __init__(
        self,
        success: bool,
        status_code: int,
        event_id: str | None = None,
        request_id: str = "",
        error: ApiError | None = None,
        is_duplicate: bool = False,
    ):
        self.success = success
        self.status_code = status_code
        self.event_id = event_id
        self.request_id = request_id
        self.error = error
        self.is_duplicate = is_duplicate


async def ingest_event(
    envelope_data: dict[str, Any],
    session: AsyncSession,
    request_id: str,
) -> EventIngestionResult:
    """
    Ingest a signed event envelope into the canonical store.

    Returns:
      - 201 + receipt for new canonical event
      - 200 + receipt for byte-identical replay (idempotency)
      - 409 EVENT_ID_CONFLICT for changed bytes with existing ID
      - 400/410/422 for validation failures

    Per: 16_BUILD_CONTRACT.md §P0 HTTP endpoints and fixtures
    """

    # ── Step 2: Parse and validate schema ──────────────────────────────────
    try:
        envelope = EventEnvelope.model_validate(envelope_data)
    except Exception as e:
        error_msg = str(e)
        # Truncate for safety — no raw body in logs
        if len(error_msg) > 200:
            error_msg = error_msg[:200] + "..."
        log_api_schema_invalid(
            request_id=request_id,
            error_code=ApiErrorCode.INVALID_SCHEMA.value,
            reason=error_msg,
            event_type=envelope_data.get("type"),
        )
        return EventIngestionResult(
            success=False,
            status_code=400,
            request_id=request_id,
            error=ApiError(
                code=ApiErrorCode.INVALID_SCHEMA.value,
                message="Event envelope does not match the required schema.",
                request_id=request_id,
                retryable=False,
                details={"validation_error": error_msg},
            ),
        )

    event_id_str = envelope.event_id

    # ── Step 4: Check TTL expiry ───────────────────────────────────────────
    try:
        created_at = datetime.fromisoformat(
            envelope.created_at.replace("Z", "+00:00")
        )
    except ValueError:
        return EventIngestionResult(
            success=False,
            status_code=400,
            request_id=request_id,
            error=ApiError(
                code=ApiErrorCode.INVALID_SCHEMA.value,
                message="Invalid created_at timestamp format.",
                request_id=request_id,
                retryable=False,
            ),
        )

    now = datetime.now(timezone.utc)
    age_seconds = (now - created_at).total_seconds()

    if age_seconds > envelope.ttl_seconds:
        log_api_ttl_expired(
            request_id=request_id,
            event_id=event_id_str,
            created_at=envelope.created_at,
            ttl_seconds=envelope.ttl_seconds,
        )
        return EventIngestionResult(
            success=False,
            status_code=410,
            request_id=request_id,
            event_id=event_id_str,
            error=ApiError(
                code=ApiErrorCode.EVENT_TTL_EXPIRED.value,
                message=(
                    "This event has expired. It remains available on "
                    "the originating device for review."
                ),
                request_id=request_id,
                retryable=False,
                details={"event_id": event_id_str},
            ),
        )

    # ── Step 5: Validate signature ─────────────────────────────────────────
    sig_result = verify_envelope_signature(envelope)
    if not sig_result.valid:
        log_api_signature_invalid(
            request_id=request_id,
            event_id=event_id_str,
            key_id_hint=envelope.origin.key_id,
            reason=sig_result.error_message or "Unknown",
        )
        return EventIngestionResult(
            success=False,
            status_code=422,
            request_id=request_id,
            event_id=event_id_str,
            error=ApiError(
                code=(sig_result.error_code or ApiErrorCode.SIGNATURE_INVALID).value,
                message=sig_result.error_message or "Signature verification failed.",
                request_id=request_id,
                retryable=False,
                details={"event_id": event_id_str},
            ),
        )

    # ── Step 4 (cont): Check idempotency — event_id PK uniqueness ─────────
    try:
        event_uuid = UUID(event_id_str)
    except ValueError:
        return EventIngestionResult(
            success=False,
            status_code=400,
            request_id=request_id,
            error=ApiError(
                code=ApiErrorCode.INVALID_SCHEMA.value,
                message="event_id must be a valid UUID.",
                request_id=request_id,
                retryable=False,
            ),
        )

    existing = await session.execute(
        select(EventModel).where(EventModel.event_id == event_uuid)
    )
    existing_event = existing.scalar_one_or_none()

    if existing_event is not None:
        # Compare envelope bytes for idempotency check
        incoming_canonical = json.dumps(
            envelope_data, sort_keys=True, separators=(",", ":")
        )
        stored_canonical = json.dumps(
            existing_event.envelope, sort_keys=True, separators=(",", ":")
        )

        if incoming_canonical == stored_canonical:
            # Byte-identical replay → 200
            queue_age_ms = int(age_seconds * 1000) if age_seconds > 0 else 0
            log_api_receipt(
                request_id=request_id,
                event_id=event_id_str,
                event_type=envelope.type.value,
                queue_age_ms=queue_age_ms,
                region_geohash=envelope.location_geohash,
                is_duplicate=True,
            )
            return EventIngestionResult(
                success=True,
                status_code=200,
                event_id=event_id_str,
                request_id=request_id,
                is_duplicate=True,
            )
        else:
            # Changed bytes with same ID → 409
            return EventIngestionResult(
                success=False,
                status_code=409,
                event_id=event_id_str,
                request_id=request_id,
                error=ApiError(
                    code=ApiErrorCode.EVENT_ID_CONFLICT.value,
                    message=(
                        "An event with this ID already exists with different content. "
                        "Fetch the current state and resolve the conflict."
                    ),
                    request_id=request_id,
                    retryable=False,
                    details={"event_id": event_id_str},
                ),
            )

    # ── Step 6: Persist canonical event transactionally ─────────────────────
    new_event = EventModel(
        event_id=event_uuid,
        schema_version=envelope.schema_version,
        type=envelope.type.value,
        incident_id=envelope.incident_id,
        region_geohash=envelope.location_geohash,
        created_at=created_at,
        ttl_seconds=envelope.ttl_seconds,
        priority=envelope.priority.value,
        origin_kind=envelope.origin.kind.value,
        origin_key_id=envelope.origin.key_id,
        envelope=envelope_data,  # Store the complete original envelope as JSONB
        signature_b64url=envelope.signature_b64url,
        received_at=now,
    )

    session.add(new_event)
    # Flush to detect PK conflicts immediately (race condition safety)
    await session.flush()

    # ── Step 7: Log receipt and return receipt ──────────────────────────────
    queue_age_ms = int(age_seconds * 1000) if age_seconds > 0 else 0
    log_api_receipt(
        request_id=request_id,
        event_id=event_id_str,
        event_type=envelope.type.value,
        queue_age_ms=queue_age_ms,
        region_geohash=envelope.location_geohash,
        is_duplicate=False,
    )

    return EventIngestionResult(
        success=True,
        status_code=201,
        event_id=event_id_str,
        request_id=request_id,
        is_duplicate=False,
    )
