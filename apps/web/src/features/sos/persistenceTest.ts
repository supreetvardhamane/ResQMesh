/**
 * ResQMesh — Persistence Test for IndexedDB Queue
 * (apps/web/src/features/sos/persistenceTest.ts)
 *
 * Automated test: SOS survives browser refresh.
 * Per: docs/TEAM_TASK_DIVISION.md §Member 2 Phase 1 — IndexedDB Queue
 * "Queue survives browser refresh — write a persistence test (automated)"
 *
 * This test can be run in-browser via the browser console or a test harness.
 */

import {
  saveEvent,
  getEvent,
  updateDeliveryState,
  removeEvent,
  getQueueSize,
} from "../../lib/storage/queue";
import {
  DeliveryState,
  EventType,
  Priority,
  NeedCode,
  SourceKind,
  SCHEMA_VERSION,
  DEMO_INCIDENT_ID,
  DEFAULT_TTL_SECONDS,
  EventEnvelope,
} from "@contracts";

// ─── Persistence test ────────────────────────────────────────────────────────

/**
 * Automated persistence test for the IndexedDB queue.
 * Tests that:
 * 1. An event can be saved (→ SAVED_LOCAL)
 * 2. The event survives and can be read back by event_id
 * 3. Delivery state can be updated
 * 4. The event can be removed
 *
 * @returns { passed, details } — pass/fail with human-readable detail
 */
export async function runQueuePersistenceTest(): Promise<{
  passed: boolean;
  details: string;
}> {
  const steps: string[] = [];
  const TEST_EVENT_ID = "test-persist-00000000-0000-4000-a000-000000000001";

  // Construct a minimal valid-shaped test envelope (not real-signed — test only)
  const mockEnvelope: EventEnvelope = {
    schema_version: SCHEMA_VERSION,
    event_id: TEST_EVENT_ID,
    type: EventType.SOS_CREATED,
    incident_id: DEMO_INCIDENT_ID,
    created_at: new Date().toISOString(),
    ttl_seconds: DEFAULT_TTL_SECONDS,
    priority: Priority.HIGH,
    origin: {
      kind: SourceKind.CITIZEN,
      key_id: "demo:aabbccddeeff0011",
      public_key_b64url: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    },
    location_geohash: "tdr1q0",
    payload: { need: NeedCode.MEDICAL },
    signature_b64url: "TEST_SIGNATURE_NOT_REAL",
  };

  try {
    // Step 1: Save event
    const saved = await saveEvent(mockEnvelope);
    if (saved.delivery_state !== DeliveryState.SAVED_LOCAL) {
      return {
        passed: false,
        details: `FAIL step 1: expected SAVED_LOCAL, got ${saved.delivery_state}`,
      };
    }
    steps.push("✓ Step 1: saveEvent → SAVED_LOCAL");

    // Step 2: Read it back (simulates a page refresh)
    const readBack = await getEvent(TEST_EVENT_ID);
    if (!readBack) {
      return {
        passed: false,
        details: "FAIL step 2: event not found after save (persistence failure)",
      };
    }
    if (readBack.event_id !== TEST_EVENT_ID) {
      return {
        passed: false,
        details: `FAIL step 2: event_id mismatch: ${readBack.event_id}`,
      };
    }
    if (readBack.delivery_state !== DeliveryState.SAVED_LOCAL) {
      return {
        passed: false,
        details: `FAIL step 2: expected SAVED_LOCAL after read-back, got ${readBack.delivery_state}`,
      };
    }
    steps.push("✓ Step 2: getEvent → SAVED_LOCAL (survives reload)");

    // Step 3: Update delivery state
    await updateDeliveryState(TEST_EVENT_ID, DeliveryState.QUEUED_FOR_RELAY);
    const afterUpdate = await getEvent(TEST_EVENT_ID);
    if (!afterUpdate || afterUpdate.delivery_state !== DeliveryState.QUEUED_FOR_RELAY) {
      return {
        passed: false,
        details: `FAIL step 3: state not updated, got ${afterUpdate?.delivery_state}`,
      };
    }
    steps.push("✓ Step 3: updateDeliveryState → QUEUED_FOR_RELAY");

    // Step 4: Remove event
    const sizeBefore = await getQueueSize();
    await removeEvent(TEST_EVENT_ID);
    const afterRemove = await getEvent(TEST_EVENT_ID);
    if (afterRemove !== null) {
      return {
        passed: false,
        details: "FAIL step 4: event still present after removeEvent",
      };
    }
    const sizeAfter = await getQueueSize();
    if (sizeAfter !== sizeBefore - 1) {
      return {
        passed: false,
        details: `FAIL step 4: queue size after remove expected ${sizeBefore - 1}, got ${sizeAfter}`,
      };
    }
    steps.push("✓ Step 4: removeEvent → event gone, queue size decremented");

    return {
      passed: true,
      details: ["PERSISTENCE TEST PASSED", ...steps].join("\n"),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      passed: false,
      details: `FAIL: Unexpected error: ${msg}\nCompleted steps:\n${steps.join("\n")}`,
    };
  }
}
