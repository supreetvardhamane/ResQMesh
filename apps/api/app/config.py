"""
ResQMesh — Typed Configuration Validator

Validates environment configuration at startup and fails safely.
Per: docs/02_MASTER_SPEC.md §Configuration policy
Per: docs/16_BUILD_CONTRACT.md §Fixed stack and layout
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path


def _load_dotenv() -> None:
    """Load .env from repo root if present (no external dependency needed)."""
    env_path = Path(__file__).resolve().parents[3] / ".env"
    if not env_path.exists():
        return
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip()
            if key and key not in os.environ:
                os.environ[key] = value


_load_dotenv()


@dataclass(frozen=True)
class AppConfig:
    """Typed, validated application configuration."""

    # Database
    database_url: str = field(default="")
    database_pool_size: int = 5
    database_max_overflow: int = 10

    # API
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    api_cors_origins: list[str] = field(default_factory=lambda: ["*"])

    # Feature flags
    enable_signature_verification: bool = True
    enable_rate_limiting: bool = True

    # Demo
    demo_incident_id: str = "demo-flood-2026"

    def validate(self) -> list[str]:
        """
        Validate configuration and return a list of errors.
        Empty list means valid.
        """
        errors: list[str] = []

        if not self.database_url:
            errors.append("DATABASE_URL is required")

        if self.database_pool_size < 1:
            errors.append("DATABASE_POOL_SIZE must be >= 1")

        if self.database_max_overflow < 0:
            errors.append("DATABASE_MAX_OVERFLOW must be >= 0")

        if self.api_port < 1 or self.api_port > 65535:
            errors.append("API_PORT must be between 1 and 65535")

        # Safety: reject config that looks like it contains raw credentials
        if "password" in self.database_url.lower() and "@" not in self.database_url:
            errors.append(
                "DATABASE_URL appears to contain a password without a host. "
                "Use the standard postgresql://user:pass@host/db format."
            )

        return errors


def load_config() -> AppConfig:
    """
    Load configuration from environment variables.
    Fails safely at startup if required config is missing.
    """
    # LOCAL_DEV_ONLY default — matches infra/compose.yaml and .env.example.
    # In any internet-facing deployment, set DATABASE_URL via environment variable
    # or a secrets manager and never rely on this fallback.
    db_url = os.environ.get(
        "DATABASE_URL",
        "postgresql+psycopg://resqmesh:resqmesh_dev@localhost:5432/resqmesh",  # noqa: S105 local-dev-only
    )

    config = AppConfig(
        database_url=db_url,
        database_pool_size=int(os.environ.get("DATABASE_POOL_SIZE", "5")),
        database_max_overflow=int(os.environ.get("DATABASE_MAX_OVERFLOW", "10")),
        api_host=os.environ.get("API_HOST", "0.0.0.0"),
        api_port=int(os.environ.get("API_PORT", "8000")),
        api_cors_origins=os.environ.get("API_CORS_ORIGINS", "*").split(","),
        enable_signature_verification=os.environ.get(
            "ENABLE_SIGNATURE_VERIFICATION", "true"
        ).lower() == "true",
        enable_rate_limiting=os.environ.get(
            "ENABLE_RATE_LIMITING", "true"
        ).lower() == "true",
        demo_incident_id=os.environ.get("DEMO_INCIDENT_ID", "demo-flood-2026"),
    )

    errors = config.validate()
    if errors:
        raise SystemExit(
            f"Configuration validation failed:\n"
            + "\n".join(f"  - {e}" for e in errors)
        )

    return config
