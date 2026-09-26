# Risk Register

Risk is managed as a product activity, not a last-minute security checklist. Probability and impact are reviewed at each integration checkpoint. The owner records evidence when a risk is reduced or accepted.

| ID | Risk | Probability | Impact | Mitigation | Trigger | Owner |
| --- | --- | --- | --- | --- | --- | --- |
| R-01 | Browser cannot provide native BLE/Wi-Fi Direct reliably. | High | High | Use transport-neutral adapter; demo Wi-Fi/LAN WebSocket only; label roadmap honestly. | A browser-specific API is required for core flow. | Mesh |
| R-02 | Offline queue loses critical event. | Medium | Critical | IndexedDB-first write, reload test, storage error path, compact fallback message. | Local-save failure or queue migration error. | Client/Reliability |
| R-03 | Relay loop floods local devices. | Medium | High | TTL, stable ID, duplicate cache, quota, backoff, priority scheduling. | Duplicate ratio/queue age spikes. | Mesh |
| R-04 | Misinformation is treated as verified. | Medium | Critical | Preserve provenance, expose conflicts, human review, no automated dispatch. | Conflicting source or unexplained trust state. | Trust/QA |
| R-05 | Exact location or medical information is exposed. | Medium | Critical | P0 rejects sensitive fields; production adds role scope, encryption, and precision reduction. | Sensitive data in public view/log/fixture. | Security/Data |
| R-06 | Central server outage stops perceived core flow. | Medium | High | Local-first UX, bridge queue, status semantics, offline demo test. | API outage causes SOS loss or misleading UI. | Backend/Client |
| R-07 | Graph database delays MVP integration. | Medium | Medium | PostgreSQL 16 P0 store; graph/PostGIS explicitly deferred. | Neo4j dependency blocks core path. | Data |
| R-08 | AI causes unsafe or biased suggestion. | Medium | High | Optional assist only, rule fallback, human approval, eval by language/context. | Model changes a life-safety workflow automatically. | AI |
| R-09 | Demo uses fake metrics or unsupported claims. | Medium | High | Evidence register, explicit prototype limits, fixture labels. | A number has no test artifact. | QA/Demo |
| R-10 | Static map/routing directs users through a hazard. | Medium | Critical | Show freshness/provenance, conflict state, human route review, text fallback. | Route depends on stale/contested road. | Data/Responder UX |
| R-11 | Contract drift splits team work. | High | High | Shared schemas, decision log, integration checkpoints, one API owner. | Client and server disagree on state/field. | Architecture |
| R-12 | Accessibility is deferred until too late. | Medium | High | Include in DoD, keyboard/mobile/reduced-motion checkpoint. | Core flow fails keyboard or 360 px test. | QA/Client |

## Risk response rules

- **Avoid:** remove an unsafe automation or unsupported dependency.
- **Mitigate:** reduce likelihood or impact with an implemented control and test.
- **Transfer:** use an approved external/official system at a clearly defined boundary.
- **Accept:** only with an owner, rationale, expiry date, and visible product limit.

No risk is "closed" merely because it is documented. Closure requires a test, operational control, or an explicit accepted limitation.
