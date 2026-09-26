/**
 * ResQMesh — SOS Form (Member 2 / apps/web/src/features/sos/SOSForm.tsx)
 *
 * Mobile-first SOS capture form per:
 * - docs/TEAM_TASK_DIVISION.md §Member 2 Phase 1 — SOS Form
 * - docs/16_BUILD_CONTRACT.md §Exact immutable event envelope
 * - docs/02_MASTER_SPEC.md §User-interface requirements
 *
 * Requirements:
 * - Mobile-first at 360px viewport; SOS button visible WITHOUT scroll
 * - Fields: need category, priority, geohash (6-char) — no free text name/phone
 * - Confirmation step summarizes payload before submit
 * - Ed25519 key generation on first run — private JWK in IndexedDB only
 * - Sign envelope per ed25519.ts signing rule
 * - Delivery state: DRAFT → SAVED_LOCAL (on IndexedDB save)
 * - Loading, success, error, retry states for every async action
 * - 44px touch targets; visible focus; status not color-only; keyboard navigation
 */

import React, { useState, useCallback } from "react";
import {
  NeedCode,
  Priority,
  DeliveryState,
  EventType,
  SCHEMA_VERSION,
  DEMO_INCIDENT_ID,
  DEFAULT_TTL_SECONDS,
  SourceKind,
  EventEnvelope,
} from "../../../../packages/contracts/types";
import { getOrCreateDeviceKey, signEnvelope } from "../../lib/crypto/ed25519";
import { saveEvent } from "../../lib/storage/queue";
import {
  logQueueReject,
  logDeliveryStateChange,
  logSignatureCreated,
} from "../../lib/crypto/observability";

// ─── Types ───────────────────────────────────────────────────────────────────

type FormStep = "FORM" | "CONFIRM" | "SUBMITTED";

interface FormState {
  need: NeedCode | "";
  priority: Priority | "";
  geohash: string;
}

interface SubmitState {
  status: "idle" | "loading" | "success" | "error";
  deliveryState: DeliveryState | null;
  error: string | null;
  eventId: string | null;
}

// ─── UUID v4 helper ───────────────────────────────────────────────────────────

function generateUUIDv4(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback UUID v4 generation
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ─── Label maps ──────────────────────────────────────────────────────────────

const NEED_LABELS: Record<NeedCode, string> = {
  [NeedCode.MEDICAL]: "Medical — Injury or health emergency",
  [NeedCode.RESCUE]: "Rescue — Trapped or stranded",
  [NeedCode.FOOD_WATER]: "Food & Water — Immediate need",
  [NeedCode.SHELTER]: "Shelter — No safe place to stay",
};

const PRIORITY_LABELS: Record<Priority, string> = {
  [Priority.CRITICAL]: "Critical — Life-threatening",
  [Priority.HIGH]: "High — Urgent but stable",
  [Priority.NORMAL]: "Normal — Needs help soon",
};

const DELIVERY_STATE_TEXT: Record<DeliveryState, string> = {
  [DeliveryState.DRAFT]: "Draft — not yet saved",
  [DeliveryState.SAVED_LOCAL]: "Saved locally — awaiting relay",
  [DeliveryState.QUEUED_FOR_RELAY]: "Queued — waiting for nearby peer",
  [DeliveryState.PEER_ACKED]: "Peer acknowledged — relaying",
  [DeliveryState.BRIDGE_ACKED]: "Bridge received — syncing to server",
  [DeliveryState.SYNCED]: "Synced — server confirmed",
  [DeliveryState.RETRY_PENDING]: "Retry pending — will retry shortly",
  [DeliveryState.EXPIRED]: "Expired — TTL elapsed",
  [DeliveryState.REJECTED]: "Rejected — validation failed",
};

// ─── Inline styles (only for specific contract values) ───────────────────────

const STYLES = {
  container: {
    maxWidth: "100%",
    minHeight: "100vh",
    padding: "12px 16px",
    boxSizing: "border-box" as const,
    fontFamily: "system-ui, sans-serif",
  },
  button: {
    minHeight: "44px",
    minWidth: "44px",
    padding: "10px 20px",
    fontSize: "16px",
    cursor: "pointer",
    borderRadius: "6px",
    border: "2px solid transparent",
    fontWeight: 600,
  },
  sosButton: {
    background: "#cc0000",
    color: "#ffffff",
    width: "100%",
    fontSize: "20px",
    minHeight: "56px",
    border: "2px solid #990000",
  },
  secondaryButton: {
    background: "#f5f5f5",
    color: "#333",
    border: "2px solid #999",
  },
  field: {
    marginBottom: "16px",
  },
  label: {
    display: "block",
    marginBottom: "6px",
    fontWeight: 600,
    fontSize: "15px",
  },
  select: {
    width: "100%",
    minHeight: "44px",
    fontSize: "16px",
    padding: "8px 12px",
    border: "2px solid #666",
    borderRadius: "6px",
    background: "#fff",
  },
  input: {
    width: "100%",
    minHeight: "44px",
    fontSize: "16px",
    padding: "8px 12px",
    border: "2px solid #666",
    borderRadius: "6px",
    fontFamily: "monospace",
    boxSizing: "border-box" as const,
  },
  errorBox: {
    background: "#fff3f3",
    border: "2px solid #cc0000",
    borderRadius: "6px",
    padding: "12px",
    marginBottom: "16px",
  },
  successBox: {
    background: "#f0fff4",
    border: "2px solid #006600",
    borderRadius: "6px",
    padding: "12px",
    marginBottom: "16px",
  },
  confirmBox: {
    background: "#f8f8f8",
    border: "2px solid #333",
    borderRadius: "6px",
    padding: "16px",
    marginBottom: "16px",
  },
  notice: {
    background: "#fffbe6",
    border: "1px solid #cca300",
    borderRadius: "4px",
    padding: "8px 12px",
    fontSize: "13px",
    marginBottom: "16px",
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function SOSForm(): React.ReactElement {
  const [step, setStep] = useState<FormStep>("FORM");
  const [form, setForm] = useState<FormState>({
    need: "",
    priority: "",
    geohash: "",
  });
  const [geohashError, setGeohashError] = useState<string | null>(null);
  const [submit, setSubmit] = useState<SubmitState>({
    status: "idle",
    deliveryState: null,
    error: null,
    eventId: null,
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  const validateGeohash = useCallback((value: string): string | null => {
    if (value.length !== 6) return "Location must be exactly 6 characters.";
    if (!/^[a-z0-9]{6}$/.test(value))
      return "Location must be 6 lowercase letters/digits only (geohash format).";
    return null;
  }, []);

  const isFormValid =
    form.need !== "" &&
    form.priority !== "" &&
    form.geohash.length === 6 &&
    /^[a-z0-9]{6}$/.test(form.geohash);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleGeohashChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase().slice(0, 6);
    setForm((f) => ({ ...f, geohash: value }));
    setGeohashError(validateGeohash(value));
  };

  const handleProceedToConfirm = () => {
    const err = validateGeohash(form.geohash);
    if (err) {
      setGeohashError(err);
      return;
    }
    if (!isFormValid) return;
    setStep("CONFIRM");
  };

  const handleBack = () => {
    setStep("FORM");
    setSubmit({ status: "idle", deliveryState: null, error: null, eventId: null });
  };

  const handleSubmit = useCallback(async () => {
    if (!isFormValid) return;
    setSubmit({ status: "loading", deliveryState: null, error: null, eventId: null });

    try {
      // Step 1: Get or create device key (stores private JWK in IndexedDB only)
      const deviceKey = await getOrCreateDeviceKey();

      // Step 2: Build envelope WITHOUT signature (as per contract)
      const eventId = generateUUIDv4();
      const createdAt = new Date().toISOString();

      const envelopeWithoutSig: Record<string, unknown> = {
        schema_version: SCHEMA_VERSION,
        event_id: eventId,
        type: EventType.SOS_CREATED,
        incident_id: DEMO_INCIDENT_ID,
        created_at: createdAt,
        ttl_seconds: DEFAULT_TTL_SECONDS,
        priority: form.priority as Priority,
        origin: {
          kind: SourceKind.CITIZEN,
          key_id: deviceKey.key_id,
          public_key_b64url: deviceKey.public_key_b64url,
        },
        location_geohash: form.geohash,
        payload: {
          need: form.need as NeedCode,
        },
      };

      // Step 3: Sign the envelope (Ed25519 per build contract)
      const signedEnvelope = (await signEnvelope(envelopeWithoutSig)) as EventEnvelope;

      logSignatureCreated({ eventId, keyIdHint: deviceKey.key_id });

      // Step 4: Save to IndexedDB → transitions to SAVED_LOCAL
      await saveEvent(signedEnvelope);

      logDeliveryStateChange({
        eventId,
        fromState: DeliveryState.DRAFT,
        toState: DeliveryState.SAVED_LOCAL,
        priority: form.priority as Priority,
        locationGeohash: form.geohash,
      });

      setSubmit({
        status: "success",
        deliveryState: DeliveryState.SAVED_LOCAL,
        error: null,
        eventId,
      });
      setStep("SUBMITTED");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logQueueReject({
        errorCode: message.startsWith("QUEUE_LIMITED") ? "QUEUE_LIMITED" : "SUBMIT_ERROR",
        reason: message,
        priority: form.priority as Priority | undefined,
      });
      setSubmit({ status: "error", deliveryState: null, error: message, eventId: null });
    }
  }, [form, isFormValid]);

  const handleRetry = () => {
    setSubmit({ status: "idle", deliveryState: null, error: null, eventId: null });
    setStep("CONFIRM");
  };

  // ── Render helpers ──────────────────────────────────────────────────────────

  const renderFormStep = () => (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleProceedToConfirm();
      }}
      noValidate
    >
      <h1 style={{ fontSize: "22px", marginBottom: "4px" }}>🆘 Send SOS</h1>
      <p style={{ fontSize: "14px", color: "#555", marginBottom: "16px" }}>
        Report an emergency. No name or phone required.
      </p>

      {/* Prototype notice */}
      <div style={STYLES.notice} role="note">
        <strong>Prototype transport</strong> — This is a demonstration system using synthetic data.
      </div>

      {/* Need category */}
      <div style={STYLES.field}>
        <label htmlFor="sos-need" style={STYLES.label}>
          Type of help needed <span aria-hidden="true">*</span>
        </label>
        <select
          id="sos-need"
          value={form.need}
          onChange={(e) => setForm((f) => ({ ...f, need: e.target.value as NeedCode }))}
          style={STYLES.select}
          required
          aria-required="true"
        >
          <option value="" disabled>
            — Select need category —
          </option>
          {Object.values(NeedCode).map((code) => (
            <option key={code} value={code}>
              {NEED_LABELS[code]}
            </option>
          ))}
        </select>
      </div>

      {/* Priority */}
      <div style={STYLES.field}>
        <label htmlFor="sos-priority" style={STYLES.label}>
          Urgency level <span aria-hidden="true">*</span>
        </label>
        <select
          id="sos-priority"
          value={form.priority}
          onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as Priority }))}
          style={STYLES.select}
          required
          aria-required="true"
        >
          <option value="" disabled>
            — Select urgency —
          </option>
          {Object.values(Priority).map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
      </div>

      {/* Geohash location */}
      <div style={STYLES.field}>
        <label htmlFor="sos-geohash" style={STYLES.label}>
          Approximate location (6-character geohash) <span aria-hidden="true">*</span>
        </label>
        <input
          id="sos-geohash"
          type="text"
          value={form.geohash}
          onChange={handleGeohashChange}
          style={STYLES.input}
          placeholder="e.g. tdr1q0"
          maxLength={6}
          pattern="[a-z0-9]{6}"
          required
          aria-required="true"
          aria-describedby={geohashError ? "geohash-error" : "geohash-hint"}
          autoComplete="off"
          spellCheck={false}
        />
        {geohashError ? (
          <span
            id="geohash-error"
            role="alert"
            style={{ color: "#cc0000", fontSize: "13px", display: "block", marginTop: "4px" }}
          >
            ⚠ {geohashError}
          </span>
        ) : (
          <span
            id="geohash-hint"
            style={{ color: "#555", fontSize: "13px", display: "block", marginTop: "4px" }}
          >
            Enter 6 lowercase letters/digits. No exact GPS — approximate area only.
          </span>
        )}
      </div>

      {/* SOS Submit — visible without scroll at 360px */}
      <button
        type="submit"
        style={{ ...STYLES.button, ...STYLES.sosButton }}
        disabled={!isFormValid}
        aria-disabled={!isFormValid}
      >
        🆘 Review &amp; Send SOS
      </button>
    </form>
  );

  const renderConfirmStep = () => (
    <div role="main">
      <h2 style={{ fontSize: "20px", marginBottom: "4px" }}>Confirm your SOS</h2>
      <p style={{ fontSize: "14px", color: "#555", marginBottom: "16px" }}>
        Review the details below before sending.
      </p>

      <div style={STYLES.confirmBox} role="region" aria-label="SOS summary">
        <dl style={{ margin: 0 }}>
          <dt style={{ fontWeight: 600 }}>Help needed</dt>
          <dd style={{ marginLeft: 0, marginBottom: "10px" }}>
            {form.need ? NEED_LABELS[form.need as NeedCode] : "—"}
          </dd>

          <dt style={{ fontWeight: 600 }}>Urgency</dt>
          <dd style={{ marginLeft: 0, marginBottom: "10px" }}>
            {form.priority ? PRIORITY_LABELS[form.priority as Priority] : "—"}
          </dd>

          <dt style={{ fontWeight: 600 }}>Location area</dt>
          <dd style={{ marginLeft: 0, marginBottom: "10px" }}>
            {/* Show only first 4 chars in display — privacy */}
            Geohash area: <code>{form.geohash.slice(0, 4)}**</code> (approximate region)
          </dd>
        </dl>
        <p style={{ fontSize: "13px", color: "#555", margin: "8px 0 0" }}>
          No name, phone number, or exact location is sent. Synthetic data — prototype system.
        </p>
      </div>

      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={handleSubmit}
          style={{ ...STYLES.button, ...STYLES.sosButton, flex: "1 1 auto" }}
          aria-label="Confirm and send SOS"
        >
          ✔ Confirm &amp; Send
        </button>
        <button
          type="button"
          onClick={handleBack}
          style={{ ...STYLES.button, ...STYLES.secondaryButton, flex: "0 0 auto" }}
          aria-label="Go back and edit"
        >
          ← Back
        </button>
      </div>
    </div>
  );

  const renderSubmittedStep = () => (
    <div role="main">
      {submit.status === "loading" && (
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          style={{ padding: "24px", textAlign: "center" }}
        >
          <p style={{ fontSize: "18px" }}>⏳ Saving SOS…</p>
          <p style={{ fontSize: "14px", color: "#555" }}>Signing and saving to local storage.</p>
        </div>
      )}

      {submit.status === "success" && submit.deliveryState && (
        <div style={STYLES.successBox} role="status" aria-live="polite">
          <h2 style={{ margin: "0 0 8px", fontSize: "18px" }}>✓ SOS Saved</h2>
          <p style={{ margin: "0 0 8px" }}>
            <strong>Status:</strong>{" "}
            {DELIVERY_STATE_TEXT[submit.deliveryState]}
          </p>
          <p style={{ margin: "0 0 8px", fontSize: "13px", color: "#444" }}>
            Event ID: <code>{submit.eventId}</code>
          </p>
          <p style={{ fontSize: "13px", color: "#444" }}>
            Your SOS is saved offline. It will be relayed when a peer is available, even if you
            close this page.
          </p>
        </div>
      )}

      {submit.status === "error" && (
        <div style={STYLES.errorBox} role="alert">
          <h2 style={{ margin: "0 0 8px", fontSize: "18px" }}>⚠ Failed to save SOS</h2>
          <p style={{ margin: "0 0 12px", fontSize: "14px" }}>{submit.error}</p>
          <button
            type="button"
            onClick={handleRetry}
            style={{ ...STYLES.button, background: "#cc0000", color: "#fff" }}
          >
            ↺ Retry
          </button>
        </div>
      )}

      {submit.status === "success" && (
        <button
          type="button"
          onClick={() => {
            setStep("FORM");
            setForm({ need: "", priority: "", geohash: "" });
            setSubmit({ status: "idle", deliveryState: null, error: null, eventId: null });
          }}
          style={{ ...STYLES.button, ...STYLES.secondaryButton, marginTop: "16px" }}
        >
          + Send another SOS
        </button>
      )}
    </div>
  );

  // ── Main render ─────────────────────────────────────────────────────────────

  return (
    <div style={STYLES.container}>
      {step === "FORM" && renderFormStep()}
      {step === "CONFIRM" && renderConfirmStep()}
      {step === "SUBMITTED" && renderSubmittedStep()}
      {/* Loading overlay during submit (shows inline above) */}
      {submit.status === "loading" && step === "SUBMITTED" && null}
    </div>
  );
}
