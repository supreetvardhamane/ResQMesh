/**
 * ResQMesh — Frame Builder Utilities
 *
 * Constructs typed WebSocket frames per the frozen contract.
 * Every frame carries: frame_type, protocol_version: 1, frame_id (UUID v4), sent_at (UTC ISO-8601).
 *
 * See: docs/16_BUILD_CONTRACT.md §WebSocket frame contract
 */

import {
  PROTOCOL_VERSION,
  FrameType,
  AckOutcome,
  type BaseFrame,
  type HelloFrame,
  type EventOfferFrame,
  type EventRequestFrame,
  type EventPushFrame,
  type EventAckFrame,
  type PingFrame,
  type PongFrame,
  type EventEnvelope,
} from "../../../../packages/contracts/types";

// ─── UUID v4 Generator ───────────────────────────────────────────────────────

/**
 * Generate a UUID v4 using the Web Crypto API.
 */
function generateUUIDv4(): string {
  const buf = new Uint8Array(16);
  crypto.getRandomValues(buf);
  // Set version to 4
  buf[6] = (buf[6] & 0x0f) | 0x40;
  // Set variant to 10xx
  buf[8] = (buf[8] & 0x3f) | 0x80;
  const hex = Array.from(buf)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

/**
 * Build the mandatory base fields for any frame.
 */
function baseFields(frameType: FrameType): BaseFrame {
  return {
    frame_type: frameType,
    protocol_version: PROTOCOL_VERSION,
    frame_id: generateUUIDv4(),
    sent_at: new Date().toISOString(),
  };
}

// ─── Frame Constructors ──────────────────────────────────────────────────────

/**
 * Build a HELLO frame.
 * Sent when establishing a new peer connection.
 * See: docs/16_BUILD_CONTRACT.md §WebSocket frame contract
 */
export function buildHelloFrame(peerId: string): HelloFrame {
  return {
    ...baseFields(FrameType.HELLO),
    frame_type: FrameType.HELLO,
    peer_id: peerId,
    capabilities: ["EVENT_RELAY"],
  };
}

/**
 * Build an EVENT_OFFER frame.
 * Sent to announce a new event to peers before pushing.
 * See: docs/16_BUILD_CONTRACT.md §WebSocket frame contract
 */
export function buildEventOfferFrame(
  eventId: string,
  contentHashSha256: string
): EventOfferFrame {
  return {
    ...baseFields(FrameType.EVENT_OFFER),
    frame_type: FrameType.EVENT_OFFER,
    event_id: eventId,
    content_hash_sha256: contentHashSha256,
  };
}

/**
 * Build an EVENT_REQUEST frame.
 * Sent by a receiver to request a specific event from the offering peer.
 * See: docs/16_BUILD_CONTRACT.md §WebSocket frame contract
 */
export function buildEventRequestFrame(eventId: string): EventRequestFrame {
  return {
    ...baseFields(FrameType.EVENT_REQUEST),
    frame_type: FrameType.EVENT_REQUEST,
    event_id: eventId,
  };
}

/**
 * Build an EVENT_PUSH frame.
 * Carries the full signed envelope + relay metadata (hop_count, previous_peer_id).
 * hop_count is relay metadata, never a signed envelope field.
 * See: docs/16_BUILD_CONTRACT.md §WebSocket frame contract
 */
export function buildEventPushFrame(
  envelope: EventEnvelope,
  hopCount: number,
  previousPeerId: string
): EventPushFrame {
  return {
    ...baseFields(FrameType.EVENT_PUSH),
    frame_type: FrameType.EVENT_PUSH,
    envelope,
    relay: {
      hop_count: hopCount,
      previous_peer_id: previousPeerId,
    },
  };
}

/**
 * Build an EVENT_ACK frame.
 * Sent after validating a received EVENT_PUSH.
 * Outcome: ACCEPTED | DUPLICATE | EXPIRED | REJECTED
 * See: docs/16_BUILD_CONTRACT.md §WebSocket frame contract
 */
export function buildEventAckFrame(
  eventId: string,
  outcome: AckOutcome
): EventAckFrame {
  return {
    ...baseFields(FrameType.EVENT_ACK),
    frame_type: FrameType.EVENT_ACK,
    event_id: eventId,
    outcome,
  };
}

/**
 * Build a PING frame.
 * Used for connection liveness checks.
 */
export function buildPingFrame(nonce: string): PingFrame {
  return {
    ...baseFields(FrameType.PING),
    frame_type: FrameType.PING,
    nonce,
  };
}

/**
 * Build a PONG frame.
 * Response to a PING frame, echoes the same nonce.
 */
export function buildPongFrame(nonce: string): PongFrame {
  return {
    ...baseFields(FrameType.PONG),
    frame_type: FrameType.PONG,
    nonce,
  };
}

// ─── Content Hash ────────────────────────────────────────────────────────────

/**
 * Compute SHA-256 hash of a canonical JSON envelope for EVENT_OFFER.
 * Used for duplicate detection without transferring the full envelope.
 */
export async function computeContentHash(
  envelope: EventEnvelope
): Promise<string> {
  const json = JSON.stringify(envelope);
  const bytes = new TextEncoder().encode(json);
  const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
  const hashBytes = new Uint8Array(hashBuf);
  return Array.from(hashBytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
