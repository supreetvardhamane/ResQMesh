/**
 * ResQMesh — Client-Side Structured Observability (TypeScript)
 *
 * Privacy-minimized structured telemetry for the web client.
 * Per: docs/TEAM_TASK_DIVISION.md §Member 5 Phase 4
 * Per: docs/12_RELIABILITY_AND_RUNBOOKS.md §Observability requirements
 * Per: docs/04_DATA_AND_PRIVACY.md §Privacy controls
 *
 * Rules enforced:
 * - No plaintext sensitive data (exact location, phone, name) in any log
 * - location_geohash is NEVER logged — only first-4-char region_bucket
 * - Internal errors logged client-side only; stack traces never sent to API
 * - Captures: queue_age, relay_receipt, duplicate_suppression, delivery state transitions
 */

import { DeliveryState, Priority } from "../../../../packages/contracts/types";

// ─── Software version ─────────────────────────────────────────────────────────
const SOFTWARE_VERSION = "0.1.0";

// ─── Log event types ─────────────────────────────────────────────────────────

export type LogEventType =
  | "QUEUE_ACCEPT"
  | "QUEUE_REJECT"
  | "QUEUE_FULL"
  | "RELAY_OFFER_SENT"
  | "RELAY_ACK_RECEIVED"
  | "RELAY_DUPLICATE_SUPPRESSED"
  | "RELAY_TTL_EXPIRED"
  | "DELIVERY_STATE_CHANGE"
  | "SIGNATURE_CREATED"
  | "SIGNATURE_VERIFY_FAIL"
  | "RATE_LIMITED_CLIENT"
  | "QUEUE_LIMITED_CLIENT";

// ─── Base log record ──────────────────────────────────────────────────────────

interface BaseLogRecord {
  event: LogEventType;
  timestamp_ms: number;
  software_version: string;
  schema_version: number;
  region_bucket?: string; // first 4 chars of geohash ONLY — never full 6-char
}

// ─── Privacy helper: region bucket ───────────────────────────────────────────

/**
 * Extract first-4-char region bucket for observability.
 * NEVER log the full 6-char geohash — too precise (privacy rule).
 * Per: 04_DATA_AND_PRIVACY.md §Approximate locality/geohash
 */
function toRegionBucket(geohash?: string): string | undefined {
  if (!geohash) return undefined;
  return geohash.slice(0, 4);
}

// ─── Log emitter ─────────────────────────────────────────────────────────────

function emit(record: BaseLogRecord & Record<string, unknown>): void {
  // In production, send to a structured log endpoint.
  // For P0 demo: emit to console as structured JSON (machine-readable).
  // Never include PII, exact location, or stack traces.
  console.log(JSON.stringify(record));
}

// ─── Queue observability ──────────────────────────────────────────────────────

/**
 * Log successful local queue accept (SAVED_LOCAL state).
 */
export function logQueueAccept(params: {
  eventId: string;
  eventType: string;
  priority: Priority;
  queueAgeMs: number;
  locationGeohash?: string;
}): void {
  emit({
    event: "QUEUE_ACCEPT",
    timestamp_ms: Date.now(),
    software_version: SOFTWARE_VERSION,
    schema_version: 1,
    region_bucket: toRegionBucket(params.locationGeohash),
    event_id: params.eventId,
    event_type: params.eventType,
    priority: params.priority,
    queue_age_ms: params.queueAgeMs,
    // NOT: exact geohash, name, phone, or any PII
  });
}

/**
 * Log queue rejection (schema error, capacity, etc.)
 */
export function logQueueReject(params: {
  errorCode: string;
  reason: string;
  priority?: Priority;
}): void {
  emit({
    event: "QUEUE_REJECT",
    timestamp_ms: Date.now(),
    software_version: SOFTWARE_VERSION,
    schema_version: 1,
    error_code: params.errorCode,
    reason: params.reason,
    priority: params.priority,
  });
}

/**
 * Log queue full (MAX_QUEUE_EVENTS = 200 reached).
 */
export function logQueueFull(params: { queueSize: number; priority?: Priority }): void {
  emit({
    event: "QUEUE_FULL",
    timestamp_ms: Date.now(),
    software_version: SOFTWARE_VERSION,
    schema_version: 1,
    queue_size: params.queueSize,
    priority: params.priority,
  });
}

// ─── Relay observability ──────────────────────────────────────────────────────

/**
 * Log relay EVENT_OFFER sent to a peer.
 */
export function logRelayOfferSent(params: {
  eventId: string;
  hopCount: number;
  locationGeohash?: string;
}): void {
  emit({
    event: "RELAY_OFFER_SENT",
    timestamp_ms: Date.now(),
    software_version: SOFTWARE_VERSION,
    schema_version: 1,
    region_bucket: toRegionBucket(params.locationGeohash),
    event_id: params.eventId,
    hop_count: params.hopCount,
  });
}

/**
 * Log ACK received from peer relay.
 */
export function logRelayAckReceived(params: {
  eventId: string;
  outcome: "ACCEPTED" | "DUPLICATE" | "EXPIRED" | "REJECTED";
}): void {
  emit({
    event: "RELAY_ACK_RECEIVED",
    timestamp_ms: Date.now(),
    software_version: SOFTWARE_VERSION,
    schema_version: 1,
    event_id: params.eventId,
    outcome: params.outcome,
  });
}

/**
 * Log duplicate suppression at relay layer.
 */
export function logRelayDuplicateSuppressed(params: { eventId: string }): void {
  emit({
    event: "RELAY_DUPLICATE_SUPPRESSED",
    timestamp_ms: Date.now(),
    software_version: SOFTWARE_VERSION,
    schema_version: 1,
    event_id: params.eventId,
  });
}

/**
 * Log TTL expiry detected at relay layer (event not forwarded).
 */
export function logRelayTtlExpired(params: {
  eventId: string;
  createdAt: string;
  ttlSeconds: number;
}): void {
  emit({
    event: "RELAY_TTL_EXPIRED",
    timestamp_ms: Date.now(),
    software_version: SOFTWARE_VERSION,
    schema_version: 1,
    event_id: params.eventId,
    created_at: params.createdAt,
    ttl_seconds: params.ttlSeconds,
  });
}

// ─── Delivery state observability ─────────────────────────────────────────────

/**
 * Log delivery state transition for an event.
 * Per: 16_BUILD_CONTRACT.md §Single delivery-state machine
 */
export function logDeliveryStateChange(params: {
  eventId: string;
  fromState: DeliveryState;
  toState: DeliveryState;
  priority?: Priority;
  locationGeohash?: string;
}): void {
  emit({
    event: "DELIVERY_STATE_CHANGE",
    timestamp_ms: Date.now(),
    software_version: SOFTWARE_VERSION,
    schema_version: 1,
    region_bucket: toRegionBucket(params.locationGeohash),
    event_id: params.eventId,
    from_state: params.fromState,
    to_state: params.toState,
    priority: params.priority,
  });
}

// ─── Signature observability ──────────────────────────────────────────────────

/**
 * Log successful signature creation (no key material in log).
 */
export function logSignatureCreated(params: {
  eventId: string;
  keyIdHint: string; // First 8 chars of key_id only
}): void {
  emit({
    event: "SIGNATURE_CREATED",
    timestamp_ms: Date.now(),
    software_version: SOFTWARE_VERSION,
    schema_version: 1,
    event_id: params.eventId,
    // Short hint only — never full key_id, never private key material
    key_id_hint: params.keyIdHint.slice(0, 8),
  });
}

/**
 * Log signature verification failure (client-side pre-check).
 * NEVER include raw envelope content or key material.
 */
export function logSignatureVerifyFail(params: {
  eventId?: string;
  reason: string;
}): void {
  emit({
    event: "SIGNATURE_VERIFY_FAIL",
    timestamp_ms: Date.now(),
    software_version: SOFTWARE_VERSION,
    schema_version: 1,
    event_id: params.eventId,
    reason: params.reason,
    // Never: raw payload, stack trace, private key
  });
}
