/**
 * ResQMesh — Relay Telemetry
 *
 * Emits structured telemetry events for the relay layer.
 * Privacy constraints: no plaintext sensitive data (exact location, phone, name)
 * in any log label. Region bucket is used instead of exact geohash.
 *
 * See: docs/TEAM_TASK_DIVISION.md §Member 3, Phase 3 — Emit structured telemetry
 * See: docs/04_DATA_AND_PRIVACY.md
 */

// ─── Telemetry Event Types ───────────────────────────────────────────────────

export type RelayTelemetryEvent =
  | RelayReceiptEvent
  | DuplicateSuppressionEvent
  | TtlExpiryEvent
  | RejectionEvent
  | HopLimitEvent
  | BackpressureEvent
  | PeerConnectedEvent
  | PeerDisconnectedEvent;

export interface RelayReceiptEvent {
  kind: "relay_receipt";
  event_id: string;
  /** First 4 chars of geohash only — no exact location */
  region_bucket: string;
  priority: string;
  hop_count: number;
  received_at: string;
}

export interface DuplicateSuppressionEvent {
  kind: "duplicate_suppressed";
  event_id: string;
  region_bucket: string;
  suppressed_at: string;
}

export interface TtlExpiryEvent {
  kind: "ttl_expired";
  event_id: string;
  region_bucket: string;
  created_at: string;
  ttl_seconds: number;
  expired_at: string;
}

export interface RejectionEvent {
  kind: "frame_rejected";
  reason: string;
  frame_id?: string;
  rejected_at: string;
}

export interface HopLimitEvent {
  kind: "hop_limit_reached";
  event_id: string;
  hop_count: number;
  rejected_at: string;
}

export interface BackpressureEvent {
  kind: "backpressure_applied";
  event_id: string;
  peer_tokens_remaining: number;
  origin_tokens_remaining: number;
  priority: string;
  applied_at: string;
}

export interface PeerConnectedEvent {
  kind: "peer_connected";
  peer_id: string;
  connected_at: string;
}

export interface PeerDisconnectedEvent {
  kind: "peer_disconnected";
  peer_id: string;
  disconnected_at: string;
}

// ─── Telemetry Emitter ───────────────────────────────────────────────────────

/** Subscribers registered to receive telemetry events */
type TelemetrySubscriber = (event: RelayTelemetryEvent) => void;

/**
 * Relay telemetry emitter.
 * Emits structured events for observability; sensitive data is never included.
 *
 * Use toRegionBucket() to derive the safe region label from a geohash.
 */
export class RelayTelemetry {
  private readonly subscribers: TelemetrySubscriber[] = [];

  /**
   * Subscribe to telemetry events (e.g., to log them or collect metrics).
   */
  subscribe(fn: TelemetrySubscriber): () => void {
    this.subscribers.push(fn);
    return () => {
      const idx = this.subscribers.indexOf(fn);
      if (idx !== -1) this.subscribers.splice(idx, 1);
    };
  }

  private emit(event: RelayTelemetryEvent): void {
    for (const sub of this.subscribers) {
      try {
        sub(event);
      } catch {
        // Telemetry must never crash the relay path
      }
    }
  }

  /**
   * Derive a safe region bucket from a geohash (first 4 chars only).
   * Never logs the full 6-char geohash (could reveal precise location).
   */
  static toRegionBucket(geohash: string): string {
    return geohash.slice(0, 4);
  }

  // ─── Emit helpers ──────────────────────────────────────────────────────

  emitRelayReceipt(
    eventId: string,
    geohash: string,
    priority: string,
    hopCount: number
  ): void {
    this.emit({
      kind: "relay_receipt",
      event_id: eventId,
      region_bucket: RelayTelemetry.toRegionBucket(geohash),
      priority,
      hop_count: hopCount,
      received_at: new Date().toISOString(),
    });
  }

  emitDuplicateSuppressed(eventId: string, geohash: string): void {
    this.emit({
      kind: "duplicate_suppressed",
      event_id: eventId,
      region_bucket: RelayTelemetry.toRegionBucket(geohash),
      suppressed_at: new Date().toISOString(),
    });
  }

  emitTtlExpiry(
    eventId: string,
    geohash: string,
    createdAt: string,
    ttlSeconds: number
  ): void {
    this.emit({
      kind: "ttl_expired",
      event_id: eventId,
      region_bucket: RelayTelemetry.toRegionBucket(geohash),
      created_at: createdAt,
      ttl_seconds: ttlSeconds,
      expired_at: new Date().toISOString(),
    });
  }

  emitRejection(reason: string, frameId?: string): void {
    this.emit({
      kind: "frame_rejected",
      reason,
      frame_id: frameId,
      rejected_at: new Date().toISOString(),
    });
  }

  emitHopLimitReached(eventId: string, hopCount: number): void {
    this.emit({
      kind: "hop_limit_reached",
      event_id: eventId,
      hop_count: hopCount,
      rejected_at: new Date().toISOString(),
    });
  }

  emitBackpressure(
    eventId: string,
    priority: string,
    peerTokens: number,
    originTokens: number
  ): void {
    this.emit({
      kind: "backpressure_applied",
      event_id: eventId,
      peer_tokens_remaining: peerTokens,
      origin_tokens_remaining: originTokens,
      priority,
      applied_at: new Date().toISOString(),
    });
  }

  emitPeerConnected(peerId: string): void {
    this.emit({
      kind: "peer_connected",
      peer_id: peerId,
      connected_at: new Date().toISOString(),
    });
  }

  emitPeerDisconnected(peerId: string): void {
    this.emit({
      kind: "peer_disconnected",
      peer_id: peerId,
      disconnected_at: new Date().toISOString(),
    });
  }
}

/** Singleton telemetry instance for the relay layer */
export const relayTelemetry = new RelayTelemetry();
