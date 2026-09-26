/**
 * ResQMesh — IndexedDB Event Queue (Member 2 / apps/web/src/lib/storage/queue.ts)
 *
 * Offline-first event persistence per docs/16_BUILD_CONTRACT.md §Single delivery-state machine
 * and docs/TEAM_TASK_DIVISION.md §Member 2 Phase 1 — IndexedDB Queue.
 *
 * Responsibilities:
 * - Persist events to IndexedDB on submit (SAVED_LOCAL)
 * - Queue survives browser refresh (automated persistence test in sos/persistenceTest.ts)
 * - Enforce MAX_QUEUE_EVENTS = 200 limit
 * - Implement delivery state transitions per contract
 *
 * Delivery states managed here:
 *   DRAFT → SAVED_LOCAL → QUEUED_FOR_RELAY → PEER_ACKED → BRIDGE_ACKED → SYNCED
 *   SAVED_LOCAL | QUEUED_FOR_RELAY | PEER_ACKED → RETRY_PENDING → QUEUED_FOR_RELAY
 *   SAVED_LOCAL | QUEUED_FOR_RELAY → EXPIRED
 *   any validation failure → REJECTED
 */

import {
  DeliveryState,
  EventEnvelope,
  MAX_QUEUE_EVENTS,
} from "@contracts";
import {
  logQueueAccept,
  logQueueFull,
  logQueueReject,
  logDeliveryStateChange,
} from "../crypto/observability";

// ─── Constants ───────────────────────────────────────────────────────────────

const DB_NAME = "resqmesh-events";
const DB_VERSION = 1;
const STORE_NAME = "events";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface QueuedEvent {
  event_id: string;
  envelope: EventEnvelope;
  delivery_state: DeliveryState;
  queued_at: string; // UTC ISO-8601
}

// ─── IndexedDB helpers ───────────────────────────────────────────────────────

function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "event_id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ─── Queue operations ────────────────────────────────────────────────────────

/**
 * Save an event envelope to IndexedDB, transitioning to SAVED_LOCAL.
 * Rejects with QUEUE_LIMITED if MAX_QUEUE_EVENTS (200) is reached.
 */
export async function saveEvent(envelope: EventEnvelope): Promise<QueuedEvent> {
  const db = await openQueueDb();
  const currentSize = await getQueueSizeInternal(db);

  if (currentSize >= MAX_QUEUE_EVENTS) {
    db.close();
    logQueueFull({ queueSize: currentSize, priority: envelope.priority });
    logQueueReject({
      errorCode: "QUEUE_LIMITED",
      reason: `Queue full: ${currentSize}/${MAX_QUEUE_EVENTS} events`,
      priority: envelope.priority,
    });
    throw new Error(
      `QUEUE_LIMITED: Queue is full (${currentSize}/${MAX_QUEUE_EVENTS} events). Cannot save new event.`
    );
  }

  const queued_at = new Date().toISOString();
  const record: QueuedEvent = {
    event_id: envelope.event_id,
    envelope,
    delivery_state: DeliveryState.SAVED_LOCAL,
    queued_at,
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  db.close();

  logQueueAccept({
    eventId: envelope.event_id,
    eventType: envelope.type,
    priority: envelope.priority,
    queueAgeMs: 0,
    locationGeohash: envelope.location_geohash,
  });

  return record;
}

/**
 * Retrieve a single queued event by event_id.
 */
export async function getEvent(eventId: string): Promise<QueuedEvent | null> {
  const db = await openQueueDb();
  return new Promise<QueuedEvent | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(eventId);
    req.onsuccess = () => {
      db.close();
      resolve((req.result as QueuedEvent) ?? null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/**
 * Get all queued events (all states).
 */
export async function getAllEvents(): Promise<QueuedEvent[]> {
  const db = await openQueueDb();
  return new Promise<QueuedEvent[]>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      db.close();
      resolve((req.result as QueuedEvent[]) ?? []);
    };
    req.onerror = () => {
      db.close();
      reject(req.error);
    };
  });
}

/**
 * Get all events in a specific delivery state.
 */
export async function getEventsByState(state: DeliveryState): Promise<QueuedEvent[]> {
  const all = await getAllEvents();
  return all.filter((e) => e.delivery_state === state);
}

/**
 * Update the delivery state of a queued event.
 * Logs the state transition.
 */
export async function updateDeliveryState(
  eventId: string,
  newState: DeliveryState
): Promise<void> {
  const db = await openQueueDb();
  const existing = await new Promise<QueuedEvent | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(eventId);
    req.onsuccess = () => resolve((req.result as QueuedEvent) ?? null);
    req.onerror = () => reject(req.error);
  });

  if (!existing) {
    db.close();
    throw new Error(`Event ${eventId} not found in queue`);
  }

  const prevState = existing.delivery_state;
  const updated: QueuedEvent = { ...existing, delivery_state: newState };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(updated);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  db.close();

  logDeliveryStateChange({
    eventId,
    fromState: prevState,
    toState: newState,
    priority: existing.envelope.priority,
    locationGeohash: existing.envelope.location_geohash,
  });
}

/**
 * Remove an event from the queue (after SYNCED or terminal state).
 */
export async function removeEvent(eventId: string): Promise<void> {
  const db = await openQueueDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(eventId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
  db.close();
}

/**
 * Get the current queue size.
 */
export async function getQueueSize(): Promise<number> {
  const db = await openQueueDb();
  const size = await getQueueSizeInternal(db);
  db.close();
  return size;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getQueueSizeInternal(db: IDBDatabase): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const req = store.count();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
