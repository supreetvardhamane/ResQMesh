#!/usr/bin/env python3
"""
ResQMesh — Fixture Generator (Member 6 / QA)

Generates deterministic test Ed25519 key pair and produces:
  - packages/fixtures/sos.valid.json       (valid signed SOS event)
  - packages/fixtures/sos.bad-signature.json (mutated — rejected by verifier)
  - packages/fixtures/test_key.json        (test public key, NOT for deployment)

Rules from 16_BUILD_CONTRACT.md:
  1. Construct envelope WITHOUT signature_b64url
  2. No floats — strings/bools/ints/arrays/objects only
  3. Canonical JSON: sort object keys by Unicode code point, no whitespace
  4. Prefix: b"resqmesh/v1\n"
  5. Sign with Ed25519, output unpadded base64url
  6. key_id = "demo:" + first 16 lowercase hex chars of SHA-256(raw public key)

This script uses a FIXED seed so fixtures are reproducible across runs.
The private key MUST NEVER leave test environments.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import sys


def _install_if_missing() -> None:
    """Install cryptography package if not available."""
    try:
        import cryptography  # noqa: F401
    except ImportError:
        import subprocess
        subprocess.check_call([sys.executable, "-m", "pip", "install", "cryptography>=43.0.0"])


_install_if_missing()

from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
)


# ─── Canonical JSON ─────────────────────────────────────────────────────────

def canonical_json(obj: object) -> bytes:
    """
    Recursively sort object keys by Unicode code point and produce
    compact (no whitespace) JSON bytes. Arrays preserve order.
    Floats are rejected as per the build contract.
    """
    if isinstance(obj, bool):
        return b"true" if obj else b"false"
    if isinstance(obj, int):
        return str(obj).encode()
    if isinstance(obj, float):
        raise ValueError("Floats are forbidden in signed envelopes (16_BUILD_CONTRACT.md §2)")
    if isinstance(obj, str):
        return json.dumps(obj, ensure_ascii=False).encode()
    if obj is None:
        return b"null"
    if isinstance(obj, list):
        parts = [canonical_json(item) for item in obj]
        return b"[" + b",".join(parts) + b"]"
    if isinstance(obj, dict):
        sorted_keys = sorted(obj.keys())  # Unicode code point sort
        pairs = [
            json.dumps(k, ensure_ascii=False).encode() + b":" + canonical_json(obj[k])
            for k in sorted_keys
        ]
        return b"{" + b",".join(pairs) + b"}"
    raise ValueError(f"Unsupported type: {type(obj)}")


def sign_envelope(envelope_without_sig: dict, private_key: Ed25519PrivateKey) -> str:
    """Sign an envelope dict (without signature_b64url) per the build contract."""
    canonical = canonical_json(envelope_without_sig)
    message = b"resqmesh/v1\n" + canonical
    sig_bytes = private_key.sign(message)
    return base64.urlsafe_b64encode(sig_bytes).rstrip(b"=").decode()


def derive_key_id(raw_public_key_bytes: bytes) -> str:
    """Derive key_id = 'demo:' + first 16 lowercase hex chars of SHA-256(raw public key)."""
    digest = hashlib.sha256(raw_public_key_bytes).hexdigest()
    return f"demo:{digest[:16]}"


def raw_public_key_b64url(private_key: Ed25519PrivateKey) -> str:
    """Return raw 32-byte Ed25519 public key as unpadded base64url."""
    pub = private_key.public_key()
    raw = pub.public_bytes_raw()
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


# ─── Deterministic key from fixed seed ──────────────────────────────────────
# We use a fixed seed so the fixture is reproducible.
# This MUST ONLY be used in test/demo environments.
_FIXED_SEED = bytes.fromhex(
    "resqmesh_test_key_v1_member6_do_not_deploy_outside_test".encode().hex()[:64]
    or "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
)
# Derive a stable 32-byte seed for the private key
_KEY_SEED = hashlib.sha256(b"resqmesh_test_fixture_key_v1_member6").digest()


def generate_test_private_key() -> Ed25519PrivateKey:
    """Generate a deterministic Ed25519 private key from a fixed seed."""
    return Ed25519PrivateKey.from_private_bytes(_KEY_SEED)


# ─── Fixtures ────────────────────────────────────────────────────────────────

def make_sos_valid(private_key: Ed25519PrivateKey) -> dict:
    """Create a valid SOS_CREATED envelope for demo-flood-2026."""
    raw_pub = private_key.public_key().public_bytes_raw()
    key_id = derive_key_id(raw_pub)
    pub_b64 = raw_public_key_b64url(private_key)

    envelope_body = {
        "schema_version": 1,
        "event_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        "type": "SOS_CREATED",
        "incident_id": "demo-flood-2026",
        "created_at": "2026-09-26T10:30:00Z",
        "ttl_seconds": 1800,
        "priority": "CRITICAL",
        "origin": {
            "kind": "CITIZEN",
            "key_id": key_id,
            "public_key_b64url": pub_b64,
        },
        "location_geohash": "tdr1q0",
        "payload": {"need": "MEDICAL"},
    }

    sig = sign_envelope(envelope_body, private_key)
    return {**envelope_body, "signature_b64url": sig}


def make_sos_bad_signature(valid_sos: dict) -> dict:
    """
    Mutate the priority field AFTER signing — the signature will not verify.
    This fixture is used by tests that confirm bad-signature rejection (FR-02).
    """
    bad = dict(valid_sos)
    # Mutate a signed field (priority) — signature now invalid
    bad["priority"] = "NORMAL"  # was CRITICAL
    bad["_fixture_note"] = (
        "REJECTED fixture: priority mutated after signing. "
        "Verifier must return SIGNATURE_INVALID (422)."
    )
    return bad


def make_road_report(
    event_id: str,
    subject_id: str,
    condition: str,
    key_id: str,
    pub_b64: str,
    created_at: str,
    private_key: Ed25519PrivateKey,
) -> dict:
    """Create a signed ROAD_REPORTED event."""
    body = {
        "schema_version": 1,
        "event_id": event_id,
        "type": "ROAD_REPORTED",
        "incident_id": "demo-flood-2026",
        "created_at": created_at,
        "ttl_seconds": 1800,
        "priority": "HIGH",
        "origin": {
            "kind": "CITIZEN",
            "key_id": key_id,
            "public_key_b64url": pub_b64,
        },
        "location_geohash": "tdr1q0",
        "payload": {
            "subject_id": subject_id,
            "condition": condition,
            "observed_at": created_at,
        },
    }
    sig = sign_envelope(body, private_key)
    return {**body, "signature_b64url": sig}


def make_incident_demo(
    primary_key: Ed25519PrivateKey,
    key2_seed: bytes,
) -> dict:
    """
    Build incident.demo.json with:
    - incident_id = demo-flood-2026, geohash tdr1q0
    - One CRITICAL medical SOS (signed by primary_key)
    - One ambulance resource (AVAILABLE, 2 units)
    - One hospital_bed resource (AVAILABLE, 5 units)
    - Two conflicting road reports (same subject, different conditions,
      different origin.key_id values — triggers CONFLICTING trust state)
    """
    raw_pub1 = primary_key.public_key().public_bytes_raw()
    key_id1 = derive_key_id(raw_pub1)
    pub_b64_1 = raw_public_key_b64url(primary_key)

    key2 = Ed25519PrivateKey.from_private_bytes(key2_seed)
    raw_pub2 = key2.public_key().public_bytes_raw()
    key_id2 = derive_key_id(raw_pub2)
    pub_b64_2 = raw_public_key_b64url(key2)

    sos_body = {
        "schema_version": 1,
        "event_id": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
        "type": "SOS_CREATED",
        "incident_id": "demo-flood-2026",
        "created_at": "2026-09-26T10:30:00Z",
        "ttl_seconds": 1800,
        "priority": "CRITICAL",
        "origin": {
            "kind": "CITIZEN",
            "key_id": key_id1,
            "public_key_b64url": pub_b64_1,
        },
        "location_geohash": "tdr1q0",
        "payload": {"need": "MEDICAL"},
    }
    sos_sig = sign_envelope(sos_body, primary_key)
    sos_event = {**sos_body, "signature_b64url": sos_sig}

    road1 = make_road_report(
        event_id="c0de0001-f100-4a00-b000-000000000001",
        subject_id="road-main-bridge",
        condition="BLOCKED",
        key_id=key_id1,
        pub_b64=pub_b64_1,
        created_at="2026-09-26T10:20:00Z",
        private_key=primary_key,
    )
    road2 = make_road_report(
        event_id="c0de0002-f100-4a00-b000-000000000002",
        subject_id="road-main-bridge",
        condition="OPEN",
        key_id=key_id2,
        pub_b64=pub_b64_2,
        created_at="2026-09-26T10:22:00Z",
        private_key=key2,
    )

    return {
        "incident_id": "demo-flood-2026",
        "region_geohash": "tdr1q0",
        "_fixture_note": (
            "Demo fixture for ResQMesh hackathon. "
            "All keys are test-only. Never deploy in production."
        ),
        "events": [sos_event],
        "resources": [
            {
                "resource_id": "res-ambulance-001",
                "incident_id": "demo-flood-2026",
                "capability": "AMBULANCE",
                "status": "AVAILABLE",
                "region_geohash": "tdr1q0",
                "available_units": 2,
                "observed_at": "2026-09-26T10:25:00Z",
            },
            {
                "resource_id": "res-hospital-001",
                "incident_id": "demo-flood-2026",
                "capability": "HOSPITAL_BED",
                "status": "AVAILABLE",
                "region_geohash": "tdr1q0",
                "available_units": 5,
                "observed_at": "2026-09-26T10:25:00Z",
            },
        ],
        "road_reports": [road1, road2],
    }


# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    fixtures_dir = os.path.dirname(os.path.abspath(__file__))

    print("ResQMesh Fixture Generator — Member 6 / QA")
    print("=" * 60)

    # Primary test key (deterministic)
    primary_key = generate_test_private_key()
    raw_pub = primary_key.public_key().public_bytes_raw()
    key_id = derive_key_id(raw_pub)
    pub_b64 = raw_public_key_b64url(primary_key)

    # Secondary key for conflicting road report
    key2_seed = hashlib.sha256(b"resqmesh_test_fixture_key_v2_conflicting").digest()

    print(f"\n[KEY] Primary key_id : {key_id}")
    print(f"[KEY] Public key     : {pub_b64}")
    print()

    # 1. sos.valid.json
    sos_valid = make_sos_valid(primary_key)
    sos_valid_path = os.path.join(fixtures_dir, "sos.valid.json")
    with open(sos_valid_path, "w", encoding="utf-8") as f:
        json.dump(sos_valid, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"[OK] Written: {sos_valid_path}")

    # Verify canonical round-trip
    envelope_body = {k: v for k, v in sos_valid.items() if k != "signature_b64url"}
    canonical = canonical_json(envelope_body)
    message = b"resqmesh/v1\n" + canonical
    sig_bytes = base64.urlsafe_b64decode(sos_valid["signature_b64url"] + "==")
    primary_key.public_key().verify(sig_bytes, message)
    print("[OK] Signature self-verified (canonical round-trip passed)")

    # 2. sos.bad-signature.json
    sos_bad = make_sos_bad_signature(sos_valid)
    sos_bad_path = os.path.join(fixtures_dir, "sos.bad-signature.json")
    with open(sos_bad_path, "w", encoding="utf-8") as f:
        json.dump(sos_bad, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"[OK] Written: {sos_bad_path}")

    # 3. incident.demo.json
    incident = make_incident_demo(primary_key, key2_seed)
    incident_path = os.path.join(fixtures_dir, "incident.demo.json")
    with open(incident_path, "w", encoding="utf-8") as f:
        json.dump(incident, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"[OK] Written: {incident_path}")

    # 4. test_key.json — public key only, for cross-layer verification tests
    test_key = {
        "_note": "TEST KEY ONLY — forbidden in any deployed environment",
        "key_id": key_id,
        "public_key_b64url": pub_b64,
        "algorithm": "Ed25519",
        "usage": "fixture-verification",
    }
    test_key_path = os.path.join(fixtures_dir, "test_key.json")
    with open(test_key_path, "w", encoding="utf-8") as f:
        json.dump(test_key, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"[OK] Written: {test_key_path}")

    print()
    print("All fixtures generated successfully.")
    print()
    print("Next: run validate_fixtures.py to confirm Pydantic accepts sos.valid.json")
    print("      and rejects sos.bad-signature.json at the signature step.")


if __name__ == "__main__":
    main()
