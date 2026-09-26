# Problem and Scope

## Problem

Disasters damage more than roads. They interrupt the digital paths on which response coordination depends: power, mobile networks, maps, central dashboards, and trusted information streams. A survivor may have a working phone but no route for an SOS; a hospital may have beds but no visibility; a blocked road can make a static map unsafe; contradictory reports can make responders distrust the situation picture.

The result is an information-and-coordination gap between people who need help, resources that can help, and responders who need an operational picture.

## People served

- Citizens and survivors in rural, hilly, coastal, and low-connectivity areas.
- Community volunteers who can register ambulances, generators, shelters, medicine, and local help.
- Hospitals and shelters publishing capacity and supply status.
- Rescue teams, district disaster authorities, and state authorities coordinating a shared view.

## Product outcome

ResQMesh turns nearby devices, people, and community resources into a resilient coordination network. A person can raise a lightweight SOS without an account or active internet. Nearby nodes relay it using store-and-forward; a rescue vehicle or other bridge node syncs it when connectivity returns; responders see a provenance-aware event and a match to available resources.

## Four core capabilities

1. **Offline SOS Mesh**: unique SOS packets carry an ID, timestamp, priority, TTL, and Ed25519 signature. Nodes deduplicate, preserve critical traffic, and relay bounded messages hop by hop.
2. **Distributed Disaster Knowledge Graph**: local nodes retain relationships among people, needs, resources, roads, and responders. Event-based synchronization merges updates after reconnection; a central server is not required for local usefulness.
3. **Community Resource Mesh**: assets become discoverable through `Need -> Capability -> Location -> Availability -> Assignment`, not merely a static list.
4. **Information Provenance and Trust**: every observation retains source, timestamp, freshness, corroboration, and bridge history. A visible Confidence Decay indicator lowers a stale map report's confidence over time until an independent confirmation refreshes it. Conflicts are weighted rather than blindly accepted.

## In scope for the MVP

- One-tap offline SOS creation and durable local storage.
- Simulated local peer relay and a visible delivery/sync state.
- Resource registration, search, and assignment suggestion.
- A local graph view showing needs, capacity, routes, and blocked-road updates.
- Signed event envelope, duplicate prevention, TTL, priority, and trust explanation.
- Sync to a FastAPI service when a bridge connection becomes available.
- PostgreSQL-backed canonical storage for P0 events, resources, and assignments.
- CAP and GeoJSON import/export boundary for interoperability.

## Explicit non-goals

- Replacing official emergency dispatch or guaranteeing emergency response.
- Claiming BLE or Wi-Fi Direct support in a browser-only prototype; those require a native-roadmap adapter.
- Routing responders onto unverified roads.
- Treating AI output as a life-safety decision.
- Claiming billion-user validation without measured evidence.

## Success measures

- SOS reaches a simulated bridge through relay hops and appears once after deduplication.
- A responder can see the event source, freshness, corroboration, and current trust status.
- A registered resource is matched to a need using capability, location, and availability.
- Core actions remain understandable on a low-end mobile viewport and keyboard-accessible desktop.

## Failure-mode to capability map

| Observed failure | User consequence | ResQMesh response | Important limitation |
| --- | --- | --- | --- |
| Connectivity fails | SOS remains on a phone. | Durable local queue and bounded peer relay. | Delivery cannot be guaranteed when no peer or bridge exists. |
| Visibility fails | Existing beds, shelters, and volunteers are invisible. | Resource registration and local/distributed graph projection. | Availability can become stale and must show its last update. |
| Maps go stale | A suggested route can be unsafe. | Road observations carry source, freshness, and conflict evidence. | ResQMesh is not autonomous navigation. |
| Trust breaks | Responders receive contradictory reports. | Immutable provenance and corroboration workflow. | Evidence supports judgment; it does not prove truth. |

## Personas and jobs to be done

### Survivor with a disconnected phone

When I am trapped or need urgent help and the network is unavailable, I need to record a simple SOS that remains on my device and can move through nearby people, so I am not forced to wait for cellular service to return.

### Volunteer with a useful asset

When I have an ambulance, generator, boat, medicine, or local knowledge, I need to register what is available and update its status quickly, so responders can find a credible community resource instead of coordinating by rumor.

### Responder under time pressure

When reports arrive from many sources, I need to see what is known, what conflicts, how recent it is, and why a resource is suggested, so I can make an accountable decision quickly.

### District operator

When connectivity comes and goes across a region, I need a system that exchanges structured alerts with established systems, isolates regional incidents, and preserves an audit trail, so local disruption does not collapse all coordination.

## Product principles

1. **Capture before connection.** Essential user intent is saved locally before any network operation.
2. **Evidence before certainty.** The product shows what supports a report instead of making invisible truth claims.
3. **Human-readable states.** The UI distinguishes saved locally, peer-acknowledged, bridge-acknowledged, and server-synced states.
4. **Community capacity is operational capacity.** Volunteers and local assets are first-class resources with accountable status.
5. **Graceful degradation.** A missing map, AI service, or backend reduces enrichment, not the ability to make an SOS.
6. **Interoperate at the edge.** External CAP/GeoJSON systems are integrated through validated boundaries.
7. **Measure before claiming.** Impact, accessibility, and scale statements need reproducible evidence.

## Detailed scope boundaries

### P0: demonstrable vertical slice

- A citizen records a medical SOS offline with a need category, priority, and approximate location/locality.
- The PWA verifies local persistence and provides an explicit retry/relay state.
- Two simulated peers and one bridge exercise store-and-forward, TTL, duplicate detection, and sync acknowledgement.
- A responder sees a provenance-aware event and a candidate resource match.
- A blocked-road observation and capacity update demonstrate graph relationships and conflict-aware operational information.

### P1: credible near-term extension

- Incident roles and authorization, CAP/GeoJSON validation, regional dashboards, event replay tooling, and PostGIS-backed spatial queries.
- Field-level encryption for sensitive production data after key governance, retention policy, and deployment review are in place.
- Native mobile transport adapters after a conformance test proves they preserve the relay contract.
- Multi-language content packs and research with target users.

### Production evolution, not MVP promise

- District/regional federation, key governance, multi-region recovery, formal retention policy, official-authority feed onboarding, 24/7 operations, load testing, and legal/privacy review.

## Assumptions to validate

| Assumption | Why it matters | Validation action |
| --- | --- | --- |
| Nearby devices can form a usable short-range relay path. | Determines practical offline delivery. | Field test density, hop delay, and battery impact. |
| Volunteers will maintain resource status. | Matching is only as good as availability. | Drill workflow and stale-status policy. |
| Responders can interpret evidence states quickly. | Trust UI must assist, not slow decisions. | Usability test with representative users. |
| CAP/GeoJSON partners accept the selected mapping. | Interoperability needs real schema agreement. | Validate against sample partner payloads. |
| Approximate location is enough for early triage. | Reduces privacy risk but may affect response. | Test dispatch workflows and escalation path. |

## Out-of-scope decision checklist

Before accepting a new feature, the owner answers: Which failure mode does it address? Which judging criterion does it evidence? Does it preserve offline operation? Which contract changes? What is its failure behavior? Can it be demonstrated reliably in the available time? If those answers are weak, defer it.
