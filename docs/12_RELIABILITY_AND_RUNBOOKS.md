# Reliability and Operational Runbooks

## Reliability posture

ResQMesh must fail in ways that preserve a person's ability to record and relay a need. The system is intentionally degraded by capability: local capture first, local relay second, bridge synchronization third, central enrichment last. A server, map, or AI outage must not erase a durable SOS.

## Service indicators

| Indicator | Meaning | Safe user-facing wording |
| --- | --- | --- |
| Local persistence healthy | The device queue accepted the event. | "Saved on this device" |
| Peer relay available | A nearby relay path is available. | "Ready to share with nearby devices" |
| Bridge receipt | A bridge acknowledged durable receipt. | "Received by a relay bridge" |
| Regional sync | Regional service accepted the event. | "Synced to responders" |
| Trust evidence incomplete | The report lacks sufficient corroboration. | "Report needs confirmation" |

Never collapse these states into a generic green "sent" label.

## Runbook: SOS cannot be saved locally

**Signals:** IndexedDB write fails, quota exception, or schema migration error.

**Immediate action:** Keep the entered data in memory, show a plain-language warning, offer copy/share of a compact emergency message, and retry after asking the user to free space only where appropriate. Do not imply relay is active.

**Operator action:** collect anonymized error code, client version, free-storage category, and migration version. Stop rollout if failures cluster after a release.

**Exit condition:** a test event persists after reload or an alternate emergency handoff is explicitly completed.

## Runbook: relay loop or duplicate storm

**Signals:** repeated receipt of same `event_id`, exponential queue growth, repeated peer reconnects, or high duplicate ratio.

**Immediate action:** enforce duplicate cache, TTL, per-peer quota, randomized retry, and priority scheduling. Preserve the first event and audit duplicate receipts. Do not delete unrelated critical messages to free space.

**Operator action:** inspect adapter version, peer IDs, TTL distribution, and queue age. Disable a bad bridge or adapter version by capability flag if needed.

**Exit condition:** duplicate rate returns to expected baseline and high-priority queues drain.

## Runbook: bridge or regional API unavailable

**Signals:** connection timeout, DNS/TLS failure, 5xx response, circuit breaker open, or failed acknowledgement.

**Immediate action:** retain local/bridge queue, show `RETRY_PENDING`, and retry with capped exponential backoff plus jitter. Do not spin a request loop or discard expired evidence without recording expiry.

**Operator action:** inspect regional status, queue depth, ingestion latency, error codes, and region partition. Shift traffic only through an approved failover path.

**Exit condition:** idempotent submission receives an acknowledgement; the original event must appear once in the responder projection.

## Runbook: suspicious signature or malformed payload

**Signals:** signature failure, unknown key, invalid schema, oversize payload, replay anomaly, invalid CAP, or malformed GeoJSON.

**Immediate action:** quarantine the envelope with minimal metadata, reject it from operational projections, and return a non-sensitive error. Never expose a raw malicious payload in a responder dashboard.

**Operator action:** correlate source/bridge identifiers, policy version, and error class. Rotate or revoke keys only through an audited procedure.

**Exit condition:** valid signed events continue, and quarantine is reviewed or expired under retention policy.

## Runbook: conflicting road or capacity reports

**Signals:** two valid reports disagree, source freshness differs, or the selected route crosses an unconfirmed hazard.

**Immediate action:** retain both observations, mark the read model as conflicting, show timestamps and sources, and avoid automated dispatch/routing through the disputed condition.

**Operator action:** request corroboration from authorized sources; attach the decision event explaining any override.

**Exit condition:** the conflict is resolved by a new, attributable event or remains visibly unresolved.

## Release and rollback

1. Validate schema compatibility and event-envelope version support.
2. Deploy read-path changes before writers that emit a new field.
3. Enable new client behavior behind a capability flag.
4. Exercise offline save, duplicate relay, bridge retry, and malformed event checks.
5. Roll back UI/service code independently; never roll back by deleting immutable events.
6. Document incident, impact, remediation, and follow-up test in the decision log and risk register.

## Observability requirements

Capture structured, privacy-minimized metrics for local-save success, relay attempts, duplicate suppression, queue age, bridge acknowledgements, sync latency, projection lag, schema rejection, trust conflicts, and assignment lifecycle. Attach `request_id`, event schema version, region bucket, and software version. Do not log plaintext personal data, exact public location, secrets, or private message content.
