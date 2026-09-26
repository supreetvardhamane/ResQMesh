# Evaluation Plan

## Evidence matrix

| Criterion | What judges can see | Evidence to prepare |
| --- | --- | --- |
| Impact and scalability | SOS survives outage; community assets become useful; regional event architecture | scenario result, scale diagram, stated prototype limits |
| Technical feasibility and execution | PWA local persistence, signed envelope, TTL/dedupe, bridge sync, typed API | live flow, request logs, schema, automated checks |
| Innovation and problem relevance | Four failures addressed together rather than a generic alert app | before/after story, graph + provenance explanation |
| UX and accessibility | One-tap SOS, clear network state, icons plus text, responsive and keyboard flow | mobile recording, keyboard check, contrast/reduced-motion pass |

## Test checkpoints

### Checkpoint A: core journey

- Disable network, create SOS, refresh, and confirm local recovery.
- Relay the same event twice and confirm one operational event.
- Decrease TTL or exceed it and confirm forwarding stops.
- Make bridge sync fail then recover and confirm idempotent delivery.

### Checkpoint B: coordination

- Register ambulance, hospital bed, shelter, and blocked road.
- Create medical need and confirm a candidate match has a transparent rationale.
- Send corroborating and conflicting reports; inspect preserved evidence and changed trust state.

### Checkpoint C: quality

- Test 360 px, 768 px, 1280 px, and 1440 px widths.
- Keyboard-only create/read/retry flow; screen-reader labels for status and controls.
- Simulate slow network and offline state; check no data loss and no request storm.
- Validate API schema, signature failure, malformed GeoJSON, and unauthorized responder access.

## Scale validation roadmap

Start with event-level measurements: payload size, P95 local write time, replay/dedupe correctness, sync batch size, and API error rate. Then run progressively larger synthetic workloads by region partition. Report hardware, data shape, duration, and failure conditions with every number. Until that exists, the presentation describes a scaling design, not benchmarked capacity.

## Definition of demo-ready

The P0 scenario runs twice consecutively on known demo devices, failure states are deliberate and recoverable, fixture data is resettable, and every visible number is either measured or labelled illustrative.

## Verification levels

| Level | Purpose | Examples | Evidence location |
| --- | --- | --- | --- |
| L1 Build | Application starts with valid configuration. | type check, build, migration validation | CI/build log |
| L2 Module | A module meets local behavior. | queue reducer, signature verifier, match rule | unit test result |
| L3 Contract | Clients and services agree. | OpenAPI/schema fixtures, error payloads | contract test |
| L4 Integration | Multiple layers complete one path. | PWA -> relay -> bridge -> API -> projection | integration recording/log |
| L5 End-to-end | A person can complete the intended workflow. | offline SOS and responder assignment | scripted demo check |
| L6 Resilience | Failure does not violate core safety. | outage, duplicate storm, stale map | chaos/failure test |
| L7 Scale | System behavior under load is measured. | region partition, queue depth, p95 latency | benchmark report |

## Test cases

| ID | Scenario | Expected result | Level |
| --- | --- | --- | --- |
| EV-01 | Device offline, create SOS, refresh browser. | Event remains in local queue and status says saved locally. | L4/L5 |
| EV-02 | Relay same envelope through two peers twice. | One canonical event; duplicate receipt is audited. | L3/L4 |
| EV-03 | TTL expires before a peer receives event. | Adapter stops forwarding and explains expiry. | L2/L4 |
| EV-04 | Tamper with signed payload. | Quarantined/rejected; no responder projection. | L2/L3 |
| EV-05 | Bridge/API outage during sync. | Queue remains; retry succeeds once service recovers. | L4/L6 |
| EV-06 | Resource becomes unavailable after a match. | Match view is stale/changed; assignment requires review. | L3/L4 |
| EV-07 | Conflicting road reports arrive. | Both evidence items remain; route state is conflicted. | L4/L5 |
| EV-08 | 360 px and keyboard-only SOS flow. | No clipped text; all controls/state announcements usable. | L5 |
| EV-09 | AI unavailable or returns malformed output. | Manual/rule path completes without data loss. | L3/L6 |
| EV-10 | CAP/GeoJSON invalid or unauthorized. | Bounded validation error; no partial projection. | L3 |
| EV-11 | Let a fresh blocked-road report age by simulated time, then corroborate it. | Confidence visibly moves from 94% to 60% at 20 simulated minutes, dims to amber, then resets to 94% on valid responder confirmation. | L4/L5 |

## Accessibility evaluation

Perform semantic/automated checks, then manual task checks. Test keyboard focus order; visible focus; accessible labels; error association; status/live-region announcements; contrast; touch target size; zoom/reflow; screen-reader naming; and `prefers-reduced-motion`. Use simple language in the SOS path and do not depend on color, map tiles, motion, or network animation to communicate state. Where time permits, test with actual low-end devices and representative language preferences.

## Performance and scale methodology

Benchmarking must be reproducible: record commit SHA, configuration, hardware/region, synthetic data shape, number of incidents, event type mix, payload distribution, concurrency profile, warm-up, duration, and fault injection. Measure API acceptance rate, P50/P95/P99 latency, queue age, duplicate ratio, projection lag, database CPU/IO, stream lag, error rate, and recovery time. Increase load by partition rather than only one global counter. Publish failure thresholds before the run. Do not compare numbers across environments without noting the difference.

## Evidence register format

```md
Requirement: RT-02
Build/version:
Environment:
Scenario:
Result: PASS | FAIL | PENDING
Measurements:
Artifacts: log, screenshot, recording, test output
Known limits:
Reviewer and date:
```

## Exit criteria by release stage

**Prototype demo:** EV-01 through EV-08 pass once in the known demo environment; known gaps are stated in the demo.

**Pilot candidate:** repeatable integration suite, security review, actual-user usability feedback, retention/access policy approval, documented incident runbooks, and measured regional load baseline.

**Production:** operational ownership, incident response, backup/recovery tests, key governance, accessibility conformance review, legal/privacy review, partner interoperability validation, capacity plan, and multi-region recovery evidence.
