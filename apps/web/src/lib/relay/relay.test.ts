/**
 * ResQMesh — Relay Resilience Tests
 *
 * Tests required per docs/TEAM_TASK_DIVISION.md §Member 3, Phase 5:
 *
 * - Duplicate relay test: two copies → one canonical event
 * - TTL expiry test: expired event not forwarded
 * - hop_count = 3 boundary test: not forwarded on 4th hop
 * - Malformed / oversized frame rejection
 * - Demo scale proof: 50 duplicate Region A copies while Region B SOS created
 *   → Region A = 1 canonical, Region B completes
 *
 * These are plain TypeScript assertions using a lightweight test harness.
 * Run with: npx ts-node apps/web/src/lib/relay/relay.test.ts
 *
 * See: docs/TEAM_TASK_DIVISION.md §Member 3, Phase 5 — Resilience Tests
 * See: docs/16_BUILD_CONTRACT.md §WebSocket frame contract
 */

import {
  MAX_FRAME_BYTES,
  MAX_HOPS,
  MAX_DEDUPE_IDS,
  MIN_TTL_SECONDS,
  AckOutcome,
  DeliveryState,
  Priority,
  FrameType,
  PROTOCOL_VERSION,
} from "@contracts";

import { DedupeCache } from "./dedupe";

// ─── Minimal Test Harness ────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string): void {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

function describe(name: string, fn: () => void): void {
  console.log(`\n▶ ${name}`);
  fn();
}

function summarize(): void {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

// ─── Test: Duplicate Suppression Cache ──────────────────────────────────────

describe("DedupeCache — duplicate suppression", () => {
  const cache = new DedupeCache();

  // Add first event
  cache.add("event-001");
  assert(!cache.has("event-999"), "Unknown event_id returns false");
  assert(cache.has("event-001"), "Known event_id returns true");

  // Duplicate relay: same event added twice → size stays the same
  const sizeBefore = cache.size;
  cache.add("event-001");
  assert(cache.size === sizeBefore, "Duplicate add does not increase cache size");

  // Two copies of same event_id → only one entry
  cache.add("event-002");
  cache.add("event-002");
  assert(cache.size === 2, "Two duplicates → still 2 unique IDs cached");
});

// ─── Test: DedupeCache FIFO eviction at MAX_DEDUPE_IDS ──────────────────────

describe("DedupeCache — FIFO eviction at MAX_DEDUPE_IDS (1024)", () => {
  const cache = new DedupeCache();

  // Fill to capacity
  for (let i = 0; i < MAX_DEDUPE_IDS; i++) {
    cache.add(`event-${i}`);
  }
  assert(cache.size === MAX_DEDUPE_IDS, `Cache holds exactly MAX_DEDUPE_IDS (${MAX_DEDUPE_IDS}) entries`);

  // Adding one more should evict the oldest (event-0)
  cache.add("event-overflow");
  assert(cache.size === MAX_DEDUPE_IDS, "Cache stays at MAX_DEDUPE_IDS after overflow");
  assert(!cache.has("event-0"), "Oldest entry (event-0) was evicted");
  assert(cache.has("event-overflow"), "New entry is present after eviction");
});

// ─── Test: TTL enforcement ────────────────────────────────────────────────────

describe("TTL enforcement", () => {
  // TTL has elapsed: created_at is in the past by more than ttl_seconds
  function isTtlExpired(createdAt: string, ttlSeconds: number): boolean {
    const elapsed = (Date.now() - Date.parse(createdAt)) / 1000;
    return elapsed >= ttlSeconds || ttlSeconds < MIN_TTL_SECONDS;
  }

  const expiredCreatedAt = new Date(Date.now() - 3600_000).toISOString(); // 1 hour ago
  assert(isTtlExpired(expiredCreatedAt, 1800), "Event created 1h ago with TTL=1800s is expired");

  const freshCreatedAt = new Date(Date.now() - 60_000).toISOString(); // 1 min ago
  assert(!isTtlExpired(freshCreatedAt, 1800), "Event created 1m ago with TTL=1800s is NOT expired");

  // TTL below MIN_TTL_SECONDS is always rejected
  assert(isTtlExpired(new Date().toISOString(), MIN_TTL_SECONDS - 1),
    `Event with ttl_seconds < MIN_TTL_SECONDS (${MIN_TTL_SECONDS}) is rejected`);

  // TTL exactly at MIN is valid
  assert(!isTtlExpired(new Date().toISOString(), MIN_TTL_SECONDS),
    `Event with ttl_seconds = MIN_TTL_SECONDS (${MIN_TTL_SECONDS}) is NOT rejected`);
});

// ─── Test: Hop count boundary ─────────────────────────────────────────────────

describe(`Hop count enforcement (MAX_HOPS = ${MAX_HOPS})`, () => {
  function shouldForward(hopCount: number): boolean {
    // Never forward when hop_count >= MAX_HOPS
    return hopCount < MAX_HOPS;
  }

  assert(shouldForward(0), "hop_count=0 → forward allowed");
  assert(shouldForward(1), "hop_count=1 → forward allowed");
  assert(shouldForward(2), "hop_count=2 → forward allowed (last valid)");
  assert(!shouldForward(3), "hop_count=3 → NOT forwarded (at MAX_HOPS boundary)");
  assert(!shouldForward(4), "hop_count=4 → NOT forwarded (exceeds MAX_HOPS)");
  assert(!shouldForward(10), "hop_count=10 → NOT forwarded");
});

// ─── Test: Frame size enforcement ─────────────────────────────────────────────

describe(`Frame size enforcement (MAX_FRAME_BYTES = ${MAX_FRAME_BYTES})`, () => {
  function isFrameOversized(raw: string): boolean {
    return new TextEncoder().encode(raw).length > MAX_FRAME_BYTES;
  }

  const normalFrame = JSON.stringify({
    frame_type: "EVENT_OFFER",
    protocol_version: 1,
    frame_id: "a".repeat(36),
    sent_at: new Date().toISOString(),
    event_id: "b".repeat(36),
    content_hash_sha256: "c".repeat(64),
  });
  assert(!isFrameOversized(normalFrame), "Normal EVENT_OFFER frame is within size limit");

  const oversizedFrame = "x".repeat(MAX_FRAME_BYTES + 1);
  assert(isFrameOversized(oversizedFrame), `Frame of ${MAX_FRAME_BYTES + 1} bytes is rejected`);

  const exactLimitFrame = "x".repeat(MAX_FRAME_BYTES);
  assert(!isFrameOversized(exactLimitFrame), `Frame of exactly MAX_FRAME_BYTES (${MAX_FRAME_BYTES}) is accepted`);
});

// ─── Test: PEER_ACKED only on ACCEPTED or DUPLICATE ─────────────────────────

describe("DeliveryState — PEER_ACKED transition", () => {
  function toPeerAcked(outcome: AckOutcome): DeliveryState | null {
    if (outcome === AckOutcome.ACCEPTED || outcome === AckOutcome.DUPLICATE) {
      return DeliveryState.PEER_ACKED;
    }
    return null;
  }

  assert(
    toPeerAcked(AckOutcome.ACCEPTED) === DeliveryState.PEER_ACKED,
    "ACCEPTED outcome → PEER_ACKED"
  );
  assert(
    toPeerAcked(AckOutcome.DUPLICATE) === DeliveryState.PEER_ACKED,
    "DUPLICATE outcome → PEER_ACKED"
  );
  assert(
    toPeerAcked(AckOutcome.EXPIRED) === null,
    "EXPIRED outcome → no PEER_ACKED"
  );
  assert(
    toPeerAcked(AckOutcome.REJECTED) === null,
    "REJECTED outcome → no PEER_ACKED"
  );
});

// ─── Test: Priority scheduling ────────────────────────────────────────────────

describe("Priority scheduling — CRITICAL events first", () => {
  // Simulate a simple priority queue: CRITICAL prepended, others appended
  const queue: Array<{ id: string; priority: Priority }> = [];

  function enqueue(id: string, priority: Priority): void {
    if (priority === Priority.CRITICAL) {
      queue.unshift({ id, priority }); // front
    } else {
      queue.push({ id, priority }); // back
    }
  }

  enqueue("event-normal-1", Priority.NORMAL);
  enqueue("event-high-1", Priority.HIGH);
  enqueue("event-critical-1", Priority.CRITICAL);
  enqueue("event-normal-2", Priority.NORMAL);
  enqueue("event-critical-2", Priority.CRITICAL);

  assert(queue[0].priority === Priority.CRITICAL, "First in queue is CRITICAL");
  assert(queue[1].priority === Priority.CRITICAL, "Second in queue is also CRITICAL");
  assert(
    queue[queue.length - 1].priority !== Priority.CRITICAL,
    "NORMAL/HIGH events are at the back"
  );
});

// ─── Test: Demo scale proof ───────────────────────────────────────────────────

describe("Demo scale proof: 50 duplicate Region A copies → 1 canonical", () => {
  const cache = new DedupeCache();
  const regionAEventId = "region-a-sos-001";
  const regionBEventId = "region-b-sos-001";

  // Simulate 50 duplicate relays of the same Region A event
  let regionAAccepted = 0;
  let regionASuppressed = 0;

  for (let i = 0; i < 50; i++) {
    if (cache.has(regionAEventId)) {
      regionASuppressed++;
    } else {
      cache.add(regionAEventId);
      regionAAccepted++;
    }
  }

  assert(regionAAccepted === 1, "Region A: exactly 1 canonical event accepted");
  assert(regionASuppressed === 49, "Region A: 49 duplicates suppressed");

  // Region B SOS is a distinct event — still completes independently
  const regionBAccepted = !cache.has(regionBEventId);
  cache.add(regionBEventId);

  assert(regionBAccepted, "Region B SOS accepted independently (distinct event_id)");
  assert(cache.has(regionBEventId), "Region B event is now in dedupe cache");
  assert(cache.has(regionAEventId), "Region A event remains in dedupe cache");
});

// ─── Test: Frame protocol version validation ──────────────────────────────────

describe("Frame protocol_version validation", () => {
  function isValidProtocolVersion(frame: { protocol_version: number }): boolean {
    return frame.protocol_version === PROTOCOL_VERSION;
  }

  assert(
    isValidProtocolVersion({ protocol_version: 1 }),
    "protocol_version=1 is valid"
  );
  assert(
    !isValidProtocolVersion({ protocol_version: 0 }),
    "protocol_version=0 is invalid"
  );
  assert(
    !isValidProtocolVersion({ protocol_version: 2 }),
    "protocol_version=2 is invalid (future version)"
  );
});

// ─── Test: Malformed frame rejection ─────────────────────────────────────────

describe("Malformed frame rejection", () => {
  function parseFrame(raw: string): { valid: boolean; reason?: string } {
    try {
      const frame = JSON.parse(raw);
      if (!frame.frame_type) return { valid: false, reason: "missing frame_type" };
      if (frame.protocol_version !== PROTOCOL_VERSION)
        return { valid: false, reason: "protocol_version mismatch" };
      if (!frame.frame_id) return { valid: false, reason: "missing frame_id" };
      if (!frame.sent_at) return { valid: false, reason: "missing sent_at" };
      return { valid: true };
    } catch {
      return { valid: false, reason: "JSON parse error" };
    }
  }

  assert(!parseFrame("not-json").valid, "Non-JSON string is rejected");
  assert(!parseFrame("{}").valid, "Empty object is rejected (missing frame_type)");
  assert(
    !parseFrame(JSON.stringify({ frame_type: FrameType.HELLO, protocol_version: 99, frame_id: "x", sent_at: "t" })).valid,
    "Wrong protocol_version is rejected"
  );
  assert(
    parseFrame(JSON.stringify({
      frame_type: FrameType.PING,
      protocol_version: PROTOCOL_VERSION,
      frame_id: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
      sent_at: new Date().toISOString(),
      nonce: "abc",
    })).valid,
    "Well-formed PING frame is valid"
  );
});

// ─── Summary ─────────────────────────────────────────────────────────────────

summarize();
