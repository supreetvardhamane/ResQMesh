/**
 * ResQMesh — Relay Layer Public API
 *
 * Single entry point for the relay library.
 * Re-exports all public types and classes.
 *
 * See: docs/TEAM_TASK_DIVISION.md §Member 3 — Mesh / P2P Networking
 * See: docs/16_BUILD_CONTRACT.md §WebSocket frame contract
 */

// Relay adapter (core peer session management + frame handling)
export { RelayAdapter } from "./adapter";
export type { OnDeliveryStateChange, OnEventReceived } from "./adapter";

// Frame builders
export {
  buildHelloFrame,
  buildEventOfferFrame,
  buildEventRequestFrame,
  buildEventPushFrame,
  buildEventAckFrame,
  buildPingFrame,
  buildPongFrame,
  computeContentHash,
} from "./frames";

// Duplicate suppression cache
export { DedupeCache } from "./dedupe";

// Token-bucket quota manager
export { QuotaManager } from "./quota";
export type { TokenBucketConfig } from "./quota";

// Bridge simulator
export { BridgeSimulator, createSimulatedPeers } from "./bridge";

// Structured telemetry
export { RelayTelemetry, relayTelemetry } from "./telemetry";
export type { RelayTelemetryEvent } from "./telemetry";
