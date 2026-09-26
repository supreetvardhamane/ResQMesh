"""
ResQMesh — Ed25519 Python Verifier

Implements the exact same canonicalization and verification logic as the
TypeScript signing helper (apps/web/src/lib/crypto/ed25519.ts).

Used by: apps/api/app/routes (Member 4) to verify incoming signed envelopes.

Contract: docs/16_BUILD_CONTRACT.md §Exact Ed25519 signing rule
Rules:
  1. Construct the envelope without signature_b64url.
  2. Reject floating-point values.
  3. Canonicalize recursively: object keys sort by Unicode code point;
     arrays preserve order; standard JSON escaping; no whitespace.
  4. Prefix UTF-8 canonical JSON with exact ASCII bytes: b"resqmesh/v1\\n"
  5. Verify signature using Ed25519 from the cryptography library.

Citizen events are labelled UNVERIFIED — integrity is proven, identity is not.
SIGNATURE_INVALID and KEY_REVOKED events must NOT enter the projection.
"""

from __future__ import annotations

import base64
import hashlib
import json
import re
from typing import Any

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from .contracts import (
    ApiErrorCode,
    EventEnvelope,
    TrustState,
)

# ─── Constants ──────────────────────────────────────────────────────────────

SIGN_PREFIX = b"resqmesh/v1\n"
KEY_ID_PATTERN = re.compile(r"^demo:[0-9a-f]{16}$")


# ─── Canonical JSON ──────────────────────────────────────────────────────────

def _reject_floats(value: Any, path: str = "") -> None:
    """
    Reject floating-point numbers per the build contract.
    Only strings, booleans, integers, arrays, and objects are allowed.
    """
    if isinstance(value, float):
        raise ValueError(
            f"SIGNATURE_ERROR: Floating-point value not allowed in envelope "
            f"at path '{path}'. Use integers only."
        )
    if isinstance(value, bool):
        return  # bool is a subclass of int in Python — handle before int check
    if isinstance(value, int):
        return
    if isinstance(value, list):
        for i, item in enumerate(value):
            _reject_floats(item, f"{path}[{i}]")
    elif isinstance(value, dict):
        for k, v in value.items():
            child_path = f"{path}.{k}" if path else k
            _reject_floats(v, child_path)


def _canonical_json(value: Any) -> str:
    """
    Recursively canonicalize a value to canonical JSON:
    - Object keys sorted by Unicode code point
    - Arrays preserve order
    - Standard JSON escaping (via json.dumps)
    - No whitespace

    Must match exactly the TypeScript canonicalizeJson() function.
    Per 16_BUILD_CONTRACT.md §Exact Ed25519 signing rule, step 3.
    """
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return json.dumps(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, list):
        parts = [_canonical_json(item) for item in value]
        return "[" + ",".join(parts) + "]"
    if isinstance(value, dict):
        sorted_keys = sorted(value.keys())
        pairs = [
            json.dumps(k, ensure_ascii=False) + ":" + _canonical_json(value[k])
            for k in sorted_keys
        ]
        return "{" + ",".join(pairs) + "}"
    raise TypeError(f"SIGNATURE_ERROR: Unsupported value type: {type(value)}")


def build_signing_bytes(envelope_without_sig: dict[str, Any]) -> bytes:
    """
    Build the canonical signing bytes for an envelope (without signature_b64url).

    Prefix: b"resqmesh/v1\\n" + canonical JSON (UTF-8 bytes).
    Per 16_BUILD_CONTRACT.md §Exact Ed25519 signing rule, steps 1–4.
    """
    _reject_floats(envelope_without_sig)
    canonical = _canonical_json(envelope_without_sig)
    prefixed = SIGN_PREFIX + canonical.encode("utf-8")
    return prefixed


# ─── Base64url helpers ───────────────────────────────────────────────────────

def _from_base64url(b64url: str) -> bytes:
    """Decode unpadded base64url string to bytes."""
    padding = (4 - len(b64url) % 4) % 4
    padded = b64url.replace("-", "+").replace("_", "/") + "=" * padding
    return base64.b64decode(padded)


def _to_base64url(data: bytes) -> str:
    """Encode bytes to unpadded base64url string."""
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


# ─── Key ID derivation ───────────────────────────────────────────────────────

def derive_key_id(raw_public_key: bytes) -> str:
    """
    Derive key_id: "demo:" + first 16 lowercase hex chars of SHA-256(raw public key).
    Per 16_BUILD_CONTRACT.md §Ed25519 signing rule.
    """
    digest = hashlib.sha256(raw_public_key).hexdigest()
    return "demo:" + digest[:16]


# ─── Verification ────────────────────────────────────────────────────────────

class SignatureVerificationResult:
    """Result of signature verification."""

    def __init__(
        self,
        valid: bool,
        trust_state: TrustState,
        error_code: ApiErrorCode | None = None,
        error_message: str | None = None,
    ):
        self.valid = valid
        self.trust_state = trust_state
        self.error_code = error_code
        self.error_message = error_message

    def __bool__(self) -> bool:
        return self.valid


def verify_envelope_signature(envelope: EventEnvelope) -> SignatureVerificationResult:
    """
    Verify the Ed25519 signature of a received event envelope.

    Steps:
    1. Extract envelope dict without signature_b64url.
    2. Reject floats.
    3. Canonicalize (keys sorted by Unicode code point, no whitespace).
    4. Prefix with b"resqmesh/v1\\n".
    5. Verify with Ed25519 using the public key in origin.public_key_b64url.

    Returns:
        SignatureVerificationResult with:
        - valid=True, trust_state=UNVERIFIED if signature is valid (citizen event)
        - valid=False, trust_state=REJECTED with error_code on failure

    Per 16_BUILD_CONTRACT.md §Ed25519 signing rule, step 6.
    Note: SIGNATURE_INVALID and KEY_REVOKED must NOT enter the projection.
    Citizen keys are always labelled UNVERIFIED — integrity proven, identity is not.
    """
    # Extract envelope as dict, remove signature field for signing bytes
    envelope_dict = envelope.model_dump()
    signature_b64url = envelope_dict.pop("signature_b64url", None)

    if not signature_b64url:
        return SignatureVerificationResult(
            valid=False,
            trust_state=TrustState.REJECTED,
            error_code=ApiErrorCode.SIGNATURE_INVALID,
            error_message="Missing signature_b64url in envelope.",
        )

    # Validate key_id format
    key_id = envelope.origin.key_id
    if not KEY_ID_PATTERN.match(key_id):
        return SignatureVerificationResult(
            valid=False,
            trust_state=TrustState.REJECTED,
            error_code=ApiErrorCode.SIGNATURE_INVALID,
            error_message=f"Invalid key_id format: {key_id!r}.",
        )

    # Decode public key
    try:
        raw_public_key = _from_base64url(envelope.origin.public_key_b64url)
    except Exception:
        return SignatureVerificationResult(
            valid=False,
            trust_state=TrustState.REJECTED,
            error_code=ApiErrorCode.SIGNATURE_INVALID,
            error_message="Invalid public_key_b64url encoding.",
        )

    # Verify key_id matches public key (self-consistency check)
    expected_key_id = derive_key_id(raw_public_key)
    if key_id != expected_key_id:
        return SignatureVerificationResult(
            valid=False,
            trust_state=TrustState.REJECTED,
            error_code=ApiErrorCode.SIGNATURE_INVALID,
            error_message=(
                f"key_id mismatch: envelope has {key_id!r}, "
                f"derived from public key is {expected_key_id!r}."
            ),
        )

    # Build signing bytes using canonical JSON
    try:
        signing_bytes = build_signing_bytes(envelope_dict)
    except (ValueError, TypeError) as e:
        return SignatureVerificationResult(
            valid=False,
            trust_state=TrustState.REJECTED,
            error_code=ApiErrorCode.SIGNATURE_INVALID,
            error_message=f"Canonicalization error: {e}",
        )

    # Decode signature
    try:
        signature_bytes = _from_base64url(signature_b64url)
    except Exception:
        return SignatureVerificationResult(
            valid=False,
            trust_state=TrustState.REJECTED,
            error_code=ApiErrorCode.SIGNATURE_INVALID,
            error_message="Invalid signature_b64url encoding.",
        )

    # Perform Ed25519 verification
    try:
        public_key = Ed25519PublicKey.from_public_bytes(raw_public_key)
        public_key.verify(signature_bytes, signing_bytes)
    except InvalidSignature:
        return SignatureVerificationResult(
            valid=False,
            trust_state=TrustState.REJECTED,
            error_code=ApiErrorCode.SIGNATURE_INVALID,
            error_message=(
                "Ed25519 signature verification failed. "
                "The envelope may have been tampered with."
            ),
        )
    except Exception as e:
        return SignatureVerificationResult(
            valid=False,
            trust_state=TrustState.REJECTED,
            error_code=ApiErrorCode.SIGNATURE_INVALID,
            error_message=f"Signature verification error: {e}",
        )

    # Valid signature — citizen events are UNVERIFIED (integrity proven, identity is not)
    return SignatureVerificationResult(
        valid=True,
        trust_state=TrustState.UNVERIFIED,
    )


def verify_raw_signature(
    envelope_without_sig: dict[str, Any],
    signature_b64url: str,
    public_key_b64url: str,
) -> bool:
    """
    Low-level helper: verify a signature against raw envelope dict + public key.
    Used in tests for canonicalization parity checks.

    Mirrors the exact same canonicalization as the TypeScript verifyEnvelope().
    """
    try:
        signing_bytes = build_signing_bytes(envelope_without_sig)
        raw_public_key = _from_base64url(public_key_b64url)
        signature_bytes = _from_base64url(signature_b64url)
        public_key = Ed25519PublicKey.from_public_bytes(raw_public_key)
        public_key.verify(signature_bytes, signing_bytes)
        return True
    except (InvalidSignature, Exception):
        return False
