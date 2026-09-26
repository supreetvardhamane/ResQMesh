# ResQMesh — Evidence Register (Member 6 / QA)

> **Format per** `07_EVALUATION_PLAN.md §Evidence register format`  
> **Owner:** Member 6 — QA, Demo & Accessibility  
> **Branch:** `qa/phase0-fixtures-and-demo-plan`  
> **Updated:** 2026-09-26

---

## EV-01 — Offline SOS Persistence

```
Requirement: RT-01 / FR-01 (EV-01)
Build/version: TBD — pending Member 2 (SOS form + IndexedDB)
Environment: Chrome/Edge on demo device
Scenario: Device offline, create SOS, refresh browser
Expected: Event remains in local queue, status says SAVED_LOCAL
Result: PENDING
Measurements: —
Artifacts: —
Known limits: Requires Member 2 frontend completion
Reviewer and date: Member 6 — TBD
```

---

## EV-02 — Duplicate Relay / Idempotency

```
Requirement: RT-02 / FR-07 (EV-02)
Build/version: TBD — pending Members 3 + 4
Environment: Local WS relay simulator + FastAPI
Scenario: Relay same sos.valid.json envelope through two peers twice
Expected: One canonical event in DB; duplicate receipt 200, not 201
Result: PENDING
Measurements: —
Artifacts: fixtures/sos.valid.json (event_id: a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d)
Known limits: Requires Member 3 relay adapter + Member 4 POST /v1/events
Reviewer and date: Member 6 — TBD
```

---

## EV-03 — TTL Expiry

```
Requirement: RT-02 (EV-03)
Build/version: TBD — pending Member 3 (relay TTL) + Member 4 (API 410)
Environment: Relay simulator + FastAPI
Scenario: Send event after ttl_seconds has elapsed since created_at
Expected: Adapter stops forwarding; API returns 410 EVENT_TTL_EXPIRED
Result: PENDING
Measurements: —
Artifacts: To create: sos.ttl-expired.json (created_at far in the past)
Known limits: Requires Member 5 rejection fixture + Member 4 API
Reviewer and date: Member 6 — TBD
```

---

## EV-04 — Bad Signature Rejection

```
Requirement: RT-02 / FR-02 (EV-04)
Build/version: 2026-09-26 (fixture verified)
Environment: FastAPI + Pydantic validator
Scenario: Submit sos.bad-signature.json (priority mutated after signing)
Expected: 422 SIGNATURE_INVALID; event not projected to responder view
Result: PARTIALLY VERIFIED — fixture validated; API integration pending
Measurements:
  - Fixture size: 618 bytes (< 2048 byte limit)
  - Pydantic schema: VALID (mutation is in priority field, not schema)
  - Ed25519 signature: FAILS (mutation detected by verifier) — CONFIRMED
Artifacts:
  - packages/fixtures/sos.bad-signature.json
  - validate_fixtures.py output (all 30 checks passed 2026-09-26)
Known limits: API endpoint (POST /v1/events) not yet implemented by Member 4
Reviewer and date: Member 6 — 2026-09-26
```

---

## EV-05 — Bridge/API Outage + Retry

```
Requirement: RT-02 (EV-05)
Build/version: TBD — pending Members 2, 3, 4
Environment: Local demo with network simulation
Scenario: Bridge/API outage during sync; queue remains; retry succeeds on recovery
Expected: No event loss; no request storm; RETRY_PENDING → QUEUED_FOR_RELAY
Result: PENDING
Measurements: —
Artifacts: —
Known limits: Requires full integration (Members 2+3+4)
Reviewer and date: Member 6 — TBD
```

---

## EV-06 — Stale Resource Match

```
Requirement: RT-03 (EV-06)
Build/version: TBD — pending Member 4 (resource matching)
Environment: FastAPI + PostgreSQL
Scenario: Resource observed_at > 15 min; should not appear in match candidates
Expected: Match view shows stale/changed; assignment requires review
Result: PENDING
Measurements: —
Artifacts: —
Known limits: Requires Member 4 GET /v1/resources/matches implementation
Reviewer and date: Member 6 — TBD
```

---

## EV-07 — Conflicting Road Reports

```
Requirement: RT-04 (EV-07)
Build/version: 2026-09-26 (fixture verified)
Environment: FastAPI + PostgreSQL (trust projection)
Scenario: Two road reports with different key_ids, same subject, different conditions
Expected: TrustState = CONFLICTING; both evidence items preserved
Result: PARTIALLY VERIFIED — fixture ready; trust projection pending Member 4
Measurements:
  - Road report 1: key_id demo:83c25ca7ee6501c0, condition BLOCKED, verified
  - Road report 2: key_id demo:1c81e7f31ca0ebb4, condition OPEN, verified
  - Both share subject_id: road-main-bridge
  - Both within same first-4-char region: tdr1
  - Both within 30-min window: timestamps 10:20Z and 10:22Z
Artifacts:
  - packages/fixtures/incident.demo.json (road_reports array)
  - validate_fixtures.py: Road reports use DIFFERENT key_ids — PASS
Known limits: Trust projection (CONFLICTING state) requires Member 4 implementation
Reviewer and date: Member 6 — 2026-09-26
```

---

## EV-08 — 360 px + Keyboard-Only SOS Flow

```
Requirement: RT-06 (EV-08)
Build/version: TBD — pending Member 2 (SOS form + accessibility)
Environment: Chrome at 360 px viewport; keyboard only
Scenario: Navigate SOS form, submit, view status — no mouse
Expected: No clipped text; all controls and state announcements usable
Result: PENDING
Measurements: —
Artifacts: —
Known limits: Requires Member 2 frontend completion
Reviewer and date: Member 6 — TBD
```

---

## EV-09 — AI Unavailable Fallback

```
Requirement: RT-09 (EV-09)
Build/version: DEFERRED — AI is optional per ADR-007
Environment: N/A
Scenario: AI unavailable or returns malformed output
Expected: Manual/rule path completes without data loss
Result: DEFERRED — rule-based match is P0; AI is not in scope for demo
Artifacts: docs/11_DECISIONS.md (ADR-007)
Known limits: —
Reviewer and date: Member 1 decision — Member 6 noted
```

---

## EV-10 — CAP/GeoJSON Boundary

```
Requirement: RT-07 (EV-10)
Build/version: DEFERRED — CAP/GeoJSON is post-P0 scope brake
Environment: N/A
Scenario: CAP/GeoJSON invalid or unauthorized
Expected: Bounded validation error; no partial projection
Result: DEFERRED — only if all P0 endpoints complete (per 16_BUILD_CONTRACT.md)
Artifacts: docs/15_REQUIREMENTS_TRACEABILITY.md (RT-07 = DEFERRED)
Known limits: —
Reviewer and date: Member 1 decision — Member 6 noted
```

---

## EV-11 — Confidence Decay Visual Test

```
Requirement: RT-04 (EV-11)
Build/version: TBD — pending Member 2 (responder UI + simulated clock)
Environment: Browser on demo device
Scenario: Fresh blocked-road report ages by simulated clock, then corroborated
Expected: 94% at 0m (bright red) -> 60% at 20m (amber, 0.72 opacity) -> 94% on responder corroboration (pulse)
Formula verified:
  decay_multiplier = max(35/100, 1 - 0.018 * 20) = max(0.35, 0.64) = 0.64
  confidence_pct = round(min(94, 94 * 1.0 * 0.64)) = round(60.16) = 60 [CONFIRMED]
Result: PENDING (formula math confirmed; UI pending Member 2)
Measurements:
  At 0m:  confidence = 94% (bright red, solid)
  At 10m: confidence = round(94 * (1 - 0.018*10)) = round(94 * 0.82) = round(77.08) = 77% (amber 0.72)
  At 20m: confidence = 60% (dim red/gray 0.45)
  After responder corroboration: resets to 94%, 250ms pulse
Artifacts: Formula verified against 16_BUILD_CONTRACT.md §Confidence Decay formula
Known limits: Requires Member 2 simulated-clock UI + responder action
Reviewer and date: Member 6 — 2026-09-26 (formula), UI TBD
```

---

## Fixture Integrity Summary

```
Date: 2026-09-26
Script: python -X utf8 packages/fixtures/validate_fixtures.py
Result: 30/30 checks PASSED

Files produced by Member 6 (qa/ branch):
  packages/fixtures/sos.valid.json          (real Ed25519 sig, 492 bytes)
  packages/fixtures/sos.bad-signature.json  (mutation fixture, sig FAILS)
  packages/fixtures/incident.demo.json      (full demo incident, all sigs verified)
  packages/fixtures/test_key.json           (public key only, test env only)
  packages/fixtures/generate_fixtures.py    (deterministic key generator)
  packages/fixtures/validate_fixtures.py    (Pydantic + sig validator)
  packages/fixtures/seed_reset.py           (DB + IndexedDB reset script)
  packages/fixtures/typecheck_fixtures.ts   (TypeScript type assertions)
  packages/fixtures/ACCEPTANCE_CHECKLIST.md (living QA checklist)
  packages/fixtures/EVIDENCE_REGISTER.md    (this file)
```
