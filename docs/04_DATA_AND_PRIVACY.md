# Data and Privacy

## Data minimization

P0 SOS needs only opaque event ID, six-character location bucket, need category, priority, creation time, and minimal relay metadata. P0 rejects names, contact channels, precise GPS, health/free-text detail, identifying media, attachments, and arbitrary metadata. Production policy may add fields only after purpose, retention, access, and protection are approved.

## Classification

| Class | Examples | Handling |
| --- | --- | --- |
| Public operational | CAP alert, blocked-road status, shelter capacity | Signed source, cacheable, expiry required |
| Sensitive operational | exact resource location, responder route, availability | Excluded from P0; production uses role-limited encrypted storage |
| Personal or special-category | name, phone, precise victim location, health need | Excluded from P0; production needs approved opt-in and encrypted fields |
| Security evidence | signature, bridge IDs, audit trail | Immutable audit store, restricted operator access |

## Privacy controls

- Do not require an account to record SOS; use an ephemeral device key or anonymous event identity.
- P0 accepts only coarse geohash buckets and has no precise-coordinate field.
- Field-level encryption is deferred from P0 because P0 rejects sensitive fields. Ed25519 provides integrity, not confidentiality.
- Keep raw relay payloads only long enough to support delivery, audit, and incident resolution. Retention durations require authority approval before deployment.
- Provide an operator redaction and correction workflow. Never erase an audit trail without a replacement record explaining the action.
- Export only the minimum CAP/GeoJSON fields necessary for partner interoperability.

## Trust is not identity verification

Provenance records who or what supplied information and how it moved through the mesh. It makes reliability inspectable; it must not be shown as proof that a vulnerable person, report, or route is unquestionably safe. High-impact decisions require responder review and corroboration.

## P0 security boundary

- TLS for API/bridge traffic; the LAN simulation is a controlled demo transport and must not be represented as production-secure transport.
- Ed25519 event signatures use the canonicalization in `16_BUILD_CONTRACT.md`.
- Server-side authorization by role and incident/region scope.
- Input schemas, payload-size limits, replay protection, rate limits, and audit logs.
- P0 accepts no PII or special-category fields, so field-level encryption is explicitly out of scope.
- No secrets in client bundles, commits, screenshots, or demo fixtures.

## Data lifecycle

| Stage | Purpose | Controls |
| --- | --- | --- |
| Create | Capture a request or observation on device. | P0 minimum fields only, durable queue, no PII/free-text health detail |
| Relay | Move bounded envelope between peers. | TTL, signature, no broad data browsing, peer quotas |
| Ingest | Establish canonical operational evidence. | schema/signature checks, idempotency, immutable audit append |
| Project | Make information useful for responders. | role and region scope, precision reduction, as-of timestamp |
| Share | Interoperate with official/partner systems. | explicit CAP/GeoJSON mapping, data minimization, source attribution |
| Retain | Support active incident and accountable review. | retention schedule, legal/governance approval, access logging |
| Delete/redact | Remove non-essential personal content when policy allows. | tombstone/redaction event, preserve minimum audit proof |

## Production field-level handling baseline

| Field category | Default | Public responder map | Authorized responder | Retention direction |
| --- | --- | --- | --- | --- |
| Event ID/type/time | collect | visible | visible | operational/audit |
| Approximate locality/geohash | collect | coarse only | visible by scope | operational |
| Precise coordinates | optional | never | need-to-know only | shortest practical |
| Name/contact | optional | never | authorized workflow only | shortest practical |
| Medical/free-text need | minimized | category only | only when response requires | shortest practical |
| Resource status/capacity | collect | policy-controlled aggregate | visible by scope | operational |
| Signature/key ID | collect | not generally shown | diagnostic/audit view | security lifecycle |
| Relay IDs/path | collect minimally | aggregate only | trusted operational view | audit-limited |

## Consent, notice, and emergency exception

The product must explain, in plain language and where feasible before submission, what an SOS shares and the distinction between local save, nearby relay, and responder sync. Emergency use does not justify collecting every possible field. Where an immediate life-safety flow requires a minimal event without formal consent, capture only the necessary data, record the legal/policy basis approved by the deploying authority, and present notice as soon as it is safe to do so. This is an engineering baseline, not legal advice; production deployment needs jurisdiction-specific review.

## Access-control model

Access uses least privilege and incident/region scope. A responder sees only active incidents and fields needed for their role. A volunteer can manage their own resource entry but not browse personal SOS content. Operators can administer incident boundaries but require audited elevation for sensitive content. Support/debug personnel use redacted diagnostics by default. All sensitive reads and exports receive an audit event containing actor, role, scope, purpose, time, and request ID.

## Retention and deletion policy placeholder

Production retention values cannot be invented in a hackathon document. Before deployment, an accountable authority must set event, contact, health, location, security-log, and backup retention schedules. The technical design must support: expiry rules by field class; legal hold where authorized; deletion/redaction requests; backup expiration; and retention-policy version on each record. A demo uses synthetic data only and resets it after presentation.

## Threat model summary

| Threat | Example | Primary control |
| --- | --- | --- |
| Spoofed report | attacker creates an event as a trusted bridge | signature verification and key lifecycle |
| Replay | valid event resent repeatedly | event ID, TTL, idempotency, duplicate cache |
| Traffic flood | peer sends huge/rapid messages | size/type limits, quota, priority scheduler |
| Sensitive exposure | exact victim location appears in public UI | field separation, role scope, precision reduction |
| Silent tampering | bridge modifies a report | end-to-end signature and immutable evidence |
| Insider overreach | operator browses unrelated incidents | incident scope, audit, privileged-access review |
| Third-party overcollection | AI/map provider sees raw SOS content | data minimization and explicit boundary adapters |

## Privacy acceptance checklist

- [ ] Every field has a documented purpose, classification, access scope, and retention rule or explicit pending-policy note.
- [ ] Synthetic fixtures contain no real people, phone numbers, home locations, or copied emergency reports.
- [ ] Public and responder views demonstrate different precision/access behavior.
- [ ] Logs and error reports exclude raw sensitive content by default.
- [ ] Export endpoints validate schema and do not bypass authorization.
- [ ] Key, role, and data-access events create an auditable record.
