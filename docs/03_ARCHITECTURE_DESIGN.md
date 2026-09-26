# Architecture Design

## System shape

```text
Citizen PWA / Volunteer PWA / Responder Console
              |
      Local event store (IndexedDB)
              |
    Prototype relay adapter (Wi-Fi/LAN WebSocket)
              |
     Bridge node: rescue vehicle / nearby relay
              |
 Regional API and event ingestion when connectivity exists
              |
 Event stream -> trust, graph, match, responder read models
              |
 PostgreSQL 16 + event/resource/assignment projections
```

## Layers

### Client

React PWA, service worker, IndexedDB, Leaflet, and OpenStreetMap data form the lightweight client. The PWA creates and queues SOS events offline. It must never require the map, AI, or an authenticated user before recording the essential SOS.

### Mesh communication

The hackathon transport is WebSocket over Wi-Fi/LAN. The packet contract is transport-neutral so native BLE and Wi-Fi Direct adapters can be introduced later. Store-and-forward behavior is bounded by TTL, priority, packet size, duplicate cache, and per-peer quotas.

### Core services

- **Offline SOS service** validates envelope shape, signature, expiry, and idempotency.
- **Knowledge graph projection** creates local and regional relationships among needs, resources, roads, and responders.
- **Resource discovery and matching** queries capability, proximity, availability, and verified constraints.
- **Trust engine** calculates explainable evidence from source, freshness, corroboration, and conflict rather than treating reports as facts. For map observations, the client derives a visible Confidence Decay value from the latest confirmation time; event history remains the source of truth.

### Data and external systems

FastAPI with Pydantic exposes typed APIs. PostgreSQL 16 is the P0 canonical store for events, resources, assignments, and derived trust state. P0 uses six-character geohash equality/prefix matching; it does not require PostGIS, Neo4j, pgRouting, object storage, or a graph database. Those are production-evolution options only after the P0 path works. External systems are bridges, not single points of failure: emergency servers, maps, satellite/cellular connectivity, government systems, and CAP feeds.

## Event path and safety controls

1. Client creates `event_id`, signed payload, priority, TTL, and timestamp.
2. Relay node verifies basic envelope constraints before caching and forwarding.
3. Nodes use `event_id` plus content hash to suppress duplicates.
4. A bridge records receipt and submits idempotently to regional ingestion.
5. Ingestion appends immutable evidence, then asynchronously builds graph, trust, and responder projections.
6. A decision remains reviewable because every projection links back to source events.

## Billion-ready evolution

| Concern | Design now | Production evolution |
| --- | --- | --- |
| Write load | Append-only idempotent events | Region-sharded ingestion and durable stream partitions |
| Read load | Separate responder views | CDN, regional read replicas, precomputed materialized views |
| Local outage | IndexedDB and relay | Multi-region control plane and federated regional domains |
| Hot incident | TTL, priority, quotas | Per-incident isolation, adaptive rate limits, backpressure |
| Geo queries | Six-character geohash equality/prefix filters | PostGIS indexes and bounded regional windows |
| Reconciliation | Versioned event merges | Conflict queues and audited policy-based resolution |

## Reliability targets

For the demo: locally saved SOS must survive refresh, duplicate relay must create one event, and a failed sync must retry without losing the message. For production: define SLOs only after load and failure tests establish a baseline; do not advertise numeric availability or throughput before measurement.

## Component responsibilities and boundaries

| Component | Owns | Does not own | Interface |
| --- | --- | --- | --- |
| PWA application | interaction, local queue, device state, cached read data | dispatch truth, authorization decisions | typed HTTP client and relay adapter |
| Relay adapter | peer sessions, bounded send/receive, acknowledgement | business interpretation, global ordering | canonical envelope interface |
| Bridge service | durable handoff and sync cursor | user-facing incident decisions | sync API and receipt events |
| Ingestion service | validation, idempotency, immutable event append | expensive match/trust reads inline | event stream/write store |
| Projection workers | current needs, resources, graph, trust, matches | canonical event mutation | event stream and read models |
| Responder API | scoped queries and accountable commands | peer transport details | REST/query contract |
| Interop gateway | CAP/GeoJSON validation/mapping | internal schema ownership by partners | import/export contract |

## Data flow and consistency

The architecture uses an event-log-first consistency model. The canonical append is durable before a responder read model changes. Read models may lag; every view should display its as-of time where stale data could alter a decision. A command that needs immediate feedback returns a receipt for the canonical append, not a claim that every projection is already current.

For a local mesh, each device has a partial history. Reconciliation exchanges cursor or summary information, requests missing event IDs, validates them, and applies them idempotently. Conflict is domain data: two road observations can coexist, and a projection renders the conflict rather than choosing a winner invisibly.

## Partitioning and storage strategy

- `incident_id` is the primary operational boundary.
- A coarse geographic bucket/geohash and event-time partition distribute high-volume writes.
- Event IDs are time-sortable only for efficient queries; their order is not proof of causal ordering across devices.
- Sensitive payload fields are separated from general envelope/index fields so responders receive only what their scope permits.
- Projections are rebuildable from immutable events, allowing schema upgrades and trust-policy changes to be replayed with an audit trail.
- Object/media attachments are deferred from the emergency envelope; if introduced, store references and signed metadata rather than large binaries in relay packets.

## Security architecture

For P0, each device generates an ephemeral signing identity and includes its public key in the signed envelope; the API verifies integrity but does not treat a citizen key as verified identity. Bridge/API verification occurs before canonical ingestion. A production key registry/cache with expiry and revocation is explicitly deferred. Transport encryption protects API/bridge links; signatures protect event integrity across hops. Authorization is evaluated server-side for commands and sensitive reads. Audit records track administrative/key operations separately from public operational events.

## Backpressure and abuse controls

Critical traffic needs protection from both accident and abuse. Enforce maximum payload size, event-type allowlist, TTL cap, per-origin and per-peer token buckets, queue quotas, duplicate-cache limits, and priority scheduling. Backpressure response must remain visible: lower-priority messages may be delayed or declined, but a critical SOS needs an explicit local outcome and alternate handoff guidance.

## Deployment progression

### Local development

Single API process, local PostgreSQL 16 through `infra/compose.yaml`, two simulated peers, one bridge simulator, deterministic fixture incident. This is the fastest integration environment and matches the P0 persistence contract.

### Demo environment

Static PWA hosting, controlled WebSocket/LAN relay, HTTPS FastAPI endpoint, managed database or deterministic seed, read-only responder fixture reset. Record version and configuration used in the demo.

### Production candidate

Regional deployments behind WAF/API gateway, CDN for static assets, managed Postgres/PostGIS with backups, durable event stream, horizontally scalable workers, secret manager, key registry, observability pipeline, rate limits, incident response, and tested cross-region recovery. These are architectural requirements, not work completed by the prototype.

## Failure containment

| Failure | Contained by | Expected behavior |
| --- | --- | --- |
| Client loses network | local queue and relay adapter | SOS remains saved and retryable |
| One peer is malicious/noisy | quotas, signature/schema checks, duplicate cache | peer cannot flood operational projection |
| Bridge unavailable | durable bridge/client queue and backoff | event waits without loss or request storm |
| Projection worker fails | immutable event log and retry | reads may be stale; canonical events persist |
| Map provider unavailable | text/locality fallback | capture and response work continue |
| AI provider unavailable | rule/manual path | no emergency operation is blocked |
| One region is overloaded | region/incident partitioning | unrelated regions retain isolation |

## Architecture review checklist

- Does the change preserve offline creation before remote calls?
- Can the same event be retried, relayed, or replayed safely?
- Is an event's source and evidence traceable after every transform?
- Does a new dependency sit behind a fallback for the emergency path?
- Is sensitive data limited to the component that needs it?
- Can the component scale/read independently from event ingestion?
- Does a production claim have a measurement plan, not just a diagram?
