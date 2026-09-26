"""
ResQMesh API — FastAPI Application Entry Point

Provides the health endpoint and mounts all P0 route modules.
See: docs/16_BUILD_CONTRACT.md §P0 HTTP endpoints
"""

from fastapi import FastAPI

app = FastAPI(
    title="ResQMesh API",
    version="0.1.0",
    description="Disaster-resilient mesh coordination API",
)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    """Health check endpoint."""
    return {"status": "ok"}
