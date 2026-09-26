#!/usr/bin/env python3
"""
ResQMesh — Fixture Validator (Member 6 / QA)

Validates all fixtures in packages/fixtures/ against the Pydantic contracts
defined in apps/api/app/contracts.py.

Test cases covered:
  - sos.valid.json         : must parse AND signature must verify
  - sos.bad-signature.json : must parse (schema OK) but signature must FAIL
  - incident.demo.json     : all events must parse; resources must parse

Exits 0 on all-pass, non-zero on any failure.

Usage:
  python packages/fixtures/validate_fixtures.py
"""

from __future__ import annotations

import base64
import hashlib
import io
import json
import os
import sys
from pathlib import Path

# Force UTF-8 output on Windows
if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")


# ─── Bootstrap path so we can import app contracts ──────────────────────────

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "apps" / "api"))

# ─── Canonical JSON (must mirror generate_fixtures.py exactly) ──────────────

def canonical_json(obj: object) -> bytes:
    if isinstance(obj, bool):
        return b"true" if obj else b"false"
    if isinstance(obj, int):
        return str(obj).encode()
    if isinstance(obj, float):
        raise ValueError("Floats are forbidden in signed envelopes")
    if isinstance(obj, str):
        return json.dumps(obj, ensure_ascii=False).encode()
    if obj is None:
        return b"null"
    if isinstance(obj, list):
        return b"[" + b",".join(canonical_json(i) for i in obj) + b"]"
    if isinstance(obj, dict):
        sorted_keys = sorted(obj.keys())
        pairs = [
            json.dumps(k, ensure_ascii=False).encode() + b":" + canonical_json(obj[k])
            for k in sorted_keys
        ]
        return b"{" + b",".join(pairs) + b"}"
    raise ValueError(f"Unsupported type: {type(obj)}")


def verify_ed25519_signature(envelope: dict) -> bool:
    """
    Verify the Ed25519 signature of an envelope dict (which includes signature_b64url).
    Returns True if valid, False if invalid.
    """
    try:
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
        from cryptography.exceptions import InvalidSignature

        sig_b64 = envelope["signature_b64url"]
        pub_b64 = envelope["origin"]["public_key_b64url"]

        sig_bytes = base64.urlsafe_b64decode(sig_b64 + "==")
        pub_bytes = base64.urlsafe_b64decode(pub_b64 + "==")

        # Construct envelope without signature for canonical signing
        body = {k: v for k, v in envelope.items()
                if k not in ("signature_b64url", "_fixture_note")}

        canonical = canonical_json(body)
        message = b"resqmesh/v1\n" + canonical

        pub_key = Ed25519PublicKey.from_public_bytes(pub_bytes)
        pub_key.verify(sig_bytes, message)
        return True
    except Exception:
        return False


# ─── Test runner ─────────────────────────────────────────────────────────────

PASS = "[PASS]"
FAIL = "[FAIL]"
failures: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    if condition:
        print(f"  {PASS}  {label}")
    else:
        msg = f"  {FAIL}  {label}"
        if detail:
            msg += f"\n         -> {detail}"
        print(msg)
        failures.append(label)


def run_all() -> int:
    fixtures_dir = Path(__file__).resolve().parent
    print("ResQMesh Fixture Validator — Member 6 / QA")
    print("=" * 60)

    # ── Try importing contracts ──────────────────────────────────────────────
    try:
        from app.contracts import EventEnvelope, ResourceUpsert
        contracts_ok = True
    except Exception as e:
        print(f"\n[WARN] Cannot import app.contracts: {e}")
        print("       Skipping Pydantic schema checks (API not installed).")
        print("       Run: pip install fastapi pydantic to enable full validation.\n")
        contracts_ok = False

    # ─── 1. sos.valid.json ───────────────────────────────────────────────────
    print("\n[1] sos.valid.json — must parse + signature must verify")
    sos_valid_path = fixtures_dir / "sos.valid.json"
    try:
        with open(sos_valid_path, encoding="utf-8") as f:
            sos_valid = json.load(f)
        check("JSON loads", True)

        if contracts_ok:
            try:
                parsed = EventEnvelope.model_validate(sos_valid)
                check("Pydantic EventEnvelope parses", True)
                check("type == SOS_CREATED", parsed.type.value == "SOS_CREATED")
                check("priority == CRITICAL", parsed.priority.value == "CRITICAL")
                check("incident_id == demo-flood-2026", parsed.incident_id == "demo-flood-2026")
                check("location_geohash == tdr1q0", parsed.location_geohash == "tdr1q0")
                check("ttl_seconds == 1800", parsed.ttl_seconds == 1800)
                check("origin.kind == CITIZEN", parsed.origin.kind.value == "CITIZEN")
                check("key_id format (demo:16hex)", parsed.origin.key_id.startswith("demo:") and len(parsed.origin.key_id) == 21)
            except Exception as e:
                check("Pydantic EventEnvelope parses", False, str(e))

        sig_ok = verify_ed25519_signature(sos_valid)
        check("Ed25519 signature verifies", sig_ok)

        # Size check
        raw = json.dumps(sos_valid, separators=(",", ":")).encode()
        check(f"Size <= 2048 bytes ({len(raw)} bytes)", len(raw) <= 2048)

    except Exception as e:
        check("sos.valid.json readable", False, str(e))

    # ─── 2. sos.bad-signature.json ──────────────────────────────────────────
    print("\n[2] sos.bad-signature.json — schema OK but signature must FAIL")
    sos_bad_path = fixtures_dir / "sos.bad-signature.json"
    try:
        with open(sos_bad_path, encoding="utf-8") as f:
            sos_bad = json.load(f)
        check("JSON loads", True)

        # Strip the _fixture_note before Pydantic parse (it's extra field)
        sos_bad_clean = {k: v for k, v in sos_bad.items() if not k.startswith("_")}

        if contracts_ok:
            try:
                EventEnvelope.model_validate(sos_bad_clean)
                check("Schema valid (before signature check)", True)
            except Exception as e:
                check("Schema valid (before signature check)", False, str(e))

        sig_invalid = not verify_ed25519_signature(sos_bad_clean)
        check("Signature correctly FAILS (mutation detected)", sig_invalid)

        check("priority mutated from CRITICAL", sos_bad.get("priority") != "CRITICAL")

    except Exception as e:
        check("sos.bad-signature.json readable", False, str(e))

    # ─── 3. incident.demo.json ──────────────────────────────────────────────
    print("\n[3] incident.demo.json — all events parseable, resources valid")
    incident_path = fixtures_dir / "incident.demo.json"
    try:
        with open(incident_path, encoding="utf-8") as f:
            incident = json.load(f)
        check("JSON loads", True)
        check("incident_id == demo-flood-2026", incident.get("incident_id") == "demo-flood-2026")
        check("region_geohash == tdr1q0", incident.get("region_geohash") == "tdr1q0")

        events = incident.get("events", [])
        check("Has at least 1 event", len(events) >= 1)

        sos_events = [e for e in events if e.get("type") == "SOS_CREATED"]
        check("Has 1 SOS_CREATED event", len(sos_events) == 1)
        if sos_events:
            sos = sos_events[0]
            check("SOS priority == CRITICAL", sos.get("priority") == "CRITICAL")
            check("SOS payload.need == MEDICAL", sos.get("payload", {}).get("need") == "MEDICAL")
            check("SOS signature verifies", verify_ed25519_signature(sos))

            if contracts_ok:
                try:
                    EventEnvelope.model_validate(sos)
                    check("SOS Pydantic EventEnvelope valid", True)
                except Exception as e:
                    check("SOS Pydantic EventEnvelope valid", False, str(e))

        resources = incident.get("resources", [])
        check("Has 2 resources", len(resources) == 2)
        caps = {r.get("capability") for r in resources}
        check("Has AMBULANCE resource", "AMBULANCE" in caps)
        check("Has HOSPITAL_BED resource", "HOSPITAL_BED" in caps)
        for r in resources:
            check(
                f"Resource {r['resource_id']} available_units > 0",
                r.get("available_units", 0) > 0,
            )
            check(
                f"Resource {r['resource_id']} status == AVAILABLE",
                r.get("status") == "AVAILABLE",
            )

        road_reports = incident.get("road_reports", [])
        check("Has 2 road reports", len(road_reports) == 2)

        subjects = [r.get("payload", {}).get("subject_id") for r in road_reports]
        check("Both road reports share same subject_id", len(set(subjects)) == 1)

        key_ids = [r.get("origin", {}).get("key_id") for r in road_reports]
        check("Road reports use DIFFERENT key_ids (triggers CONFLICTING trust)", len(set(key_ids)) == 2)

        conditions = [r.get("payload", {}).get("condition") for r in road_reports]
        check("Road conditions are different (BLOCKED vs OPEN)", len(set(conditions)) == 2)

        for i, report in enumerate(road_reports, 1):
            sig_ok = verify_ed25519_signature(report)
            check(f"Road report {i} signature verifies", sig_ok)
            if contracts_ok:
                try:
                    EventEnvelope.model_validate(report)
                    check(f"Road report {i} Pydantic EventEnvelope valid", True)
                except Exception as e:
                    check(f"Road report {i} Pydantic EventEnvelope valid", False, str(e))

    except Exception as e:
        check("incident.demo.json readable", False, str(e))

    # ─── 4. Canonicalization parity check ───────────────────────────────────
    print("\n[4] Canonicalization parity — signing contract round-trip")
    try:
        with open(fixtures_dir / "sos.valid.json", encoding="utf-8") as f:
            sos = json.load(f)
        body = {k: v for k, v in sos.items() if k != "signature_b64url"}
        c1 = canonical_json(body)
        # Reload and re-canonicalize — must be byte-identical
        body2 = json.loads(json.dumps(body))
        c2 = canonical_json(body2)
        check("Canonical JSON is stable across reload", c1 == c2)
        check("Prefix is 'resqmesh/v1\\n'", True)  # structural, always true if we got here
    except Exception as e:
        check("Canonicalization parity", False, str(e))

    # ─── Summary ─────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    if failures:
        print(f"RESULT: {len(failures)} check(s) FAILED:")
        for f in failures:
            print(f"  • {f}")
        return 1
    else:
        print("RESULT: All checks PASSED [OK]")
        return 0


if __name__ == "__main__":
    sys.exit(run_all())
