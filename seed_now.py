import asyncio
import sys
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

sys.path.insert(0, str(Path(__file__).parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from apps.api.app.config import load_config
from apps.api.app.db.models import Base, EventModel, ResourceModel

async def main():
    cfg = load_config()
    engine = create_async_engine(cfg.database_url, echo=True)

    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    sf = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Load fixture
    fixture_path = Path("packages/fixtures/incident.demo.json")
    with open(fixture_path) as f:
        fixture = json.load(f)

    async with sf() as session:
        async with session.begin():
            # Delete old demo data
            await session.execute(text("DELETE FROM assignments WHERE need_event_id IN (SELECT event_id FROM events WHERE incident_id = 'demo-flood-2026')"))
            await session.execute(text("DELETE FROM resources WHERE incident_id = 'demo-flood-2026'"))
            await session.execute(text("DELETE FROM events WHERE incident_id = 'demo-flood-2026'"))

            # Insert events
            for ev in fixture.get("events", []) + fixture.get("road_reports", []):
                created_at = datetime.fromisoformat(ev["created_at"].replace("Z", "+00:00"))
                session.add(EventModel(
                    event_id=uuid.UUID(ev["event_id"]),
                    schema_version=ev["schema_version"],
                    type=ev["type"],
                    incident_id=ev["incident_id"],
                    region_geohash=ev["location_geohash"],
                    created_at=created_at,
                    ttl_seconds=ev["ttl_seconds"],
                    priority=ev["priority"],
                    origin_kind=ev["origin"]["kind"],
                    origin_key_id=ev["origin"]["key_id"],
                    envelope=ev,
                    signature_b64url=ev["signature_b64url"],
                    received_at=datetime.now(timezone.utc),
                ))

            # Insert resources
            for res in fixture.get("resources", []):
                obs = datetime.fromisoformat(res["observed_at"].replace("Z", "+00:00"))
                rid = res["resource_id"]
                resource_uuid = uuid.UUID(rid) if (len(rid) == 36 and rid.count("-") == 4) else uuid.uuid5(uuid.NAMESPACE_DNS, rid)
                session.add(ResourceModel(
                    resource_id=resource_uuid,
                    incident_id=res["incident_id"],
                    capability=res["capability"],
                    status=res["status"],
                    region_geohash=res["region_geohash"],
                    available_units=res["available_units"],
                    observed_at=obs,
                    updated_at=datetime.now(timezone.utc),
                ))
        # session.begin() auto-commits here

    # Verify
    async with sf() as session:
        ev_count = (await session.execute(text("SELECT COUNT(*) FROM events"))).scalar()
        res_count = (await session.execute(text("SELECT COUNT(*) FROM resources"))).scalar()
        print(f"\nSEED COMPLETE: {ev_count} events, {res_count} resources in Neon DB")

    await engine.dispose()

asyncio.run(main())
