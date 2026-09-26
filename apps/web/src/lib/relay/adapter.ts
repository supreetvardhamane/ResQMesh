/**
 * ResQMesh — WebSocket Relay Adapter
 *
 * Core relay node implementation.
 * Manages peer connections, frame validation, duplicate suppression,
 * TTL enforcement, hop-count enforcement, priority scheduling, and backpressure.
 *
 * See: docs/16_BUILD_CONTRACT.md §WebSocket frame contract
 * See: docs/03_ARCHITECTURE_DESIGN.md §Mesh communication
 * See: docs/05_API_CONTRACT.md §Transport contract
 * See: docs/TEAM_TASK_DIVISION.md §Member 3, Phase 1 & Phase 2 & Phase 3
 */

import {
  PROTOCOL_VERSION,
  MAX_FRAME_BYTES,
  MAX_ACTIVE_PEERS,
  MAX_HOPS,
  MIN_TTL_SECONDS,
  FrameType,
  AckOutcome,
  Priority,
  DeliveryState,
  type RelayFrame,
  type EventEnvelope,
  type EventPushFrame,
  type HelloFrame,
  type EventOfferFrame,
  type EventRequestFrame,
  type EventAckFrame,
  type PingFrame,
} from "@contracts";

import { DedupeCache } from "./dedupe";
import { QuotaManager } from "./quota";
import { relayTelemetry } from "./telemetry";
import {
  buildHelloFrame,
  buildEventOfferFrame,
  buildEventRequestFrame,
  buildEventPushFrame,
  buildEventAckFrame,
  buildPongFrame,
  computeContentHash,
} from "./frames";

// ─── Peer State ───────────────────────────────────────────────────────────────

interface PeerSession {
  peerId: string;
  ws: WebSocket;
  /** Whether the HELLO handshake has been completed */
  ready: boolean;
  /** event_ids offered by this peer (awaiting our request) */
  pendingOffers: Map<string, string>; // event_id → content_hash_sha256
}

// ─── Priority Queue ───────────────────────────────────────────────────────────

interface QueuedForward {
  envelope: EventEnvelope;
  hopCount: number;
  sourcePeerId: string;
}

/**
 * Simple priority queue: CRITICAL events are prepended, others appended.
 * See: docs/TEAM_TASK_DIVISION.md §Member 3, Phase 3 — priority scheduling
 */
class PriorityForwardQueue {
  private readonly queue: QueuedForward[] = [];

  enqueue(item: QueuedForward): void {
    if (item.envelope.priority === Priority.CRITICAL) {
      this.queue.unshift(item); // CRITICAL goes to front
    } else {
      this.queue.push(item);
    }
  }

  dequeue(): QueuedForward | undefined {
    return this.queue.shift();
  }

  get length(): number {
    return this.queue.length;
  }
}

// ─── Relay Adapter ────────────────────────────────────────────────────────────

export type OnDeliveryStateChange = (
  eventId: string,
  state: DeliveryState
) => void;

export type OnEventReceived = (
  envelope: EventEnvelope,
  hopCount: number
) => Promise<AckOutcome>;

/**
 * WebSocket Relay Adapter.
 *
 * Responsibilities:
 * - Maintain up to MAX_ACTIVE_PEERS = 4 peer connections
 * - Implement all 7 frame types
 * - Enforce MAX_FRAME_BYTES = 3072 BEFORE parsing an envelope
 * - Suppress duplicates via DedupeCache (MAX_DEDUPE_IDS = 1024)
 * - Enforce TTL (MIN_TTL_SECONDS = 60, DEFAULT = 1800, MAX = 3600)
 * - Enforce hop limit: never forward when hop_count >= MAX_HOPS (3)
 * - Priority scheduling: CRITICAL events forwarded first
 * - Per-peer and per-origin token-bucket backpressure
 * - Emit structured telemetry (no sensitive data)
 *
 * See: docs/16_BUILD_CONTRACT.md §WebSocket frame contract
 */
export class RelayAdapter {
  private readonly peerId: string;
  private readonly peers = new Map<string, PeerSession>();
  private readonly dedupe = new DedupeCache();
  private readonly quota = new QuotaManager();
  private readonly forwardQueue = new PriorityForwardQueue();
  private forwardProcessing = false;

  /**
   * Called when a fully validated new event arrives (for local storage and further action).
   * Should return ACCEPTED, DUPLICATE, EXPIRED, or REJECTED.
   */
  private readonly onEventReceived: OnEventReceived;
  private readonly onDeliveryStateChange?: OnDeliveryStateChange;

  constructor(opts: {
    peerId: string;
    onEventReceived: OnEventReceived;
    onDeliveryStateChange?: OnDeliveryStateChange;
  }) {
    this.peerId = opts.peerId;
    this.onEventReceived = opts.onEventReceived;
    this.onDeliveryStateChange = opts.onDeliveryStateChange;
  }

  // ─── Peer Management ────────────────────────────────────────────────────

  /**
   * Connect to a peer via WebSocket URL.
   * Enforces MAX_ACTIVE_PEERS = 4.
   */
  connect(url: string): void {
    if (this.peers.size >= MAX_ACTIVE_PEERS) {
      relayTelemetry.emitRejection(
        `MAX_ACTIVE_PEERS (${MAX_ACTIVE_PEERS}) reached — rejecting connection to ${url}`
      );
      return;
    }

    const ws = new WebSocket(url);
    const session: PeerSession = {
      peerId: "", // will be set on HELLO
      ws,
      ready: false,
      pendingOffers: new Map(),
    };

    ws.onopen = () => {
      // Send our HELLO immediately
      this._send(ws, buildHelloFrame(this.peerId));
    };

    ws.onmessage = (evt) => {
      this._handleRawMessage(evt.data as string, session);
    };

    ws.onclose = () => {
      if (session.peerId) {
        this.peers.delete(session.peerId);
        this.quota.removePeer(session.peerId);
        relayTelemetry.emitPeerDisconnected(session.peerId);
      }
    };

    ws.onerror = () => {
      relayTelemetry.emitRejection(
        `WebSocket error for peer connection to ${url}`
      );
    };
  }

  /**
   * Accept an incoming WebSocket connection (called by the server-side listener).
   * Enforces MAX_ACTIVE_PEERS = 4.
   */
  acceptConnection(ws: WebSocket): void {
    if (this.peers.size >= MAX_ACTIVE_PEERS) {
      relayTelemetry.emitRejection(
        `MAX_ACTIVE_PEERS (${MAX_ACTIVE_PEERS}) reached — rejecting incoming connection`
      );
      ws.close(1008, "MAX_ACTIVE_PEERS reached");
      return;
    }

    const session: PeerSession = {
      peerId: "",
      ws,
      ready: false,
      pendingOffers: new Map(),
    };

    ws.onmessage = (evt) => {
      this._handleRawMessage(evt.data as string, session);
    };

    ws.onclose = () => {
      if (session.peerId) {
        this.peers.delete(session.peerId);
        this.quota.removePeer(session.peerId);
        relayTelemetry.emitPeerDisconnected(session.peerId);
      }
    };

    // Send our HELLO
    this._send(ws, buildHelloFrame(this.peerId));
  }

  // ─── Outbound: Offer an event to all connected peers ────────────────────

  /**
   * Offer a locally-originated event to all ready peers.
   * Flow: EVENT_OFFER → (peer requests) → EVENT_PUSH
   *
   * See: docs/16_BUILD_CONTRACT.md §WebSocket frame contract
   */
  async offerEvent(envelope: EventEnvelope): Promise<void> {
    const contentHash = await computeContentHash(envelope);

    // Mark as seen locally so we don't re-accept our own event
    this.dedupe.add(envelope.event_id);

    for (const session of this.peers.values()) {
      if (!session.ready) continue;
      this._send(
        session.ws,
        buildEventOfferFrame(envelope.event_id, contentHash)
      );
    }
  }

  // ─── Inbound: Raw message handling ──────────────────────────────────────

  /**
   * Handle a raw incoming WebSocket message.
   * Step 1: Reject frames larger than MAX_FRAME_BYTES = 3072 BEFORE parsing envelope.
   * See: docs/16_BUILD_CONTRACT.md §WebSocket frame contract
   */
  private _handleRawMessage(raw: string, session: PeerSession): void {
    // STEP 1: Size check BEFORE parsing
    const byteLength = new TextEncoder().encode(raw).length;
    if (byteLength > MAX_FRAME_BYTES) {
      relayTelemetry.emitRejection(
        `Frame too large: ${byteLength} bytes > MAX_FRAME_BYTES (${MAX_FRAME_BYTES})`,
        undefined
      );
      return;
    }

    // STEP 2: Parse frame
    let frame: RelayFrame;
    try {
      frame = JSON.parse(raw) as RelayFrame;
    } catch {
      relayTelemetry.emitRejection("Frame parse error — invalid JSON");
      return;
    }

    // STEP 3: Validate protocol version
    if (frame.protocol_version !== PROTOCOL_VERSION) {
      relayTelemetry.emitRejection(
        `Protocol version mismatch: expected ${PROTOCOL_VERSION}, got ${frame.protocol_version}`,
        frame.frame_id
      );
      return;
    }

    this._handleFrame(frame, session);
  }

  /**
   * Dispatch a parsed frame to the appropriate handler.
   */
  private _handleFrame(frame: RelayFrame, session: PeerSession): void {
    switch (frame.frame_type) {
      case FrameType.HELLO:
        this._handleHello(frame as HelloFrame, session);
        break;
      case FrameType.EVENT_OFFER:
        this._handleEventOffer(frame as EventOfferFrame, session);
        break;
      case FrameType.EVENT_REQUEST:
        this._handleEventRequest(frame as EventRequestFrame, session);
        break;
      case FrameType.EVENT_PUSH:
        void this._handleEventPush(frame as EventPushFrame, session);
        break;
      case FrameType.EVENT_ACK:
        this._handleEventAck(frame as EventAckFrame);
        break;
      case FrameType.PING:
        this._handlePing(frame as PingFrame, session);
        break;
      case FrameType.PONG:
        // No action needed — liveness confirmed
        break;
      default:
        relayTelemetry.emitRejection(
          `Unknown frame_type: ${(frame as RelayFrame).frame_type}`,
          (frame as RelayFrame).frame_id
        );
    }
  }

  // ─── Frame Handlers ──────────────────────────────────────────────────────

  private _handleHello(frame: HelloFrame, session: PeerSession): void {
    if (session.ready) return; // Already handshaked
    session.peerId = frame.peer_id;
    session.ready = true;
    this.peers.set(frame.peer_id, session);
    relayTelemetry.emitPeerConnected(frame.peer_id);
  }

  private _handleEventOffer(
    frame: EventOfferFrame,
    session: PeerSession
  ): void {
    if (!session.ready) return;

    // Check if we already have this event (duplicate suppression)
    if (this.dedupe.has(frame.event_id)) {
      // We have it — no need to request
      return;
    }

    // Store the offer so we can validate the push against it
    session.pendingOffers.set(frame.event_id, frame.content_hash_sha256);

    // Request the event
    this._send(session.ws, buildEventRequestFrame(frame.event_id));
  }

  private _handleEventRequest(
    frame: EventRequestFrame,
    session: PeerSession
  ): void {
    if (!session.ready) return;
    // The other peer is requesting an event we offered.
    // This is handled by the application layer that calls offerEvent().
    // We store that the peer has requested it so the app can push it.
    // Actual push is done by the calling code after offerEvent() triggers a request.
    // In a full implementation the app layer would call pushEventToPeer().
  }

  /**
   * Handle incoming EVENT_PUSH.
   * Validates size, TTL, hop count, signature (via onEventReceived), and deduplication.
   *
   * See: docs/16_BUILD_CONTRACT.md §WebSocket frame contract
   */
  private async _handleEventPush(
    frame: EventPushFrame,
    session: PeerSession
  ): Promise<void> {
    if (!session.ready) return;

    const { envelope, relay } = frame;
    const { event_id, created_at, ttl_seconds, priority, location_geohash, origin } =
      envelope;

    // ── Duplicate suppression ──
    if (this.dedupe.has(event_id)) {
      relayTelemetry.emitDuplicateSuppressed(event_id, location_geohash);
      // Send DUPLICATE ACK so the sender knows it reached us
      this._send(session.ws, buildEventAckFrame(event_id, AckOutcome.DUPLICATE));
      return;
    }

    // ── TTL enforcement ──
    // Reject forwarding if ttl_seconds has elapsed since created_at
    const createdMs = Date.parse(created_at);
    const nowMs = Date.now();
    const elapsedSeconds = (nowMs - createdMs) / 1000;
    if (elapsedSeconds >= ttl_seconds || ttl_seconds < MIN_TTL_SECONDS) {
      relayTelemetry.emitTtlExpiry(event_id, location_geohash, created_at, ttl_seconds);
      this._send(session.ws, buildEventAckFrame(event_id, AckOutcome.EXPIRED));
      return;
    }

    // ── Hop count enforcement ──
    // Never forward when hop_count >= MAX_HOPS (3), even if TTL remains.
    // hop_count is a relay frame field, never a signed envelope field.
    if (relay.hop_count >= MAX_HOPS) {
      relayTelemetry.emitHopLimitReached(event_id, relay.hop_count);
      this._send(session.ws, buildEventAckFrame(event_id, AckOutcome.REJECTED));
      return;
    }

    // ── Quota / backpressure ──
    const priorityEnum = priority as Priority;
    const quotaAllowed = this.quota.isAllowed(
      session.peerId,
      origin.key_id,
      priorityEnum
    );
    if (!quotaAllowed) {
      const tel = this.quota.telemetry(session.peerId, origin.key_id);
      relayTelemetry.emitBackpressure(
        event_id,
        priority,
        tel.peer_tokens_remaining,
        tel.origin_tokens_remaining
      );
      // CRITICAL SOS must always get an explicit outcome even under backpressure
      // — only non-critical events are silently deferred
      if (priorityEnum !== Priority.CRITICAL) {
        // Enqueue for later with lower priority — do not ACK yet
        this.forwardQueue.enqueue({ envelope, hopCount: relay.hop_count, sourcePeerId: session.peerId });
        return;
      }
    }

    // ── Deliver to application layer (signature + schema validation) ──
    const outcome = await this.onEventReceived(envelope, relay.hop_count);

    // Mark as seen regardless of outcome to prevent re-processing
    this.dedupe.add(event_id);

    // Emit receipt telemetry
    relayTelemetry.emitRelayReceipt(
      event_id,
      location_geohash,
      priority,
      relay.hop_count
    );

    // ── ACK the sender ──
    this._send(session.ws, buildEventAckFrame(event_id, outcome));

    // ── Forward to other peers (if ACCEPTED and hops remain) ──
    if (outcome === AckOutcome.ACCEPTED && relay.hop_count + 1 < MAX_HOPS) {
      this.forwardQueue.enqueue({
        envelope,
        hopCount: relay.hop_count + 1,
        sourcePeerId: session.peerId,
      });
      void this._processForwardQueue();
    }
  }

  private _handleEventAck(frame: EventAckFrame): void {
    // PEER_ACKED state is reached ONLY on ACCEPTED or DUPLICATE
    if (
      frame.outcome === AckOutcome.ACCEPTED ||
      frame.outcome === AckOutcome.DUPLICATE
    ) {
      this.onDeliveryStateChange?.(frame.event_id, DeliveryState.PEER_ACKED);
    }
    // EXPIRED or REJECTED → no state promotion
  }

  private _handlePing(frame: PingFrame, session: PeerSession): void {
    this._send(session.ws, buildPongFrame(frame.nonce));
  }

  // ─── Forward Queue Processing ────────────────────────────────────────────

  /**
   * Drain the priority forward queue.
   * CRITICAL events are at the front (see PriorityForwardQueue).
   */
  private async _processForwardQueue(): Promise<void> {
    if (this.forwardProcessing) return;
    this.forwardProcessing = true;

    while (this.forwardQueue.length > 0) {
      const item = this.forwardQueue.dequeue();
      if (!item) break;
      await this._forwardToPeers(item.envelope, item.hopCount, item.sourcePeerId);
    }

    this.forwardProcessing = false;
  }

  /**
   * Push an event to all ready peers (excluding the source peer).
   * hop_count is incremented for each forwarding step.
   */
  private async _forwardToPeers(
    envelope: EventEnvelope,
    hopCount: number,
    excludePeerId: string
  ): Promise<void> {
    for (const session of this.peers.values()) {
      if (!session.ready) continue;
      if (session.peerId === excludePeerId) continue;

      const pushFrame = buildEventPushFrame(envelope, hopCount, this.peerId);
      this._send(session.ws, pushFrame);
    }
  }

  // ─── Push a specific event to a specific peer (on request) ──────────────

  /**
   * Push a specific event to a peer that requested it via EVENT_REQUEST.
   * Called by the application layer when it has the event available.
   */
  async pushEventToPeer(
    peerId: string,
    envelope: EventEnvelope,
    hopCount: number
  ): Promise<void> {
    const session = this.peers.get(peerId);
    if (!session?.ready) return;

    const pushFrame = buildEventPushFrame(envelope, hopCount, this.peerId);
    this._send(session.ws, pushFrame);
  }

  // ─── Utility ─────────────────────────────────────────────────────────────

  private _send(ws: WebSocket, frame: RelayFrame): void {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(frame));
    } catch {
      relayTelemetry.emitRejection(
        "Failed to send frame — WebSocket not writable"
      );
    }
  }

  /** Return count of active ready peers */
  get activePeerCount(): number {
    let count = 0;
    for (const s of this.peers.values()) {
      if (s.ready) count++;
    }
    return count;
  }

  /** Return dedupe cache size for telemetry */
  get dedupeCacheSize(): number {
    return this.dedupe.size;
  }
}
