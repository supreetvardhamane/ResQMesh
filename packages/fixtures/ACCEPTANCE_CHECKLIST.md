# ResQMesh — Member 6 Acceptance Checklist

> **Owner:** Member 6 — QA, Demo & Accessibility  
> **Branch:** `qa/phase0-fixtures-and-demo-plan`  
> **Updated:** 2026-09-26  
> **Source of truth:** `docs/16_BUILD_CONTRACT.md` · `docs/07_EVALUATION_PLAN.md`

---

## Phase 0 — Demo Plan ✅

- [x] Read `09_DEMO_SCRIPT.md` and `10_JUDGE_QA.md` end to end
- [x] Defined the exact 5-minute demo journey (see `docs/09_DEMO_SCRIPT.md §Five-minute walkthrough`)
- [x] Identified which demo moment provides evidence for each judging criterion:

| Criterion | Demo Moment | Evidence |
|-----------|-------------|---------|
| Impact & Scalability | Step 6 — architecture diagram | Partitioned event model, CAP/GeoJSON boundary |
| Technical Feasibility | Steps 2–4 — SOS → relay → bridge → API | Signed envelope, TTL/dedupe, typed FastAPI |
| Innovation | Steps 4–5 — resource match + trust decay | Confidence Decay from 94% → 60% → 94% |
| UX & Accessibility | Step 7 — keyboard + mobile layout | 360px viewport, tab flow, icon+text status |

---

## Phase 1 — Fixture Creation ✅

- [x] `packages/fixtures/sos.valid.json` — generated with real Ed25519 test key, verified
  - key_id: `demo:83c25ca7ee6501c0`
  - Signature: self-verified via `validate_fixtures.py` (30 checks pass)
- [x] `packages/fixtures/sos.bad-signature.json` — priority mutated from CRITICAL→NORMAL after signing
  - Verifier must return `SIGNATURE_INVALID` (422)
- [x] `packages/fixtures/incident.demo.json`:
  - `incident_id = demo-flood-2026` ✅
  - `region_geohash = tdr1q0` ✅
  - One medical SOS (CRITICAL priority) ✅
  - One ambulance resource (AVAILABLE, 2 units) ✅
  - One hospital bed resource (AVAILABLE, 5 units) ✅
  - Two conflicting road reports (same subject `road-main-bridge`, different conditions BLOCKED/OPEN, different `origin.key_id` values) → triggers `CONFLICTING` trust state ✅
- [x] `packages/fixtures/test_key.json` — test public key for cross-layer verification
- [x] `packages/fixtures/generate_fixtures.py` — reproducible Ed25519 key generation script
- [x] `packages/fixtures/validate_fixtures.py` — Pydantic + signature validation (30 checks, all passing)
- [x] `packages/fixtures/seed_reset.py` — restores DB + IndexedDB state, supports `--dry-run`
- [x] `packages/fixtures/typecheck_fixtures.ts` — TypeScript type assertions for fixtures
- [ ] Verify CI validates fixtures through Pydantic + TypeScript type checks *(pending CI setup by Member 4)*

---

## Phase 2–3 — Acceptance Checklist (update as lanes deliver)

### FR-01 — SOS Durability (EV-01)
- [ ] SOS persists after refresh — `SAVED_LOCAL` state in IndexedDB
- [ ] Confirmed fixture event_id stable across page reload
- [ ] Status: **PENDING** — waiting for Member 2 (SOS form + IndexedDB queue)

### FR-02 — Bad Signature Rejection (EV-04)
- [x] `sos.bad-signature.json` fixture ready — mutated priority field
- [ ] API returns `422 SIGNATURE_INVALID` for bad-signature fixture
- [ ] Event not projected to responder view
- [ ] Status: **PARTIALLY VERIFIED** — fixture ready; API integration pending Member 4+5

### FR-07 — Idempotency / Duplicate Relay (EV-02)
- [x] Same event_id in fixture — relay dedupe test uses `sos.valid.json`
- [ ] Duplicate relay → one canonical event in DB
- [ ] API returns `200` for byte-identical replay
- [ ] Status: **PENDING** — waiting for Members 3 + 4

### Accessibility
- [ ] Tab through SOS form → submit → status update — all keyboard
- [ ] 360 px viewport: SOS button visible without scroll
- [ ] Status text not color-only; visible focus rings
- [ ] Screen reader labels on all interactive controls
- [ ] `prefers-reduced-motion` tested
- [ ] Status: **PENDING** — waiting for Member 2 (frontend)

### Performance
- [ ] No full-feed download triggered (cursor-paginated only)
- [ ] No uncontrolled polling from client
- [ ] Status: **PENDING** — waiting for Members 2 + 4

### Observability
- [ ] Failure path creates structured log (queue age, relay receipt, duplicate suppression)
- [ ] No plaintext sensitive data in any log
- [ ] Status: **PENDING** — waiting for Member 5

---

## Phase 4 — Evidence Capture (planned)

Screenshots to capture:
- [ ] SOS form (360px, keyboard focus visible)
- [ ] Each delivery state: `DRAFT → SAVED_LOCAL → QUEUED_FOR_RELAY → PEER_ACKED → BRIDGE_ACKED → SYNCED`
- [ ] Confidence Decay at 0m (94% bright red), 10m (amber), 20m (60% dim)
- [ ] Resource match with rationale array
- [ ] Provenance panel (origin, relay hops, trust state)
- [ ] Conflicting trust state for road reports
- [ ] Assignment acceptance

Network samples:
- [ ] `POST /v1/events` → 201 (valid SOS)
- [ ] `POST /v1/events` → 200 (duplicate)
- [ ] `POST /v1/events` → 410 (expired TTL)
- [ ] `POST /v1/events` → 422 (bad signature)

Log captures:
- [ ] Queue age log entry
- [ ] Relay receipt log entry
- [ ] Duplicate suppression log entry

---

## Phase 6 — Verification Complete (planned)

- [ ] Run full integration suite from `07_EVALUATION_PLAN.md` (EV-01 through EV-08)
- [ ] Rehearse 5-minute demo script once with full team
- [ ] Update `15_REQUIREMENTS_TRACEABILITY.md` with `IMPLEMENTED`/`VERIFIED`/`DEFERRED` for FR-01 through FR-08
- [ ] Confirm backup recording ready as fallback
- [ ] Two consecutive successful demo walkthroughs on final device

---

## Phase 7 — Demo Lock (planned)

- [ ] Reset fixtures between the two final runs (use `seed_reset.py`)
- [ ] Prepare factual judge answers from `10_JUDGE_QA.md`
- [ ] Capture evidence register (see `EVIDENCE_REGISTER.md`)
- [ ] Confirm backup recording playback works

---

## Pre-Demo Checklist (from `09_DEMO_SCRIPT.md`)

- [ ] Known device/browser pair tested and charger/network fallback available
- [ ] Fixture IDs, seed resources, and blocked-road conflict are visible
- [ ] Offline state and bridge state can be toggled without editing code
- [ ] Console/log windows are closed or scrubbed of any secret/sensitive data
- [ ] Mobile viewport, keyboard focus, and reduced-motion setting are prepared
- [ ] Backup recording matches the current build
- [ ] Every visible metric has a source or is marked illustrative

---

## Fixture Verification Evidence

```
Run: python -X utf8 packages/fixtures/validate_fixtures.py
Date: 2026-09-26
Result: All 30 checks PASSED

  [1] sos.valid.json — must parse + signature must verify
      JSON loads                    PASS
      Pydantic EventEnvelope        PASS
      type == SOS_CREATED           PASS
      priority == CRITICAL          PASS
      incident_id == demo-flood-2026 PASS
      location_geohash == tdr1q0    PASS
      ttl_seconds == 1800           PASS
      origin.kind == CITIZEN        PASS
      key_id format (demo:16hex)    PASS
      Ed25519 signature verifies    PASS
      Size <= 2048 bytes (492B)     PASS

  [2] sos.bad-signature.json — schema OK but signature must FAIL
      JSON loads                    PASS
      Schema valid                  PASS
      Signature correctly FAILS     PASS
      priority mutated from CRITICAL PASS

  [3] incident.demo.json — all events parseable, resources valid
      incident_id == demo-flood-2026 PASS
      region_geohash == tdr1q0      PASS
      Has 1 SOS_CREATED event       PASS
      SOS priority == CRITICAL      PASS
      SOS payload.need == MEDICAL   PASS
      SOS signature verifies        PASS
      SOS Pydantic valid            PASS
      Has 2 resources               PASS
      Has AMBULANCE resource        PASS
      Has HOSPITAL_BED resource     PASS
      Both resources AVAILABLE      PASS
      Both resources units > 0      PASS
      Has 2 road reports            PASS
      Same subject_id               PASS
      DIFFERENT key_ids             PASS
      Different conditions          PASS
      Road report 1 sig verifies    PASS
      Road report 1 Pydantic valid  PASS
      Road report 2 sig verifies    PASS
      Road report 2 Pydantic valid  PASS

  [4] Canonicalization parity
      Canonical JSON stable         PASS
      Prefix 'resqmesh/v1\n'        PASS
```
