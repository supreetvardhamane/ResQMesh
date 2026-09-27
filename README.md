<![CDATA[<div align="center">

# 🚨 ResQMesh

### Disconnected-First Disaster Coordination Infrastructure

*When cell towers go dark and the internet fails, ResQMesh keeps survivors connected.*

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Python 3.12](https://img.shields.io/badge/Python-3.12-blue.svg)](https://python.org)
[![React 18](https://img.shields.io/badge/React-18.3-61DAFB.svg)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688.svg)](https://fastapi.tiangolo.com)

</div>

---

## The Problem

When severe floods, cyclones, or earthquakes strike, cell towers lose power within 2 hours and central emergency dashboards go dark — yet millions of survivors hold fully charged smartphones with functional Wi-Fi chips, rendered useless because today's apps demand a live cloud connection.

**ResQMesh bridges this last-mile digital void.**

## What It Does

ResQMesh is a disconnected-first coordination layer that turns civilian devices and emergency vehicles into an **offline store-and-forward mesh network**:

| Capability | How It Works |
|-----------|-------------|
| **Offline SOS** | One-tap SOS signed with Ed25519 locally, persisted in IndexedDB — no internet required |
| **P2P Relay** | Store-and-forward gossip (max 3 hops, 30-min TTL) propagates events to rescue bridges |
| **Resource Discovery** | Community assets (boats, generators, hospital beds) visible without cloud lookup |
| **Trusted Information** | Cryptographic signatures prevent rumour injection; confidence-decay scores flag stale reports |
| **Responder Console** | Evidence-backed operational picture for field responders |

### Architecture at a Glance

```
[ Survivor (No Internet) ]           [ Community Volunteer ]
        │                                      │
  1-Tap Offline SOS                   Registers Capacity
  Ed25519 Local Signature             IndexedDB Local Store
  Stored in IndexedDB                          │
        │                                      │
        └──────────────┬───────────────────────┘
                       │
        ┌──────────────▼──────────────────────┐
        │     OFFLINE LOCAL P2P RELAY         │
        │  Store-and-Forward Bounded Gossip   │
        │  Max 3 Hops · 30-min TTL            │
        │  1024-entry Dedupe · ≤ 3 KB frames  │
        └──────────────┬──────────────────────┘
                       │ Moves hop-by-hop
                       ▼
              [ Rescue Vehicle / Bridge ]
              Stores receipt locally
                       │
               Reaches network boundary
                       ▼
        ┌──────────────────────────────────────┐
        │   CLOUD COORDINATION LAYER           │
        │   FastAPI · PostgreSQL 16            │
        │   Signature verification             │
        │   Resource matching                  │
        │   Assignment projection              │
        └──────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Frontend | React PWA + TypeScript + Vite | React 18.3.1 / Vite 5.4.14 |
| Crypto | Web Crypto API (Ed25519) | Browser-native |
| Local storage | IndexedDB (idb) | — |
| API | FastAPI + Pydantic v2 | 0.115.6 / 2.10.3 |
| Database | PostgreSQL 16 + SQLAlchemy 2 | — |
| Signing | Ed25519 via `cryptography` | 43.0.3 |
| Dev infra | Docker Compose | — |

---

## Quick Start

### Prerequisites
- Python 3.12+, Node.js 20+ LTS, Docker 24+

### 1 — Clone & Configure

```bash
git clone https://github.com/supreetvardhamane/ResQMesh.git
cd ResQMesh
cp .env.example .env          # review defaults; they work as-is for local dev
```

### 2 — Start PostgreSQL

```bash
docker compose -f infra/compose.yaml up -d
```

### 3 — Backend

```bash
cd apps/api
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 4 — Seed Demo Data

```bash
# From repo root, in a new terminal
python seed_now.py
```

### 5 — Frontend

```bash
cd apps/web
npm install
npm run dev              # http://localhost:5173
```

> API docs available at `http://localhost:8000/docs`

---

## Project Structure

```
ResQMesh/
├── apps/
│   ├── api/                  # FastAPI backend
│   │   ├── app/
│   │   │   ├── config.py     # Typed env-var config
│   │   │   ├── contracts.py  # Canonical Python types
│   │   │   ├── db/           # SQLAlchemy models + async engine
│   │   │   ├── middleware.py # Rate limiting + payload size enforcement
│   │   │   ├── observability.py # Privacy-minimised structured logging
│   │   │   ├── routes/       # /v1/events, /v1/resources, /v1/assignments, /v1/sync
│   │   │   ├── security.py   # Ed25519 verification + canonical JSON
│   │   │   └── services/     # Event, resource, assignment, sync services
│   │   └── requirements.txt  # Pinned dependencies
│   └── web/                  # React 18 PWA
│       └── src/
│           ├── features/     # sos · relay · responder · resources
│           └── lib/          # crypto · relay · storage
├── docs/                     # Architecture, API contract, design decisions
├── infra/
│   └── compose.yaml          # Local PostgreSQL 16
├── packages/
│   ├── contracts/            # Shared TypeScript types (single source of truth)
│   └── fixtures/             # Deterministic test data + QA scripts
├── .env.example              # Environment variable template
├── CONTRIBUTING.md           # Developer setup and contribution guide
├── SECURITY.md               # Security policy and design notes
└── seed_now.py               # One-command demo data seed
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/healthz` | Health check |
| `POST` | `/v1/events` | Submit signed SOS / road report envelope |
| `GET` | `/v1/events` | List events for an incident |
| `POST` | `/v1/resources` | Register community resource |
| `GET` | `/v1/resources` | List available resources |
| `POST` | `/v1/assignments` | Create rescue assignment |
| `GET` | `/v1/assignments` | List assignments |
| `POST` | `/v1/sync/pull` | Pull events since a cursor (for bridge sync) |
| `POST` | `/v1/sync/ack` | Acknowledge synced event batch |
| `GET` | `/v1/reports` | Road condition reports |

Full API contract: [`docs/05_API_CONTRACT.md`](docs/05_API_CONTRACT.md)

---

## Security

- All event envelopes are signed with **Ed25519** keys generated on-device; only public keys transit the network.
- Rate limiting: 60 req/min standard · 120 req/min for `CRITICAL` SOS events.
- No plaintext PII in any log entry (privacy-minimised structured logging).
- See [`SECURITY.md`](SECURITY.md) for the full security design and vulnerability reporting process.

---

## Documentation

| Document | Purpose |
|---------|---------|
| [`docs/01_PROBLEM_AND_SCOPE.md`](docs/01_PROBLEM_AND_SCOPE.md) | Problem definition and scope boundaries |
| [`docs/02_MASTER_SPEC.md`](docs/02_MASTER_SPEC.md) | Product requirements |
| [`docs/03_ARCHITECTURE_DESIGN.md`](docs/03_ARCHITECTURE_DESIGN.md) | System architecture |
| [`docs/04_DATA_AND_PRIVACY.md`](docs/04_DATA_AND_PRIVACY.md) | Data model and privacy controls |
| [`docs/05_API_CONTRACT.md`](docs/05_API_CONTRACT.md) | REST API reference |
| [`docs/11_DECISIONS.md`](docs/11_DECISIONS.md) | Architecture decision log |
| [`docs/16_BUILD_CONTRACT.md`](docs/16_BUILD_CONTRACT.md) | Frozen implementation contract (enums, limits, wire format) |
| [`PITCH_DECK_AND_JURY_DEFENSE.md`](PITCH_DECK_AND_JURY_DEFENSE.md) | Jury pitch deck and Q&A guide |

---

## Team

ResQMesh was built in 12 hours by a 6-member team:

| Role | Responsibility |
|------|---------------|
| Architecture & Integration Lead | Contracts, docs, cross-lane integration |
| Frontend / PWA | SOS form, responder console, resource UI |
| Mesh / P2P Networking | WebSocket relay adapter, hop-by-hop gossip |
| Backend / Data | FastAPI routes, services, PostgreSQL schema |
| Security, Reliability & Observability | Ed25519 crypto, rate limiting, structured logging |
| QA, Demo & Accessibility | Fixtures, acceptance tests, evidence register |

---

## License

MIT © 2026 ResQMesh Team
]]>
