/**
 * ResQMesh — Duplicate Suppression Cache
 *
 * Stores up to MAX_DEDUPE_IDS = 1024 event IDs.
 * Suppresses forwarding if event_id has already been seen.
 * Uses a FIFO eviction strategy when the cache is full.
 *
 * See: docs/16_BUILD_CONTRACT.md §Fixed enums and limits
 * See: docs/TEAM_TASK_DIVISION.md §Member 3, Phase 1 — Duplicate suppression cache
 */

import { MAX_DEDUPE_IDS } from "./constants";

export class DedupeCache {
  /** Ordered list of seen event IDs for FIFO eviction */
  private readonly ids: string[] = [];
  /** Set for O(1) lookup */
  private readonly seen: Set<string> = new Set();

  /**
   * Check whether an event_id has already been seen.
   * Returns true if the event is a duplicate (should be suppressed).
   */
  has(eventId: string): boolean {
    return this.seen.has(eventId);
  }

  /**
   * Record an event_id as seen.
   * If the cache is at MAX_DEDUPE_IDS capacity, evicts the oldest entry (FIFO).
   */
  add(eventId: string): void {
    if (this.seen.has(eventId)) {
      // Already present — no-op
      return;
    }
    if (this.ids.length >= MAX_DEDUPE_IDS) {
      // Evict oldest entry
      const oldest = this.ids.shift();
      if (oldest !== undefined) {
        this.seen.delete(oldest);
      }
    }
    this.ids.push(eventId);
    this.seen.add(eventId);
  }

  /**
   * Return the current number of cached IDs.
   */
  get size(): number {
    return this.seen.size;
  }

  /**
   * Clear all cached IDs (useful for testing).
   */
  clear(): void {
    this.ids.length = 0;
    this.seen.clear();
  }
}
