/**
 * ResQMesh — Relay Client (Member 2 / apps/web/src/features/relay/RelayClient.ts)
 *
 * Phase 2: Connects to Member 3's relay adapter using the WebSocket frame contract
 * defined in docs/16_BUILD_CONTRACT.md §WebSocket frame contract.
 *
 * Implements the full relay flow:
 *   EVENT_OFFER → EVENT_REQUEST → EVENT_PUSH → EVENT_ACK
 *
 * Delivery state transitions managed here:
 *   SAVED_LOCAL → QUEUED_FOR_RELAY (on relay connect)
 *   QUEUED_FOR_RELAY → PEER_ACKED  (on ACCEPTED or DUPLICATE ACK)
 *   QUEUED_FOR_RELAY → RETRY_PENDING (on EXPIRED/REJECTED/network error)
 *   RETRY_PENDING → QUEUED_FOR_RELAY (on retry with backoff)
 *   BRIDGE_ACKED: set by bridge relay peer signalling via ACK
 *   SYNCED: set when POST /v1/events returns canonical receipt
 *
 * Per docs/16_BUILD_CONTRACT.md §WebSocket frame contract:
 *   - Every frame carries: frame_type, protocol_version: 1, frame_id (UUID v4), sent_at (UTC ISO-8601)
 *   - Reject frames > MAX_FRAME_BYTES (3072) before parsing envelope
 *   - Max MAX_ACTIVE_PEERS (4) connections
 *   - PEER_ACKED only on ACCEPTED or DUPLICATE ACK
 *
 * Observability:
 *   - logRelayOfferSent, logRelayAckReceived, logDeliveryStateChange
 *   - No plaintext sensitive data in logs
 */

import {
  DeliveryState,
  EventEnvelope,
  FrameType,
  AckOutcome,
  PROTOCOL_VERSION,
  MAX_FRAME_BYTES,
  MAX_ACTIVE_PEERS,
} from "../../../../packages/contracts/types";
import {
  logRelayOfferSent,
  logRelayAckReceived,
  logDeliveryStateChange,
  logRelayTtlExpired,
  logRelayDuplicateSuppressed,
} from "../../lib/crypto/observability";
import {
  getAllEvents,
  updateDeliveryState,
  getEventsByState,
} from "../../lib/storage/queue";

// ─── Types ────────────────────────────────────────────────────────────────────

export type RelayStateChangeCallback = (
  eventId: string,
  newState: DeliveryState
) => void;

// ─── UUID v4 helper ───────────────────────────────────────────────────────────

function generateUUIDv4(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Frame builders ───────────────────────────────────────────────────────────

function makeBaseFrame(frameType: FrameType): Record<string, unknown> {
  return {
    frame_type: frameType,
    protocol_version: PROTOCOL_VERSION,
    frame_id: generateUUIDv4(),
    sent_at: new Date().toISOString(),
  };
}

function makeHelloFrame(peerId: string): string {
  return JSON.stringify({
    ...makeBaseFrame(FrameType.HELLO),
    peer_id: peerId,
    capabilities: ["EVENT_RELAY"],
  });
}

function makeEventOfferFrame(eventId: string, contentHashSha256: string): string {
  return JSON.stringify({
    ...makeBaseFrame(FrameType.EVENT_OFFER),
    event_id: eventId,
    content_hash_sha256: contentHashSha256,
  });
}

function makeEventPushFrame(envelope: EventEnvelope, hopCount: number, previousPeerId: string): string {
  return JSON.stringify({
    ...makeBaseFrame(FrameType.EVENT_PUSH),
    envelope,
    relay: { hop_count: hopCount, previous_peer_id: previousPeerId },
  });
}

function makePongFrame(nonce: string): string {
  return JSON.stringify({
    ...makeBaseFrame(FrameType.PONG),
    nonce,
  });
}

// ─── Content hash (SHA-256 of envelope JSON bytes) ────────────────────────────

async function sha256Hex(envelope: EventEnvelope): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(envelope));
  const hashBuf = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── Retry backoff ────────────────────────────────────────────────────────────

const INITIAL_BACKOFF_MS = 2000;
const MAX_BACKOFF_MS = 30000;
const BACKOFF_MULTIPLIER = 2;

function computeBackoff(attempt: number): number {
  const delay = INITIAL_BACKOFF_MS * Math.pow(BACKOFF_MULTIPLIER, attempt);
  return Math.min(delay, MAX_BACKOFF_MS);
}

// ─── RelayClient ─────────────────────────────────────────────────────────────

/**
 * RelayClient connects to a WebSocket relay peer and sends queued events.
 *
 * Usage:
 *   const client = new RelayClient({ wsUrl: "ws://localhost:9001", onStateChange: ... });
 *   client.start(); // connects and starts sending SAVED_LOCAL events
 *   client.stop();  // graceful disconnect
 *
 * Per build contract:
 * - Maintains max MAX_ACTIVE_PEERS = 4 connections (enforced externally via RelayManager)
 * - PEER_ACKED only on ACCEPTED or DUPLICATE ACK
 * - Retry with backoff on failure
 */
export class RelayClient {
  private ws: WebSocket | null = null;
  private peerId: string;
  private wsUrl: string;
  private onStateChange: RelayStateChangeCallback;
  private stopped = false;
  private retryAttempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  // Tracks which events are pending an ACK
  private pendingOffers: Map<string, EventEnvelope> = new Map();

  constructor(params: {
    wsUrl: string;
    onStateChange: RelayStateChangeCallback;
  }) {
    this.wsUrl = params.wsUrl;
    this.onStateChange = params.onStateChange;
    this.peerId = generateUUIDv4();
  }

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  private connect(): void {
    if (this.stopped) return;

    try {
      this.ws = new WebSocket(this.wsUrl);
    } catch {
      this.scheduleRetry();
      return;
    }

    this.ws.onopen = () => {
      this.retryAttempt = 0;
      // Send HELLO frame
      this.ws!.send(makeHelloFrame(this.peerId));
      // Offer all SAVED_LOCAL and RETRY_PENDING events
      void this.offerAllPendingEvents();
    };

    this.ws.onmessage = (event) => {
      const rawData = event.data as string;

      // Reject oversized frames before parsing (per contract)
      if (rawData.length > MAX_FRAME_BYTES) {
        return; // drop — do not parse
      }

      let frame: Record<string, unknown>;
      try {
        frame = JSON.parse(rawData) as Record<string, unknown>;
      } catch {
        return; // malformed JSON — drop
      }

      void this.handleFrame(frame);
    };

    this.ws.onerror = () => {
      // Error logged via scheduleRetry
    };

    this.ws.onclose = () => {
      if (!this.stopped) {
        this.scheduleRetry();
      }
    };
  }

  private scheduleRetry(): void {
    if (this.stopped) return;
    const delay = computeBackoff(this.retryAttempt);
    this.retryAttempt++;
    this.retryTimer = setTimeout(() => {
      this.connect();
    }, delay);

    // Transition pending events to RETRY_PENDING
    for (const [eventId, envelope] of this.pendingOffers.entries()) {
      void this.transitionState(eventId, DeliveryState.RETRY_PENDING, envelope.priority, envelope.location_geohash);
    }
    this.pendingOffers.clear();
  }

  private async offerAllPendingEvents(): Promise<void> {
    // Offer SAVED_LOCAL events first (they haven't been offered yet)
    const savedLocal = await getEventsByState(DeliveryState.SAVED_LOCAL);
    // Then RETRY_PENDING events (they need re-offering)
    const retryPending = await getEventsByState(DeliveryState.RETRY_PENDING);

    // Prioritize CRITICAL events first (per contract: CRITICAL gets priority)
    const allToOffer = [...savedLocal, ...retryPending].sort((a, b) => {
      const priorityOrder: Record<string, number> = { CRITICAL: 0, HIGH: 1, NORMAL: 2 };
      return (priorityOrder[a.envelope.priority] ?? 2) - (priorityOrder[b.envelope.priority] ?? 2);
    });

    for (const queued of allToOffer) {
      await this.offerEvent(queued.envelope);
    }
  }

  private async offerEvent(envelope: EventEnvelope): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

    // Transition to QUEUED_FOR_RELAY
    await this.transitionState(
      envelope.event_id,
      DeliveryState.QUEUED_FOR_RELAY,
      envelope.priority,
      envelope.location_geohash
    );

    // Compute content hash
    const contentHash = await sha256Hex(envelope);

    // Send EVENT_OFFER
    const offerFrame = makeEventOfferFrame(envelope.event_id, contentHash);
    this.ws.send(offerFrame);

    logRelayOfferSent({
      eventId: envelope.event_id,
      hopCount: 0,
      locationGeohash: envelope.location_geohash,
    });

    // Track pending offer
    this.pendingOffers.set(envelope.event_id, envelope);
  }

  private async handleFrame(frame: Record<string, unknown>): Promise<void> {
    const frameType = frame.frame_type as string;

    switch (frameType) {
      case FrameType.EVENT_REQUEST: {
        // Peer requests the full event — send EVENT_PUSH
        const eventId = frame.event_id as string;
        const envelope = this.pendingOffers.get(eventId);
        if (envelope && this.ws?.readyState === WebSocket.OPEN) {
          const pushFrame = makeEventPushFrame(envelope, 0, this.peerId);
          this.ws.send(pushFrame);
        }
        break;
      }

      case FrameType.EVENT_ACK: {
        const eventId = frame.event_id as string;
        const outcome = frame.outcome as AckOutcome;
        const envelope = this.pendingOffers.get(eventId);

        logRelayAckReceived({ eventId, outcome });

        if (outcome === AckOutcome.ACCEPTED || outcome === AckOutcome.DUPLICATE) {
          // Transition to PEER_ACKED per contract: only on ACCEPTED or DUPLICATE
          if (outcome === AckOutcome.DUPLICATE) {
            logRelayDuplicateSuppressed({ eventId });
          }
          await this.transitionState(
            eventId,
            DeliveryState.PEER_ACKED,
            envelope?.priority,
            envelope?.location_geohash
          );
          this.pendingOffers.delete(eventId);
        } else if (outcome === AckOutcome.EXPIRED) {
          // TTL expired — mark EXPIRED (terminal for relay)
          if (envelope) {
            logRelayTtlExpired({
              eventId,
              createdAt: envelope.created_at,
              ttlSeconds: envelope.ttl_seconds,
            });
          }
          await this.transitionState(
            eventId,
            DeliveryState.EXPIRED,
            envelope?.priority,
            envelope?.location_geohash
          );
          this.pendingOffers.delete(eventId);
        } else if (outcome === AckOutcome.REJECTED) {
          // Rejected by peer — RETRY_PENDING (may be schema/signature issue)
          await this.transitionState(
            eventId,
            DeliveryState.RETRY_PENDING,
            envelope?.priority,
            envelope?.location_geohash
          );
          this.pendingOffers.delete(eventId);
        }
        break;
      }

      case FrameType.PING: {
        // Respond with PONG
        const nonce = frame.nonce as string;
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(makePongFrame(nonce));
        }
        break;
      }

      case FrameType.HELLO:
      case FrameType.PONG:
        // No action needed
        break;

      default:
        // Unknown frame type — ignore (do not crash)
        break;
    }
  }

  private async transitionState(
    eventId: string,
    newState: DeliveryState,
    priority?: string,
    locationGeohash?: string
  ): Promise<void> {
    try {
      await updateDeliveryState(eventId, newState);
      logDeliveryStateChange({
        eventId,
        fromState: DeliveryState.QUEUED_FOR_RELAY, // approximate — actual from state is in DB
        toState: newState,
        priority: priority as Parameters<typeof logDeliveryStateChange>[0]["priority"],
        locationGeohash,
      });
      this.onStateChange(eventId, newState);
    } catch {
      // State update may fail if event was already removed — ignore
    }
  }
}

// ─── RelayManager ─────────────────────────────────────────────────────────────

/**
 * RelayManager enforces MAX_ACTIVE_PEERS = 4 and manages multiple relay connections.
 *
 * Usage:
 *   const manager = new RelayManager({ onStateChange: ... });
 *   manager.addPeer("ws://192.168.1.5:9001"); // up to 4 peers
 *   manager.removePeer("ws://192.168.1.5:9001");
 *   manager.stop();
 */
export class RelayManager {
  private clients: Map<string, RelayClient> = new Map();
  private onStateChange: RelayStateChangeCallback;

  constructor(params: { onStateChange: RelayStateChangeCallback }) {
    this.onStateChange = params.onStateChange;
  }

  /**
   * Add a relay peer. Enforces MAX_ACTIVE_PEERS = 4 limit.
   * Returns false if limit reached.
   */
  addPeer(wsUrl: string): boolean {
    if (this.clients.size >= MAX_ACTIVE_PEERS) {
      return false; // MAX_ACTIVE_PEERS reached
    }
    if (this.clients.has(wsUrl)) {
      return true; // already connected
    }
    const client = new RelayClient({ wsUrl, onStateChange: this.onStateChange });
    this.clients.set(wsUrl, client);
    client.start();
    return true;
  }

  /**
   * Remove and disconnect a relay peer.
   */
  removePeer(wsUrl: string): void {
    const client = this.clients.get(wsUrl);
    if (client) {
      client.stop();
      this.clients.delete(wsUrl);
    }
  }

  /**
   * Stop all relay connections.
   */
  stop(): void {
    for (const client of this.clients.values()) {
      client.stop();
    }
    this.clients.clear();
  }

  /**
   * Current active peer count.
   */
  get peerCount(): number {
    return this.clients.size;
  }

  /**
   * Returns list of connected peer URLs.
   */
  get connectedPeers(): string[] {
    return Array.from(this.clients.keys());
  }
}
