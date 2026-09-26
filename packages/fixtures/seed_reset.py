#!/usr/bin/env python3
"""
ResQMesh — DB + IndexedDB Reset/Seed Script  (Member 6 / QA)

Restores the demo environment to a deterministic state in < 30 seconds.
Run between demo rehearsals or after the judge Q&A.

What it does:
  1. Connects to PostgreSQL (via compose.yaml config) and truncates all tables
  2. Re-seeds the DB with incident.demo.json fixtures (events, resources)
  3. Prints an IndexedDB clear instruction for the browser (cannot automate headlessly)

Usage:
  python packages/fixtures/seed_reset.py [--dry-run]

Environment variables (override defaults):
  DB_HOST     localhost
  DB_PORT     5432
  DB_NAME     resqmesh
  DB_USER     resqmesh
  DB_PASSWORD resqmesh

Requirements:
  pip install psycopg[binary]>=3.2.0
"""

from __future__ import annotations

import argparse
import io
import json
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

# Force UTF-8 on Windows
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

FIXTURES_DIR = Path(__file__).resolve().parent
INCIDENT_DEMO = FIXTURES_DIR / "incident.demo.json"

# ─── Config ──────────────────────────────────────────────────────────────────

import os

DB_CONFIG = {
    "host": os.getenv("DB_HOST", "localhost"),
    "port": int(os.getenv("DB_PORT", "5432")),
    "dbname": os.getenv("DB_NAME", "resqmesh"),
    "user": os.getenv("DB_USER", "resqmesh"),
    "password": os.getenv("DB_PASSWORD", "resqmesh"),
}


def log(msg: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
    print(f"[{ts}] {msg}")


def connect():
    try:
        import psycopg
    except ImportError:
        log("ERROR: psycopg not installed. Run: pip install 'psycopg[binary]>=3.2.0'")
        sys.exit(1)
    try:
        conn = psycopg.connect(**DB_CONFIG)
        return conn
    except Exception as e:
        log(f"ERROR: Cannot connect to PostgreSQL: {e}")
        log(f"       Config: {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['dbname']}")
        log("       Is the DB running? (docker compose up -d)")
        sys.exit(1)


def truncate_all(conn, dry_run: bool) -> None:
    """Truncate all data tables in dependency order."""
    tables = ["assignments", "resources", "events"]
    with conn.cursor() as cur:
        for table in tables:
            sql = f"TRUNCATE TABLE {table} RESTART IDENTITY CASCADE"
            if dry_run:
                log(f"[DRY-RUN] Would execute: {sql}")
            else:
                try:
                    cur.execute(sql)
                    log(f"Truncated: {table}")
                except Exception as e:
                    log(f"WARNING: Could not truncate {table}: {e} (table may not exist yet)")
    if not dry_run:
        conn.commit()


def seed_events(conn, events: list[dict], dry_run: bool) -> None:
    """Insert events from fixture into the events table."""
    received_at = datetime.now(timezone.utc).isoformat()
    sql = """
        INSERT INTO events (
            event_id, schema_version, type, incident_id, region_geohash,
            created_at, ttl_seconds, priority, origin_kind, origin_key_id,
            envelope, signature_b64url, received_at
        ) VALUES (
            %(event_id)s, %(schema_version)s, %(type)s, %(incident_id)s, %(region_geohash)s,
            %(created_at)s, %(ttl_seconds)s, %(priority)s, %(origin_kind)s, %(origin_key_id)s,
            %(envelope)s::jsonb, %(signature_b64url)s, %(received_at)s
        )
        ON CONFLICT (event_id) DO NOTHING
    """
    with conn.cursor() as cur:
        for event in events:
            params = {
                "event_id": event["event_id"],
                "schema_version": event["schema_version"],
                "type": event["type"],
                "incident_id": event["incident_id"],
                "region_geohash": event["location_geohash"],
                "created_at": event["created_at"],
                "ttl_seconds": event["ttl_seconds"],
                "priority": event["priority"],
                "origin_kind": event["origin"]["kind"],
                "origin_key_id": event["origin"]["key_id"],
                "envelope": json.dumps(event),
                "signature_b64url": event["signature_b64url"],
                "received_at": received_at,
            }
            if dry_run:
                log(f"[DRY-RUN] Would INSERT event: {event['event_id']} ({event['type']})")
            else:
                try:
                    cur.execute(sql, params)
                    log(f"Seeded event: {event['event_id']} ({event['type']})")
                except Exception as e:
                    log(f"WARNING: Could not insert event {event['event_id']}: {e}")
    if not dry_run:
        conn.commit()


def seed_resources(conn, resources: list[dict], dry_run: bool) -> None:
    """Insert resources from fixture into the resources table."""
    sql = """
        INSERT INTO resources (
            resource_id, incident_id, capability, status,
            region_geohash, available_units, observed_at, updated_at
        ) VALUES (
            %(resource_id)s, %(incident_id)s, %(capability)s, %(status)s,
            %(region_geohash)s, %(available_units)s, %(observed_at)s, %(updated_at)s
        )
        ON CONFLICT (resource_id) DO UPDATE SET
            status = EXCLUDED.status,
            available_units = EXCLUDED.available_units,
            observed_at = EXCLUDED.observed_at,
            updated_at = EXCLUDED.updated_at
    """
    updated_at = datetime.now(timezone.utc).isoformat()
    with conn.cursor() as cur:
        for resource in resources:
            params = {
                "resource_id": resource["resource_id"],
                "incident_id": resource["incident_id"],
                "capability": resource["capability"],
                "status": resource["status"],
                "region_geohash": resource["region_geohash"],
                "available_units": resource["available_units"],
                "observed_at": resource["observed_at"],
                "updated_at": updated_at,
            }
            if dry_run:
                log(f"[DRY-RUN] Would INSERT resource: {resource['resource_id']} ({resource['capability']})")
            else:
                try:
                    cur.execute(sql, params)
                    log(f"Seeded resource: {resource['resource_id']} ({resource['capability']})")
                except Exception as e:
                    log(f"WARNING: Could not insert resource {resource['resource_id']}: {e}")
    if not dry_run:
        conn.commit()


def seed_road_reports(conn, road_reports: list[dict], dry_run: bool) -> None:
    """Insert road report events from fixture into the events table."""
    seed_events(conn, road_reports, dry_run)


def print_indexeddb_instructions() -> None:
    """Print browser steps to clear IndexedDB (cannot automate headlessly)."""
    print()
    print("=" * 60)
    print("INDEXEDDB RESET — Manual Browser Steps:")
    print("  1. Open Chrome/Edge DevTools (F12)")
    print("  2. Go to Application > Storage > IndexedDB")
    print("  3. Expand 'resqmesh' database")
    print("  4. Right-click each object store > 'Clear'")
    print("  OR: In DevTools Console, run:")
    print("      indexedDB.deleteDatabase('resqmesh')")
    print("  5. Refresh the page")
    print("=" * 60)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="ResQMesh DB+IndexedDB reset/seed script (Member 6 / QA)"
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be done without modifying the DB",
    )
    parser.add_argument(
        "--no-db",
        action="store_true",
        help="Skip DB operations (only print IndexedDB instructions)",
    )
    args = parser.parse_args()

    print("ResQMesh Reset/Seed — Member 6 / QA")
    print("=" * 60)
    if args.dry_run:
        log("DRY-RUN MODE — no changes will be made")

    # Load fixture
    with open(INCIDENT_DEMO, encoding="utf-8") as f:
        incident = json.load(f)

    events = incident.get("events", [])
    resources = incident.get("resources", [])
    road_reports = incident.get("road_reports", [])

    log(f"Fixture: {incident['incident_id']} @ {incident['region_geohash']}")
    log(f"  Events: {len(events)}, Resources: {len(resources)}, Road reports: {len(road_reports)}")

    if not args.no_db:
        log("Connecting to PostgreSQL...")
        conn = connect()
        log(f"Connected to {DB_CONFIG['host']}:{DB_CONFIG['port']}/{DB_CONFIG['dbname']}")

        log("--- Truncating tables ---")
        truncate_all(conn, args.dry_run)

        log("--- Seeding events ---")
        seed_events(conn, events, args.dry_run)

        log("--- Seeding road reports ---")
        seed_road_reports(conn, road_reports, args.dry_run)

        log("--- Seeding resources ---")
        seed_resources(conn, resources, args.dry_run)

        conn.close()
        log("DB connection closed.")
    else:
        log("--no-db: Skipping database operations.")

    print_indexeddb_instructions()

    log("Reset complete. Environment is ready for demo.")
    log("Run validate_fixtures.py to confirm fixture integrity before presenting.")


if __name__ == "__main__":
    main()
