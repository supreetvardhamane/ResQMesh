# API Contract

## Conventions

- Base path: `/v1`; JSON UTF-8; UTC ISO-8601 timestamps.
- All mutation requests require `Idempotency-Key`.
- Event IDs are UUIDv7 or another time-sortable opaque identifier.
- Cursor pagination is mandatory for incident feeds and resources.
- Errors follow `{ "code", "message", "request_id", "retryable" }`.

## Canonical event envelope

```json
{
  "schema_version": 1,
  "event_id": "uuid-v4",
  "type": "SOS_CREATED",
  "incident_id": "demo-flood-2026",
  "created_at": "2026-09-26T10:30:00Z",
  "priority": "CRITICAL",
  "ttl_seconds": 1800,
  "origin": { "kind": "CITIZEN", "key_id": "demo:16-lowercase-hex", "public_key_b64url": "..." },
  "location_geohash": "tdr1q0",
  "payload": { "need": "MEDICAL" },
  "signature_b64url": "base64url-ed25519"
}
```

`event_id` is immutable. The server accepts a byte-identical canonical retry as the same write and returns the original outcome. Conflicting content using the same ID is rejected with `EVENT_ID_CONFLICT`. `16_BUILD_CONTRACT.md` defines the canonical JSON bytes, signature scope, limits, and relay frames; no other document may define an alternate P0 envelope.

## MVP endpoints

| Method and path | Purpose | Actor |
| --- | --- | --- |
| `POST /v1/events` | Submit a signed SOS, road, capacity, or report event. | bridge/client |
| `POST /v1/sync/pull` | Fetch events after a cursor for a bounded incident/region. | bridge |
| `POST /v1/sync/ack` | Confirm durable bridge receipt. | bridge |
| `GET /v1/incidents/{id}/events` | Read filtered, cursor-paginated incident events. | responder |
| `POST /v1/resources` | Register or update a community resource. | volunteer/operator |
| `GET /v1/resources/matches` | Return explainable candidate matches. | responder |
| `POST /v1/reports/{id}/corroborations` | Add evidence without overwriting the report. | responder/bridge |
| `POST /v1/assignments` | Create a responder-approved resource assignment. | responder |
| `PATCH /v1/assignments/{id}` | Update assignment state. | responder |
| `GET /v1/interop/cap/{id}` | Export a validated CAP alert. | partner |
| `POST /v1/interop/geojson` | Ingest bounded GeoJSON operational features. | partner |

## State model

Client state: `DRAFT -> SAVED_LOCAL -> QUEUED_FOR_RELAY -> PEER_ACKED -> BRIDGE_ACKED -> SYNCED`, with `RETRY_PENDING`, `EXPIRED`, and `REJECTED` recovery/terminal states. The exact P0 enum, frames, limits, and canonical envelope are in `16_BUILD_CONTRACT.md`. UI must state whether a status is local, peer-reported, bridge-confirmed, or server-confirmed.

## Matching response

Each returned match includes `resource_id`, `need_id`, `status`, `distance_or_region`, `availability_updated_at`, and `rationale[]`. Rationale is factual: for example, "ambulance capability matches medical transport; available 4 minutes ago; route includes a blocked-road warning." It must not present an AI score as certainty.

## Confidence Decay observation fields

`ROAD_REPORTED` creates a map observation with `payload.subject_id`, `payload.condition` (`BLOCKED` or `OPEN`), and `payload.observed_at`. `REPORT_CORROBORATED` carries `payload.target_event_id`, `payload.subject_id`, `payload.condition`, and `payload.observed_at`. The responder map derives `last_confirmed_at` from the newest valid matching observation/corroboration. It does not persist a mutable confidence value or treat the percentage as a fact. Exact formula, UI thresholds, and reset behavior are frozen in `16_BUILD_CONTRACT.md`.

## Transport contract

The local relay adapter moves the canonical envelope unchanged. WebSocket is the prototype carrier; BLE and Wi-Fi Direct must implement the same validation, acknowledgement, backpressure, duplicate, and TTL semantics before being called supported.

## Authentication and authorization

Anonymous SOS creation is deliberately narrow: it can submit a minimum schema through a bridge, but it cannot query incident data or obtain precise locations. Authenticated clients use short-lived access tokens with audience, role, incident/region scope, and expiry. Bridge identities use separate credentials/keys and are never interchangeable with responder accounts. The API returns `403` for an authenticated actor outside scope and does not reveal whether a protected resource exists.

## Request validation order

1. Enforce transport security, request-size limit, and rate limit.
2. Parse JSON and validate API/event schema version.
3. Verify caller/bridge authorization for the requested scope.
4. Check `Idempotency-Key`, `event_id`, TTL, and replay/duplicate policy.
5. Validate signature and known/revoked key state when a signed envelope is required.
6. Persist canonical event or command receipt transactionally.
7. Publish projection work asynchronously and return a receipt with request ID.

Validation errors are deterministic and safe to surface. Internal stack traces, private key state, and protected resource existence are never included in client errors.

## Error contract

```json
{
  "code": "EVENT_TTL_EXPIRED",
  "message": "This update is too old to relay. It remains available on this device for review.",
  "request_id": "req_01J...",
  "retryable": false,
  "details": { "event_id": "018f..." }
}
```

| HTTP | Code examples | Client behavior |
| --- | --- | --- |
| 400 | `INVALID_SCHEMA`, `INVALID_GEOJSON`, `PAYLOAD_TOO_LARGE` | explain/correct; do not blind retry |
| 401 | `AUTH_REQUIRED`, `TOKEN_EXPIRED` | refresh/sign in only for non-emergency scoped action |
| 403 | `SCOPE_DENIED`, `ROLE_DENIED` | show access-denied state without data leakage |
| 404 | `NOT_FOUND` | show missing/expired resource; do not retry |
| 409 | `EVENT_ID_CONFLICT`, `VERSION_CONFLICT` | fetch current state and surface conflict |
| 410 | `EVENT_TTL_EXPIRED`, `CURSOR_EXPIRED` | stop relay or perform bounded re-sync |
| 422 | `SIGNATURE_INVALID`, `KEY_REVOKED` | quarantine/repair identity; do not project |
| 429 | `RATE_LIMITED`, `QUEUE_LIMITED` | back off with retry metadata |
| 5xx | `TEMPORARY_UNAVAILABLE` | retain local queue and retry with jitter |

## Event versioning and compatibility

Every envelope includes `schema_version`. New optional fields are backward-compatible only if older readers can ignore them safely. Renaming/removing a field, changing interpretation, or altering a signature canonicalization requires a new major schema version and a migration period. Writers do not emit a new major version until bridge and server validators support it. The server retains a documented support window and returns a machine-readable upgrade error after retirement.

## Synchronization protocol

`POST /v1/sync/pull` accepts a bounded incident/region, schema-version capability list, and opaque cursor. It returns events or compact summaries with `next_cursor`, `has_more`, and server/as-of time. `POST /v1/sync/ack` records the highest durably processed cursor for that bridge, not an unsafe global deletion signal. Clients must tolerate repeated pages, late events, and projection lag. Sync limits page size and byte size to protect constrained networks.

```json
{
  "scope": { "incident_id": "inc_demo", "region_bucket": "tdr1" },
  "cursor": "opaque-cursor",
  "accepted_schema_versions": [1],
  "max_events": 50
}
```

## Resource and assignment commands

Resource updates require an `observed_at` timestamp and actor identity. A stale resource update is retained as evidence but must not silently overwrite a newer availability state. Match endpoints are queries: their results are suggestions. `POST /v1/assignments` requires an accountable responder role and stores the selected resource, rationale, current evidence versions, and actor. A later `assignment.updated` command records completion, failure, reassignment, or cancellation.

## Real-time updates

The responder console may subscribe to scoped server-sent events or WebSocket updates after the REST contract is stable. Real-time is an optimization, not a source of truth: reconnect must resume from a cursor and refetch durable state. The client must avoid one persistent connection per data widget, aggressive polling, or unbounded fan-out to all incident members.

## Contract fixtures

Maintain fixtures for a valid signed SOS, duplicate SOS, expired TTL, tampered signature, low-priority queue limit, resource availability update, conflicting road observation, CAP export, invalid GeoJSON, unauthorized read, and server retry. Fixtures use synthetic locations and people only. CI validates fixtures against Pydantic/schema definitions and client types.
