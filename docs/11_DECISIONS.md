# Architecture Decisions

This log records decisions that affect more than one module. It prevents contributors from re-litigating settled choices and makes tradeoffs visible to judges and future maintainers. A decision is not a performance claim; verification stays in the evaluation plan.

## ADR-001: Offline-first event capture

**Status:** Accepted for MVP

**Context:** A disaster may remove internet access exactly when a survivor needs to report a need. A remote API cannot be the first dependency in the emergency path.

**Decision:** The PWA persists an SOS envelope in IndexedDB before it attempts a relay or API request. The local queue has its own state machine and survives reload. The backend receipt is an acknowledgement, not the definition of existence.

**Consequences:** Clients need retry, duplicate, expiry, local-storage-failure, and queue-migration handling. Event creation remains useful during a server outage. The user interface must never show "sent" when it only means "saved locally."

**Alternatives considered:** server-first capture was rejected because it fails under the problem's primary condition. Browser localStorage was rejected for structured queueing, durability controls, and capacity limitations.

## ADR-002: Immutable event envelope with idempotent ingestion

**Status:** Accepted for MVP

**Context:** Store-and-forward relay naturally delivers duplicates and out-of-order messages. Mutable records make provenance and conflict handling difficult.

**Decision:** Operational facts arrive as immutable, signed event envelopes. A stable `event_id` and idempotency key make retries safe. Corrections and resolutions are new events linked to the original event; responder read models project the current state.

**Consequences:** Queries require materialized projections, and clients cannot overwrite an observation silently. Auditability, replay, conflict review, and event-stream partitioning become possible.

## ADR-003: Transport-neutral mesh contract

**Status:** Accepted for MVP

**Context:** The wireframe describes Wi-Fi/BLE relay, but browser support and hackathon time make native transports unreliable to promise.

**Decision:** Use a WebSocket-over-Wi-Fi/LAN prototype adapter. Define relay validation, acknowledgement, TTL, dedupe, payload limits, and backpressure independently from the carrier. Native BLE and Wi-Fi Direct are future adapters implementing the same interface.

**Consequences:** The demo can prove relay semantics without falsely claiming browser BLE/Wi-Fi Direct support. Adapter boundaries must be tested with the same conformance suite.

## ADR-004: PostgreSQL is the P0 operational source of truth

**Status:** Accepted for MVP

**Context:** The project needs durable event storage, geospatial filters, resource availability, and simple operations. A graph database is attractive for exploration but adds operational risk during a short build.

**Decision:** PostgreSQL 16 holds canonical P0 event, resource, and assignment data. P0 uses geohash prefix/equality filters only. A graph projection, PostGIS, and Neo4j are production-evolution options only after the relational APIs work.

**Consequences:** Core workflows have one durable store. Graph insight is still possible, but not a hard deployment dependency. The projection must be rebuildable from events.

## ADR-005: Explainable evidence with visible Confidence Decay

**Status:** Accepted for MVP

**Context:** Conflicting and stale disaster reports need prioritization, but an unexplained percentage can create dangerous false certainty. Static verified/pending badges also hide the named "maps go stale" failure mode.

**Decision:** The trust engine exposes provenance, source class, freshness, corroboration, conflicts, and policy version. It derives `unverified`, `corroborated`, or `conflicting` states and, for map observations, a visible deterministic Confidence Decay value that falls with time since confirmation and resets after valid corroboration. The formula, cap, and UI states are explicit in `16_BUILD_CONTRACT.md`; it never blocks manual review.

**Consequences:** UI needs an evidence panel, map freshness display, simulated demo clock, and policy-friendly language. Automated decisions remain limited. Trust policy changes require versioning and review.

## ADR-006: Public infrastructure interoperability at the boundary

**Status:** Accepted for MVP

**Context:** ResQMesh must complement, not compete with, official emergency systems.

**Decision:** Use OASIS CAP 1.2 and GeoJSON at explicit import/export boundaries. Internal event vocabulary remains versioned and does not mirror external formats field-for-field.

**Consequences:** Partner integrations are isolated. Payload validation, source attribution, and schema mapping are required before external data affects operations.

## ADR-007: AI is assistive and optional

**Status:** Accepted for MVP

**Context:** Unstructured or multilingual reports can burden responders, but model errors have safety consequences and remote inference may be unavailable.

**Decision:** AI can propose structured fields, translation, duplicate candidates, or summaries. It never creates a verified fact, dispatches a resource, or blocks SOS capture. Rule-based and manual workflows remain complete without AI.

**Consequences:** Model outputs need provenance, confidence calibration, human review, data-minimization controls, and a clear unavailable state.

## Change-control template

```md
## ADR-NNN: Title

Status: Proposed | Accepted | Superseded
Date:
Owner:
Context:
Decision:
Alternatives:
Consequences:
Migration and rollback:
Verification:
```
