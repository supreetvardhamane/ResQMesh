"""
ResQMesh — Database Seed Script

Seeds the demo incident (demo-flood-2026) with fixture data.
Uses packages/fixtures/incident.demo.json as the single source.

Usage: python -m apps.api.app.db.seed
"""

from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import sqlalchemy
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Direct imports to avoid circular dependency at script level
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))

from apps.api.app.db.models import Base, EventModel, ResourceModel


DATABASE_URL = "postgresql+psycopg://resqmesh:resqmesh_dev@localhost:5432/resqmesh"
FIXTURES_DIR = Path(__file__).resolve().parents[4] / "packages" / "fixtures"


async def seed() -> None:
    """Seed DB with demo incident fixture data."""
    engine = create_async_engine(DATABASE_URL, echo=False)

    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Load fixture
    fixture_path = FIXTURES_DIR / "incident.demo.json"
    if not fixture_path.exists():
        print(f"ERROR: Fixture not found: {fixture_path}")
        return

    with open(fixture_path) as f:
        fixture = json.load(f)

    async with session_factory() as session:
        async with session.begin():
            # Clear existing demo data
            await session.execute(text("DELETE FROM assignments WHERE need_event_id IN (SELECT event_id FROM events WHERE incident_id = 'demo-flood-2026')"))
            await session.execute(text("DELETE FROM resources WHERE incident_id = 'demo-flood-2026'"))
            await session.execute(text("DELETE FROM events WHERE incident_id = 'demo-flood-2026'"))

            # Seed events (SOS + road reports)
            for event_data in fixture.get("events", []) + fixture.get("road_reports", []):
                created_at = datetime.fromisoformat(
                    event_data["created_at"].replace("Z", "+00:00")
                )
                event = EventModel(
                    event_id=uuid.UUID(event_data["event_id"]),
                    schema_version=event_data["schema_version"],
                    type=event_data["type"],
                    incident_id=event_data["incident_id"],
                    region_geohash=event_data["location_geohash"],
                    created_at=created_at,
                    ttl_seconds=event_data["ttl_seconds"],
                    priority=event_data["priority"],
                    origin_kind=event_data["origin"]["kind"],
                    origin_key_id=event_data["origin"]["key_id"],
                    envelope=event_data,
                    signature_b64url=event_data["signature_b64url"],
                    received_at=datetime.now(timezone.utc),
                )
                session.add(event)

            # Seed resources
            for res_data in fixture.get("resources", []):
                observed_at = datetime.fromisoformat(
                    res_data["observed_at"].replace("Z", "+00:00")
                )
                resource = ResourceModel(
                    resource_id=uuid.UUID(res_data["resource_id"]) if (len(res_data["resource_id"]) == 36 and res_data["resource_id"].count("-") == 4) else uuid.uuid5(uuid.NAMESPACE_DNS, res_data["resource_id"]),
                    incident_id=res_data["incident_id"],
                    capability=res_data["capability"],
                    status=res_data["status"],
                    region_geohash=res_data["region_geohash"],
                    available_units=res_data["available_units"],
                    observed_at=observed_at,
                    updated_at=datetime.now(timezone.utc),
                )
                session.add(resource)

    await engine.dispose()
    print("OK Demo incident seeded: demo-flood-2026")
    print(f"   Events: {len(fixture.get('events', [])) + len(fixture.get('road_reports', []))}")
    print(f"   Resources: {len(fixture.get('resources', []))}")


if __name__ == "__main__":
    asyncio.run(seed())
