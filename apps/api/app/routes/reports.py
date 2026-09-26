"""
ResQMesh — Reports Router

POST /v1/reports/{id}/corroborations — add evidence without overwriting

Per: docs/05_API_CONTRACT.md
"""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..contracts import (
    ApiError,
    ApiErrorCode,
    EventEnvelope,
    EventType,
    SourceKind,
)
from ..db import get_session
from ..db.models import EventModel
from ..services.event_service import ingest_event

router = APIRouter(prefix="/v1", tags=["reports"])


class CorroborationRequest(BaseModel):
    """Corroboration submission — adds evidence to an existing report."""
    subject_id: str
    condition: str = Field(..., pattern=r"^(BLOCKED|OPEN)$")
    observed_at: str
    origin_kind: str = "RESPONDER"
    origin_key_id: str
    origin_public_key_b64url: str
    location_geohash: str = Field(..., min_length=6, max_length=6)
    signature_b64url: str


@router.post("/reports/{report_id}/corroborations")
async def post_corroboration(
    report_id: str,
    data: CorroborationRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    """Add evidence without overwriting the report."""
    request_id = getattr(request.state, "request_id", "req_unknown")

    # Verify the target report exists
    try:
        report_uuid = uuid.UUID(report_id)
    except ValueError:
        return JSONResponse(status_code=400, content=ApiError(
            code=ApiErrorCode.INVALID_SCHEMA.value,
            message="report_id must be a valid UUID.",
            request_id=request_id, retryable=False,
        ).model_dump(exclude_none=True))

    result = await session.execute(
        select(EventModel).where(EventModel.event_id == report_uuid)
    )
    if result.scalar_one_or_none() is None:
        return JSONResponse(status_code=404, content=ApiError(
            code=ApiErrorCode.NOT_FOUND.value,
            message="Target report not found.",
            request_id=request_id, retryable=False,
        ).model_dump(exclude_none=True))

    # Build a REPORT_CORROBORATED event envelope and ingest it
    corroboration_envelope = {
        "schema_version": 1,
        "event_id": str(uuid.uuid4()),
        "type": EventType.REPORT_CORROBORATED.value,
        "incident_id": "demo-flood-2026",
        "created_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "ttl_seconds": 1800,
        "priority": "HIGH",
        "origin": {
            "kind": data.origin_kind,
            "key_id": data.origin_key_id,
            "public_key_b64url": data.origin_public_key_b64url,
        },
        "location_geohash": data.location_geohash,
        "payload": {
            "target_event_id": report_id,
            "subject_id": data.subject_id,
            "condition": data.condition,
            "observed_at": data.observed_at,
        },
        "signature_b64url": data.signature_b64url,
    }

    ingest_result = await ingest_event(corroboration_envelope, session, request_id)

    if ingest_result.success:
        return JSONResponse(status_code=201, content={
            "corroboration_event_id": ingest_result.event_id,
            "target_report_id": report_id,
            "status": "accepted",
            "request_id": request_id,
        })
    else:
        return JSONResponse(
            status_code=ingest_result.status_code,
            content=ingest_result.error.model_dump(exclude_none=True) if ingest_result.error else {},
        )
