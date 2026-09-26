"""
ResQMesh — Sync Router

POST /v1/sync/pull — fetch events after cursor for bounded incident/region
POST /v1/sync/ack  — confirm durable bridge receipt

Per: docs/05_API_CONTRACT.md §Synchronization protocol
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..contracts import SyncAckRequest, SyncPullRequest
from ..db import get_session
from ..services.sync_service import sync_ack, sync_pull

router = APIRouter(prefix="/v1", tags=["sync"])


@router.post("/sync/pull")
async def post_sync_pull(
    data: SyncPullRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    """Fetch events after a cursor for a bounded incident/region."""
    request_id = getattr(request.state, "request_id", "req_unknown")
    result = await sync_pull(data, session, request_id)
    return JSONResponse(content=result)


@router.post("/sync/ack")
async def post_sync_ack(
    data: SyncAckRequest,
    request: Request,
    session: AsyncSession = Depends(get_session),
) -> JSONResponse:
    """Confirm durable bridge receipt."""
    request_id = getattr(request.state, "request_id", "req_unknown")
    result = await sync_ack(data, session, request_id)
    return JSONResponse(content=result)
