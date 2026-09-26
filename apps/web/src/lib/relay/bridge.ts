/**
 * ResQMesh — Bridge Simulator
 *
 * Simulates a rescue-vehicle bridge node:
 * - Acts as a relay peer (receives events via WebSocket relay)
 * - Has HTTP connectivity to the backend API
 * - On receiving a valid event via relay, calls POST /v1/events idempotently
 * - Implements POST /v1/sync/pull + POST /v1/sync/ack loop (cursor-based)
 * - Page size: ≤ SYNC_PAGE_MAX_EVENTS (50) events or SYNC_PAGE_MAX_BYTES (100 KB)
 * - Transitions event state to BRIDGE_ACKED on own receipt
 * - Waits for API 201 to signal SYNCED
 *
 * See: docs/TEAM_TASK_DIVISION.md §Member 3, Phase 2 — Bridge simulator
 * See: docs/16_BUILD_CONTRACT.md §WebSocket frame contract
 * See: docs/05_API_CONTRACT.md §Synchronization protocol
 */

import {
  AckOutcome,
  DeliveryState,
  SYNC_PAGE_MAX_EVENTS,
  SYNC_PAGE_MAX_BYTES,
  type EventEnvelope,
} from "../../../../packages/contracts/types";

import { RelayAdapter, type OnDeliveryStateChange } from "./adapter";
import { relayTelemetry } from "./telemetry";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Represents a bridge-buffered event awaiting HTTP sync */
interface BridgeBufferedEvent {
  envelope: EventEnvelope;
  idempotencyKey: string;
  bridgeReceivedAt: string;
  synced: boolean;
}

/** API receipt returned by POST /v1/events */
interface EventReceipt {
  event_id: string;
  request_id: string;
  status: "created" | "duplicate";
}

/** Response from POST /v1/sync/pull */
interface SyncPullResponse {
  events: EventEnvelope[];
  next_cursor: string;
  has_more: boolean;
  as_of: string;
}

// ─── Bridge Simulator ─────────────────────────────────────────────────────────

/**
 * BridgeSimulator
 *
 * Simulates one bridge node (e.g., a rescue vehicle with intermittent HTTP).
 * Combines a RelayAdapter (mesh side) with HTTP client logic (API side).
 *
 * Two simulated scenarios for local dev/demo:
 *   Phone A  → origin
 *   Phone B  → relay hop
 *   Bridge   → bridge node (this class)
 *
 * Duplicate validation:
 *   Two duplicate relays from same event_id → only one canonical event at API
 *   (POST /v1/events is idempotent: returns 201 for new, 200 for byte-identical replay)
 *
 * See: docs/05_API_CONTRACT.md §Synchronization protocol
 */
export class BridgeSimulator {
  private readonly bridgeId: string;
  private readonly apiBaseUrl: string;
  private readonly relay: RelayAdapter;

  /** Events received via relay but not yet synced to API */
  private readonly buffer = new Map<string, BridgeBufferedEvent>();

  /** Opaque cursor for sync/pull loop */
  private syncCursor: string | null = null;

  /** Whether the sync loop is currently running */
  private syncing = false;

  private readonly onDeliveryStateChange?: OnDeliveryStateChange;

  constructor(opts: {
    bridgeId: string;
    apiBaseUrl: string;
    onDeliveryStateChange?: OnDeliveryStateChange;
  }) {
    this.bridgeId = opts.bridgeId;
    this.apiBaseUrl = opts.apiBaseUrl;
    this.onDeliveryStateChange = opts.onDeliveryStateChange;

    // Create a relay adapter for the bridge node
    this.relay = new RelayAdapter({
      peerId: this.bridgeId,
      onEventReceived: this._onRelayEventReceived.bind(this),
      onDeliveryStateChange: this.onDeliveryStateChange,
    });
  }

  /**
   * Expose the relay adapter so callers can connect peers to this bridge.
   */
  get relayAdapter(): RelayAdapter {
    return this.relay;
  }

  // ─── Relay Event Handler ─────────────────────────────────────────────────

  /**
   * Called when a valid event arrives via the relay layer.
   * Transitions state to BRIDGE_ACKED on receipt, then queues for HTTP sync.
   *
   * See: docs/TEAM_TASK_DIVISION.md §Member 3, Phase 2
   */
  private async _onRelayEventReceived(
    envelope: EventEnvelope,
    hopCount: number
  ): Promise<AckOutcome> {
    const { event_id, location_geohash, priority } = envelope;

    // Check if already buffered (duplicate relay)
    if (this.buffer.has(event_id)) {
      relayTelemetry.emitDuplicateSuppressed(event_id, location_geohash);
      return AckOutcome.DUPLICATE;
    }

    // Buffer the event — we own it now
    const idempotencyKey = `bridge-${this.bridgeId}-${event_id}`;
    this.buffer.set(event_id, {
      envelope,
      idempotencyKey,
      bridgeReceivedAt: new Date().toISOString(),
      synced: false,
    });

    // Transition to BRIDGE_ACKED
    this.onDeliveryStateChange?.(event_id, DeliveryState.BRIDGE_ACKED);

    relayTelemetry.emitRelayReceipt(
      event_id,
      location_geohash,
      priority,
      hopCount
    );

    // Trigger async HTTP sync (non-blocking)
    void this._syncEventToApi(event_id);

    return AckOutcome.ACCEPTED;
  }

  // ─── HTTP Sync: POST /v1/events ──────────────────────────────────────────

  /**
   * Submit a buffered event to POST /v1/events idempotently.
   * Returns 201 for new canonical event, 200 for byte-identical replay.
   * Transitions to SYNCED on success (201 or 200).
   *
   * See: docs/16_BUILD_CONTRACT.md §P0 HTTP endpoints
   * See: docs/05_API_CONTRACT.md §MVP endpoints
   */
  private async _syncEventToApi(eventId: string): Promise<void> {
    const buffered = this.buffer.get(eventId);
    if (!buffered || buffered.synced) return;

    try {
      const response = await fetch(`${this.apiBaseUrl}/v1/events`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": buffered.idempotencyKey,
        },
        body: JSON.stringify(buffered.envelope),
      });

      if (response.status === 201 || response.status === 200) {
        // Canonical receipt confirmed — transition to SYNCED
        buffered.synced = true;
        this.onDeliveryStateChange?.(eventId, DeliveryState.SYNCED);
      } else if (response.status === 409) {
        // EVENT_ID_CONFLICT — different bytes on same ID, mark as REJECTED
        buffered.synced = true; // Don't retry
        this.onDeliveryStateChange?.(eventId, DeliveryState.REJECTED);
        relayTelemetry.emitRejection(
          `EVENT_ID_CONFLICT from API for event_id: ${eventId}`
        );
      } else if (response.status === 410) {
        // TTL expired at API layer
        buffered.synced = true;
        relayTelemetry.emitTtlExpiry(
          eventId,
          buffered.envelope.location_geohash,
          buffered.envelope.created_at,
          buffered.envelope.ttl_seconds
        );
      } else if (response.status === 422) {
        // Signature invalid — reject and do not retry
        buffered.synced = true;
        this.onDeliveryStateChange?.(eventId, DeliveryState.REJECTED);
        relayTelemetry.emitRejection(
          `SIGNATURE_INVALID from API for event_id: ${eventId}`
        );
      }
      // 5xx → will be retried on next sync trigger (retry loop handles it)
    } catch {
      // Network error — will be retried
      relayTelemetry.emitRejection(
        `Network error syncing event_id: ${eventId} to API — will retry`
      );
    }
  }

  // ─── HTTP Sync: POST /v1/sync/pull + POST /v1/sync/ack ──────────────────

  /**
   * Run one iteration of the cursor-based sync/pull + sync/ack loop.
   * Fetches at most SYNC_PAGE_MAX_EVENTS (50) events or SYNC_PAGE_MAX_BYTES (100 KB).
   *
   * See: docs/05_API_CONTRACT.md §Synchronization protocol
   * See: docs/TEAM_TASK_DIVISION.md §Member 3, Phase 2
   */
  async runSyncLoop(incidentId: string, regionBucket: string): Promise<void> {
    if (this.syncing) return;
    this.syncing = true;

    try {
      let hasMore = true;

      while (hasMore) {
        const pullBody = {
          scope: {
            incident_id: incidentId,
            region_bucket: regionBucket,
          },
          cursor: this.syncCursor ?? undefined,
          accepted_schema_versions: [1],
          max_events: SYNC_PAGE_MAX_EVENTS,
        };

        const pullResponse = await fetch(`${this.apiBaseUrl}/v1/sync/pull`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(pullBody),
        });

        if (!pullResponse.ok) {
          relayTelemetry.emitRejection(
            `sync/pull returned ${pullResponse.status}`
          );
          break;
        }

        // Guard byte limit
        const rawText = await pullResponse.text();
        if (new TextEncoder().encode(rawText).length > SYNC_PAGE_MAX_BYTES) {
          relayTelemetry.emitRejection(
            `sync/pull response exceeds SYNC_PAGE_MAX_BYTES (${SYNC_PAGE_MAX_BYTES})`
          );
          break;
        }

        const pullData: SyncPullResponse = JSON.parse(rawText);
        hasMore = pullData.has_more;

        // Process pulled events
        for (const envelope of pullData.events) {
          // Only buffer events not yet received via relay
          if (!this.buffer.has(envelope.event_id)) {
            this.buffer.set(envelope.event_id, {
              envelope,
              idempotencyKey: `sync-${this.bridgeId}-${envelope.event_id}`,
              bridgeReceivedAt: new Date().toISOString(),
              synced: true, // Already on API — mark as synced
            });
          }
        }

        // Send ACK with highest confirmed cursor
        if (pullData.next_cursor) {
          const ackBody = {
            bridge_id: this.bridgeId,
            cursor: pullData.next_cursor,
          };
          await fetch(`${this.apiBaseUrl}/v1/sync/ack`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(ackBody),
          });

          this.syncCursor = pullData.next_cursor;
        }
      }
    } finally {
      this.syncing = false;
    }
  }

  // ─── Retry: re-sync unsent buffer items ─────────────────────────────────

  /**
   * Retry syncing all unsent buffered events.
   * Called after API connectivity is restored.
   */
  async retrySyncAll(): Promise<void> {
    const unsent = Array.from(this.buffer.entries()).filter(
      ([, v]) => !v.synced
    );
    for (const [eventId] of unsent) {
      await this._syncEventToApi(eventId);
    }
  }

  /** Count of events buffered but not yet synced to API */
  get pendingSyncCount(): number {
    let count = 0;
    for (const v of this.buffer.values()) {
      if (!v.synced) count++;
    }
    return count;
  }
}

// ─── Simulated Peers Factory ──────────────────────────────────────────────────

/**
 * Create the three simulated peers for local development and demo.
 *
 * Phone A: origin — creates and signs events
 * Phone B: relay hop — relays events from Phone A to Bridge
 * Bridge:  bridge node — has HTTP access to backend
 *
 * See: docs/TEAM_TASK_DIVISION.md §Member 3, Phase 2 —
 *   "Two simulated peers: Phone A (origin), Phone B (relay hop), Bridge (bridge node)"
 */
export function createSimulatedPeers(opts: {
  apiBaseUrl: string;
  onDeliveryStateChange?: OnDeliveryStateChange;
}): {
  phoneA: RelayAdapter;
  phoneB: RelayAdapter;
  bridge: BridgeSimulator;
} {
  const bridge = new BridgeSimulator({
    bridgeId: "bridge-sim-01",
    apiBaseUrl: opts.apiBaseUrl,
    onDeliveryStateChange: opts.onDeliveryStateChange,
  });

  const phoneA = new RelayAdapter({
    peerId: "phone-a-sim",
    onEventReceived: async (_envelope, _hop) => AckOutcome.ACCEPTED,
    onDeliveryStateChange: opts.onDeliveryStateChange,
  });

  const phoneB = new RelayAdapter({
    peerId: "phone-b-sim",
    onEventReceived: async (_envelope, _hop) => AckOutcome.ACCEPTED,
    onDeliveryStateChange: opts.onDeliveryStateChange,
  });

  return { phoneA, phoneB, bridge };
}
