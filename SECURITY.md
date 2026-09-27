# Security Policy

## Supported Versions

ResQMesh is a hackathon prototype and is **not intended for production use** without further hardening. The `main` branch reflects the demo-ready submission state.

| Version | Supported |
|---------|-----------|
| `main`  | ✅ Active development |

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do not** open a public GitHub issue for security-sensitive findings.
2. Email the team lead at the address on file, or open a **private GitHub security advisory** (Repository → Security → Advisories → New draft).
3. Include a description of the vulnerability, steps to reproduce, and potential impact.
4. We aim to acknowledge reports within **48 hours** and provide a fix or mitigation plan within **7 days**.

## Security Design Notes

ResQMesh is designed with the following security properties:

### Cryptographic Identity
- All SOS event envelopes are signed with **Ed25519** private keys generated locally on the user's device.
- The signing key never leaves the device — only the public key is transmitted.
- Citizen-origin events are labelled `UNVERIFIED` (integrity proven, identity not verified). Responder events use a separate trust path.

### Secrets Management
- **No production secrets are stored in this repository.**
- `infra/compose.yaml` and `.env.example` use **local-dev-only** placeholder credentials (`resqmesh_dev`). These must be replaced before any internet-facing deployment.
- All sensitive configuration is loaded from environment variables. See `.env.example` for the full variable set.

### Test Key Disclosure
- `packages/fixtures/test_key.json` contains a **test-only public key** used for fixture verification. It is safe to commit because it is public (Ed25519 public keys carry no secret material).
- The corresponding private key is derived deterministically from a hashed test seed inside `packages/fixtures/generate_fixtures.py` and is **never stored** in any file in this repository.
- These keys must **never** be used in a deployed environment.

### CORS Policy
- The API defaults to `allow_origins=["*"]` for local development convenience. For any internet-facing deployment, set `API_CORS_ORIGINS` to a specific allow-list.

### Rate Limiting
- The API implements per-origin sliding-window rate limiting (60 req/min standard, 120 req/min for `CRITICAL` SOS events).
- This is a first-line defence only; a reverse proxy (nginx/Caddy) should enforce additional limits in production.

### Known Limitations (Prototype Scope)
- No authentication/authorization layer — all endpoints are open. A production deployment requires an authN/authZ layer.
- The relay protocol uses bounded gossip (max 3 hops, 30-min TTL, 1024-entry dedupe); replay attacks outside TTL windows are rejected, but this is not a substitute for a full PKI.
- SQLite is not supported; PostgreSQL 16 is required for JSONB and ACID guarantees.
