"""
ResQMesh — Events Router

POST /v1/events — submit a signed event envelope
GET  /v1/incidents/{incident_id}/events — cursor-paginated incident events

Per: docs/16_BUILD_CONTRACT.md §P0 HTTP endpoints
Per: docs/05_API_CONTRACT.md
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..contracts import ApiError, ApiErrorCode, SYNC_PAGE_MAX_EVENTS
from ..db import get_session
from ..db.models import EventModel
from ..services.event_service import ingest_event

router = APIRouter(prefix="/v1", tags=["events"])


@router.post("/events")
async def post_event(
    request: Request,
    session: AsyncSession = Depends(get_session),
    idempotency_key: str | None = Header(None, alias="Idempotency-Key"),
) -> JSONResponse:
    """
    Submit a signed SOS, road, capacity, or report event.
    Returns 201 new, 200 replay, 409 conflict.
    """
    request_id = getattr(request.state, "request_id", "req_unknown")

    # Read body — middleware may have already consumed it
    if hasattr(request.state, "body"):
        body = request.state.body
    else:
        body = await request.body()

    try:
        import json
        envelope_data = json.loads(body)
    except Exception:
        error = ApiError(
            code=ApiErrorCode.INVALID_SCHEMA.value,
            message="Request body is not valid JSON.",
            request_id=request_id,
            retryable=False,
        )
        return JSONResponse(status_code=400, content=error.model_dump(exclude_none=True))

    result = await ingest_event(envelope_data, session, request_id)

    if result.success:
        return JSONResponse(
            status_code=result.status_code,
            content={
                "event_id": result.event_id,
                "status": "duplicate" if result.is_duplicate else "accepted",
                "request_id": result.request_id,
            },
        )
    else:
        return JSONResponse(
            status_code=result.status_code,
            content=result.error.model_dump(exclude_none=True) if result.error else {},
        )


@router.get("/incidents/{incident_id}/events")
async def get_incident_events(
    incident_id: str,
    cursor: str | None = Query(None),
    limit: int = Query(default=50, le=SYNC_PAGE_MAX_EVENTS),
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    """Read filtered, cursor-paginated incident events."""
    import base64

    query = (
        select(EventModel)
        .where(EventModel.incident_id == incident_id)
        .order_by(EventModel.created_at.desc())
    )

    if cursor:
        try:
            cursor_bytes = base64.urlsafe_b64decode(cursor + "==")
            cursor_ts = datetime.fromisoformat(cursor_bytes.decode("utf-8"))
            query = query.where(EventModel.created_at < cursor_ts)
        except Exception:
            pass

    query = query.limit(limit + 1)

    result = await session.execute(query)
    events = result.scalars().all()

    has_more = len(events) > limit
    page_events = events[:limit]

    next_cursor = None
    if page_events:
        last_ts = page_events[-1].created_at.isoformat()
        next_cursor = base64.urlsafe_b64encode(
            last_ts.encode("utf-8")
        ).rstrip(b"=").decode("ascii")

    return JSONResponse(content={
        "events": [e.envelope for e in page_events],
        "next_cursor": next_cursor,
        "has_more": has_more,
        "as_of": datetime.now(timezone.utc).isoformat(),
    })
