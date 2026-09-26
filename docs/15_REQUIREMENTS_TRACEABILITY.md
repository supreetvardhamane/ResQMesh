# Requirements Traceability

This matrix connects the disaster problem, implementation artifact, verification evidence, demo moment, and owner. It is the control surface for judging alignment and integration completeness.

| ID | User/problem need | Product requirement | Primary artifacts | Verification | Demo evidence | Owner | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| RT-01 | A person cannot reach emergency services online. | Offline SOS persists before transport. | `02`, `03`, `05`, client queue | reload/offline test | create SOS with network disabled | Client | `SPECIFIED` |
| RT-02 | A message has no direct path to responders. | Relay uses bounded signed store-and-forward. | `03`, `05`, `11` | TTL/dedupe/priority test | phone -> peer -> bridge | Mesh | `SPECIFIED` |
| RT-03 | Resources are unavailable to responders. | Resources expose capability, location, availability, assignment. | `02`, `03`, `05` | resource-match fixture | ambulance/hospital match | Data | `SPECIFIED` |
| RT-04 | Reports conflict and trust fails. | Evidence/provenance survives relay and projection; map observations visibly decay until corroborated. | `03`, `04`, `05`, `11`, `16` | conflict/corroboration/decay test | fading blocked-road marker | Trust | `SPECIFIED` |
| RT-05 | Static maps can be unsafe. | Road data has freshness, source, conflict and text fallback. | `03`, `04`, `05` | stale/blocked road test | contested route shown | Data/UX | `SPECIFIED` |
| RT-06 | Underserved users need a usable product. | Mobile-first, low-bandwidth, accessible UI. | `01`, `02`, `07` | viewport/keyboard/a11y test | one-tap mobile flow | Client/QA | `SPECIFIED` |
| RT-07 | Authorities need interoperability. | CAP/GeoJSON boundary is validated and attributed. | `03`, `05`, `11` | schema import/export test | partner payload sample | Backend | `DEFERRED` — P0 scope brake |
| RT-08 | Scale must be credible. | Event flow is partitionable, cacheable, and asynchronous. | `02`, `03`, `07` | progressive load plan | architecture explanation | Architecture | `IMPLEMENTED` — contracts + arch diagram |
| RT-09 | AI must not make emergency decisions. | AI is optional, reviewable, and has rule/manual fallback. | `04`, `06`, `11` | failure/override test | assist proposal, not dispatch | AI | `DEFERRED` — AI is optional per ADR-007 |
| RT-10 | People and data require protection. | P0 rejects sensitive fields; production must minimize, encrypt, restrict, retain, and audit approved sensitive data. | `04`, `12`, `14` | schema/access rejection review | privacy boundary explanation | Security | `IMPLEMENTED` — contracts reject unknown fields |

## Status labels

- `SPECIFIED`: documented but not yet implemented.
- `IMPLEMENTED`: code exists; verification may still be pending.
- `VERIFIED`: planned evidence has passed and is recorded.
- `DEFERRED`: intentionally outside the current release, with reason and mitigation.

At each checkpoint, add a status and a link to the actual test/log/screenshot artifact beside the relevant requirement. Do not change a requirement to `VERIFIED` based on a design review alone.
