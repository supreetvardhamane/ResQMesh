# Master Specification

## Product principle

Disaster-response infrastructure should keep working when connectivity does not. The user experience stays simple while the system carries the complexity: local durability, bounded relay, reconciliation, provenance, and federation.

## Primary journey

1. A citizen selects SOS, need category, priority, and approximate location.
2. The PWA saves a signed event locally and enters `SAVED_LOCAL`, then `QUEUED_FOR_RELAY` when a peer path is available.
3. Nearby relay nodes exchange the event over the prototype transport. Each node forwards only if TTL, priority, and deduplication rules allow it.
4. A rescue vehicle or other bridge node synchronizes events to the emergency service when it has connectivity.
5. The knowledge graph relates the SOS to hospitals, beds, ambulances, shelters, road conditions, and volunteers.
6. A responder reviews the event's evidence and accepts, redirects, or marks it resolved.

## Functional requirements

| ID | Requirement | Acceptance signal |
| --- | --- | --- |
| FR-01 | Create SOS without login or internet. | Event persists after reload. |
| FR-02 | Relay bounded, signed messages. | ID, TTL, priority, signature, and dedupe key are present. |
| FR-03 | Show network state. | Offline, relaying, bridge available, synced, and failed are distinguishable. |
| FR-04 | Manage community resources. | Resource has capability, location, availability, and status. |
| FR-05 | Match needs to resources. | Candidate match includes rationale and status. |
| FR-06 | Preserve trust evidence. | Source, timestamp, freshness, corroboration, conflict state, and visible Confidence Decay are shown. |
| FR-07 | Synchronize safely. | Replayed event is idempotent; conflict is surfaced, not silently overwritten. |
| FR-08 | Interoperate. | CAP alert and GeoJSON payload can cross the API boundary. |

## Non-functional requirements

- **Offline-first**: IndexedDB is the client source of truth until acknowledgement.
- **Accessible**: semantic controls, visible focus, 44 px touch targets, status text beyond color, and reduced-motion support.
- **Low-bandwidth**: compact envelopes, pagination, no continuous polling, cached static map resources, and progressive enhancement.
- **Safe degradation**: SOS capture survives missing maps, AI, or remote APIs.
- **Observable**: relay, sync, duplicate, rejection, assignment, and trust events generate structured telemetry with no plaintext sensitive payloads.

## Scale model

The prototype validates the contracts, not billion-user throughput. Production evolution separates the blast radius:

- Edge cache serves static PWA assets and public advisories.
- Regional ingestion accepts immutable events behind rate limits and idempotency keys.
- Partition keys use disaster region/geohash plus event time; hot regions can scale independently.
- Durable streams fan out to materialized responder views and analytics without coupling writes to reads.
- Local meshes operate without dependence on the control plane; federation syncs summaries and evidence when paths exist.

## Scope gates

P0 is one end-to-end flood scenario: offline SOS, relay, bridge sync, graph-based resource match, trust explanation. Additional maps, AI, native transports, and district federation only proceed after the P0 demo is reliable.

## Domain model

| Entity | Meaning | Key fields | Lifecycle |
| --- | --- | --- | --- |
| Incident | Bounded operational situation. | ID, region, status, severity, time window. | planned -> active -> stabilized -> closed |
| Event | Immutable observation or action. | ID, type, source, time, payload, signature, provenance. | queued -> relayed -> ingested -> projected |
| Need | A request for help. | category, priority, location bucket, affected count, status. | open -> acknowledged -> assigned -> resolved/cancelled |
| Resource | A community/official capability. | type, capability, availability, location, owner scope. | draft -> available -> reserved -> unavailable |
| Assignment | Intent to satisfy a need. | need, resource, rationale, actor, state. | proposed -> accepted -> in-progress -> completed/failed |
| Observation | Road, capacity, or field report. | subject, value, source, time, evidence state. | received -> corroborated/conflicting -> superseded |
| Bridge | Node that synchronizes local mesh events. | key ID, capability, last contact, region. | active -> degraded -> revoked |

## Event vocabulary

The initial vocabulary is deliberately small. New types require a versioned schema and update to the API contract.

| Type | Producer | Required facts | Consumer behavior |
| --- | --- | --- | --- |
| `sos.created` | citizen/bridge | need, priority, locality, creation time | create/open need projection |
| `resource.upserted` | volunteer/operator | capability, availability, location bucket | refresh resource projection |
| `capacity.reported` | hospital/shelter | resource, quantity/status, observed time | update capacity evidence |
| `road.reported` | field source/authority | road/area, condition, observed time | annotate routing projection |
| `report.corroborated` | responder/bridge | target event, source, time | add evidence; no overwrite |
| `assignment.proposed` | responder/matcher | need, resource, rationale | show reviewable suggestion |
| `assignment.updated` | responder | state, reason, time | update assignment projection |
| `need.resolved` | responder/authority | target need, reason, actor | close operational state |

## Roles and permissions

Anonymous citizens may create minimal SOS events but cannot browse precise incident data. Volunteers may register their own assets and update availability within defined scope. Responders can view sensitive operational data and create assignments. District operators manage incident boundaries and partner feeds. Security administrators manage keys and audit access but should not casually access operational content. The backend enforces role and incident/region scope; the client never treats hidden UI as authorization.

## State machines

### Delivery state

```text
DRAFT
  -> SAVED_LOCAL
  -> QUEUED_FOR_RELAY
  -> PEER_ACKED
  -> BRIDGE_ACKED
  -> SYNCED

SAVED_LOCAL / QUEUED_FOR_RELAY / PEER_ACKED -> RETRY_PENDING -> QUEUED_FOR_RELAY
SAVED_LOCAL / QUEUED_FOR_RELAY -> EXPIRED
any validation failure -> REJECTED
```

This is the only P0 delivery-state enum. `PEER_ACKED` is not delivery to responders; `BRIDGE_ACKED` is not server receipt; only `SYNCED` means the API accepted the event. Exact values and transitions are frozen in `16_BUILD_CONTRACT.md`.

### Need state

```text
OPEN -> ACKNOWLEDGED -> ASSIGNED -> IN_PROGRESS -> RESOLVED
OPEN/ACKNOWLEDGED/ASSIGNED -> CANCELLED
ASSIGNED/IN_PROGRESS -> ESCALATED
```

No automated match may set `ASSIGNED`; an accountable responder must accept it.

## User-interface requirements

- SOS action is visible without scrolling on a 360 px viewport and has text, icon, and accessible name.
- Status is written in plain language and never color-only.
- Map is progressive enhancement; locality, relative direction, or geohash remains usable without tiles.
- Critical controls have a confirmation that summarizes intended payload without demanding unnecessary typing.
- Long resource/event lists paginate or virtualize; client does not download an incident's full history by default.
- Every asynchronous action provides loading, success, empty, error, and retry behavior as applicable.

## Quality attributes and measurable acceptance criteria

| Attribute | Requirement | Minimum evidence |
| --- | --- | --- |
| Durability | An accepted local SOS survives refresh. | automated/browser persistence test |
| Correctness | Retry/relay duplicate results in one canonical event. | idempotency and duplicate test |
| Safety | Bad signature/expired TTL does not enter projection. | negative API/relay test |
| Accessibility | Core journey works keyboard-only and at mobile width. | recorded/manual checklist |
| Performance | Client avoids full-feed downloads and uncontrolled polling. | network inspection and code review |
| Observability | Failure path creates privacy-minimized diagnostic signal. | structured log/metric assertion |
| Maintainability | Contract change is versioned and documented. | PR/doc review |

## Configuration policy

Environment configuration may set API origin, feature flags, map tile endpoint, public key set, queue limits, and telemetry endpoint. It must never contain private keys, service credentials, unrestricted database URLs, or raw production fixture data. Provide a typed configuration validator that fails safely at startup.
