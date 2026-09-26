/**
 * ResQMesh — Relay Layer Constants
 *
 * Re-exports relay-specific constants from the canonical contracts package.
 * Do not redefine these values — use packages/contracts/types.ts as the
 * single source of truth.
 *
 * See: docs/16_BUILD_CONTRACT.md §Fixed enums and limits
 */

export {
  PROTOCOL_VERSION,
  MAX_FRAME_BYTES,
  MAX_ACTIVE_PEERS,
  MAX_HOPS,
  MAX_DEDUPE_IDS,
  MIN_TTL_SECONDS,
  DEFAULT_TTL_SECONDS,
  MAX_TTL_SECONDS,
  FrameType,
  AckOutcome,
  Priority,
  DeliveryState,
} from "../../../../packages/contracts/types";
