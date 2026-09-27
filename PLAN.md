# ResQMesh Project Plan

## 1. Goal

Deliver a working prototype that proves the core emergency coordination promise:

- a person can create an SOS while offline
- the message survives local storage and local transport
- the signal reaches nearby responders through a relay path
- the responder sees trust, provenance, and resource suggestions
- the system remains understandable, explainable, and safe in degraded conditions

This is not a full production emergency system. It is a credible, demoable vertical slice for the project goal.

---

## 2. Guiding principles

1. Offline-first before network-first
2. Event-first architecture over hidden state
3. Explainable trust instead of opaque automation
4. Fail safely and show uncertainty explicitly
5. Keep the core path reliable before layering extra features
6. Use synthetic demo data clearly and honestly

---

## 3. Current project scope

The repo already contains the foundations for the following capabilities:

- SOS form and offline capture
- local queue and local persistence
- relay messaging and duplicate suppression
- event validation and API ingestion
- responder feed and provenance panel
- confidence decay for road conditions
- resource matching and assignment proposal
- security-focused validation scenarios

---

## 4. Delivery plan

### Phase 1 — Foundation and contract freeze

Objective:
Finalize the shared contract that all modules rely on.

Work items:
- align on event envelope schema
- define fixed enum values and limits
- freeze delivery states and relay semantics
- confirm incident and geohash conventions
- confirm what is demo-only vs production-ready

Exit criteria:
- all major components agree on the same event model
- the demo flow can be described in one coherent sequence

### Phase 2 — Offline SOS path

Objective:
Ensure the user can create and retain an SOS without connectivity.

Work items:
- mobile-first form experience
- geohash validation
- local queue save
- Ed25519 signing
- state transitions for local save and retry
- refresh survival and persistence checks

Exit criteria:
- SOS remains available after refresh or loss of connectivity
- the event is stored locally before any network handoff

### Phase 3 — Relay and peer propagation

Objective:
Move the event from one device to another in a bounded mesh path.

Work items:
- WebSocket relay client and manager
- event offer/request/push/ack model
- duplicate suppression
- TTL enforcement
- retry policy and backoff
- priority ordering

Exit criteria:
- the same event is not duplicated in final outcome
- expired or invalid relay events are rejected cleanly

### Phase 4 — Backend ingestion and canonical persistence

Objective:
Validate and persist the event through the API layer.

Work items:
- FastAPI app setup
- event validation and middleware
- idempotency checks
- API sync endpoints
- database persistence and event storage
- health checks and error handling

Exit criteria:
- a valid signed event is accepted once and preserved as canonical
- invalid data is rejected before operational use

### Phase 5 — Responder operations

Objective:
Turn the stored event into an operational response surface.

Work items:
- event listing for responders
- provenance detail and trust explanation
- confidence decay UI for changing conditions
- verification of corroboration and stale evidence handling
- resource match candidate results
- assignment action workflow

Exit criteria:
- a responder can understand what happened, why it is believed, and what resources may help

### Phase 6 — Reliability and security validation

Objective:
Prove that failure modes are handled safely.

Work items:
- expired TTL tests
- bad signature rejection
- stale resource exclusion
- duplicate event handling
- assignment safety constraints
- retry and queue persistence tests

Exit criteria:
- critical failure scenarios produce a visible, safe, explainable outcome
- the demo can be reset cleanly between runs

### Phase 7 — Demo polish and final verification

Objective:
Convert the prototype into a coherent judge-ready experience.

Work items:
- accessibility polish
- keyboard navigation
- clear status labels
- simplified explanation of prototype boundaries
- final run-through and evidence capture

Exit criteria:
- the demo path works reliably
- the project communicates honest limitations and current capability

---

## 5. Ownership map

### Client / UX
- SOS form
- offline UI states
- tabbed responder experience
- status and local feedback

### Mesh / reliability
- relay flow
- duplicate suppression
- TTL and retry logic
- bounded transport semantics

### Backend / data
- ingestor and schema validation
- database models and persistence
- sync endpoints
- assignment and resource API logic

### Trust / evidence
- provenance and confidence decay
- corroboration rules
- explainable evidence view

### Security / integration
- event signing and validation
- rejection failures and safety checks
- architecture consistency across app and API

---

## 6. Risks and mitigations

### Risk: event duplication across peers
Mitigation: enforce idempotency and duplicate cache on event id and content hash.

### Risk: offline path not persistent enough
Mitigation: use IndexedDB, queue management, and explicit local-save state.

### Risk: fake certainty in responder decisions
Mitigation: show confidence decay, provenance, and stale-data boundaries.

### Risk: system looks polished but is not actually working
Mitigation: focus on the single reliable journey and verify each step end to end.

### Risk: overpromising production readiness
Mitigation: clearly mark prototype transport, synthetic data, and planned capabilities.

---

## 7. Acceptance checklist

The project is ready when:

- SOS can be created offline
- the event persists locally
- the event can be relayed via nearby peers
- a bridge or sync path accepts and stores the event
- responders can view it in a structured feed
- confidence decay or provenance is visible
- resource matches are explainable and bounded
- invalid or expired data is rejected
- the flow can be demonstrated repeatedly without confusion

---

## 8. Recommended immediate next steps

1. Keep the repo on the testing_final branch
2. Confirm the single golden end-to-end demo path
3. Document the actual workflow in one runbook
4. Remove or clearly mark any feature that does not affect the real path
5. Align docs, UI, and backend behavior around the same flow

This keeps the project credible and makes the architecture easier to explain to reviewers and judges.
