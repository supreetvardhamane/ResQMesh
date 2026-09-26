# ResQMesh — Ownership Map & Dependency Graph

> This document is owned by **Member 1 (Architecture & Integration Lead)**.
> Updated at each checkpoint.

---

## Folder Ownership

| Path | Owner | Purpose |
|------|-------|---------|
| `docs/` | Member 1 | Architecture docs, decisions, traceability |
| `packages/contracts/types.ts` | Member 1 | Canonical TypeScript types — DO NOT duplicate |
| `packages/fixtures/` | Member 1 + Member 6 | Shared demo data — single source |
| `apps/api/app/contracts.py` | Member 1 | Canonical Python types — DO NOT duplicate |
| `apps/api/app/main.py` | Member 4 | FastAPI entry point |
| `apps/api/app/routes/` | Member 4 | API route handlers |
| `apps/api/app/services/` | Member 4 | Business logic services |
| `apps/api/app/db/` | Member 4 | Database models, migrations |
| `apps/web/src/features/sos/` | Member 2 | SOS form, submission |
| `apps/web/src/features/relay/` | Member 2 | Network status bar |
| `apps/web/src/features/responder/` | Member 2 | Responder console UI |
| `apps/web/src/features/resources/` | Member 2 | Resource match display |
| `apps/web/src/lib/contracts/` | Member 2 | Client-side contract imports |
| `apps/web/src/lib/storage/` | Member 2 | IndexedDB queue |
| `apps/web/src/lib/crypto/` | Member 5 | Ed25519 TS signing helper |
| `apps/web/src/lib/relay/` | Member 3 | WebSocket relay adapter |
| `infra/compose.yaml` | Member 1 | Docker Compose (PostgreSQL 16) |

---

## Dependency Graph

```
Member 1 (Contracts & Types)
    ├──► Member 2 (Frontend PWA)
    │       ◄── Member 5 (Ed25519 TS helper)
    │       ◄── Member 3 (Relay adapter interface)
    │       ◄── Member 4 (API endpoints live)
    │       ◄── Member 6 (Fixture files)
    ├──► Member 3 (Mesh / Relay)
    │       ◄── Member 6 (Fixture files)
    ├──► Member 4 (Backend API)
    │       ◄── Member 5 (Python verifier)
    │       ◄── Member 6 (Fixture files)
    ├──► Member 5 (Security Helpers)
    │       ◄── Member 4 (DB schema)
    └──► Member 6 (Fixtures & QA)
```

---

## Integration Checkpoints

| Checkpoint | Hour | Gate | Status |
|-----------|------|------|--------|
| CP1 — Contract crossing | 3 | Event fixture traverses client → relay → API validator | ⬜ PENDING |
| CP2 — Vertical slice | 5 | Full offline-to-bridge path works end-to-end | ⬜ PENDING |
| CP3 — Integrated product | 9 | All P0 features use real integrated behavior | ⬜ PENDING |
| CP4 — Verification complete | 11:30 | Evidence captured, demo script passes ×2 | ⬜ PENDING |

---

## Shared Contracts — Change Rules

1. **No one** creates a second event schema, API client, or delivery-state enum.
2. Changes to `packages/contracts/types.ts` or `apps/api/app/contracts.py` require Member 1 review.
3. Any enum/field/limit change updates: this doc + `05_API_CONTRACT.md` + `11_DECISIONS.md` + relevant test.
4. Fixture files in `packages/fixtures/` are the only shared demo-data source.

---

## Frozen Fixture IDs

- `incident_id`: `demo-flood-2026`
- `geohash`: `tdr1q0`
- Region bucket (first 4 chars): `tdr1`
