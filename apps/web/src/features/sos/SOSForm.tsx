/**
 * ResQMesh — SOS Form
 * Per FRONTEND.md: mobile-first, India-first, trustworthy, no AI slop.
 * Per docs/16_BUILD_CONTRACT.md: geohash 6-char, Ed25519 sign, DRAFT → SAVED_LOCAL.
 */

import React, { useState } from "react";
import {
  EventType,
  Priority,
  NeedCode,
  DeliveryState,
  SourceKind,
  DEFAULT_TTL_SECONDS,
} from "@contracts";
import { getOrCreateDeviceKey, signEnvelope } from "../../lib/crypto/ed25519";
import { saveEvent } from "../../lib/storage/queue";
import type { EventEnvelope } from "@contracts";

// ── Types ──────────────────────────────────────────────────────────────────

type FormStep = "form" | "confirm" | "submitted";

interface FormValues {
  need: NeedCode | "";
  priority: Priority;
  geohash: string;
}

interface FormErrors {
  need?: string;
  geohash?: string;
}

// ── Constants ──────────────────────────────────────────────────────────────

const GEOHASH_RE = /^[0-9b-hjkmnp-z]{6}$/;

const NEED_OPTIONS: { value: NeedCode; label: string; desc: string }[] = [
  { value: NeedCode.MEDICAL,    label: "Medical",     desc: "Injury, illness, or medical emergency" },
  { value: NeedCode.RESCUE,     label: "Rescue",      desc: "Trapped, stranded, or missing person" },
  { value: NeedCode.FOOD_WATER, label: "Food / Water", desc: "Food or drinking water urgently needed" },
  { value: NeedCode.SHELTER,    label: "Shelter",     desc: "Safe location or housing needed" },
];

const PRIORITY_OPTIONS: { value: Priority; label: string; color: string }[] = [
  { value: Priority.CRITICAL, label: "Critical — life-threatening", color: "var(--c-red)" },
  { value: Priority.HIGH,     label: "High — urgent but stable",   color: "var(--c-amber)" },
  { value: Priority.NORMAL,   label: "Normal",                     color: "var(--c-muted)" },
];

// ── Component ──────────────────────────────────────────────────────────────

export function SOSForm(): React.ReactElement {
  const [step, setStep] = useState<FormStep>("form");
  const [values, setValues] = useState<FormValues>({
    need: "",
    priority: Priority.HIGH,
    geohash: "",
  });
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Validation ──────────────────────────────────────────────────────────

  function validate(): boolean {
    const e: FormErrors = {};
    if (!values.need) e.need = "Please select your emergency type.";
    if (!GEOHASH_RE.test(values.geohash))
      e.geohash = "Enter a 6-character geohash (e.g. tdr1q0). Use geohash.org to find yours.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  // ── Submit ──────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const { keyRecord, keyId } = await getOrCreateDeviceKey();

      const envelope: EventEnvelope = {
        schema_version: 1,
        event_id: crypto.randomUUID(),
        type: EventType.SOS_CREATED,
        incident_id: "demo-flood-2026",
        created_at: new Date().toISOString(),
        ttl_seconds: DEFAULT_TTL_SECONDS,
        priority: values.priority,
        origin: {
          kind: SourceKind.CITIZEN,
          key_id: keyId,
          public_key_b64url: keyRecord.publicKeyB64url,
        },
        location_geohash: values.geohash,
        payload: { need: values.need },
        signature_b64url: "",
        delivery_state: DeliveryState.DRAFT,
      };

      const signed = await signEnvelope(envelope, keyRecord);
      await saveEvent(signed);

      setSubmittedId(signed.event_id);
      setStep("submitted");
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Failed to save. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Reset ───────────────────────────────────────────────────────────────

  function handleReset() {
    setStep("form");
    setValues({ need: "", priority: Priority.HIGH, geohash: "" });
    setErrors({});
    setSubmittedId(null);
    setSubmitError(null);
  }

  // ── Render: Form ────────────────────────────────────────────────────────

  if (step === "form") {
    return (
      <div>
        <div style={{ marginBottom: "var(--sp-6)" }}>
          <h2 style={{
            fontSize: "var(--text-xl)",
            fontWeight: "var(--weight-bold)",
            letterSpacing: "-0.02em",
            marginBottom: "var(--sp-1)",
          }}>
            Send Emergency Alert
          </h2>
          <p style={{ fontSize: "var(--text-sm)", color: "var(--c-muted)" }}>
            Your alert will be saved locally and relayed when network is available.
            No phone number or name is collected.
          </p>
        </div>

        {/* Need Type */}
        <div className="form-group">
          <fieldset style={{ border: "none", padding: 0 }}>
            <legend className="form-label" style={{ marginBottom: "var(--sp-3)" }}>
              Emergency type <span style={{ color: "var(--c-red)" }}>*</span>
            </legend>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
              {NEED_OPTIONS.map((opt) => (
                <label
                  key={opt.value}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--sp-3)",
                    padding: "var(--sp-4)",
                    border: values.need === opt.value
                      ? "2px solid var(--c-brand)"
                      : "1.5px solid var(--c-border-strong)",
                    borderRadius: "var(--r-md)",
                    cursor: "pointer",
                    background: values.need === opt.value ? "var(--c-surface-2)" : "var(--c-surface)",
                    transition: "border-color var(--duration-fast), background var(--duration-fast)",
                    minHeight: "56px",
                  }}
                >
                  <input
                    type="radio"
                    name="need"
                    value={opt.value}
                    checked={values.need === opt.value}
                    onChange={() => {
                      setValues((v) => ({ ...v, need: opt.value }));
                      setErrors((e) => ({ ...e, need: undefined }));
                    }}
                    style={{ width: 18, height: 18, accentColor: "var(--c-brand)", flexShrink: 0 }}
                  />
                  <div>
                    <div style={{ fontWeight: "var(--weight-semibold)", fontSize: "var(--text-base)" }}>
                      {opt.label}
                    </div>
                    <div style={{ fontSize: "var(--text-xs)", color: "var(--c-muted)", marginTop: 2 }}>
                      {opt.desc}
                    </div>
                  </div>
                </label>
              ))}
            </div>
            {errors.need && <p className="form-error" role="alert">{errors.need}</p>}
          </fieldset>
        </div>

        {/* Priority */}
        <div className="form-group">
          <label className="form-label" htmlFor="priority">
            Severity <span style={{ color: "var(--c-red)" }}>*</span>
          </label>
          <select
            id="priority"
            className="form-select"
            value={values.priority}
            onChange={(e) => setValues((v) => ({ ...v, priority: e.target.value as Priority }))}
          >
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        {/* Geohash */}
        <div className="form-group">
          <label className="form-label" htmlFor="geohash">
            Location (geohash) <span style={{ color: "var(--c-red)" }}>*</span>
          </label>
          <input
            id="geohash"
            className={`form-input ${errors.geohash ? "error" : ""}`}
            type="text"
            value={values.geohash}
            onChange={(e) => {
              setValues((v) => ({ ...v, geohash: e.target.value.toLowerCase().trim() }));
              setErrors((e2) => ({ ...e2, geohash: undefined }));
            }}
            placeholder="e.g. tdr1q0"
            maxLength={6}
            inputMode="text"
            autoComplete="off"
            style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.12em" }}
          />
          {errors.geohash
            ? <p className="form-error" role="alert">{errors.geohash}</p>
            : <p className="form-hint">
                6-character geohash. Find yours at{" "}
                <a href="https://geohash.org" target="_blank" rel="noopener noreferrer"
                  style={{ color: "var(--c-blue)" }}>geohash.org</a>.
                No exact GPS is collected.
              </p>
          }
        </div>

        {/* Privacy notice */}
        <div style={{
          padding: "var(--sp-3) var(--sp-4)",
          background: "var(--c-surface-2)",
          border: "1px solid var(--c-border)",
          borderRadius: "var(--r-md)",
          fontSize: "var(--text-xs)",
          color: "var(--c-muted)",
          marginBottom: "var(--sp-6)",
          lineHeight: 1.6,
        }}>
          🔒 No name, phone number, or exact location is collected. Your device generates
          a unique signing key stored only on this device. The 6-char geohash covers
          approximately a 1.2 km × 0.6 km area.
        </div>

        <button
          type="button"
          className="btn btn-danger btn-full"
          style={{ minHeight: 56, fontSize: "var(--text-md)" }}
          onClick={() => validate() && setStep("confirm")}
        >
          Review Alert →
        </button>
      </div>
    );
  }

  // ── Render: Confirm ─────────────────────────────────────────────────────

  if (step === "confirm") {
    const selectedNeed = NEED_OPTIONS.find((o) => o.value === values.need);
    const selectedPriority = PRIORITY_OPTIONS.find((o) => o.value === values.priority);

    return (
      <div>
        <button
          type="button"
          onClick={() => setStep("form")}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--c-muted)",
            fontSize: "var(--text-sm)",
            display: "flex",
            alignItems: "center",
            gap: "var(--sp-2)",
            marginBottom: "var(--sp-5)",
            padding: 0,
          }}
        >
          ← Edit
        </button>

        <h2 style={{
          fontSize: "var(--text-xl)",
          fontWeight: "var(--weight-bold)",
          letterSpacing: "-0.02em",
          marginBottom: "var(--sp-2)",
        }}>
          Confirm your alert
        </h2>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--c-muted)", marginBottom: "var(--sp-6)" }}>
          Review before sending. This cannot be recalled once relayed.
        </p>

        <div className="card" style={{ marginBottom: "var(--sp-5)" }}>
          <div className="card-body">
            <dl style={{ display: "flex", flexDirection: "column", gap: "var(--sp-4)" }}>
              {[
                { term: "Emergency type", desc: selectedNeed?.label ?? values.need },
                { term: "Severity",       desc: selectedPriority?.label ?? values.priority },
                { term: "Location",       desc: <code>{values.geohash}</code> },
              ].map(({ term, desc }) => (
                <div key={term} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--sp-4)" }}>
                  <dt style={{ fontSize: "var(--text-sm)", color: "var(--c-muted)", flexShrink: 0 }}>{term}</dt>
                  <dd style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", textAlign: "right" }}>{desc}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {submitError && (
          <div className="alert alert-error" style={{ marginBottom: "var(--sp-4)" }} role="alert">
            <strong>Failed to save:</strong> {submitError}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
          <button
            type="button"
            className="btn btn-danger btn-full"
            style={{ minHeight: 56, fontSize: "var(--text-md)" }}
            onClick={handleSubmit}
            disabled={isSubmitting}
            aria-busy={isSubmitting}
          >
            {isSubmitting ? "Signing and saving…" : "Send Emergency Alert"}
          </button>
          <button type="button" className="btn btn-ghost btn-full" onClick={() => setStep("form")}>
            Go back
          </button>
        </div>
      </div>
    );
  }

  // ── Render: Submitted ───────────────────────────────────────────────────

  return (
    <div style={{ textAlign: "center", padding: "var(--sp-10) 0" }}>
      <div style={{
        width: 64, height: 64,
        borderRadius: "50%",
        background: "var(--c-green-light)",
        border: "2px solid var(--c-green-border)",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto var(--sp-5)",
        fontSize: 28,
      }}>
        ✓
      </div>

      <h2 style={{
        fontSize: "var(--text-xl)",
        fontWeight: "var(--weight-bold)",
        letterSpacing: "-0.02em",
        marginBottom: "var(--sp-2)",
        color: "var(--c-green)",
      }}>
        Alert saved
      </h2>
      <p style={{ fontSize: "var(--text-sm)", color: "var(--c-muted)", marginBottom: "var(--sp-6)", lineHeight: 1.6 }}>
        Your alert is saved locally and signed with your device key.
        It will be relayed automatically when a peer or bridge is reachable.
      </p>

      {submittedId && (
        <div style={{
          background: "var(--c-surface-2)",
          border: "1px solid var(--c-border)",
          borderRadius: "var(--r-md)",
          padding: "var(--sp-3) var(--sp-4)",
          marginBottom: "var(--sp-6)",
          fontSize: "var(--text-xs)",
          color: "var(--c-muted)",
          wordBreak: "break-all",
          textAlign: "left",
        }}>
          <span style={{ display: "block", fontWeight: "var(--weight-semibold)", marginBottom: 4 }}>Event ID</span>
          <code style={{ background: "none", border: "none", padding: 0, fontSize: "11px" }}>
            {submittedId}
          </code>
        </div>
      )}

      <button type="button" className="btn btn-ghost btn-full" onClick={handleReset}>
        Send another alert
      </button>
    </div>
  );
}
