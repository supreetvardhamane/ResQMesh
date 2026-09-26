# Frozen P0 Build Contract

This is the implementation contract for the 12-hour ResQMesh build. It contains the choices individual agents must not invent. It overrides ambiguity in earlier narrative documents for P0 only. Any change requires an ADR entry and integration-owner approval.

## Agent context rule

An implementation agent reads this file, `08_BUILD_PLAN_12_HOURS.md`, and the files in its assigned folder. It does not read the wider documentation set unless a linked task requires it. Build P0 only. Do not add native BLE/Wi-Fi Direct, Neo4j, PostGIS, live AI, field-level encryption, external authority feeds, authentication UI, attachments, or a map dependency in the emergency path.

## Fixed stack and layout

| Area | P0 choice | Pin before code generation |
| --- | --- | --- |
| Runtime | Node.js and Python | Node `20.18.0`, Python `3.12.7` |
| Web | React PWA, TypeScript, Vite | React `18.3.1`, TypeScript `5.6.3`, Vite `5.4.14` |
| Map | Optional Leaflet view | Leaflet `1.9.4`, React Leaflet `4.2.1` |
| API | FastAPI/Pydantic v2 | FastAPI `0.115.6`, Pydantic `2.10.3`, Uvicorn `0.32.1` |
| Database | PostgreSQL, no extension | PostgreSQL `16`, psycopg `3.2.3` |
| Data tooling | SQLAlchemy/Alembic | SQLAlchemy `2.0.36`, Alembic `1.14.0` |
| Signature | Chromium Web Crypto Ed25519 and Python verifier | cryptography `43.0.3` |
| Relay | WebSocket over a controlled Wi-Fi/LAN simulation | JSON text frames, protocol `1` |

```text
apps/
  web/src/features/{sos,relay,responder,resources}/
  web/src/lib/{contracts,storage,crypto}/
  api/app/{routes,services,db}/
  api/app/{main.py,contracts.py}
packages/fixtures/
infra/compose.yaml
docs/
```

The API owns canonical validation and Postgres writes. The web app owns IndexedDB queue, relay frames, and UI state. `packages/fixtures` is the only shared demo-data source. Do not create a second event schema, API client, or delivery-state enum.

## Fixed enums and limits

```text
PROTOCOL_VERSION = 1
SCHEMA_VERSION = 1
MAX_EVENT_BYTES = 2048
MAX_FRAME_BYTES = 3072
MAX_ACTIVE_PEERS = 4
MAX_HOPS = 3
MAX_QUEUE_EVENTS = 200
MAX_DEDUPE_IDS = 1024
DEFAULT_TTL_SECONDS = 1800
MIN_TTL_SECONDS = 60
MAX_TTL_SECONDS = 3600
GEOHASH_LENGTH = 6
SYNC_PAGE_MAX_EVENTS = 50
SYNC_PAGE_MAX_BYTES = 102400
RESOURCE_FRESHNESS_MINUTES = 15
OBSERVATION_WINDOW_MINUTES = 30
CONFIDENCE_BASE_PERCENT = 94
CONFIDENCE_DECAY_PER_MINUTE = 0.018
CONFIDENCE_FLOOR_PERCENT = 35
```

```text
Priority = CRITICAL | HIGH | NORMAL
NeedCode = MEDICAL | RESCUE | FOOD_WATER | SHELTER
ResourceCapability = AMBULANCE | HOSPITAL_BED | SHELTER_BED | FOOD_WATER | GENERATOR
ResourceStatus = AVAILABLE | RESERVED | UNAVAILABLE
SourceKind = CITIZEN | VOLUNTEER | RESPONDER | AUTHORITY | BRIDGE
TrustState = UNVERIFIED | CORROBORATED | CONFLICTING | REJECTED
DeliveryState = DRAFT | SAVED_LOCAL | QUEUED_FOR_RELAY | PEER_ACKED |
                BRIDGE_ACKED | SYNCED | RETRY_PENDING | EXPIRED | REJECTED
```

P0 accepts a six-character lowercase geohash only. It accepts no exact latitude/longitude, name, phone number, free-text health detail, media, attachment, or arbitrary metadata field. Reject unknown body fields.

## Exact immutable event envelope

The signed envelope is immutable. Relay metadata is carried in a frame and never mutates this body.

```json
{
  "schema_version": 1,
  "event_id": "uuid-v4",
  "type": "SOS_CREATED",
  "incident_id": "demo-flood-2026",
  "created_at": "2026-09-26T10:30:00Z",
  "ttl_seconds": 1800,
  "priority": "CRITICAL",
  "origin": {
    "kind": "CITIZEN",
    "key_id": "demo:16-lowercase-hex",
    "public_key_b64url": "32-byte-raw-ed25519-public-key"
  },
  "location_geohash": "tdr1q0",
  "payload": { "need": "MEDICAL" },
  "signature_b64url": "64-byte-ed25519-signature"
}
```

P0 event types: `SOS_CREATED`, `RESOURCE_UPSERTED`, `ROAD_REPORTED`, `REPORT_CORROBORATED`, `ASSIGNMENT_CREATED`, and `ASSIGNMENT_UPDATED`. Each has an allowlisted body schema in `apps/api/app/contracts.py`.

## Exact Ed25519 signing rule

1. Construct the envelope without `signature_b64url`.
2. Reject floating-point values. Use strings, booleans, integers, arrays, and objects only.
3. Canonicalize recursively: object keys sort by Unicode code point; arrays preserve order; JSON strings use standard JSON escaping; output has no whitespace.
4. Prefix the UTF-8 canonical JSON with exact ASCII bytes `resqmesh/v1\n`.
5. Sign those bytes with Ed25519. Store raw public key and signature as unpadded base64url.
6. Verify using the exact same first four steps. Received time, relay fields, database fields, and UI state are not signed.

On first P0 app run, the client creates an Ed25519 key pair and stores private JWK only in IndexedDB. `key_id` is `demo:` plus the first 16 lowercase hex characters of SHA-256(raw public key). The public key travels in the signed envelope. The API verifies self-consistency but labels a citizen event `UNVERIFIED`; this proves integrity, not identity. Fixtures use a source-controlled test key forbidden from every deployed environment.

## Single delivery-state machine

```text
DRAFT -> SAVED_LOCAL -> QUEUED_FOR_RELAY -> PEER_ACKED -> BRIDGE_ACKED -> SYNCED
SAVED_LOCAL | QUEUED_FOR_RELAY | PEER_ACKED -> RETRY_PENDING -> QUEUED_FOR_RELAY
SAVED_LOCAL | QUEUED_FOR_RELAY -> EXPIRED
any state -> REJECTED only after local/API validation failure
```

`SAVED_LOCAL` means IndexedDB accepted the event. `PEER_ACKED` means a peer accepted the frame. `BRIDGE_ACKED` means a bridge accepted it for HTTP sync. `SYNCED` means `POST /v1/events` returned a canonical receipt.

## WebSocket frame contract

Every frame has `frame_type`, `protocol_version: 1`, `frame_id` (UUID v4), and `sent_at` (UTC ISO-8601). Reject frames larger than `MAX_FRAME_BYTES` before parsing an envelope.

```text
HELLO          { peer_id, capabilities: ["EVENT_RELAY"] }
EVENT_OFFER    { event_id, content_hash_sha256 }
EVENT_REQUEST  { event_id }
EVENT_PUSH     { envelope, relay: { hop_count, previous_peer_id } }
EVENT_ACK      { event_id, outcome: ACCEPTED | DUPLICATE | EXPIRED | REJECTED }
PING           { nonce }
PONG           { nonce }
```

Flow: `HELLO` -> `EVENT_OFFER` -> receiver requests only unknown ID -> `EVENT_PUSH` -> receiver validates size, schema, expiry, signature, and dedupe -> receiver stores before `EVENT_ACK`. Sender reaches `PEER_ACKED` only on `ACCEPTED` or `DUPLICATE`. A relay never forwards when `hop_count >= 3`, even if TTL remains. `hop_count` is local telemetry, never a signed envelope field.

## Storage choice and schema

PostgreSQL 16 is mandatory for P0. Do not substitute SQLite, JSON files, in-memory repositories, PostGIS, or Neo4j. Local development and demo use the same schema through `infra/compose.yaml`.

```text
events(event_id uuid primary key, schema_version smallint, type text,
  incident_id text, region_geohash char(6), created_at timestamptz,
  ttl_seconds integer, priority text, origin_kind text, origin_key_id text,
  envelope jsonb, signature_b64url text, received_at timestamptz)
resources(resource_id uuid primary key, incident_id text, capability text,
  status text, region_geohash char(6), available_units integer,
  observed_at timestamptz, updated_at timestamptz)
assignments(assignment_id uuid primary key, need_event_id uuid references events,
  resource_id uuid references resources, state text, rationale jsonb,
  created_by text, created_at timestamptz, updated_at timestamptz)
```

Indexes: `(incident_id, created_at desc)` and `(incident_id, region_geohash, type)` on events; `(incident_id, capability, status, observed_at desc)` on resources. `event_id` uniqueness provides idempotency.

## Deterministic match, trust, and Confidence Decay rules

No LLM score or hidden numeric trust score appears in P0. Confidence Decay is the sole visible numeric freshness heuristic, with its complete formula and inputs specified below.

**Match:** a resource is eligible when it has the mapped capability, `status == AVAILABLE`, `available_units > 0`, the same first four geohash characters as the need, and `observed_at` is at most 15 minutes old. Capability order: `MEDICAL -> AMBULANCE, HOSPITAL_BED`; `SHELTER -> SHELTER_BED`; `FOOD_WATER -> FOOD_WATER`; `RESCUE -> AMBULANCE`. Sort by exact six-character geohash, capability order, newest observation, then stable resource ID. Return at most three candidates and each satisfied condition as rationale.

**Trust:** reject invalid signature, schema, or expiry. For observations of the same subject in the same first-four-character region inside 30 minutes: `CONFLICTING` when two distinct valid `origin.key_id` values report different values; `CORROBORATED` when two distinct valid keys report the same value; otherwise `UNVERIFIED`. A bridge cannot corroborate a report it merely relayed.

**Confidence Decay:** it applies only to map observations in P0, beginning with `ROAD_REPORTED`. Derive `last_confirmed_at` from the newest valid matching `ROAD_REPORTED` or independent `REPORT_CORROBORATED` event for the same `subject_id` and `condition`. The first report counts as one confirmation. A bridge relay receipt does not reset the clock. A responder's direct `REPORT_CORROBORATED` observation does.

```text
minutes_elapsed = max(0, (demo_or_system_now - last_confirmed_at) / 60 seconds)
corroboration_multiplier = 1 + 0.05 * max(0, distinct_confirming_key_count - 1)
decay_multiplier = max(CONFIDENCE_FLOOR_PERCENT / 100, 1 - CONFIDENCE_DECAY_PER_MINUTE * minutes_elapsed)
confidence_pct = round(min(CONFIDENCE_BASE_PERCENT, CONFIDENCE_BASE_PERCENT * corroboration_multiplier * decay_multiplier))
```

This yields 94% when fresh and 60% after 20 minutes with one confirmation. A valid responder confirmation updates `last_confirmed_at`, returns the value to 94%, and increases the evidence count without allowing a misleading value over 94%. It is a visible freshness heuristic, not a probability that the road is blocked and not an automated routing decision.

**Map UI:** update derived confidence once per second. At `80-94`, use solid red marker and label; at `60-79`, use amber at 0.72 opacity; below `60`, use dim red/gray at 0.45 opacity. Include source time and "last confirmed" text in marker details. On a valid reset, use one 250 ms pulse; honor `prefers-reduced-motion` by updating color/text without pulse. The demo exposes a simulated clock with `0m`, `10m`, and `20m` controls; production uses system time.

## P0 HTTP endpoints and fixtures

```text
POST  /v1/events
GET   /v1/incidents/{incident_id}/events?cursor=&limit=
POST  /v1/resources
GET   /v1/resources/matches?need_event_id=
POST  /v1/assignments
PATCH /v1/assignments/{assignment_id}
POST  /v1/sync/pull
POST  /v1/sync/ack
GET   /healthz
```

`POST /v1/events` returns `201` for a new canonical event, `200` for byte-identical replay, and `409 EVENT_ID_CONFLICT` for changed bytes with an existing ID. `POST /v1/assignments` must fail for unavailable/stale resources. CAP/GeoJSON is a deferred fixture boundary unless all listed endpoints work.

Required fixtures: `sos.valid.json` generated by the test key and verified by web/API tests; `sos.bad-signature.json` mutates a signed field; `incident.demo.json` uses `demo-flood-2026`, one medical SOS, ambulance, hospital bed, and two conflicting road reports. Required checks: canonicalization parity; valid/bad signature; queue reload; idempotency; expiry; relay dedupe; API retry; match ordering; trust classification; assignment validation.

## Sixty-second scale proof

- An event is capped at 2 KB; a node has at most four peers and at most three hops.
- A node emits at most four event copies per forwarding round; this is bounded local fan-out, not global gossip.
- Only bridge nodes call the API and batch at most 50 events or 100 KB.
- Partition key is `incident_id + first four geohash characters`; the event stores a six-character location bucket.
- Demo: send 50 duplicate Region A copies while creating a Region B SOS. Region A yields one canonical event and Region B still completes. Record local timing as observed evidence, never billion-QPS proof.

Any change to a pin, enum, field, signature rule, state, frame, table, endpoint, fixture, or limit updates this document, `05_API_CONTRACT.md`, the ADR log, and the relevant test in one reviewed change.
