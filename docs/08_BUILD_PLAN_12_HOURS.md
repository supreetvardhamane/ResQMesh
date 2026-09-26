# Twelve-Hour Build Plan

## Objective

ResQMesh is being built for a 24-hour Build for Billions hackathon at NITK. This team reserves 12 focused hours for implementation, integration, verification, and rehearsal. The outcome is one reliable, judgeable vertical slice: an offline SOS becomes a relayed, trusted, resource-matched responder event. The priority remains one coherent system before extra features.

## Phase 0: Alignment and contract freeze, Hour 0-1

**Goal:** ensure all six contributors can build toward the same event and state model.

- Freeze `16_BUILD_CONTRACT.md`: event/resource enums, storage, limits, frames, fixtures, API, and exact delivery states.
- Freeze `sos.created`, resource, road, corroboration, and assignment fixtures.
- Freeze API errors, mock incident IDs, and ownership map.
- Decide the exact demo journey and defer any feature that does not support it.
- Create a shared task board with owner, dependency, status, and integration checkpoint.

**Exit gate:** one sample SOS parses in client, relay, and backend type/schema layers; all lanes know their first interface and no one is inventing fields independently.

## Phase 1: Foundation in parallel, Hour 1-3

| Lane | Deliverable | Done when |
| --- | --- | --- |
| Client | React PWA shell, SOS form, IndexedDB queue, network/status bar | offline SOS remains after refresh |
| Backend/data | FastAPI skeleton, event validator, idempotency store, synthetic incident | valid event returns a canonical receipt |
| Mesh | WebSocket/LAN peer and bridge simulator | valid fixture traverses one hop |
| Trust/resources | resource fixture schema and deterministic candidate-match rule | match rationale is structured |
| Security/reliability | signature/TTL/dedupe helper interfaces and rejection fixtures | invalid/expired envelope is rejected |
| QA/demo | seed/reset plan, acceptance checklist, primary recording path | fixture resets deterministically |

**Exit gate:** each lane demonstrates its isolated fixture behavior, shared types still match, and the project starts cleanly from a fresh environment.

## Phase 2: Offline-to-bridge vertical path, Hour 3-5

**Goal:** prove the core promise before adding dashboards or visual polish.

1. Create SOS offline in the PWA and persist it.
2. Relay through Phone B using the prototype adapter.
3. Enforce TTL and duplicate suppression.
4. A bridge receives the event and submits it idempotently to the API.
5. The responder read endpoint returns one canonical event with source/time data.

**Exit gate:** the full route works end to end with a displayed distinction between local save, peer relay, bridge receipt, and server sync. This is the first non-negotiable checkpoint.

## Phase 3: Coordination, trust, and data projections, Hour 5-7

**Goal:** make the SOS operationally useful.

- Add hospital/shelter/ambulance/volunteer resource data with availability timestamps.
- Build the need-to-resource candidate match and plain-language rationale.
- Add provenance panel: origin, signature state, relay hops, freshness, corroboration, and conflict.
- Implement Confidence Decay for the blocked-road fixture: simulated time control, visible score/marker dimming, and responder corroboration reset.
- Add blocked-road observation and ensure it affects the explanation without asserting an unsafe route.
- Add assignment proposal/acceptance state; only a responder action creates an assignment.

**Exit gate:** a responder can answer, from the UI, what happened, what resource may help, why it is suggested, and what information remains uncertain. The data model, API, and UI describe the same state.

## Phase 4: Product integration and user experience, Hour 7-9

**Goal:** make the core path usable and credible for judges.

- Complete loading, empty, error, retry, and degraded states.
- Test 360 px mobile, 768 px tablet, desktop, keyboard, focus, contrast, and reduced-motion behavior.
- Ensure maps are optional and locality/geohash text is usable without tiles.
- Add bounded CAP/GeoJSON request/response fixtures and validate failure paths.
- Add explicit labels for prototype transport, synthetic data, and planned capabilities.

**Exit gate:** the critical flow is accessible and understandable without color, animation, a map provider, or a perfect connection. No mocked UI state remains where the core system can provide a real result.

## Phase 5: Resilience, security, and scale evidence, Hour 9-10:30

**Goal:** prove failure behavior and articulate the scale path honestly.

- Re-run offline refresh, duplicate relay, TTL expiry, bad signature, API outage/retry, stale resource, and conflicting-road tests.
- Verify Confidence Decay at the 20-minute simulated-time point and its reset after a responder corroboration.
- Add privacy-minimized logs/metrics for queue age, relay receipt, duplicate suppression, API receipt, and projection lag.
- Validate client request behavior: no uncontrolled polling or full incident-history fetch.
- Prepare the architecture view showing partitioning, asynchronous projections, cache boundaries, and regional federation evolution.

**Exit gate:** every critical failure has a visible safe state or documented limitation, and every scale statement is tied to design or measured evidence.

## Phase 6: Verification and demo preparation, Hour 10:30-11:30

**Goal:** convert implementation into evidence and eliminate integration surprises.

- Run the core integration suite and all priority manual checks from `07_EVALUATION_PLAN.md`.
- Test mobile/keyboard/reduced-motion behavior, restart the app from a clean state, and exercise all documented recovery paths.
- Capture clean screenshots, request/response samples, and logs for the evidence register.
- Update the traceability matrix with actual `IMPLEMENTED`, `VERIFIED`, or `DEFERRED` status. Do not promote pending work to verified.
- Rehearse the product story and judge questions once, then fix the defects that threaten clarity or reliability.

**Exit gate:** all P0 verification evidence is captured, known limits are written down, and the presenter can distinguish implementation from architecture roadmap.

## Phase 7: Demo lock and final integration, Hour 11:30-12

**Goal:** remove uncertainty from the presentation.

- Freeze feature work. Accept only fixes that protect the golden path.
- Run the complete script twice on final devices/configuration.
- Reset fixtures between runs; verify backup recording only as recovery.
- Rehearse judge questions using factual prototype boundaries.
- Capture the evidence register: build/version, test result, screenshots/logs, known limits.

**Exit gate:** two consecutive successful walkthroughs, no unverified claims, a resettable fixture, and explicit owners for any remaining issue.

## Six ownership lanes

1. Architecture/integration: contracts, merge ownership, integration decisions.
2. P2P/networking: relay adapter and bridge semantics.
3. Backend/data: API, events, resources, spatial/graph boundary.
4. AI: optional report-assist stub behind safe fallback only.
5. Reliability/security: signatures, limits, persistence, failure tests.
6. QA/demo: fixtures, accessibility, runbook, evidence capture.

## Scope brakes

If time slips, preserve offline storage, simulated relay, bridge sync, resource match, and provenance. Defer native BLE/Wi-Fi Direct, full map routing, remote AI, Neo4j, and multi-region deployment. Mark deferred items honestly in the UI and demo.

## Task cards

### P0.1 Shared contract freeze

**Owner:** architecture. **Inputs:** `02_MASTER_SPEC`, `05_API_CONTRACT`. **Output:** one event type file, state enums, fixture IDs, and error vocabulary. **Done when:** client, relay, and API can serialize/parse one valid SOS fixture without hand-written duplicate types.

### P0.2 Offline capture

**Owner:** client. **Output:** mobile-first SOS form, local queue, status state, persistence test. **Done when:** a browser refresh while offline preserves the event and shows an accessible saved-local state.

### P0.3 Relay and bridge

**Owner:** mesh. **Output:** simulated peers, TTL, duplicate cache, acknowledgement, bridge sync. **Done when:** two duplicate relays produce one canonical event and an expired event is not forwarded.

### P0.4 Event ingestion and projection

**Owner:** backend/data. **Output:** typed endpoint, idempotency, synthetic incident projection, resource read/query. **Done when:** bridge receipt survives retry and responder query shows a canonical event.

### P0.5 Trust and matching

**Owner:** data/trust. **Output:** evidence panel, resource candidate rule, conflict fixture. **Done when:** a responder can explain why a candidate is shown and see a conflicting observation.

### P0.6 Demo reliability

**Owner:** QA/demo. **Output:** reset script, documented sequence, fallback recording, evidence log. **Done when:** full demo passes twice in a row and failure states are intentionally exercised.

## Integration checkpoints

### Checkpoint 1: contract connection (Hour 3)

Client event fixture travels through the relay interface into the API validator. Verify field names, timestamps, enum values, error form, and explicit local-vs-server status. Do not polish UI before this crosses the boundary.

### Checkpoint 2: vertical slice (Hour 5)

Disable network, create SOS, relay, bridge sync, read responder projection, register/match resource, and display provenance. Record all blockers and remove any feature that breaks the golden path.

### Checkpoint 3: integrated product (Hour 9)

Core P0 functionality must use real integrated behavior: offline save, relay simulation, bridge sync, event projection, resource match, and provenance. At this gate, stop building unrelated additions; send remaining effort toward usability, resilience, and evidence.

### Checkpoint 4: verification complete (Hour 11:30)

Freeze scope. Exercise the five-minute script, reset fixture, test keyboard/mobile behavior, and verify every spoken claim against a visible artifact. Only defect fixes and reliability improvements enter after this point.

## After the 12-hour target

The hackathon still has remaining time, but it is contingency and polish time, not a license to destabilize the core. Use it only for: a blocker discovered during verification, a security/privacy correction, improved accessibility, demo reliability, documentation evidence, or a small feature already supported by the frozen contracts. Any feature requiring a new cross-team contract is deferred unless the integration owner explicitly reopens scope.

## Phase handoff protocol

At the end of each phase, each owner posts: completed task IDs, changed contracts, verification evidence, current blocker, next dependency, and whether the golden path is still executable. The integration owner decides whether to proceed, fix the contract, or defer scope. No phase is considered complete merely because code was written.

## Build hygiene

- Work from typed fixtures, not ad hoc JSON copied between modules.
- Use capability flags for incomplete AI, map, and native transport work.
- Keep mock data visibly synthetic and isolated from production configuration.
- Avoid simultaneous changes to the canonical type file without coordination.
- Document unresolved blocker, owner, impact, and workaround immediately.
