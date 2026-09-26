/**
 * ResQMesh — Token-Bucket Rate Limiter
 *
 * Implements per-peer and per-origin token-bucket quotas (backpressure).
 * CRITICAL SOS always gets an explicit local outcome even under backpressure.
 *
 * See: docs/03_ARCHITECTURE_DESIGN.md §Backpressure and abuse controls
 * See: docs/TEAM_TASK_DIVISION.md §Member 3, Phase 3 — Per-peer and per-origin token-bucket quotas
 */

import { Priority } from "./constants";

// ─── Token Bucket Configuration ──────────────────────────────────────────────

/**
 * Token-bucket parameters.
 * capacity: maximum tokens (burst size)
 * refillRate: tokens added per second
 */
export interface TokenBucketConfig {
  capacity: number;
  refillRate: number; // tokens per second
}

/** Standard quota for normal peers/origins */
const DEFAULT_PEER_CONFIG: TokenBucketConfig = {
  capacity: 20,
  refillRate: 2, // 2 events/second steady state
};

/** Higher burst allowance for CRITICAL events */
const CRITICAL_PEER_CONFIG: TokenBucketConfig = {
  capacity: 40,
  refillRate: 5,
};

// ─── Token Bucket ────────────────────────────────────────────────────────────

class TokenBucket {
  private tokens: number;
  private lastRefill: number; // epoch ms

  constructor(private readonly config: TokenBucketConfig) {
    this.tokens = config.capacity;
    this.lastRefill = Date.now();
  }

  /**
   * Attempt to consume one token.
   * Returns true if the token was consumed (request allowed), false if throttled.
   */
  consume(): boolean {
    this._refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  /** Remaining tokens (for telemetry). */
  get available(): number {
    this._refill();
    return Math.floor(this.tokens);
  }

  private _refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000; // seconds
    this.tokens = Math.min(
      this.config.capacity,
      this.tokens + elapsed * this.config.refillRate
    );
    this.lastRefill = now;
  }
}

// ─── Quota Manager ───────────────────────────────────────────────────────────

/**
 * Manages per-peer and per-origin token buckets.
 * CRITICAL events use a higher-capacity bucket so they always get a local outcome.
 *
 * See: docs/03_ARCHITECTURE_DESIGN.md §Backpressure and abuse controls
 */
export class QuotaManager {
  /** Per-peer buckets keyed by peer_id */
  private readonly peerBuckets = new Map<string, TokenBucket>();
  /** Per-origin buckets keyed by origin key_id */
  private readonly originBuckets = new Map<string, TokenBucket>();

  /**
   * Check whether a forwarding request is allowed.
   *
   * @param peerId - The peer sending this event
   * @param originKeyId - The origin.key_id from the signed envelope
   * @param priority - The event priority (CRITICAL gets higher limits)
   * @returns true if allowed; false if backpressure applies
   */
  isAllowed(
    peerId: string,
    originKeyId: string,
    priority: Priority
  ): boolean {
    const config =
      priority === Priority.CRITICAL ? CRITICAL_PEER_CONFIG : DEFAULT_PEER_CONFIG;

    // Get or create peer bucket
    if (!this.peerBuckets.has(peerId)) {
      this.peerBuckets.set(peerId, new TokenBucket(config));
    }
    // Get or create origin bucket
    if (!this.originBuckets.has(originKeyId)) {
      this.originBuckets.set(originKeyId, new TokenBucket(config));
    }

    const peerAllowed = this.peerBuckets.get(peerId)!.consume();
    const originAllowed = this.originBuckets.get(originKeyId)!.consume();

    // Both peer AND origin must have quota — prevents flooding from one source
    return peerAllowed && originAllowed;
  }

  /**
   * Return remaining quota for telemetry (no sensitive data exposed).
   */
  telemetry(peerId: string, originKeyId: string): Record<string, number> {
    return {
      peer_tokens_remaining: this.peerBuckets.get(peerId)?.available ?? -1,
      origin_tokens_remaining: this.originBuckets.get(originKeyId)?.available ?? -1,
    };
  }

  /**
   * Remove a peer's bucket (e.g., on disconnect).
   */
  removePeer(peerId: string): void {
    this.peerBuckets.delete(peerId);
  }
}
