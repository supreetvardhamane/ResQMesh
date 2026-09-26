"""
ResQMesh — Database Connection and Session Management

SQLAlchemy 2.0.36 async engine with PostgreSQL 16 via psycopg 3.2.3.
Per: docs/16_BUILD_CONTRACT.md §Storage choice and schema
Per: docs/16_BUILD_CONTRACT.md §Fixed stack and layout

PostgreSQL 16 is mandatory for P0. Do not substitute SQLite, JSON files,
in-memory repositories, PostGIS, or Neo4j.
"""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from ..config import load_config

_config = load_config()

engine = create_async_engine(
    _config.database_url,
    pool_size=_config.database_pool_size,
    max_overflow=_config.database_max_overflow,
    echo=False,
)

async_session_factory = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency: yields a scoped async session."""
    async with async_session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
