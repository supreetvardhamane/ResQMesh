# ResQMesh — Architecture Diagram for Judges

> **Owner:** Member 1 (Architecture & Integration Lead)
> **Reference:** [03_ARCHITECTURE_DESIGN.md](03_ARCHITECTURE_DESIGN.md) · [16_BUILD_CONTRACT.md](16_BUILD_CONTRACT.md)

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CITIZEN / SURVIVOR                          │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │  React PWA (Offline-First)                                   │  │
│  │  ┌──────────┐  ┌──────────────┐  ┌────────────────────────┐ │  │
│  │  │ SOS Form │  │ IndexedDB    │  │ Ed25519 Key Generation │ │  │
│  │  │ (Mobile- │  │ Queue        │  │ (Web Crypto API)       │ │  │
│  │  │  first)  │  │ ≤200 events  │  │ Private JWK in IDB    │ │  │
│  │  └────┬─────┘  └──────┬───────┘  └────────────────────────┘ │  │
│  │       │               │                                      │  │
│  │       ▼               ▼                                      │  │
│  │  ┌────────────────────────────┐                              │  │
│  │  │ Delivery State Machine     │                              │  │
│  │  │ DRAFT → SAVED_LOCAL →      │                              │  │
│  │  │ QUEUED_FOR_RELAY →         │                              │  │
│  │  │ PEER_ACKED → BRIDGE_ACKED  │                              │  │
│  │  │ → SYNCED                   │                              │  │
│  │  └────────────┬───────────────┘                              │  │
│  └───────────────┼──────────────────────────────────────────────┘  │
└──────────────────┼──────────────────────────────────────────────────┘
                   │
                   ▼  WebSocket / Wi-Fi LAN (Prototype)
┌──────────────────────────────────────────────────────────────────────┐
│                     MESH RELAY LAYER                                 │
│                                                                      │
│  Phone A ◄──── WebSocket ────► Phone B ◄──── WebSocket ────► Bridge │
│  (origin)        ≤4 peers       (relay)        ≤4 peers     (bridge) │
│                  ≤3 hops                       ≤3 hops               │
│                                                                      │
│  Controls: TTL (60–3600s) · Duplicate cache (1024 IDs) ·            │
│            Frame limit (3072 bytes) · Hop count (max 3) ·           │
│            Per-peer token bucket · Priority scheduling              │
└──────────────────────────────┬───────────────────────────────────────┘
                               │
                               ▼  HTTP POST /v1/events (idempotent)
┌──────────────────────────────────────────────────────────────────────┐
│                     REGIONAL API + DATA                              │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │ FastAPI Ingestion │  │ Ed25519 Verify   │  │ Sync Endpoints   │  │
│  │ POST /v1/events   │  │ (Python)         │  │ POST /v1/sync/*  │  │
│  │ Idempotency:      │  │ Canonical JSON   │  │ Cursor-based     │  │
│  │  201 new           │  │ → signature      │  │ ≤50 events       │  │
│  │  200 replay        │  │ → UNVERIFIED     │  │ ≤100KB per page  │  │
│  │  409 conflict      │  │   label          │  │                  │  │
│  └────────┬─────────┘  └──────────────────┘  └──────────────────┘  │
│           │                                                          │
│           ▼                                                          │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    PostgreSQL 16                              │   │
│  │  events(event_id PK, incident_id, region_geohash, ...)      │   │
│  │  resources(resource_id PK, capability, status, ...)          │   │
│  │  assignments(assignment_id PK, need_event_id FK, ...)        │   │
│  │                                                              │   │
│  │  Partition key: incident_id + first 4 geohash chars          │   │
│  │  Indexes: (incident_id, created_at DESC)                     │   │
│  │           (incident_id, region_geohash, type)                │   │
│  └──────────────────────────────────────────────────────────────┘   │
│           │                                                          │
│           ▼  Async Projections                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Trust Classification    │  Resource Matching                │   │
│  │  • Same subject +        │  • Capability map                 │   │
│  │    same region (4-char)  │  • Status == AVAILABLE            │   │
│  │    + within 30 min       │  • available_units > 0            │   │
│  │  • 2 keys, same value    │  • Geohash 4-char match           │   │
│  │    → CORROBORATED        │  • observed_at ≤ 15 min           │   │
│  │  • 2 keys, diff value    │  • Max 3 candidates               │   │
│  │    → CONFLICTING         │  • Factual rationale[]            │   │
│  │  • Else → UNVERIFIED     │                                   │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     RESPONDER CONSOLE                                │
│                                                                      │
│  ┌───────────────┐  ┌───────────────┐  ┌─────────────────────────┐ │
│  │ Event Feed    │  │ Provenance    │  │ Confidence Decay        │ │
│  │ (cursor-      │  │ Panel         │  │ (Map Observations)      │ │
│  │  paginated)   │  │ • Origin      │  │ • 94% when fresh        │ │
│  │               │  │ • Sig state   │  │ • ~60% at 20 min        │ │
│  │               │  │ • Relay hops  │  │ • Resets on corroborate  │ │
│  │               │  │ • Trust state │  │ • Floor: 35%            │ │
│  └───────────────┘  └───────────────┘  └─────────────────────────┘ │
│                                                                      │
│  ┌───────────────┐  ┌───────────────────────────────────────────┐   │
│  │ Resource      │  │ Assignment                                │   │
│  │ Matches       │  │ • Only responder can create               │   │
│  │ • Rationale   │  │ • Fails for unavailable/stale resource    │   │
│  │ • Max 3       │  │                                           │   │
│  └───────────────┘  └───────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Billion-Ready Evolution Path

| Concern | P0 Design (Now) | Production Evolution |
|---------|-----------------|---------------------|
| Write load | Append-only idempotent events | Region-sharded ingestion + durable stream partitions |
| Read load | Separate responder views | CDN, regional read replicas, precomputed materialized views |
| Local outage | IndexedDB + relay | Multi-region control plane + federated regional domains |
| Hot incident | TTL, priority, quotas | Per-incident isolation, adaptive rate limits, backpressure |
| Geo queries | 6-char geohash equality/prefix | PostGIS indexes + bounded regional windows |
| Reconciliation | Versioned event merges | Conflict queues + audited policy-based resolution |

---

## Sixty-Second Scale Proof

1. **Event size capped at 2 KB** — bounded payload, no attachments.
2. **Bounded local fan-out** — max 4 peers, max 3 hops. A node emits at most 4 copies per round; this is not global gossip.
3. **Bridge batching** — only bridge nodes call the API; they batch ≤50 events or ≤100 KB.
4. **Partition key** — `incident_id + first 4 geohash chars`. Events store a 6-char location bucket. Unrelated regions are isolated.
5. **Idempotency** — `event_id` uniqueness means duplicates from relay are collapsed, not multiplied.
6. **Demo evidence** — 50 duplicate Region A copies → 1 canonical event. Region B SOS created concurrently → completes independently. Measured local timing, not a billion-QPS claim.

---

## Failure Containment Summary

| Failure | Contained By | Expected Behavior |
|---------|-------------|-------------------|
| Client loses network | Local queue + relay adapter | SOS remains saved and retryable |
| Malicious/noisy peer | Quotas, signature/schema checks, dedupe cache | Cannot flood operational projection |
| Bridge unavailable | Durable queue + backoff | Event waits without loss or request storm |
| Projection worker fails | Immutable event log + retry | Reads stale; canonical events persist |
| Map provider unavailable | Text/locality fallback | Capture and response continue |
