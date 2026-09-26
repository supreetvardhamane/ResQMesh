# Judge Q and A

## Judge Preparation Phases

### Phase 1: Core value and problem relevance

Prepare concise answers on the four failure modes, target users, why central dashboards alone fail, and why ResQMesh is a coordination layer rather than another alert app. Every answer should point back to the live SOS-to-resource journey.

### Phase 2: Technical feasibility

Prepare to show the actual prototype boundary: PWA persistence, WebSocket/LAN simulation, TTL, dedupe, canonical Ed25519 signatures, bridge sync, FastAPI contract, PostgreSQL 16 store, and CAP/GeoJSON fixtures. PostGIS and Neo4j are explicitly planned, not P0 dependencies. State what is implemented, mocked, simulated, and planned without blurring them.

### Phase 3: Safety, privacy, and trust

Prepare evidence on data minimization, scope-based access, provenance, conflicting reports, invalid signatures, human assignment, AI limitations, and operational fallback. These answers should demonstrate responsible engineering rather than promise perfect information.

### Phase 4: Scale, execution, and next steps

Prepare the partitioned event architecture, async read-model pattern, client efficiency, regional federation path, test methodology, team ownership, and production-evolution roadmap. Use this phase for any question about billion-scale ambition or implementation sequencing.

### Phase 5: Rehearsal

Assign one person to ask adversarial questions and one to answer from the product. Rewrite any answer that makes an unmeasured claim, relies on vague future work, or cannot be linked to a document or live screen.

## Does this really scale to a billion users?

The prototype does not claim one billion concurrent users. It proves the contracts that avoid central bottlenecks: local-first operation, bounded event relay, idempotent regional ingestion, geography/time partitioning, asynchronous projections, caches, and federation. We will make throughput claims only after reproducible load tests.

## Why not just use WhatsApp, an alert app, or a central dashboard?

Those can fail when connectivity, visibility, maps, or trust fail. ResQMesh joins four responses: offline delivery, distributed local knowledge, community resource matching, and evidence-aware trust. It complements official systems through CAP and GeoJSON instead of replacing them.

## How does the mesh work when the internet is gone?

The MVP uses WebSocket over Wi-Fi/LAN as a simulated local transport. Events are stored locally and relayed hop by hop with priority, TTL, signatures, and duplicate detection. Native BLE/Wi-Fi Direct is a roadmap adapter, not a browser capability we falsely claim today.

## What stops misinformation from spreading?

Nothing can make all reports true. ResQMesh preserves provenance, time, freshness, corroboration, conflicts, and relay history. It weights evidence and gives responders the context to review it; it does not silently declare a report verified.

## Why does the blocked-road marker fade over time?

Conditions change during a disaster. Confidence Decay makes that uncertainty visible instead of letting a report look permanently current. A fresh blocked-road report begins at 94%, falls to 60% after 20 minutes without confirmation, and returns to 94% when a responder independently reports that it is still blocked. The visible score is a deterministic freshness signal based on time and corroboration, not an AI truth claim or automatic routing decision.

## What exactly is innovative here?

The innovation is the combination: a disaster coordination layer that works disconnected, represents local relationships as a knowledge graph, discovers community capacity, and preserves the evidence behind operational information. Each capability addresses a different observed failure mode.

## What is the AI doing, and can it make a bad decision?

AI is optional assistive extraction and summarization for unstructured reports. It proposes fields for review, retains the source text and model trace, and never automatically dispatches resources, verifies a report, or blocks SOS capture.

## How do you protect vulnerable people?

P0 minimizes data, allows anonymous SOS, accepts only coarse location buckets, and rejects sensitive fields altogether. It signs events for integrity and scopes responder actions. Production field encryption, retention, redaction, and full role governance are documented next steps, not falsely presented as shipped. Provenance is not treated as identity proof.

## What evidence shows technical feasibility?

The live vertical slice demonstrates durable local storage, signed envelopes, relay TTL and dedupe, bridge sync, typed FastAPI contracts, resource matching, and provenance views. The evaluation plan defines the failure and accessibility checks used before demo readiness.

## What happens if a map or server is down?

The emergency event stays locally stored and relayable. The interface falls back to locality/geohash text, and bridge synchronization retries later. Maps and the server enhance coordination but are not prerequisites for SOS capture.

## What would you build next?

Validate the event model under increasing regional load, add production-grade native transport adapters, integrate verified authority feeds, establish governance and retention policy, conduct accessibility research with target communities, and deploy a fault-isolated regional federation.

## How do you prevent the mesh from becoming a spam network?

Every relay packet is bounded by event type, payload size, TTL, stable ID, priority, and per-peer/origin quotas. Devices suppress duplicates, back off under pressure, and validate schema/signature before operational projection. The goal is not unrestricted gossip; it is controlled, auditable forwarding of disaster-relevant events.

## What happens when two reports disagree?

We retain both immutable observations. The responder view shows source, time, freshness, corroboration, and conflict rather than overwriting the earlier report or inventing certainty. A qualified responder can attach a resolution event with a reason, preserving the decision trail.

## Why is your graph needed instead of a table?

The useful coordination question is relational: which need can be served by which available capability, in which area, given current road and capacity observations? P0 implements those explainable links with PostgreSQL 16 and deterministic geohash filters, avoiding a fragile graph dependency. A graph projection and PostGIS are production-evolution options after the core workflow is proven.

## Is the user required to create an account during an emergency?

No. The minimum SOS path avoids account creation. It records a minimal event locally and can use an ephemeral device identity for integrity. Higher-privilege responder actions require authenticated, scoped roles.

## How is this India-first without becoming tokenistic?

It is designed for real constraints: mobile-first interfaces, low bandwidth, low-end devices, intermittent connectivity, plain language, regional accessibility, and underserved rural/coastal/hilly contexts. It does not rely on decorative cultural cues or assume a uniform user base.

## Can an attacker impersonate a rescue vehicle?

We design for signed envelopes, bridge key IDs, verification, revocation, authorization, and audit. The demo can show the contract and invalid-signature rejection; production key governance, device enrollment, and incident operations remain required before deployment.

## What is your operational source of truth?

Immutable, idempotently ingested events are canonical. Responder dashboards, graph relationships, trust states, and matches are rebuildable projections. That makes replay, audit, and policy evolution safer than allowing any screen to overwrite the only record.

## Why did you not implement every production component today?

The judgeable contribution is a reliable vertical slice. We prioritized offline persistence, controlled relay, bridge synchronization, resource matching, and provenance because they prove the product's central value. Native transport, regional federation, full authority integration, and large-scale operations have documented interfaces, risks, and validation paths rather than being presented as finished.

## How will you know whether the project actually creates impact?

We will measure successful SOS delivery through relay hops, time from SOS to responder/bridge receipt, duplicate suppression, resource match/assignment outcome, report corroboration rate, queue age, availability freshness, and usability/accessibility outcomes. Any field measurement must include context, privacy safeguards, and comparison against an agreed baseline.
