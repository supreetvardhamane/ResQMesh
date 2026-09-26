"""
ResQMesh — Assignments Router

POST  /v1/assignments — create a responder-approved assignment
PATCH /v1/assignments/{assignment_id} — update assignment state

Per: docs/16_BUILD_CONTRACT.md §P0 HTTP endpoints
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..contracts import ApiError, AssignmentCreate, AssignmentUpdate
from ..db import get_session
from ..services.assignment_service import create_assignment, update_assignment

router = APIRouter(prefix="/v1", tags=["assignments"])


@router.post("/assignments")
async def post_assignment(
    data: AssignmentCreate,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    """Create a responder-approved resource assignment."""
    request_id = getattr(request.state, "request_id", "req_unknown")
    result = await create_assignment(data, session, request_id)

    if result.get("error"):
        return JSONResponse(
            status_code=result["status_code"],
            content=ApiError(
                code=result["code"],
                message=result["message"],
                request_id=request_id,
                retryable=False,
            ).model_dump(exclude_none=True),
        )

    return JSONResponse(status_code=201, content=result)


@router.patch("/assignments/{assignment_id}")
async def patch_assignment(
    assignment_id: str,
    data: AssignmentUpdate,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    """Update assignment state."""
    request_id = getattr(request.state, "request_id", "req_unknown")
    result = await update_assignment(assignment_id, data, session, request_id)

    if result.get("error"):
        return JSONResponse(
            status_code=result["status_code"],
            content=ApiError(
                code=result["code"],
                message=result["message"],
                request_id=request_id,
                retryable=False,
            ).model_dump(exclude_none=True),
        )

    return JSONResponse(status_code=200, content=result)
