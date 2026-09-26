"""
ResQMesh — Resources Router

POST /v1/resources — register or update a community resource
GET  /v1/resources/matches — return explainable candidate matches

Per: docs/16_BUILD_CONTRACT.md §P0 HTTP endpoints
Per: docs/05_API_CONTRACT.md §Matching response
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..contracts import ApiError, ApiErrorCode, ResourceUpsert
from ..db import get_session
from ..services.resource_service import find_matches, upsert_resource

router = APIRouter(prefix="/v1", tags=["resources"])


@router.post("/resources")
async def post_resource(
    data: ResourceUpsert,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    """Register or update a community resource."""
    request_id = getattr(request.state, "request_id", "req_unknown")

    result = await upsert_resource(data, session, request_id)
    status = 201 if result.get("status") == "created" else 200
    return JSONResponse(status_code=status, content=result)


@router.get("/resources/matches")
async def get_resource_matches(
    need_event_id: str = Query(...),
    request: Request = None,
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    """Return explainable candidate matches for a need event."""
    request_id = getattr(request.state, "request_id", "req_unknown") if request else "req_unknown"

    matches = await find_matches(need_event_id, session, request_id)

    return JSONResponse(content={
        "matches": [m.model_dump() for m in matches],
        "need_event_id": need_event_id,
        "request_id": request_id,
    })
