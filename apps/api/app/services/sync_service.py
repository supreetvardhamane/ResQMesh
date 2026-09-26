"""
ResQMesh — Sync Service

POST /v1/sync/pull — cursor-paginated event pull for bridges
POST /v1/sync/ack  — record bridge cursor

Per: docs/05_API_CONTRACT.md §Synchronization protocol
"""

from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..contracts import SYNC_PAGE_MAX_EVENTS, SyncAckRequest, SyncPullRequest
from ..db.models import EventModel, SyncCursorModel


async def sync_pull(
    data: SyncPullRequest,
    session: AsyncSession,
    request_id: str,
) -> dict[str, Any]:
    """Pull events after a cursor for a bounded incident/region."""
    incident_id = data.scope.get("incident_id", "")
    region_bucket = data.scope.get("region_bucket", "")
    max_events = min(data.max_events, SYNC_PAGE_MAX_EVENTS)

    query = (
        select(EventModel)
        .where(
            and_(
                EventModel.incident_id == incident_id,
                EventModel.region_geohash.startswith(region_bucket),
                EventModel.schema_version.in_(data.accepted_schema_versions),
            )
        )
        .order_by(EventModel.created_at.asc())
    )

    # Decode cursor (base64-encoded created_at timestamp)
    if data.cursor:
        try:
            cursor_bytes = base64.urlsafe_b64decode(data.cursor + "==")
            cursor_ts = datetime.fromisoformat(cursor_bytes.decode("utf-8"))
            query = query.where(EventModel.created_at > cursor_ts)
        except Exception:
            pass  # Invalid cursor — start from beginning

    query = query.limit(max_events + 1)  # +1 to detect has_more

    result = await session.execute(query)
    events = result.scalars().all()

    has_more = len(events) > max_events
    page_events = events[:max_events]

    # Build next cursor
    next_cursor = None
    if page_events:
        last_ts = page_events[-1].created_at.isoformat()
        next_cursor = base64.urlsafe_b64encode(
            last_ts.encode("utf-8")
        ).rstrip(b"=").decode("ascii")

    return {
        "events": [e.envelope for e in page_events],
        "next_cursor": next_cursor,
        "has_more": has_more,
        "as_of": datetime.now(timezone.utc).isoformat(),
        "request_id": request_id,
    }


async def sync_ack(
    data: SyncAckRequest,
    session: AsyncSession,
    request_id: str,
) -> dict[str, Any]:
    """Record the highest durably processed cursor for a bridge."""
    result = await session.execute(
        select(SyncCursorModel).where(SyncCursorModel.bridge_id == data.bridge_id)
    )
    existing = result.scalar_one_or_none()

    now = datetime.now(timezone.utc)

    if existing:
        existing.cursor = data.cursor
        existing.updated_at = now
    else:
        session.add(SyncCursorModel(
            bridge_id=data.bridge_id,
            cursor=data.cursor,
            updated_at=now,
        ))

    await session.flush()

    return {
        "bridge_id": data.bridge_id,
        "cursor": data.cursor,
        "acknowledged_at": now.isoformat(),
        "request_id": request_id,
    }
