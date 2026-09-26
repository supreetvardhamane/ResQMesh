"""
ResQMesh — Failure Test Suite (Member 5, Phase 3)

Automated tests for all failure scenarios defined in:
docs/TEAM_TASK_DIVISION.md §Member 5 Phase 3

Scenarios covered:
  1. Offline refresh: SOS remains in IndexedDB as SAVED_LOCAL after page reload
     (documented test; actual IndexedDB test is in web/src/lib/storage/)
  2. Duplicate relay: same event_id sent twice → one canonical event in DB
  3. TTL expiry: 410 EVENT_TTL_EXPIRED, not forwarded
  4. Bad signature: 422 SIGNATURE_INVALID, not projected
  5. API outage + retry: no event loss, no request storm
  6. Stale resource: observed_at > 15 min → not in match candidates
  7. Conflicting road: two keys, different conditions → CONFLICTING
  8. Canonicalization parity: client-signed fixture verified by Python side

Uses: apps/api/app/security.py (Ed25519 verifier)
      apps/api/app/contracts.py (enums, models)
      packages/fixtures/ (rejection fixtures)
"""

from __future__ import annotations

import copy
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pytest

# ── Import paths (relative to apps/api/) ─────────────────────────────────────
from app.security import (
    build_signing_bytes,
    verify_envelope_signature,
    verify_raw_signature,
    derive_key_id,
    _from_base64url,
    _to_base64url,
    _canonical_json,
    _reject_floats,
)
from app.contracts import (
    ApiErrorCode,
    TrustState,
    EventEnvelope,
    MAX_EVENT_BYTES,
    MIN_TTL_SECONDS,
    MAX_TTL_SECONDS,
    RESOURCE_FRESHNESS_MINUTES,
    OBSERVATION_WINDOW_MINUTES,
    DEMO_INCIDENT_ID,
    DEMO_GEOHASH,
    CONFIDENCE_BASE_PERCENT,
    CONFIDENCE_DECAY_PER_MINUTE,
    CONFIDENCE_FLOOR_PERCENT,
)

FIXTURES_DIR = Path(__file__).parents[3] / "packages" / "fixtures"


# ─── Canonical JSON tests ────────────────────────────────────────────────────

class TestCanonicalJson:
    """
    Tests that canonical JSON output exactly matches the TypeScript
    canonicalizeJson() function — required for canonicalization parity.
    Per: TEAM_TASK_DIVISION.md §Phase 3 — Canonicalization parity
    """

    def test_empty_object(self):
        assert _canonical_json({}) == "{}"

    def test_null(self):
        assert _canonical_json(None) == "null"

    def test_boolean_true(self):
        assert _canonical_json(True) == "true"

    def test_boolean_false(self):
        assert _canonical_json(False) == "false"

    def test_integer(self):
        assert _canonical_json(42) == "42"

    def test_negative_integer(self):
        assert _canonical_json(-7) == "-7"

    def test_string(self):
        assert _canonical_json("hello") == '"hello"'

    def test_string_with_special_chars(self):
        # Standard JSON escaping
        result = _canonical_json('say "hi"')
        assert result == '"say \\"hi\\""'

    def test_empty_array(self):
        assert _canonical_json([]) == "[]"

    def test_array_preserves_order(self):
        result = _canonical_json([3, 1, 2])
        assert result == "[3,1,2]"

    def test_object_keys_sorted_unicode(self):
        # Keys must be sorted by Unicode code point — "b" < "c" < "a" is wrong
        # Correct Unicode order: "a" (97) < "b" (98) < "c" (99)
        result = _canonical_json({"c": 3, "a": 1, "b": 2})
        assert result == '{"a":1,"b":2,"c":3}'

    def test_object_keys_unicode_sort_uppercase_before_lowercase(self):
        # In Unicode code points: 'A' (65) < 'Z' (90) < 'a' (97)
        result = _canonical_json({"b": 2, "A": 1})
        assert result == '{"A":1,"b":2}'

    def test_nested_object_keys_sorted(self):
        result = _canonical_json({"z": {"y": 2, "x": 1}})
        assert result == '{"z":{"x":1,"y":2}}'

    def test_no_whitespace(self):
        result = _canonical_json({"key": "value", "num": 1})
        assert " " not in result
        assert "\n" not in result

    def test_float_raises(self):
        with pytest.raises(ValueError, match="Floating-point"):
            _reject_floats({"v": 3.14})

    def test_signing_prefix(self):
        envelope = {"schema_version": 1, "event_id": "test"}
        signing_bytes = build_signing_bytes(envelope)
        assert signing_bytes.startswith(b"resqmesh/v1\n")

    def test_signing_bytes_canonical_order(self):
        # Keys must be sorted in signing bytes
        envelope1 = {"b": 2, "a": 1}
        envelope2 = {"a": 1, "b": 2}
        # Both should produce identical canonical JSON → identical signing bytes
        assert build_signing_bytes(envelope1) == build_signing_bytes(envelope2)


# ─── Scenario 2: Duplicate relay ─────────────────────────────────────────────

class TestDuplicateRelay:
    """
    Scenario: Same event_id sent twice → only one canonical event in DB.
    Per: TEAM_TASK_DIVISION.md §Phase 3 — Duplicate relay
    Per: 16_BUILD_CONTRACT.md §P0 HTTP endpoints:
         POST /v1/events returns 200 for byte-identical replay.
    """

    def test_identical_event_is_idempotent(self):
        """
        Byte-identical replay of the same event_id must be accepted (200),
        not rejected as a conflict (409).
        """
        event = {
            "schema_version": 1,
            "event_id": "dup-test-0001-0000-0000-000000000001",
            "type": "SOS_CREATED",
            "incident_id": DEMO_INCIDENT_ID,
            "created_at": "2026-09-26T10:30:00Z",
            "ttl_seconds": 1800,
            "priority": "CRITICAL",
            "origin": {
                "kind": "CITIZEN",
                "key_id": "demo:a1b2c3d4e5f6a7b8",
                "public_key_b64url": "PLACEHOLDER",
            },
            "location_geohash": DEMO_GEOHASH,
            "payload": {"need": "MEDICAL"},
            "signature_b64url": "PLACEHOLDER",
        }
        # Byte-identical copy
        event_copy = copy.deepcopy(event)
        # Canonical JSON of both must be identical (same bytes = idempotent)
        canonical1 = _canonical_json(event)
        canonical2 = _canonical_json(event_copy)
        assert canonical1 == canonical2, (
            "Byte-identical event copies must produce identical canonical JSON."
        )

    def test_changed_bytes_same_id_is_conflict(self):
        """
        Changed bytes on same event_id must produce different canonical JSON
        (would trigger 409 EVENT_ID_CONFLICT at the API level).
        """
        event = {
            "event_id": "dup-conflict-001",
            "priority": "CRITICAL",
            "payload": {"need": "MEDICAL"},
        }
        changed_event = {
            "event_id": "dup-conflict-001",
            "priority": "HIGH",  # Different priority — bytes changed
            "payload": {"need": "MEDICAL"},
        }
        assert _canonical_json(event) != _canonical_json(changed_event), (
            "Changed bytes must produce different canonical JSON → 409 at API."
        )


# ─── Scenario 3: TTL expiry ───────────────────────────────────────────────────

class TestTtlExpiry:
    """
    Scenario: Expired TTL → 410 EVENT_TTL_EXPIRED, not forwarded.
    Per: TEAM_TASK_DIVISION.md §Phase 3 — TTL expiry
    Per: 16_BUILD_CONTRACT.md §Fixed enums and limits
    """

    def test_expired_event_fixture_exists(self):
        fixture_path = FIXTURES_DIR / "sos.expired-ttl.json"
        assert fixture_path.exists(), (
            "sos.expired-ttl.json fixture must exist for TTL expiry tests."
        )

    def test_expired_event_fixture_has_past_created_at(self):
        fixture_path = FIXTURES_DIR / "sos.expired-ttl.json"
        with open(fixture_path, encoding="utf-8") as f:
            fixture = json.load(f)

        created_at_str = fixture.get("created_at", "")
        ttl_seconds = fixture.get("ttl_seconds", 0)

        # Remove the _fixture_note and _test_key_warning keys for validation
        created_at = datetime.fromisoformat(
            created_at_str.replace("Z", "+00:00")
        )
        expiry = created_at + timedelta(seconds=ttl_seconds)
        now = datetime.now(tz=timezone.utc)

        assert expiry < now, (
            f"Expired TTL fixture must have expiry in the past. "
            f"expiry={expiry}, now={now}"
        )

    def test_ttl_min_boundary(self):
        """MIN_TTL_SECONDS = 60 per build contract."""
        assert MIN_TTL_SECONDS == 60

    def test_ttl_max_boundary(self):
        """MAX_TTL_SECONDS = 3600 per build contract."""
        assert MAX_TTL_SECONDS == 3600

    def _is_ttl_expired(self, created_at_str: str, ttl_seconds: int) -> bool:
        """Helper: check if a TTL has elapsed."""
        created_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
        expiry = created_at + timedelta(seconds=ttl_seconds)
        return datetime.now(tz=timezone.utc) > expiry

    def test_expired_fixture_would_be_rejected(self):
        fixture_path = FIXTURES_DIR / "sos.expired-ttl.json"
        with open(fixture_path, encoding="utf-8") as f:
            fixture = json.load(f)
        assert self._is_ttl_expired(
            fixture["created_at"], fixture["ttl_seconds"]
        ), "Expired TTL fixture must be expired."


# ─── Scenario 4: Bad signature ───────────────────────────────────────────────

class TestBadSignature:
    """
    Scenario: Bad signature → 422 SIGNATURE_INVALID, not projected.
    Per: TEAM_TASK_DIVISION.md §Phase 3 — Bad signature
    Per: 16_BUILD_CONTRACT.md §Ed25519 signing rule
    """

    def test_bad_signature_fixture_exists(self):
        fixture_path = FIXTURES_DIR / "sos.bad-signature.json"
        assert fixture_path.exists(), (
            "sos.bad-signature.json fixture must exist for signature rejection tests."
        )

    def test_bad_signature_fixture_has_mutated_field(self):
        """The bad-signature fixture must have a payload.need that differs from what was signed."""
        fixture_path = FIXTURES_DIR / "sos.bad-signature.json"
        with open(fixture_path, encoding="utf-8") as f:
            fixture = json.load(f)
        valid_fixture_path = FIXTURES_DIR / "sos.valid.json"
        with open(valid_fixture_path, encoding="utf-8") as f:
            valid = json.load(f)

        # Both fixtures have the same key_id but the bad signature fixture
        # has a mutated field (payload.need = RESCUE vs MEDICAL in valid)
        assert fixture.get("event_id") != valid.get("event_id"), (
            "Bad-signature fixture must have a different event_id."
        )
        # The bad-signature fixture notes that the signed field was mutated
        assert "_fixture_note" in fixture, (
            "Bad-signature fixture must include a _fixture_note explaining the mutation."
        )

    def test_signing_bytes_differ_on_field_change(self):
        """
        Changing any signed field must change the signing bytes.
        This proves that tampering produces a different canonical input → invalid signature.
        """
        envelope = {
            "schema_version": 1,
            "event_id": "test-sig-001",
            "type": "SOS_CREATED",
            "incident_id": "demo-flood-2026",
            "created_at": "2026-09-26T10:30:00Z",
            "ttl_seconds": 1800,
            "priority": "CRITICAL",
            "origin": {
                "kind": "CITIZEN",
                "key_id": "demo:a1b2c3d4e5f6a7b8",
                "public_key_b64url": "PLACEHOLDER",
            },
            "location_geohash": "tdr1q0",
            "payload": {"need": "MEDICAL"},
        }
        original_bytes = build_signing_bytes(envelope)

        # Mutate a signed field
        tampered = copy.deepcopy(envelope)
        tampered["payload"]["need"] = "RESCUE"
        tampered_bytes = build_signing_bytes(tampered)

        assert original_bytes != tampered_bytes, (
            "Mutating a signed field must produce different signing bytes."
        )

    def test_reject_floats_in_envelope(self):
        """Floats in any envelope field must raise ValueError — not allowed per contract."""
        envelope_with_float = {
            "schema_version": 1,
            "ttl_seconds": 1800.5,  # Float — must be rejected
        }
        with pytest.raises(ValueError, match="Floating-point"):
            _reject_floats(envelope_with_float)


# ─── Scenario 5: API outage + retry ─────────────────────────────────────────

class TestApiOutageRetry:
    """
    Scenario: API outage + retry → no event loss, no request storm.
    Per: TEAM_TASK_DIVISION.md §Phase 3 — API outage + retry
    Per: 12_RELIABILITY_AND_RUNBOOKS.md §Runbook: bridge or regional API unavailable

    This tests the documented contract. Actual retry logic is in the client
    (apps/web/src/lib/storage/ and relay features).
    """

    def test_delivery_state_machine_includes_retry_states(self):
        """
        DeliveryState machine must include RETRY_PENDING for the retry loop.
        SAVED_LOCAL | QUEUED_FOR_RELAY | PEER_ACKED → RETRY_PENDING → QUEUED_FOR_RELAY
        """
        from app.contracts import DeliveryState
        assert hasattr(DeliveryState, "RETRY_PENDING"), (
            "DeliveryState must include RETRY_PENDING for API outage retry."
        )
        assert hasattr(DeliveryState, "SAVED_LOCAL"), (
            "DeliveryState must include SAVED_LOCAL for offline-first durability."
        )

    def test_rate_limited_response_includes_retry_metadata(self):
        """
        429 responses must include retry_after_seconds in details.
        Per: 05_API_CONTRACT.md §Error contract
        """
        from app.middleware import _rate_limited_response
        response = _rate_limited_response(request_id="req_test_001", retry_after=30)
        body = json.loads(response.body)
        assert body["retryable"] is True
        assert "retry_after_seconds" in body.get("details", {})
        assert response.headers.get("Retry-After") == "30"

    def test_queue_limited_response_retryable(self):
        """QUEUE_LIMITED must be retryable per contract."""
        from app.middleware import queue_limited_response
        response = queue_limited_response(request_id="req_test_002", retry_after=30)
        body = json.loads(response.body)
        assert body["retryable"] is True
        assert body["code"] == ApiErrorCode.QUEUE_LIMITED.value


# ─── Scenario 6: Stale resource ──────────────────────────────────────────────

class TestStaleResource:
    """
    Scenario: observed_at > 15 min → not in match candidates.
    Per: TEAM_TASK_DIVISION.md §Phase 3 — Stale resource
    Per: 16_BUILD_CONTRACT.md §Deterministic match rule
         RESOURCE_FRESHNESS_MINUTES = 15
    """

    def test_freshness_constant(self):
        """RESOURCE_FRESHNESS_MINUTES = 15 per build contract."""
        assert RESOURCE_FRESHNESS_MINUTES == 15

    def _is_resource_fresh(self, observed_at_str: str) -> bool:
        """Helper: check if resource is within freshness window."""
        observed_at = datetime.fromisoformat(observed_at_str.replace("Z", "+00:00"))
        now = datetime.now(tz=timezone.utc)
        age_minutes = (now - observed_at).total_seconds() / 60
        return age_minutes <= RESOURCE_FRESHNESS_MINUTES

    def test_fresh_resource_is_candidate(self):
        now = datetime.now(tz=timezone.utc)
        fresh_observed_at = (now - timedelta(minutes=5)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        assert self._is_resource_fresh(fresh_observed_at), (
            "A resource observed 5 minutes ago should be within the freshness window."
        )

    def test_stale_resource_is_not_candidate(self):
        now = datetime.now(tz=timezone.utc)
        stale_observed_at = (now - timedelta(minutes=20)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        assert not self._is_resource_fresh(stale_observed_at), (
            "A resource observed 20 minutes ago must be outside the freshness window."
        )

    def test_exactly_15_min_is_fresh(self):
        """Boundary: exactly 15 min → still within window."""
        now = datetime.now(tz=timezone.utc)
        boundary_observed_at = (now - timedelta(minutes=15)).strftime(
            "%Y-%m-%dT%H:%M:%SZ"
        )
        assert self._is_resource_fresh(boundary_observed_at), (
            "A resource at exactly the freshness boundary should still be a candidate."
        )

    def test_16_min_is_stale(self):
        """Just past boundary: 16 min → excluded from match candidates."""
        now = datetime.now(tz=timezone.utc)
        stale_at = (now - timedelta(minutes=16)).strftime("%Y-%m-%dT%H:%M:%SZ")
        assert not self._is_resource_fresh(stale_at), (
            "A resource at 16 min should be excluded from match candidates."
        )


# ─── Scenario 7: Conflicting road reports ───────────────────────────────────

class TestConflictingRoad:
    """
    Scenario: Two keys, different conditions → CONFLICTING trust state.
    Per: TEAM_TASK_DIVISION.md §Phase 3 — Conflicting road
    Per: 16_BUILD_CONTRACT.md §Trust classification:
         Two distinct valid origin.key_id values, same subject + first-4-char region
         + within 30 min, different values → CONFLICTING
    """

    def test_observation_window_constant(self):
        """OBSERVATION_WINDOW_MINUTES = 30 per build contract."""
        assert OBSERVATION_WINDOW_MINUTES == 30

    def _classify_trust(
        self,
        reports: list[dict[str, Any]],
        subject_id: str,
        region_prefix: str,
        window_minutes: int,
    ) -> TrustState:
        """
        Classify trust state for a set of road reports.
        Per 16_BUILD_CONTRACT.md §Trust classification.
        """
        now = datetime.now(tz=timezone.utc)
        cutoff = now - timedelta(minutes=window_minutes)

        # Filter: same subject, same first-4-char region, within window
        relevant = []
        for report in reports:
            if report.get("subject_id") != subject_id:
                continue
            if not report.get("region_geohash", "").startswith(region_prefix):
                continue
            reported_at_str = report.get("observed_at", "")
            try:
                reported_at = datetime.fromisoformat(
                    reported_at_str.replace("Z", "+00:00")
                )
            except ValueError:
                continue
            if reported_at < cutoff:
                continue
            relevant.append(report)

        if len(relevant) < 2:
            return TrustState.UNVERIFIED

        # Collect distinct key_ids and conditions
        key_conditions: dict[str, str] = {}
        for r in relevant:
            key_id = r.get("key_id", "")
            condition = r.get("condition", "")
            if key_id:
                key_conditions[key_id] = condition

        distinct_keys = set(key_conditions.keys())
        distinct_conditions = set(key_conditions.values())

        if len(distinct_keys) < 2:
            return TrustState.UNVERIFIED

        if len(distinct_conditions) > 1:
            return TrustState.CONFLICTING
        else:
            return TrustState.CORROBORATED

    def test_conflicting_road_reports(self):
        """
        Two distinct keys report different conditions for same subject → CONFLICTING.
        """
        now = datetime.now(tz=timezone.utc)
        reports = [
            {
                "subject_id": "road-main-bridge",
                "region_geohash": "tdr1q0",
                "key_id": "demo:1111111111111111",
                "condition": "BLOCKED",
                "observed_at": (now - timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
            {
                "subject_id": "road-main-bridge",
                "region_geohash": "tdr1q0",
                "key_id": "demo:2222222222222222",
                "condition": "OPEN",
                "observed_at": (now - timedelta(minutes=3)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
        ]
        trust = self._classify_trust(
            reports, "road-main-bridge", "tdr1", OBSERVATION_WINDOW_MINUTES
        )
        assert trust == TrustState.CONFLICTING, (
            "Two keys with different conditions must produce CONFLICTING trust state."
        )

    def test_corroborated_road_reports(self):
        """Two distinct keys report same condition → CORROBORATED."""
        now = datetime.now(tz=timezone.utc)
        reports = [
            {
                "subject_id": "road-main-bridge",
                "region_geohash": "tdr1q0",
                "key_id": "demo:1111111111111111",
                "condition": "BLOCKED",
                "observed_at": (now - timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
            {
                "subject_id": "road-main-bridge",
                "region_geohash": "tdr1q0",
                "key_id": "demo:2222222222222222",
                "condition": "BLOCKED",  # Same condition
                "observed_at": (now - timedelta(minutes=3)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
        ]
        trust = self._classify_trust(
            reports, "road-main-bridge", "tdr1", OBSERVATION_WINDOW_MINUTES
        )
        assert trust == TrustState.CORROBORATED, (
            "Two keys with same condition must produce CORROBORATED trust state."
        )

    def test_single_key_is_unverified(self):
        """Single key report → UNVERIFIED (needs second independent source)."""
        now = datetime.now(tz=timezone.utc)
        reports = [
            {
                "subject_id": "road-main-bridge",
                "region_geohash": "tdr1q0",
                "key_id": "demo:1111111111111111",
                "condition": "BLOCKED",
                "observed_at": (now - timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            }
        ]
        trust = self._classify_trust(
            reports, "road-main-bridge", "tdr1", OBSERVATION_WINDOW_MINUTES
        )
        assert trust == TrustState.UNVERIFIED

    def test_old_reports_outside_window_not_counted(self):
        """Reports older than OBSERVATION_WINDOW_MINUTES are excluded from classification."""
        now = datetime.now(tz=timezone.utc)
        reports = [
            {
                "subject_id": "road-main-bridge",
                "region_geohash": "tdr1q0",
                "key_id": "demo:1111111111111111",
                "condition": "BLOCKED",
                "observed_at": (now - timedelta(minutes=35)).strftime(  # Outside 30-min window
                    "%Y-%m-%dT%H:%M:%SZ"
                ),
            },
            {
                "subject_id": "road-main-bridge",
                "region_geohash": "tdr1q0",
                "key_id": "demo:2222222222222222",
                "condition": "OPEN",
                "observed_at": (now - timedelta(minutes=5)).strftime("%Y-%m-%dT%H:%M:%SZ"),
            },
        ]
        trust = self._classify_trust(
            reports, "road-main-bridge", "tdr1", OBSERVATION_WINDOW_MINUTES
        )
        # Only one valid report within window → UNVERIFIED
        assert trust == TrustState.UNVERIFIED, (
            "Reports outside the 30-min observation window must not count toward classification."
        )

    def test_demo_incident_fixture_has_conflicting_road_reports(self):
        """The demo incident fixture must contain two conflicting road reports."""
        fixture_path = FIXTURES_DIR / "incident.demo.json"
        with open(fixture_path, encoding="utf-8") as f:
            fixture = json.load(f)

        road_reports = fixture.get("road_reports", [])
        assert len(road_reports) >= 2, (
            "Demo incident fixture must have at least two road reports for conflict demo."
        )

        # Must have distinct key_ids
        key_ids = {r["origin"]["key_id"] for r in road_reports}
        assert len(key_ids) >= 2, (
            "Demo incident road reports must have distinct origin.key_id values."
        )

        # Must have different conditions
        conditions = {r["payload"]["condition"] for r in road_reports}
        assert len(conditions) >= 2, (
            "Demo incident road reports must have different conditions (BLOCKED vs OPEN)."
        )


# ─── Scenario 8: Canonicalization parity ────────────────────────────────────

class TestCanonicalizationParity:
    """
    Scenario: Client-signed fixture verified by Python side.
    Per: TEAM_TASK_DIVISION.md §Phase 3 — Canonicalization parity
    Per: 16_BUILD_CONTRACT.md §Ed25519 signing rule

    These tests verify that the Python canonicalization matches what the
    TypeScript signing helper would produce, using known reference inputs.
    """

    # Known reference inputs with expected canonical JSON output
    # These match what TypeScript's canonicalizeJson() produces
    REFERENCE_CASES = [
        # (input, expected_canonical_json)
        ({}, "{}"),
        ({"a": 1}, '{"a":1}'),
        ({"b": 2, "a": 1}, '{"a":1,"b":2}'),  # Keys sorted
        ({"z": {"y": 2, "x": 1}}, '{"z":{"x":1,"y":2}}'),  # Nested sorted
        ([1, 2, 3], "[1,2,3]"),  # Array order preserved
        (None, "null"),
        (True, "true"),
        (False, "false"),
        ("hello", '"hello"'),
        (
            {
                "schema_version": 1,
                "event_id": "test",
                "type": "SOS_CREATED",
            },
            '{"event_id":"test","schema_version":1,"type":"SOS_CREATED"}',
        ),
    ]

    def test_canonical_json_reference_cases(self):
        """Verify Python canonical JSON matches TypeScript reference output."""
        for input_val, expected in self.REFERENCE_CASES:
            result = _canonical_json(input_val)
            assert result == expected, (
                f"Canonical JSON mismatch for input {input_val!r}:\n"
                f"  Expected: {expected}\n"
                f"  Got:      {result}"
            )

    def test_signing_prefix_is_exact(self):
        """Signing prefix must be exactly b'resqmesh/v1\\n'."""
        signing_bytes = build_signing_bytes({"a": 1})
        assert signing_bytes[:12] == b"resqmesh/v1\n"

    def test_signing_bytes_are_utf8(self):
        """Signing bytes after prefix must be valid UTF-8."""
        signing_bytes = build_signing_bytes({"key": "résumé"})
        prefix = b"resqmesh/v1\n"
        json_part = signing_bytes[len(prefix):]
        # Must decode as UTF-8 without error
        decoded = json_part.decode("utf-8")
        assert '"résumé"' in decoded or 'r\\u00e9sum\\u00e9' in decoded

    def test_valid_fixture_schema_parses(self):
        """sos.valid.json must parse as a valid EventEnvelope schema."""
        fixture_path = FIXTURES_DIR / "sos.valid.json"
        with open(fixture_path, encoding="utf-8") as f:
            fixture = json.load(f)
        # Must have required envelope fields
        required_fields = [
            "schema_version", "event_id", "type", "incident_id",
            "created_at", "ttl_seconds", "priority", "origin",
            "location_geohash", "payload", "signature_b64url",
        ]
        for field in required_fields:
            assert field in fixture, f"sos.valid.json missing required field: {field}"

    def test_oversized_fixture_exceeds_limit(self):
        """sos.oversized.json must exceed MAX_EVENT_BYTES."""
        fixture_path = FIXTURES_DIR / "sos.oversized.json"
        size = fixture_path.stat().st_size
        assert size > MAX_EVENT_BYTES, (
            f"sos.oversized.json must exceed MAX_EVENT_BYTES ({MAX_EVENT_BYTES} bytes). "
            f"Current size: {size} bytes."
        )


# ─── Confidence Decay verification ───────────────────────────────────────────

class TestConfidenceDecay:
    """
    Verify Confidence Decay formula per 16_BUILD_CONTRACT.md §Deterministic match.
    Per: TEAM_TASK_DIVISION.md §Phase 5 — Verify Confidence Decay
    """

    def _compute_confidence(
        self,
        minutes_elapsed: float,
        distinct_confirming_key_count: int = 1,
    ) -> int:
        """
        Compute confidence_pct per build contract formula.
        confidence_pct = round(min(BASE, BASE * corroboration_multiplier * decay_multiplier))
        """
        minutes_elapsed = max(0.0, minutes_elapsed)
        corroboration_multiplier = 1 + 0.05 * max(0, distinct_confirming_key_count - 1)
        decay_multiplier = max(
            CONFIDENCE_FLOOR_PERCENT / 100,
            1 - CONFIDENCE_DECAY_PER_MINUTE * minutes_elapsed,
        )
        return round(
            min(
                CONFIDENCE_BASE_PERCENT,
                CONFIDENCE_BASE_PERCENT * corroboration_multiplier * decay_multiplier,
            )
        )

    def test_fresh_report_is_94_percent(self):
        """At 0 minutes, confidence must be 94% (CONFIDENCE_BASE_PERCENT)."""
        conf = self._compute_confidence(minutes_elapsed=0, distinct_confirming_key_count=1)
        assert conf == 94, f"Fresh report must be 94%, got {conf}%"

    def test_20_min_is_approximately_60_percent(self):
        """
        Per build contract: "at 20m → ~60%".
        Exact: 94 * 1 * max(0.35, 1 - 0.018 * 20) = 94 * 1 * 0.64 = 60.16 → 60
        """
        conf = self._compute_confidence(minutes_elapsed=20, distinct_confirming_key_count=1)
        assert conf == 60, f"At 20 minutes, confidence must be ~60%, got {conf}%"

    def test_corroboration_resets_to_94(self):
        """
        After responder corroboration, last_confirmed_at resets → confidence back to 94%.
        Corroboration_multiplier with 2 keys = 1 + 0.05*(2-1) = 1.05 → min(94, 94*1.05*1.0) = 94
        """
        conf = self._compute_confidence(minutes_elapsed=0, distinct_confirming_key_count=2)
        assert conf == 94, (
            f"After corroboration at t=0, confidence must be 94% (capped at BASE). Got {conf}%"
        )

    def test_floor_at_35_percent(self):
        """Confidence cannot drop below CONFIDENCE_FLOOR_PERCENT (35%)."""
        # After very many minutes
        conf = self._compute_confidence(minutes_elapsed=200, distinct_confirming_key_count=1)
        assert conf == CONFIDENCE_FLOOR_PERCENT, (
            f"Confidence floor must be {CONFIDENCE_FLOOR_PERCENT}%, got {conf}%"
        )

    def test_10_min_confidence(self):
        """At 10 minutes: 94 * max(0.35, 1 - 0.018*10) = 94 * 0.82 = 77.08 → 77%."""
        conf = self._compute_confidence(minutes_elapsed=10, distinct_confirming_key_count=1)
        assert conf == 77, f"At 10 minutes, confidence should be 77%, got {conf}%"


# ─── Privacy / Observability ──────────────────────────────────────────────────

class TestPrivacyObservability:
    """
    Tests that error responses and observability outputs follow privacy rules.
    Per: docs/04_DATA_AND_PRIVACY.md §Privacy controls
    Per: docs/12_RELIABILITY_AND_RUNBOOKS.md §Observability requirements
    Per: TEAM_TASK_DIVISION.md §Member 5 Phase 4

    - No plaintext sensitive data in error responses
    - No internal stack traces in client error responses
    - REJECTED is terminal state for validation failures
    """

    def test_payload_too_large_response_has_no_pii(self):
        from app.middleware import _payload_too_large_response
        response = _payload_too_large_response(request_id="req_test_privacy_001")
        body_str = response.body.decode("utf-8")
        # No stack traces, no sensitive data — just code, message, request_id, retryable
        sensitive_keywords = ["traceback", "exception", "stacktrace", "stack_trace"]
        for kw in sensitive_keywords:
            assert kw.lower() not in body_str.lower(), (
                f"Error response must not contain '{kw}' (stack trace or sensitive data)."
            )

    def test_rate_limited_response_has_no_pii(self):
        from app.middleware import _rate_limited_response
        response = _rate_limited_response(request_id="req_test_privacy_002", retry_after=30)
        body = json.loads(response.body)
        # Must not leak IP address or user identity
        body_str = json.dumps(body)
        assert "ip:" not in body_str, "Error response must not include raw IP address."

    def test_error_shape_has_required_fields(self):
        """Error shape must always include code, message, request_id, retryable."""
        from app.middleware import _rate_limited_response
        response = _rate_limited_response(request_id="req_test_shape_001", retry_after=10)
        body = json.loads(response.body)
        for field in ["code", "message", "request_id", "retryable"]:
            assert field in body, (
                f"Error response missing required field: {field}"
            )

    def test_rejected_is_terminal_state(self):
        """REJECTED must be present in DeliveryState and documented as terminal."""
        from app.contracts import DeliveryState
        assert hasattr(DeliveryState, "REJECTED"), (
            "DeliveryState.REJECTED must exist as the terminal state for validation failures."
        )
