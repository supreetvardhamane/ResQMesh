"""
ResQMesh — Assignment Service

POST /v1/assignments — requires responder role; fails for unavailable/stale resource
PATCH /v1/assignments/{id} — update state

Per: docs/16_BUILD_CONTRACT.md §P0 HTTP endpoints
Per: docs/05_API_CONTRACT.md §Resource and assignment commands
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..contracts import (
    RESOURCE_FRESHNESS_MINUTES,
    AssignmentCreate,
    AssignmentUpdate,
    ResourceStatus,
)
from ..db.models import AssignmentModel, EventModel, ResourceModel
from ..observability import (
    log_assignment_created,
    log_assignment_rejected,
    log_assignment_updated,
)


async def create_assignment(
    data: AssignmentCreate,
    session: AsyncSession,
    request_id: str,
) -> dict[str, Any]:
    """Create a responder-approved resource assignment."""
    now = datetime.now(timezone.utc)

    # Validate need event exists
    try:
        need_uuid = uuid.UUID(data.need_event_id)
    except ValueError:
        log_assignment_rejected(request_id, None, "Invalid need_event_id format")
        return {"error": True, "status_code": 400, "code": "INVALID_SCHEMA",
                "message": "need_event_id must be a valid UUID."}

    need = await session.execute(
        select(EventModel).where(EventModel.event_id == need_uuid)
    )
    if need.scalar_one_or_none() is None:
        log_assignment_rejected(request_id, None, "Need event not found")
        return {"error": True, "status_code": 404, "code": "NOT_FOUND",
                "message": "Need event not found."}

    # Validate resource exists, is AVAILABLE, and is fresh
    try:
        res_uuid = uuid.UUID(data.resource_id)
    except ValueError:
        log_assignment_rejected(request_id, None, "Invalid resource_id format")
        return {"error": True, "status_code": 400, "code": "INVALID_SCHEMA",
                "message": "resource_id must be a valid UUID."}

    res_result = await session.execute(
        select(ResourceModel).where(ResourceModel.resource_id == res_uuid)
    )
    resource = res_result.scalar_one_or_none()

    if resource is None:
        log_assignment_rejected(request_id, None, "Resource not found")
        return {"error": True, "status_code": 404, "code": "NOT_FOUND",
                "message": "Resource not found."}

    if resource.status != ResourceStatus.AVAILABLE.value:
        log_assignment_rejected(request_id, None, f"Resource status: {resource.status}")
        return {"error": True, "status_code": 409, "code": "VERSION_CONFLICT",
                "message": f"Resource is {resource.status}, not AVAILABLE."}

    freshness_cutoff = now - timedelta(minutes=RESOURCE_FRESHNESS_MINUTES)
    if resource.observed_at < freshness_cutoff:
        log_assignment_rejected(request_id, None, "Resource observation is stale")
        return {"error": True, "status_code": 409, "code": "VERSION_CONFLICT",
                "message": "Resource observation is stale (older than 15 minutes)."}

    # Create assignment
    assignment_id = uuid.uuid4()
    assignment = AssignmentModel(
        assignment_id=assignment_id,
        need_event_id=need_uuid,
        resource_id=res_uuid,
        state="PROPOSED",
        rationale=data.rationale,
        created_by=data.created_by,
        created_at=now,
        updated_at=now,
    )
    session.add(assignment)
    await session.flush()

    log_assignment_created(
        request_id=request_id,
        assignment_id=str(assignment_id),
        need_event_id=data.need_event_id,
        resource_id=data.resource_id,
    )

    return {
        "error": False,
        "assignment_id": str(assignment_id),
        "state": "PROPOSED",
        "request_id": request_id,
    }


async def update_assignment(
    assignment_id_str: str,
    data: AssignmentUpdate,
    session: AsyncSession,
    request_id: str,
) -> dict[str, Any]:
    """Update assignment state."""
    try:
        a_uuid = uuid.UUID(assignment_id_str)
    except ValueError:
        return {"error": True, "status_code": 400, "code": "INVALID_SCHEMA",
                "message": "assignment_id must be a valid UUID."}

    result = await session.execute(
        select(AssignmentModel).where(AssignmentModel.assignment_id == a_uuid)
    )
    assignment = result.scalar_one_or_none()

    if assignment is None:
        return {"error": True, "status_code": 404, "code": "NOT_FOUND",
                "message": "Assignment not found."}

    assignment.state = data.state
    assignment.updated_at = datetime.fromisoformat(
        data.updated_at.replace("Z", "+00:00")
    )
    await session.flush()

    log_assignment_updated(request_id, str(a_uuid), data.state)

    return {
        "error": False,
        "assignment_id": str(a_uuid),
        "state": data.state,
        "request_id": request_id,
    }
