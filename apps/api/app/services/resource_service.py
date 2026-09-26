"""
ResQMesh — Resource and Matching Service

Implements:
  POST /v1/resources — register or update a community resource
  GET  /v1/resources/matches?need_event_id= — deterministic match

Per: docs/16_BUILD_CONTRACT.md §Deterministic match, trust, and Confidence Decay rules
Per: docs/05_API_CONTRACT.md §Resource and assignment commands

Match rule (exact from 16_BUILD_CONTRACT.md):
  A resource is eligible when:
    - has the mapped capability
    - status == AVAILABLE
    - available_units > 0
    - same first four geohash characters as the need
    - observed_at is at most RESOURCE_FRESHNESS_MINUTES (15) old

  Capability mapping:
    MEDICAL  → AMBULANCE, HOSPITAL_BED
    SHELTER  → SHELTER_BED
    FOOD_WATER → FOOD_WATER
    RESCUE   → AMBULANCE

  Sort: exact six-character geohash, capability order, newest observation,
        then stable resource ID.
  Return at most 3 candidates with rationale[] array.

Trust classification:
  Same subject + first-4-char region + within 30 minutes:
    CONFLICTING: two distinct valid origin.key_id values report different values
    CORROBORATED: two distinct valid keys report the same value
    Otherwise: UNVERIFIED
  A bridge cannot corroborate a report it merely relayed.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from ..contracts import (
    CAPABILITY_MAP,
    OBSERVATION_WINDOW_MINUTES,
    RESOURCE_FRESHNESS_MINUTES,
    EventType,
    NeedCode,
    ResourceCapability,
    ResourceMatch,
    ResourceStatus,
    ResourceUpsert,
    TrustState,
)
from ..db.models import EventModel, ResourceModel


# ─── Resource Upsert ────────────────────────────────────────────────────────

async def upsert_resource(
    data: ResourceUpsert,
    session: AsyncSession,
    request_id: str,
) -> dict[str, Any]:
    """
    Register or update a community resource.

    Per 05_API_CONTRACT.md §Resource and assignment commands:
      Resource updates require an observed_at timestamp and actor identity.
      A stale resource update is retained as evidence but must not silently
      overwrite a newer availability state.
    """
    try:
        resource_uuid = uuid.UUID(data.resource_id)
    except ValueError:
        resource_uuid = uuid.uuid4()

    existing = await session.execute(
        select(ResourceModel).where(ResourceModel.resource_id == resource_uuid)
    )
    existing_resource = existing.scalar_one_or_none()

    observed_at = datetime.fromisoformat(
        data.observed_at.replace("Z", "+00:00")
    )

    if existing_resource is not None:
        # A stale update must not silently overwrite a newer state
        if observed_at <= existing_resource.observed_at:
            # Retain as evidence but don't overwrite — return existing state
            return {
                "resource_id": str(existing_resource.resource_id),
                "status": "retained_stale",
                "message": "Stale update retained as evidence; newer state preserved.",
                "current_observed_at": existing_resource.observed_at.isoformat(),
                "request_id": request_id,
            }

        # Update with newer data
        existing_resource.capability = data.capability.value
        existing_resource.status = data.status.value
        existing_resource.region_geohash = data.region_geohash
        existing_resource.available_units = data.available_units
        existing_resource.observed_at = observed_at
        existing_resource.updated_at = datetime.now(timezone.utc)

        await session.flush()

        return {
            "resource_id": str(existing_resource.resource_id),
            "status": "updated",
            "request_id": request_id,
        }

    # Create new resource
    new_resource = ResourceModel(
        resource_id=resource_uuid,
        incident_id=data.incident_id,
        capability=data.capability.value,
        status=data.status.value,
        region_geohash=data.region_geohash,
        available_units=data.available_units,
        observed_at=observed_at,
        updated_at=datetime.now(timezone.utc),
    )
    session.add(new_resource)
    await session.flush()

    return {
        "resource_id": str(new_resource.resource_id),
        "status": "created",
        "request_id": request_id,
    }


# ─── Deterministic Resource Matching ────────────────────────────────────────

# Capability mapping per 16_BUILD_CONTRACT.md
# This order also defines the sort priority
_CAPABILITY_ORDER: dict[ResourceCapability, int] = {
    ResourceCapability.AMBULANCE: 0,
    ResourceCapability.HOSPITAL_BED: 1,
    ResourceCapability.SHELTER_BED: 2,
    ResourceCapability.FOOD_WATER: 3,
    ResourceCapability.GENERATOR: 4,
}


async def find_matches(
    need_event_id: str,
    session: AsyncSession,
    request_id: str,
    reference_time: datetime | None = None,
) -> list[ResourceMatch]:
    """
    Return explainable candidate matches for a need event.

    Per 16_BUILD_CONTRACT.md §Deterministic match rule:
      1. Lookup the need event to get need code and geohash
      2. Map need code → eligible capabilities
      3. Filter: status=AVAILABLE, available_units>0, first 4 geohash chars match,
         observed_at ≤ 15 minutes old
      4. Sort: exact geohash, capability order, newest observation, stable resource_id
      5. Return max 3 candidates with rationale[]
    """
    now = reference_time or datetime.now(timezone.utc)

    # Lookup the need event
    try:
        event_uuid = uuid.UUID(need_event_id)
    except ValueError:
        return []

    result = await session.execute(
        select(EventModel).where(EventModel.event_id == event_uuid)
    )
    need_event = result.scalar_one_or_none()

    if need_event is None:
        return []

    # Extract need code from the envelope payload
    payload = need_event.envelope.get("payload", {})
    need_code_str = payload.get("need")
    if not need_code_str:
        return []

    try:
        need_code = NeedCode(need_code_str)
    except ValueError:
        return []

    # Map to eligible capabilities
    eligible_capabilities = CAPABILITY_MAP.get(need_code, [])
    if not eligible_capabilities:
        return []

    need_geohash = need_event.region_geohash
    need_region = need_geohash[:4]  # First 4 chars for region matching

    # Freshness cutoff
    freshness_cutoff = now - timedelta(minutes=RESOURCE_FRESHNESS_MINUTES)

    # Query eligible resources
    capability_values = [cap.value for cap in eligible_capabilities]

    query = (
        select(ResourceModel)
        .where(
            and_(
                ResourceModel.capability.in_(capability_values),
                ResourceModel.status == ResourceStatus.AVAILABLE.value,
                ResourceModel.available_units > 0,
                ResourceModel.region_geohash.startswith(need_region),
                ResourceModel.observed_at >= freshness_cutoff,
            )
        )
    )

    result = await session.execute(query)
    candidates = result.scalars().all()

    if not candidates:
        return []

    # Sort: exact geohash match first, then capability order, newest observation,
    # stable resource_id
    def sort_key(r: ResourceModel) -> tuple:
        exact_match = 0 if r.region_geohash == need_geohash else 1
        try:
            cap_order = _CAPABILITY_ORDER.get(
                ResourceCapability(r.capability), 99
            )
        except ValueError:
            cap_order = 99
        # Negate timestamp for newest-first
        obs_ts = -r.observed_at.timestamp() if r.observed_at else 0
        return (exact_match, cap_order, obs_ts, str(r.resource_id))

    candidates_sorted = sorted(candidates, key=sort_key)

    # Return at most 3 candidates with rationale
    matches: list[ResourceMatch] = []
    for resource in candidates_sorted[:3]:
        rationale = _build_rationale(resource, need_code, need_geohash, now)
        matches.append(
            ResourceMatch(
                resource_id=str(resource.resource_id),
                need_id=need_event_id,
                status=ResourceStatus(resource.status),
                distance_or_region=resource.region_geohash,
                availability_updated_at=resource.observed_at.isoformat(),
                rationale=rationale,
            )
        )

    return matches


def _build_rationale(
    resource: ResourceModel,
    need_code: NeedCode,
    need_geohash: str,
    now: datetime,
) -> list[str]:
    """
    Build factual rationale array for a match candidate.
    Per 05_API_CONTRACT.md §Matching response:
      Rationale is factual, e.g. "ambulance capability matches medical transport;
      available 4 minutes ago; route includes a blocked-road warning."
    """
    rationale: list[str] = []

    # Capability match reason
    rationale.append(
        f"{resource.capability.lower()} capability matches "
        f"{need_code.value.lower().replace('_', ' ')} need"
    )

    # Availability freshness
    if resource.observed_at:
        age_minutes = (now - resource.observed_at).total_seconds() / 60
        rationale.append(
            f"available {int(age_minutes)} minutes ago; "
            f"{resource.available_units} units reported"
        )

    # Region match
    if resource.region_geohash == need_geohash:
        rationale.append("exact location match")
    elif resource.region_geohash[:4] == need_geohash[:4]:
        rationale.append("same region (first 4 geohash characters)")

    # Status
    rationale.append(f"status: {resource.status.lower()}")

    return rationale


# ─── Trust Classification ───────────────────────────────────────────────────

async def classify_trust(
    subject_id: str,
    region_geohash: str,
    session: AsyncSession,
    reference_time: datetime | None = None,
) -> TrustState:
    """
    Classify trust state for observations of the same subject.

    Per 16_BUILD_CONTRACT.md §Trust:
      For observations of the same subject in the same first-four-character
      region inside 30 minutes:
        CONFLICTING: two distinct valid origin.key_id values report different values
        CORROBORATED: two distinct valid keys report the same value
        Otherwise: UNVERIFIED
      A bridge cannot corroborate a report it merely relayed.
    """
    now = reference_time or datetime.now(timezone.utc)
    window_start = now - timedelta(minutes=OBSERVATION_WINDOW_MINUTES)
    region_prefix = region_geohash[:4]

    # Query road reports and corroborations for this subject in the time window
    query = (
        select(EventModel)
        .where(
            and_(
                EventModel.type.in_([
                    EventType.ROAD_REPORTED.value,
                    EventType.REPORT_CORROBORATED.value,
                ]),
                EventModel.region_geohash.startswith(region_prefix),
                EventModel.created_at >= window_start,
            )
        )
        .order_by(EventModel.created_at.desc())
    )

    result = await session.execute(query)
    events = result.scalars().all()

    # Filter events for this specific subject
    relevant_events: list[EventModel] = []
    for event in events:
        payload = event.envelope.get("payload", {})
        event_subject = payload.get("subject_id")
        if event_subject == subject_id:
            relevant_events.append(event)

    if len(relevant_events) < 2:
        return TrustState.UNVERIFIED

    # Collect distinct key_id → condition mapping
    # Per contract: bridge (origin_kind=BRIDGE) cannot corroborate
    key_conditions: dict[str, set[str]] = {}
    for event in relevant_events:
        # Skip bridge-relayed events for corroboration
        if event.origin_kind == "BRIDGE":
            continue

        key_id = event.origin_key_id
        payload = event.envelope.get("payload", {})
        condition = payload.get("condition")
        if condition and key_id:
            if key_id not in key_conditions:
                key_conditions[key_id] = set()
            key_conditions[key_id].add(condition)

    distinct_keys = list(key_conditions.keys())

    if len(distinct_keys) < 2:
        return TrustState.UNVERIFIED

    # Check if different keys report different conditions
    all_conditions: set[str] = set()
    for conditions in key_conditions.values():
        all_conditions.update(conditions)

    if len(all_conditions) > 1:
        # Two distinct keys report different values → CONFLICTING
        return TrustState.CONFLICTING
    else:
        # Two distinct keys report the same value → CORROBORATED
        return TrustState.CORROBORATED
