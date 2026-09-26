/**
 * ResQMesh — Canonical Contract Types (TypeScript)
 *
 * This is the SINGLE source of truth for all shared enums, limits,
 * and event envelope shape. Do not duplicate these definitions elsewhere.
 * See: docs/16_BUILD_CONTRACT.md
 */

// ─── Fixed Protocol Constants ───────────────────────────────────────────

export const PROTOCOL_VERSION = 1;
export const SCHEMA_VERSION = 1;
export const MAX_EVENT_BYTES = 2048;
export const MAX_FRAME_BYTES = 3072;
export const MAX_ACTIVE_PEERS = 4;
export const MAX_HOPS = 3;
export const MAX_QUEUE_EVENTS = 200;
export const MAX_DEDUPE_IDS = 1024;
export const DEFAULT_TTL_SECONDS = 1800;
export const MIN_TTL_SECONDS = 60;
export const MAX_TTL_SECONDS = 3600;
export const GEOHASH_LENGTH = 6;
export const SYNC_PAGE_MAX_EVENTS = 50;
export const SYNC_PAGE_MAX_BYTES = 102400;
export const RESOURCE_FRESHNESS_MINUTES = 15;
export const OBSERVATION_WINDOW_MINUTES = 30;
export const CONFIDENCE_BASE_PERCENT = 94;
export const CONFIDENCE_DECAY_PER_MINUTE = 0.018;
export const CONFIDENCE_FLOOR_PERCENT = 35;

// ─── Fixed Enums ────────────────────────────────────────────────────────

export enum Priority {
  CRITICAL = "CRITICAL",
  HIGH = "HIGH",
  NORMAL = "NORMAL",
}

export enum NeedCode {
  MEDICAL = "MEDICAL",
  RESCUE = "RESCUE",
  FOOD_WATER = "FOOD_WATER",
  SHELTER = "SHELTER",
}

export enum ResourceCapability {
  AMBULANCE = "AMBULANCE",
  HOSPITAL_BED = "HOSPITAL_BED",
  SHELTER_BED = "SHELTER_BED",
  FOOD_WATER = "FOOD_WATER",
  GENERATOR = "GENERATOR",
}

export enum ResourceStatus {
  AVAILABLE = "AVAILABLE",
  RESERVED = "RESERVED",
  UNAVAILABLE = "UNAVAILABLE",
}

export enum SourceKind {
  CITIZEN = "CITIZEN",
  VOLUNTEER = "VOLUNTEER",
  RESPONDER = "RESPONDER",
  AUTHORITY = "AUTHORITY",
  BRIDGE = "BRIDGE",
}

export enum TrustState {
  UNVERIFIED = "UNVERIFIED",
  CORROBORATED = "CORROBORATED",
  CONFLICTING = "CONFLICTING",
  REJECTED = "REJECTED",
}

export enum DeliveryState {
  DRAFT = "DRAFT",
  SAVED_LOCAL = "SAVED_LOCAL",
  QUEUED_FOR_RELAY = "QUEUED_FOR_RELAY",
  PEER_ACKED = "PEER_ACKED",
  BRIDGE_ACKED = "BRIDGE_ACKED",
  SYNCED = "SYNCED",
  RETRY_PENDING = "RETRY_PENDING",
  EXPIRED = "EXPIRED",
  REJECTED = "REJECTED",
}

// ─── P0 Event Types ─────────────────────────────────────────────────────

export enum EventType {
  SOS_CREATED = "SOS_CREATED",
  RESOURCE_UPSERTED = "RESOURCE_UPSERTED",
  ROAD_REPORTED = "ROAD_REPORTED",
  REPORT_CORROBORATED = "REPORT_CORROBORATED",
  ASSIGNMENT_CREATED = "ASSIGNMENT_CREATED",
  ASSIGNMENT_UPDATED = "ASSIGNMENT_UPDATED",
}

// ─── Event Envelope ─────────────────────────────────────────────────────

export interface EventOrigin {
  kind: SourceKind;
  key_id: string;           // "demo:" + first 16 lowercase hex of SHA-256(raw public key)
  public_key_b64url: string; // 32-byte raw Ed25519 public key, unpadded base64url
}

/**
 * Immutable signed event envelope.
 * Relay metadata is carried in frames and never mutates this body.
 */
export interface EventEnvelope {
  schema_version: typeof SCHEMA_VERSION;
  event_id: string;           // UUID v4
  type: EventType;
  incident_id: string;
  created_at: string;         // UTC ISO-8601
  ttl_seconds: number;
  priority: Priority;
  origin: EventOrigin;
  location_geohash: string;   // exactly 6 lowercase characters
  payload: Record<string, unknown>;
  signature_b64url: string;   // 64-byte Ed25519 signature, unpadded base64url
}

// ─── WebSocket Frame Types ──────────────────────────────────────────────

export enum FrameType {
  HELLO = "HELLO",
  EVENT_OFFER = "EVENT_OFFER",
  EVENT_REQUEST = "EVENT_REQUEST",
  EVENT_PUSH = "EVENT_PUSH",
  EVENT_ACK = "EVENT_ACK",
  PING = "PING",
  PONG = "PONG",
}

export enum AckOutcome {
  ACCEPTED = "ACCEPTED",
  DUPLICATE = "DUPLICATE",
  EXPIRED = "EXPIRED",
  REJECTED = "REJECTED",
}

export interface BaseFrame {
  frame_type: FrameType;
  protocol_version: typeof PROTOCOL_VERSION;
  frame_id: string;           // UUID v4
  sent_at: string;            // UTC ISO-8601
}

export interface HelloFrame extends BaseFrame {
  frame_type: FrameType.HELLO;
  peer_id: string;
  capabilities: string[];     // e.g. ["EVENT_RELAY"]
}

export interface EventOfferFrame extends BaseFrame {
  frame_type: FrameType.EVENT_OFFER;
  event_id: string;
  content_hash_sha256: string;
}

export interface EventRequestFrame extends BaseFrame {
  frame_type: FrameType.EVENT_REQUEST;
  event_id: string;
}

export interface EventPushFrame extends BaseFrame {
  frame_type: FrameType.EVENT_PUSH;
  envelope: EventEnvelope;
  relay: {
    hop_count: number;
    previous_peer_id: string;
  };
}

export interface EventAckFrame extends BaseFrame {
  frame_type: FrameType.EVENT_ACK;
  event_id: string;
  outcome: AckOutcome;
}

export interface PingFrame extends BaseFrame {
  frame_type: FrameType.PING;
  nonce: string;
}

export interface PongFrame extends BaseFrame {
  frame_type: FrameType.PONG;
  nonce: string;
}

export type RelayFrame =
  | HelloFrame
  | EventOfferFrame
  | EventRequestFrame
  | EventPushFrame
  | EventAckFrame
  | PingFrame
  | PongFrame;

// ─── Delivery State Machine Transitions ─────────────────────────────────
//
// DRAFT -> SAVED_LOCAL -> QUEUED_FOR_RELAY -> PEER_ACKED -> BRIDGE_ACKED -> SYNCED
// SAVED_LOCAL | QUEUED_FOR_RELAY | PEER_ACKED -> RETRY_PENDING -> QUEUED_FOR_RELAY
// SAVED_LOCAL | QUEUED_FOR_RELAY -> EXPIRED
// any state -> REJECTED  (only after local/API validation failure)
//

// ─── Capability Mapping (for resource matching) ─────────────────────────

export const CAPABILITY_MAP: Record<NeedCode, ResourceCapability[]> = {
  [NeedCode.MEDICAL]: [ResourceCapability.AMBULANCE, ResourceCapability.HOSPITAL_BED],
  [NeedCode.RESCUE]: [ResourceCapability.AMBULANCE],
  [NeedCode.FOOD_WATER]: [ResourceCapability.FOOD_WATER],
  [NeedCode.SHELTER]: [ResourceCapability.SHELTER_BED],
};

// ─── Frozen Fixture IDs ─────────────────────────────────────────────────

export const DEMO_INCIDENT_ID = "demo-flood-2026";
export const DEMO_GEOHASH = "tdr1q0";

// ─── Confidence Decay Formula ───────────────────────────────────────────
//
// minutes_elapsed = max(0, (demo_or_system_now - last_confirmed_at) / 60s)
// corroboration_multiplier = 1 + 0.05 * max(0, distinct_confirming_key_count - 1)
// decay_multiplier = max(CONFIDENCE_FLOOR_PERCENT / 100, 1 - CONFIDENCE_DECAY_PER_MINUTE * minutes_elapsed)
// confidence_pct = round(min(CONFIDENCE_BASE_PERCENT, CONFIDENCE_BASE_PERCENT * corroboration_multiplier * decay_multiplier))
//

// ─── API Error Codes ────────────────────────────────────────────────────

export enum ApiErrorCode {
  INVALID_SCHEMA = "INVALID_SCHEMA",
  INVALID_GEOJSON = "INVALID_GEOJSON",
  PAYLOAD_TOO_LARGE = "PAYLOAD_TOO_LARGE",
  AUTH_REQUIRED = "AUTH_REQUIRED",
  TOKEN_EXPIRED = "TOKEN_EXPIRED",
  SCOPE_DENIED = "SCOPE_DENIED",
  ROLE_DENIED = "ROLE_DENIED",
  NOT_FOUND = "NOT_FOUND",
  EVENT_ID_CONFLICT = "EVENT_ID_CONFLICT",
  VERSION_CONFLICT = "VERSION_CONFLICT",
  EVENT_TTL_EXPIRED = "EVENT_TTL_EXPIRED",
  CURSOR_EXPIRED = "CURSOR_EXPIRED",
  SIGNATURE_INVALID = "SIGNATURE_INVALID",
  KEY_REVOKED = "KEY_REVOKED",
  RATE_LIMITED = "RATE_LIMITED",
  QUEUE_LIMITED = "QUEUE_LIMITED",
  TEMPORARY_UNAVAILABLE = "TEMPORARY_UNAVAILABLE",
}

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  request_id: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}
