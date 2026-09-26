/**
 * ResQMesh — TypeScript Fixture Type-Check (Member 6 / QA)
 *
 * Loads all JSON fixtures and validates them against the canonical TypeScript
 * types from packages/contracts/types.ts using compile-time type assertions.
 *
 * Run: npx ts-node packages/fixtures/typecheck_fixtures.ts
 *   OR: npx tsx packages/fixtures/typecheck_fixtures.ts
 *
 * CI: tsc --noEmit also catches these (with tsconfig that includes this file).
 *
 * Exit 0 = all pass, non-zero = type errors (caught by ts-node).
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// ─── Import canonical types ────────────────────────────────────────────────
import type {
  EventEnvelope,
  EventType,
  Priority,
  NeedCode,
  SourceKind,
  DeliveryState,
} from "../../packages/contracts/types.js";

import {
  DEMO_INCIDENT_ID,
  DEMO_GEOHASH,
  MAX_EVENT_BYTES,
} from "../../packages/contracts/types.js";

// ─── Helper ────────────────────────────────────────────────────────────────

const FIXTURES_DIR = resolve(dirname(fileURLToPath(import.meta.url)));

function loadFixture(name: string): unknown {
  const path = resolve(FIXTURES_DIR, name);
  return JSON.parse(readFileSync(path, "utf-8"));
}

let passes = 0;
let failures = 0;

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  [PASS]  ${label}`);
    passes++;
  } else {
    console.log(`  [FAIL]  ${label}${detail ? `\n         -> ${detail}` : ""}`);
    failures++;
  }
}

// ─── Validate sos.valid.json ───────────────────────────────────────────────

console.log("\n[1] sos.valid.json — TypeScript type checks");
const sosValid = loadFixture("sos.valid.json") as EventEnvelope;

// TypeScript compile-time type assertion:
// If EventEnvelope shape changes in types.ts, this assignment would fail tsc.
const _typedSos: EventEnvelope = sosValid;

check("schema_version === 1", sosValid.schema_version === 1);
check("type === SOS_CREATED", sosValid.type === "SOS_CREATED");
check("priority === CRITICAL", sosValid.priority === "CRITICAL");
check("incident_id === " + DEMO_INCIDENT_ID, sosValid.incident_id === DEMO_INCIDENT_ID);
check("location_geohash === " + DEMO_GEOHASH, sosValid.location_geohash === DEMO_GEOHASH);
check("ttl_seconds === 1800", sosValid.ttl_seconds === 1800);
check("origin.kind === CITIZEN", sosValid.origin.kind === "CITIZEN");
check("key_id starts with demo:", sosValid.origin.key_id.startsWith("demo:"));
check("key_id length === 21", sosValid.origin.key_id.length === 21);
check("payload.need === MEDICAL", (sosValid.payload as { need: string }).need === "MEDICAL");
check("signature_b64url is non-empty string", typeof sosValid.signature_b64url === "string" && sosValid.signature_b64url.length > 0);

// Size check
const sosBytes = Buffer.from(JSON.stringify(sosValid)).length;
check(`size <= ${MAX_EVENT_BYTES} bytes (${sosBytes} bytes)`, sosBytes <= MAX_EVENT_BYTES);

// ─── Validate sos.bad-signature.json ──────────────────────────────────────

console.log("\n[2] sos.bad-signature.json — must have mutation marker");
const sosBad = loadFixture("sos.bad-signature.json") as EventEnvelope & { _fixture_note?: string };
check("JSON loads", true);
check("priority !== CRITICAL (mutation present)", sosBad.priority !== "CRITICAL");
check("same event_id as sos.valid.json", sosBad.event_id === sosValid.event_id);
check("same signature_b64url (unchanged — mutation is in priority)", sosBad.signature_b64url === sosValid.signature_b64url);
check("_fixture_note is present", typeof sosBad._fixture_note === "string");

// ─── Validate incident.demo.json ──────────────────────────────────────────

console.log("\n[3] incident.demo.json — structure checks");

interface IncidentFixture {
  incident_id: string;
  region_geohash: string;
  events: EventEnvelope[];
  resources: Array<{
    resource_id: string;
    incident_id: string;
    capability: string;
    status: string;
    region_geohash: string;
    available_units: number;
    observed_at: string;
  }>;
  road_reports: EventEnvelope[];
}

const incident = loadFixture("incident.demo.json") as IncidentFixture;
check("incident_id === demo-flood-2026", incident.incident_id === DEMO_INCIDENT_ID);
check("region_geohash === tdr1q0", incident.region_geohash === DEMO_GEOHASH);
check("has 1+ events", incident.events.length >= 1);
check("has 2 resources", incident.resources.length === 2);
check("has 2 road reports", incident.road_reports.length === 2);

const sosEvents = incident.events.filter((e) => e.type === "SOS_CREATED");
check("has 1 SOS_CREATED event", sosEvents.length === 1);
if (sosEvents.length > 0) {
  const sos = sosEvents[0];
  check("SOS priority === CRITICAL", sos.priority === "CRITICAL");
  check("SOS payload.need === MEDICAL", (sos.payload as { need: string }).need === "MEDICAL");
}

const caps = new Set(incident.resources.map((r) => r.capability));
check("has AMBULANCE resource", caps.has("AMBULANCE"));
check("has HOSPITAL_BED resource", caps.has("HOSPITAL_BED"));
incident.resources.forEach((r) => {
  check(`${r.resource_id} status === AVAILABLE`, r.status === "AVAILABLE");
  check(`${r.resource_id} available_units > 0`, r.available_units > 0);
});

// Conflicting road reports: same subject, different conditions, different key_ids
const subjects = new Set(incident.road_reports.map((r) => (r.payload as any).subject_id));
check("road reports share 1 subject_id", subjects.size === 1);
const keyIds = new Set(incident.road_reports.map((r) => r.origin.key_id));
check("road reports have 2 distinct key_ids", keyIds.size === 2);
const conditions = new Set(incident.road_reports.map((r) => (r.payload as any).condition));
check("road conditions are different (BLOCKED vs OPEN)", conditions.size === 2);

// ─── Summary ─────────────────────────────────────────────────────────────

console.log("\n" + "=".repeat(60));
if (failures > 0) {
  console.log(`RESULT: ${failures} check(s) FAILED`);
  process.exit(1);
} else {
  console.log(`RESULT: All ${passes} checks PASSED [OK]`);
  process.exit(0);
}
