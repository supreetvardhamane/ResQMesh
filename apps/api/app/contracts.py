"""
ResQMesh — Canonical Contract Types (Python)

This is the SINGLE source of truth for all shared enums, limits,
and event envelope shape on the API side. Do not duplicate these
definitions elsewhere.
See: docs/16_BUILD_CONTRACT.md
"""

from __future__ import annotations

import enum
from datetime import datetime
from typing import Any, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, Field, field_validator

# ─── Fixed Protocol Constants ───────────────────────────────────────────

PROTOCOL_VERSION = 1
SCHEMA_VERSION = 1
MAX_EVENT_BYTES = 2048
MAX_FRAME_BYTES = 3072
MAX_ACTIVE_PEERS = 4
MAX_HOPS = 3
MAX_QUEUE_EVENTS = 200
MAX_DEDUPE_IDS = 1024
DEFAULT_TTL_SECONDS = 1800
MIN_TTL_SECONDS = 60
MAX_TTL_SECONDS = 3600
GEOHASH_LENGTH = 6
SYNC_PAGE_MAX_EVENTS = 50
SYNC_PAGE_MAX_BYTES = 102400
RESOURCE_FRESHNESS_MINUTES = 15
OBSERVATION_WINDOW_MINUTES = 30
CONFIDENCE_BASE_PERCENT = 94
CONFIDENCE_DECAY_PER_MINUTE = 0.018
CONFIDENCE_FLOOR_PERCENT = 35


# ─── Fixed Enums ────────────────────────────────────────────────────────

class Priority(str, enum.Enum):
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    NORMAL = "NORMAL"


class NeedCode(str, enum.Enum):
    MEDICAL = "MEDICAL"
    RESCUE = "RESCUE"
    FOOD_WATER = "FOOD_WATER"
    SHELTER = "SHELTER"


class ResourceCapability(str, enum.Enum):
    AMBULANCE = "AMBULANCE"
    HOSPITAL_BED = "HOSPITAL_BED"
    SHELTER_BED = "SHELTER_BED"
    FOOD_WATER = "FOOD_WATER"
    GENERATOR = "GENERATOR"


class ResourceStatus(str, enum.Enum):
    AVAILABLE = "AVAILABLE"
    RESERVED = "RESERVED"
    UNAVAILABLE = "UNAVAILABLE"


class SourceKind(str, enum.Enum):
    CITIZEN = "CITIZEN"
    VOLUNTEER = "VOLUNTEER"
    RESPONDER = "RESPONDER"
    AUTHORITY = "AUTHORITY"
    BRIDGE = "BRIDGE"


class TrustState(str, enum.Enum):
    UNVERIFIED = "UNVERIFIED"
    CORROBORATED = "CORROBORATED"
    CONFLICTING = "CONFLICTING"
    REJECTED = "REJECTED"


class DeliveryState(str, enum.Enum):
    DRAFT = "DRAFT"
    SAVED_LOCAL = "SAVED_LOCAL"
    QUEUED_FOR_RELAY = "QUEUED_FOR_RELAY"
    PEER_ACKED = "PEER_ACKED"
    BRIDGE_ACKED = "BRIDGE_ACKED"
    SYNCED = "SYNCED"
    RETRY_PENDING = "RETRY_PENDING"
    EXPIRED = "EXPIRED"
    REJECTED = "REJECTED"


class EventType(str, enum.Enum):
    SOS_CREATED = "SOS_CREATED"
    RESOURCE_UPSERTED = "RESOURCE_UPSERTED"
    ROAD_REPORTED = "ROAD_REPORTED"
    REPORT_CORROBORATED = "REPORT_CORROBORATED"
    ASSIGNMENT_CREATED = "ASSIGNMENT_CREATED"
    ASSIGNMENT_UPDATED = "ASSIGNMENT_UPDATED"


# ─── Capability Mapping (for resource matching) ─────────────────────────

CAPABILITY_MAP: dict[NeedCode, list[ResourceCapability]] = {
    NeedCode.MEDICAL: [ResourceCapability.AMBULANCE, ResourceCapability.HOSPITAL_BED],
    NeedCode.RESCUE: [ResourceCapability.AMBULANCE],
    NeedCode.FOOD_WATER: [ResourceCapability.FOOD_WATER],
    NeedCode.SHELTER: [ResourceCapability.SHELTER_BED],
}


# ─── Frozen Fixture IDs ─────────────────────────────────────────────────

DEMO_INCIDENT_ID = "demo-flood-2026"
DEMO_GEOHASH = "tdr1q0"


# ─── Event Envelope Models ──────────────────────────────────────────────

class EventOrigin(BaseModel):
    """Origin identity embedded in the signed envelope."""
    model_config = {"extra": "forbid"}

    kind: SourceKind
    key_id: str = Field(..., pattern=r"^demo:[0-9a-f]{16}$")
    public_key_b64url: str


class SOSPayload(BaseModel):
    """Payload for SOS_CREATED events."""
    model_config = {"extra": "forbid"}

    need: NeedCode


class ResourcePayload(BaseModel):
    """Payload for RESOURCE_UPSERTED events."""
    model_config = {"extra": "forbid"}

    capability: ResourceCapability
    status: ResourceStatus
    available_units: int = Field(..., ge=0)


class RoadReportPayload(BaseModel):
    """Payload for ROAD_REPORTED events."""
    model_config = {"extra": "forbid"}

    subject_id: str
    condition: str = Field(..., pattern=r"^(BLOCKED|OPEN)$")
    observed_at: str  # UTC ISO-8601


class CorroborationPayload(BaseModel):
    """Payload for REPORT_CORROBORATED events."""
    model_config = {"extra": "forbid"}

    target_event_id: str
    subject_id: str
    condition: str = Field(..., pattern=r"^(BLOCKED|OPEN)$")
    observed_at: str  # UTC ISO-8601


class AssignmentCreatedPayload(BaseModel):
    """Payload for ASSIGNMENT_CREATED events."""
    model_config = {"extra": "forbid"}

    need_event_id: str
    resource_id: str
    rationale: list[str]


class AssignmentUpdatedPayload(BaseModel):
    """Payload for ASSIGNMENT_UPDATED events."""
    model_config = {"extra": "forbid"}

    assignment_id: str
    state: str
    reason: Optional[str] = None
    updated_at: str  # UTC ISO-8601


# Map from EventType to allowed payload model
PAYLOAD_SCHEMAS: dict[EventType, type[BaseModel]] = {
    EventType.SOS_CREATED: SOSPayload,
    EventType.RESOURCE_UPSERTED: ResourcePayload,
    EventType.ROAD_REPORTED: RoadReportPayload,
    EventType.REPORT_CORROBORATED: CorroborationPayload,
    EventType.ASSIGNMENT_CREATED: AssignmentCreatedPayload,
    EventType.ASSIGNMENT_UPDATED: AssignmentUpdatedPayload,
}


class EventEnvelope(BaseModel):
    """
    Immutable signed event envelope.
    Relay metadata is carried in frames and never mutates this body.
    """
    model_config = {"extra": "forbid"}

    schema_version: Literal[1] = SCHEMA_VERSION
    event_id: str  # UUID v4
    type: EventType
    incident_id: str
    created_at: str  # UTC ISO-8601
    ttl_seconds: int = Field(..., ge=MIN_TTL_SECONDS, le=MAX_TTL_SECONDS)
    priority: Priority
    origin: EventOrigin
    location_geohash: str = Field(..., min_length=GEOHASH_LENGTH, max_length=GEOHASH_LENGTH, pattern=r"^[a-z0-9]{6}$")
    payload: dict[str, Any]
    signature_b64url: str

    @field_validator("payload")
    @classmethod
    def validate_payload_schema(cls, v: dict[str, Any], info: Any) -> dict[str, Any]:
        """Validate payload matches the allowlisted schema for the event type."""
        event_type = info.data.get("type")
        if event_type and event_type in PAYLOAD_SCHEMAS:
            PAYLOAD_SCHEMAS[event_type].model_validate(v)
        return v


# ─── API Error Models ───────────────────────────────────────────────────

class ApiErrorCode(str, enum.Enum):
    INVALID_SCHEMA = "INVALID_SCHEMA"
    INVALID_GEOJSON = "INVALID_GEOJSON"
    PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE"
    AUTH_REQUIRED = "AUTH_REQUIRED"
    TOKEN_EXPIRED = "TOKEN_EXPIRED"
    SCOPE_DENIED = "SCOPE_DENIED"
    ROLE_DENIED = "ROLE_DENIED"
    NOT_FOUND = "NOT_FOUND"
    EVENT_ID_CONFLICT = "EVENT_ID_CONFLICT"
    VERSION_CONFLICT = "VERSION_CONFLICT"
    EVENT_TTL_EXPIRED = "EVENT_TTL_EXPIRED"
    CURSOR_EXPIRED = "CURSOR_EXPIRED"
    SIGNATURE_INVALID = "SIGNATURE_INVALID"
    KEY_REVOKED = "KEY_REVOKED"
    RATE_LIMITED = "RATE_LIMITED"
    QUEUE_LIMITED = "QUEUE_LIMITED"
    TEMPORARY_UNAVAILABLE = "TEMPORARY_UNAVAILABLE"


class ApiError(BaseModel):
    """Standard error response shape per 05_API_CONTRACT.md."""
    code: str
    message: str
    request_id: str
    retryable: bool
    details: Optional[dict[str, Any]] = None


# ─── Sync Protocol Models ───────────────────────────────────────────────

class SyncPullRequest(BaseModel):
    """Request body for POST /v1/sync/pull."""
    model_config = {"extra": "forbid"}

    scope: dict[str, str]  # { incident_id, region_bucket }
    cursor: Optional[str] = None
    accepted_schema_versions: list[int] = [SCHEMA_VERSION]
    max_events: int = Field(SYNC_PAGE_MAX_EVENTS, le=SYNC_PAGE_MAX_EVENTS)


class SyncAckRequest(BaseModel):
    """Request body for POST /v1/sync/ack."""
    model_config = {"extra": "forbid"}

    bridge_id: str
    cursor: str


# ─── Resource Models ────────────────────────────────────────────────────

class ResourceUpsert(BaseModel):
    """Request body for POST /v1/resources."""
    model_config = {"extra": "forbid"}

    resource_id: str
    incident_id: str
    capability: ResourceCapability
    status: ResourceStatus
    region_geohash: str = Field(..., min_length=GEOHASH_LENGTH, max_length=GEOHASH_LENGTH, pattern=r"^[a-z0-9]{6}$")
    available_units: int = Field(..., ge=0)
    observed_at: str  # UTC ISO-8601


class ResourceMatch(BaseModel):
    """Single resource match candidate."""
    resource_id: str
    need_id: str
    status: ResourceStatus
    distance_or_region: str
    availability_updated_at: str
    rationale: list[str]


# ─── Assignment Models ──────────────────────────────────────────────────

class AssignmentCreate(BaseModel):
    """Request body for POST /v1/assignments."""
    model_config = {"extra": "forbid"}

    need_event_id: str
    resource_id: str
    rationale: list[str]
    created_by: str  # responder identity


class AssignmentUpdate(BaseModel):
    """Request body for PATCH /v1/assignments/{assignment_id}."""
    model_config = {"extra": "forbid"}

    state: str
    reason: Optional[str] = None
    updated_at: str  # UTC ISO-8601
