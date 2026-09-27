# Contributing to ResQMesh

Thank you for your interest in ResQMesh! This guide covers how to set up the development environment and contribute effectively.

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| Python | 3.12+ | For the FastAPI backend |
| Node.js | 20+ LTS | For the React PWA |
| Docker | 24+ | For local PostgreSQL |
| Git | 2.40+ | |

## Quick Start (Local Dev)

```bash
# 1. Clone the repo
git clone https://github.com/supreetvardhamane/ResQMesh.git
cd ResQMesh

# 2. Copy environment template and configure
cp .env.example .env
# Edit .env if needed (defaults work with the Docker Compose stack)

# 3. Start PostgreSQL
docker compose -f infra/compose.yaml up -d

# 4. Set up Python backend
cd apps/api
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# 5. Seed the demo data
cd ../..
python seed_now.py

# 6. Run the API server
cd apps/api
uvicorn app.main:app --reload --port 8000

# 7. In a new terminal, set up and run the frontend
cd apps/web
npm install
npm run dev
```

The app will be available at `http://localhost:5173`.

## Project Structure

```
ResQMesh/
├── apps/
│   ├── api/          # FastAPI backend (Python 3.12)
│   │   ├── app/
│   │   │   ├── config.py       # Typed config loader
│   │   │   ├── contracts.py    # Canonical Python types
│   │   │   ├── db/             # SQLAlchemy models + seed
│   │   │   ├── middleware.py   # Rate limiting + size enforcement
│   │   │   ├── observability.py# Structured logging
│   │   │   ├── routes/         # FastAPI route handlers
│   │   │   ├── security.py     # Ed25519 verification
│   │   │   └── services/       # Business logic
│   │   └── requirements.txt    # Pinned dependencies
│   └── web/          # React 18 PWA (TypeScript + Vite)
│       └── src/
│           ├── features/       # SOS form, relay, responder, resources
│           └── lib/            # Crypto, relay, storage
├── docs/             # Architecture and design documentation
├── infra/
│   └── compose.yaml  # Local PostgreSQL 16 via Docker
├── packages/
│   ├── contracts/    # Shared TypeScript types
│   └── fixtures/     # Deterministic test data + QA scripts
├── .env.example      # Environment variable template
├── SECURITY.md       # Security policy and design notes
└── seed_now.py       # Database seed helper
```

## Branch Naming

| Prefix | Purpose |
|--------|---------|
| `feat/` | New feature |
| `fix/` | Bug fix |
| `chore/` | Tooling, deps, CI |
| `docs/` | Documentation only |
| `security/` | Security hardening |

## Code Standards

- **Python**: Follow PEP 8. Type-annotate all public functions. No bare `except`.
- **TypeScript**: Strict mode is on (`tsconfig.json`). No `any` without a `// TODO` comment.
- **Commits**: Use [Conventional Commits](https://www.conventionalcommits.org/) — `type: description`.
- **No floating-point in event envelopes** — the Ed25519 canonical-JSON spec forbids floats (see `docs/16_BUILD_CONTRACT.md`).

## Running Tests

```bash
# Python tests
cd apps/api
pytest apps/api/tests/ -v

# TypeScript type-check
cd apps/web
npm run typecheck

# Fixture validation
python packages/fixtures/validate_fixtures.py
```

## Architecture Decisions

See [`docs/11_DECISIONS.md`](docs/11_DECISIONS.md) for the full log of architecture decisions and their rationale.

## Key Documentation

- [`docs/02_MASTER_SPEC.md`](docs/02_MASTER_SPEC.md) — Product requirements
- [`docs/16_BUILD_CONTRACT.md`](docs/16_BUILD_CONTRACT.md) — Frozen implementation contract (enums, limits, wire format)
- [`docs/05_API_CONTRACT.md`](docs/05_API_CONTRACT.md) — REST API reference
- [`SECURITY.md`](SECURITY.md) — Security policy and vulnerability reporting
