"""
ResQMesh — SQLAlchemy ORM Models

Exact schema from docs/16_BUILD_CONTRACT.md §Storage choice and schema.
PostgreSQL 16 only — no PostGIS, no Neo4j, no SQLite.

Tables:
  events       — immutable event store (PK event_id provides idempotency)
  resources    — community resource projections
  assignments  — responder-approved resource assignments
  sync_cursors — bridge sync cursor tracking

Indexes:
  events:      (incident_id, created_at DESC), (incident_id, region_geohash, type)
  resources:   (incident_id, capability, status, observed_at DESC)
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import CHAR, JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""
    pass


class EventModel(Base):
    """
    Immutable event store.
    Per: 16_BUILD_CONTRACT.md §Storage choice and schema

    event_id uniqueness provides idempotency:
      - 201 for new canonical event
      - 200 for byte-identical replay
      - 409 EVENT_ID_CONFLICT for changed bytes with existing ID
    """
    __tablename__ = "events"

    event_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    schema_version = Column(SmallInteger, nullable=False, default=1)
    type = Column(Text, nullable=False)
    incident_id = Column(Text, nullable=False)
    region_geohash = Column(CHAR(6), nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)
    ttl_seconds = Column(Integer, nullable=False)
    priority = Column(Text, nullable=False)
    origin_kind = Column(Text, nullable=False)
    origin_key_id = Column(Text, nullable=False)
    envelope = Column(JSONB, nullable=False)
    signature_b64url = Column(Text, nullable=False)
    received_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index("ix_events_incident_created", "incident_id", created_at.desc()),
        Index("ix_events_incident_region_type", "incident_id", "region_geohash", "type"),
    )


class ResourceModel(Base):
    """
    Community resource projections.
    Per: 16_BUILD_CONTRACT.md §Storage choice and schema
    """
    __tablename__ = "resources"

    resource_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    incident_id = Column(Text, nullable=False)
    capability = Column(Text, nullable=False)
    status = Column(Text, nullable=False)
    region_geohash = Column(CHAR(6), nullable=False)
    available_units = Column(Integer, nullable=False, default=0)
    observed_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        Index(
            "ix_resources_incident_capability_status_observed",
            "incident_id",
            "capability",
            "status",
            observed_at.desc(),
        ),
    )


class AssignmentModel(Base):
    """
    Responder-approved resource assignments.
    Per: 16_BUILD_CONTRACT.md §Storage choice and schema
    """
    __tablename__ = "assignments"

    assignment_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    need_event_id = Column(
        UUID(as_uuid=True),
        ForeignKey("events.event_id"),
        nullable=False,
    )
    resource_id = Column(
        UUID(as_uuid=True),
        ForeignKey("resources.resource_id"),
        nullable=False,
    )
    state = Column(Text, nullable=False, default="PROPOSED")
    rationale = Column(JSONB, nullable=False, default=list)
    created_by = Column(Text, nullable=False)
    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships for eager loading
    need_event = relationship("EventModel", foreign_keys=[need_event_id])
    resource = relationship("ResourceModel", foreign_keys=[resource_id])


class SyncCursorModel(Base):
    """
    Bridge sync cursor tracking.
    Per: 05_API_CONTRACT.md §Synchronization protocol

    Records the highest durably processed cursor for each bridge,
    not an unsafe global deletion signal.
    """
    __tablename__ = "sync_cursors"

    bridge_id = Column(Text, primary_key=True)
    cursor = Column(Text, nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )
