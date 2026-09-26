"""
ResQMesh API — FastAPI Application Entry Point

Provides the health endpoint and mounts all P0 route modules.
See: docs/16_BUILD_CONTRACT.md §P0 HTTP endpoints
"""

import asyncio
import sys

# psycopg v3 async is incompatible with Windows ProactorEventLoop.
# Must be set before any async engine is created.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import engine
from .db.models import Base
from .middleware import SecurityMiddleware
from .routes import (
    assignments_router,
    events_router,
    reports_router,
    resources_router,
    sync_router,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create tables on startup, dispose engine on shutdown."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title="ResQMesh API",
    version="0.1.0",
    description="Disaster-resilient mesh coordination API",
    lifespan=lifespan,
)

# ── Middleware (order matters: outermost first) ──────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(SecurityMiddleware)

# ── Mount all P0 routers ────────────────────────────────────────────────────
app.include_router(events_router)
app.include_router(resources_router)
app.include_router(assignments_router)
app.include_router(sync_router)
app.include_router(reports_router)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}
