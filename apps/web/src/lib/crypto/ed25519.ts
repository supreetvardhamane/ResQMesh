/**
 * ResQMesh — Ed25519 Cryptographic Signing Helper (TypeScript / Web Crypto API)
 *
 * Implements the Ed25519 signing and verification contract exactly as defined in:
 * docs/16_BUILD_CONTRACT.md §Exact Ed25519 signing rule
 *
 * Rules:
 * 1. Construct envelope WITHOUT signature_b64url.
 * 2. No floats — strings, booleans, integers, arrays, objects only.
 * 3. Canonicalize recursively: object keys sorted by Unicode code point;
 *    arrays preserve order; standard JSON escaping; no whitespace.
 * 4. Prefix UTF-8 canonical JSON with exact ASCII bytes: "resqmesh/v1\n"
 * 5. Sign with Ed25519. Store raw public key and signature as unpadded base64url.
 * 6. Verify using same first four steps.
 *
 * key_id = "demo:" + first 16 lowercase hex chars of SHA-256(raw public key)
 * Private JWK stored ONLY in IndexedDB. Never in memory beyond the sign call.
 *
 * Citizen events are labelled UNVERIFIED — integrity is proven, identity is not.
 */

import { SCHEMA_VERSION } from "../../../../packages/contracts/types";

// ─── Constants ──────────────────────────────────────────────────────────────

const INDEXEDDB_DB_NAME = "resqmesh-crypto";
const INDEXEDDB_DB_VERSION = 1;
const INDEXEDDB_STORE_NAME = "keys";
const KEY_RECORD_ID = "device-key-v1";
const SIGN_PREFIX = "resqmesh/v1\n";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeviceKeyPair {
  /** "demo:" + first 16 lowercase hex chars of SHA-256(raw public key) */
  key_id: string;
  /** 32-byte raw Ed25519 public key, unpadded base64url */
  public_key_b64url: string;
}

interface StoredKeyRecord {
  id: string;
  privateJwk: JsonWebKey;
  publicKeyRaw: ArrayBuffer;
  key_id: string;
  public_key_b64url: string;
}

// ─── IndexedDB helpers ───────────────────────────────────────────────────────

function openCryptoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(INDEXEDDB_DB_NAME, INDEXEDDB_DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(INDEXEDDB_STORE_NAME)) {
        db.createObjectStore(INDEXEDDB_STORE_NAME, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadStoredKey(db: IDBDatabase): Promise<StoredKeyRecord | null> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(INDEXEDDB_STORE_NAME, "readonly");
    const store = tx.objectStore(INDEXEDDB_STORE_NAME);
    const req = store.get(KEY_RECORD_ID);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function saveKeyRecord(db: IDBDatabase, record: StoredKeyRecord): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(INDEXEDDB_STORE_NAME, "readwrite");
    const store = tx.objectStore(INDEXEDDB_STORE_NAME);
    const req = store.put(record);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ─── Key utilities ───────────────────────────────────────────────────────────

/**
 * Convert ArrayBuffer to unpadded base64url string.
 */
function toBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

/**
 * Convert unpadded base64url string to Uint8Array.
 */
export function fromBase64url(b64url: string): Uint8Array {
  const padded = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padding = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padding);
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Derive key_id: "demo:" + first 16 lowercase hex chars of SHA-256(raw public key).
 * Per 16_BUILD_CONTRACT.md §Ed25519 signing rule.
 */
async function deriveKeyId(rawPublicKey: ArrayBuffer): Promise<string> {
  const hashBuf = await crypto.subtle.digest("SHA-256", rawPublicKey);
  const hashBytes = new Uint8Array(hashBuf);
  let hex = "";
  for (const b of hashBytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return "demo:" + hex.slice(0, 16);
}

// ─── Canonical JSON ──────────────────────────────────────────────────────────

/**
 * Reject floating-point numbers per the build contract.
 * Only strings, booleans, integers, arrays, and objects are allowed.
 */
function rejectFloats(value: unknown, path = ""): void {
  if (typeof value === "number" && !Number.isInteger(value)) {
    throw new Error(
      `SIGNATURE_ERROR: Floating-point value not allowed in envelope at path "${path}". Use integers only.`
    );
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => rejectFloats(item, `${path}[${i}]`));
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      rejectFloats(v, path ? `${path}.${k}` : k);
    }
  }
}

/**
 * Recursively canonicalize an object:
 * - Object keys sorted by Unicode code point
 * - Arrays preserve order
 * - Standard JSON escaping
 * - No whitespace
 *
 * Per 16_BUILD_CONTRACT.md §Exact Ed25519 signing rule, step 3.
 */
function canonicalizeJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return JSON.stringify(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalizeJson).join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const pairs = sortedKeys.map(
      (k) => JSON.stringify(k) + ":" + canonicalizeJson(obj[k])
    );
    return "{" + pairs.join(",") + "}";
  }
  throw new Error(`SIGNATURE_ERROR: Unsupported value type: ${typeof value}`);
}

/**
 * Build the canonical signing bytes for an envelope (without signature_b64url).
 * Prefix: "resqmesh/v1\n" + canonical JSON (UTF-8 bytes).
 * Per 16_BUILD_CONTRACT.md §Exact Ed25519 signing rule, steps 1–4.
 */
export function buildSigningBytes(envelopeWithoutSig: Record<string, unknown>): Uint8Array {
  rejectFloats(envelopeWithoutSig);
  const canonical = canonicalizeJson(envelopeWithoutSig);
  const prefixed = SIGN_PREFIX + canonical;
  return new TextEncoder().encode(prefixed);
}

// ─── Key management ──────────────────────────────────────────────────────────

/**
 * Get or create the device Ed25519 key pair.
 * On first run, generates a key pair, stores private JWK ONLY in IndexedDB.
 * Returns the public-facing DeviceKeyPair (key_id + public_key_b64url).
 *
 * Per 16_BUILD_CONTRACT.md §Ed25519 signing rule (last paragraph).
 */
export async function getOrCreateDeviceKey(): Promise<DeviceKeyPair> {
  const db = await openCryptoDb();
  const existing = await loadStoredKey(db);

  if (existing) {
    return {
      key_id: existing.key_id,
      public_key_b64url: existing.public_key_b64url,
    };
  }

  // Generate new Ed25519 key pair
  const keyPair = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true, // extractable (needed to export JWK for storage)
    ["sign", "verify"]
  );

  // Export private key as JWK for IndexedDB storage only
  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);

  // Export public key as raw bytes (32 bytes for Ed25519)
  const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);

  const key_id = await deriveKeyId(publicKeyRaw);
  const public_key_b64url = toBase64url(publicKeyRaw);

  const record: StoredKeyRecord = {
    id: KEY_RECORD_ID,
    privateJwk,
    publicKeyRaw,
    key_id,
    public_key_b64url,
  };

  await saveKeyRecord(db, record);
  db.close();

  return { key_id, public_key_b64url };
}

// ─── Signing ─────────────────────────────────────────────────────────────────

/**
 * Sign an event envelope using the device Ed25519 private key (from IndexedDB).
 *
 * @param envelopeWithoutSig - The envelope object WITHOUT signature_b64url field.
 * @returns The complete envelope with signature_b64url added.
 *
 * Per 16_BUILD_CONTRACT.md §Exact Ed25519 signing rule, steps 1–5.
 */
export async function signEnvelope(
  envelopeWithoutSig: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const db = await openCryptoDb();
  const stored = await loadStoredKey(db);
  db.close();

  if (!stored) {
    throw new Error(
      "SIGNATURE_ERROR: No device key found. Call getOrCreateDeviceKey() first."
    );
  }

  // Import private key from JWK
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    stored.privateJwk,
    { name: "Ed25519" },
    false,
    ["sign"]
  );

  const signingBytes = buildSigningBytes(envelopeWithoutSig);
  const signatureBuf = await crypto.subtle.sign("Ed25519", privateKey, signingBytes);
  const signature_b64url = toBase64url(signatureBuf);

  return { ...envelopeWithoutSig, signature_b64url };
}

// ─── Verification ─────────────────────────────────────────────────────────────

/**
 * Verify an event envelope signature using the embedded public key.
 * Mirrors the exact same canonicalization as signing.
 *
 * @param envelope - The full envelope WITH signature_b64url.
 * @returns true if signature is valid; false otherwise.
 *
 * Per 16_BUILD_CONTRACT.md §Exact Ed25519 signing rule, step 6.
 * Note: Citizen events remain UNVERIFIED trust state — valid signature proves
 * integrity only, NOT identity.
 */
export async function verifyEnvelope(
  envelope: Record<string, unknown>
): Promise<boolean> {
  const { signature_b64url, ...envelopeWithoutSig } = envelope as {
    signature_b64url: string;
    [key: string]: unknown;
  };

  if (!signature_b64url || typeof signature_b64url !== "string") {
    return false;
  }

  const origin = envelopeWithoutSig.origin as { public_key_b64url?: string } | undefined;
  if (!origin?.public_key_b64url) {
    return false;
  }

  try {
    const rawPublicKey = fromBase64url(origin.public_key_b64url);
    const publicKey = await crypto.subtle.importKey(
      "raw",
      rawPublicKey,
      { name: "Ed25519" },
      false,
      ["verify"]
    );

    const signingBytes = buildSigningBytes(envelopeWithoutSig);
    const signatureBytes = fromBase64url(signature_b64url);

    return await crypto.subtle.verify(
      "Ed25519",
      publicKey,
      signatureBytes,
      signingBytes
    );
  } catch {
    return false;
  }
}

// ─── Test fixture helpers (used only by test harness, not production) ─────────

/**
 * Generate a test Ed25519 key pair for fixture generation.
 * Returns raw bytes for use in fixture files.
 * NOTE: Test keys are source-controlled and FORBIDDEN from deployed environments.
 *
 * Per 16_BUILD_CONTRACT.md §Ed25519 signing rule (last paragraph).
 */
export async function generateTestKeyPair(): Promise<{
  privateJwk: JsonWebKey;
  public_key_b64url: string;
  key_id: string;
}> {
  const keyPair = await crypto.subtle.generateKey(
    { name: "Ed25519" },
    true,
    ["sign", "verify"]
  );

  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  const publicKeyRaw = await crypto.subtle.exportKey("raw", keyPair.publicKey);
  const key_id = await deriveKeyId(publicKeyRaw);
  const public_key_b64url = toBase64url(publicKeyRaw);

  return { privateJwk, public_key_b64url, key_id };
}

/**
 * Sign a fixture envelope using a provided private JWK (test-only).
 */
export async function signWithJwk(
  envelopeWithoutSig: Record<string, unknown>,
  privateJwk: JsonWebKey
): Promise<string> {
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    privateJwk,
    { name: "Ed25519" },
    false,
    ["sign"]
  );

  const signingBytes = buildSigningBytes(envelopeWithoutSig);
  const signatureBuf = await crypto.subtle.sign("Ed25519", privateKey, signingBytes);
  return toBase64url(signatureBuf);
}
