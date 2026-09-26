# Contribution and Integration Guide

## Working agreement

The team optimizes for one integrated emergency workflow, not six isolated features. Every change must state the user outcome, touched contract, owner, verification level, and rollback consequence. Small reversible decisions can be made locally; changes to envelopes, trust policy, persistence, auth, or public state need documented review.

## Ownership lanes

| Lane | Primary responsibility | Must coordinate with |
| --- | --- | --- |
| Architecture and integration | decisions, boundaries, release assembly | every lane |
| Mesh networking | adapters, relay semantics, bridge state | client, API, reliability |
| Backend and data | event ingestion, projections, spatial/resource data | API, trust, operations |
| AI and intelligence | optional extraction, evaluation, fallbacks | privacy, responder UX |
| Security and reliability | keys, limits, failure tests, observability | every writer/reader |
| QA and demo | fixtures, evidence, accessibility, repeatability | every feature owner |

## Branch and pull request rules

- Branch naming: `lane/short-task`, for example `mesh/relay-dedupe`.
- One change should serve one outcome; do not combine dependency upgrades, broad formatting, and feature work.
- A pull request includes: summary, linked requirement IDs, contract impact, test status, screenshots or logs for visible behavior, known limits, and rollback note.
- Never merge secrets, real survivor data, private locations, or unreviewed generated dependencies.
- Resolve contract conflicts before implementation proceeds; avoid parallel edits to the same shared client/API primitive.

## Definition of done

### Feature complete

- Requirement and acceptance criteria are identified.
- Loading, empty, success, error, retry, and degraded states are designed where applicable.
- API/data/event behavior is typed and documented.
- Accessibility labels, keyboard behavior, and status wording are included.
- Relevant security/privacy impact is reviewed.

### Verified

- Automated/unit checks appropriate to risk pass.
- Integration checkpoint evidence is recorded.
- No unmeasured performance or availability claim was added.
- Demo fixture and recovery path are updated if user-visible behavior changed.

## Contract-change protocol

1. Propose the change in `11_DECISIONS.md` if cross-cutting.
2. Update `05_API_CONTRACT.md` and event examples before implementation.
3. Provide backwards-compatible reader support or a migration plan.
4. Add fixture coverage for old/new behavior and malformed input.
5. Update requirements traceability and demo evidence.

## Commit and review checklist

- [ ] Scope is deliberate and linked to requirement IDs.
- [ ] Event/API schemas remain compatible or include a migration.
- [ ] Sensitive data is not in fixtures, logs, or screenshots.
- [ ] Failure and offline behavior are covered.
- [ ] User-facing copy distinguishes local, relay, and server-confirmed state.
- [ ] Accessibility and responsive behavior are reviewed.
- [ ] Documentation and demo script remain accurate.

