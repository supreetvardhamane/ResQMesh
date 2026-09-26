import React, { useState } from "react";
import {
  EventType, Priority, NeedCode, DeliveryState, SourceKind, DEFAULT_TTL_SECONDS,
} from "@contracts";
import type { EventEnvelope } from "@contracts";
import { getOrCreateDeviceKey, signEnvelope } from "../../lib/crypto/ed25519";
import { saveEvent } from "../../lib/storage/queue";

type FormStep = "form" | "confirm" | "submitted";
interface FormValues { need: NeedCode | ""; priority: Priority; geohash: string; }
interface FormErrors { need?: string; geohash?: string; }

const GEOHASH_RE = /^[0-9b-hjkmnp-z]{6}$/;

const NEEDS: { value: NeedCode; label: string; desc: string; icon: string }[] = [
  { value: NeedCode.MEDICAL,    label: "Medical",      desc: "Injury, illness, medical emergency", icon: "🏥" },
  { value: NeedCode.RESCUE,     label: "Rescue",       desc: "Trapped, stranded, or missing",      icon: "🆘" },
  { value: NeedCode.FOOD_WATER, label: "Food / Water", desc: "Food or drinking water urgently needed", icon: "🍶" },
  { value: NeedCode.SHELTER,    label: "Shelter",      desc: "Safe location or housing needed",    icon: "🏠" },
];

const PRIORITIES: { value: Priority; label: string }[] = [
  { value: Priority.CRITICAL, label: "Critical — life-threatening" },
  { value: Priority.HIGH,     label: "High — urgent but stable" },
  { value: Priority.NORMAL,   label: "Normal" },
];

export function SOSForm(): React.ReactElement {
  const [step, setStep] = useState<FormStep>("form");
  const [values, setValues] = useState<FormValues>({ need: "", priority: Priority.HIGH, geohash: "" });
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  function validate() {
    const e: FormErrors = {};
    if (!values.need) e.need = "Please select your emergency type.";
    if (!GEOHASH_RE.test(values.geohash)) e.geohash = "Enter a 6-character geohash (letters + digits). Find yours at geohash.org.";
    setErrors(e);
    return !Object.keys(e).length;
  }

  async function handleSubmit() {
    setSubmitting(true); setSubmitError(null);
    try {
      const { keyRecord, keyId } = await getOrCreateDeviceKey();
      const envelope: EventEnvelope = {
        schema_version: 1, event_id: crypto.randomUUID(),
        type: EventType.SOS_CREATED, incident_id: "demo-flood-2026",
        created_at: new Date().toISOString(), ttl_seconds: DEFAULT_TTL_SECONDS,
        priority: values.priority,
        origin: { kind: SourceKind.CITIZEN, key_id: keyId, public_key_b64url: keyRecord.publicKeyB64url },
        location_geohash: values.geohash, payload: { need: values.need },
        signature_b64url: "", delivery_state: DeliveryState.DRAFT,
      };
      const signed = await signEnvelope(envelope, keyRecord);
      await saveEvent(signed);
      setSubmittedId(signed.event_id);
      setStep("submitted");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save. Try again.");
    } finally { setSubmitting(false); }
  }

  function reset() {
    setStep("form"); setValues({ need: "", priority: Priority.HIGH, geohash: "" });
    setErrors({}); setSubmittedId(null); setSubmitError(null);
  }

  /* ── Form step ─────────────────────────────────────────────────────── */
  if (step === "form") return (
    <div>
      <div style={{ marginBottom: "var(--sp-8)" }}>
        <h2 className="section-title" style={{ fontSize: "var(--text-xl)" }}>Send Emergency Alert</h2>
        <p className="section-desc" style={{ marginTop: "var(--sp-2)" }}>
          Saved locally and relayed when a connection is available. No name or phone number is collected.
        </p>
      </div>

      {/* Need type */}
      <div className="form-group">
        <fieldset style={{ border: "none", padding: 0 }}>
          <legend className="form-label">Emergency type <span className="form-required">*</span></legend>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-2)", marginTop: "var(--sp-1)" }}>
            {NEEDS.map((opt) => (
              <label key={opt.value}
                className={`radio-card ${values.need === opt.value ? "is-selected" : ""}`}
              >
                <input type="radio" name="need" value={opt.value}
                  checked={values.need === opt.value}
                  onChange={() => { setValues(v => ({ ...v, need: opt.value })); setErrors(e => ({ ...e, need: undefined })); }}
                />
                <span style={{ fontSize: 22, lineHeight: 1, marginTop: 1 }} aria-hidden="true">{opt.icon}</span>
                <span>
                  <span className="radio-card-label">{opt.label}</span>
                  <span className="radio-card-desc">{opt.desc}</span>
                </span>
              </label>
            ))}
          </div>
          {errors.need && <p className="form-error" role="alert">{errors.need}</p>}
        </fieldset>
      </div>

      {/* Severity */}
      <div className="form-group">
        <label className="form-label" htmlFor="priority">Severity <span className="form-required">*</span></label>
        <select id="priority" className="form-select" value={values.priority}
          onChange={(e) => setValues(v => ({ ...v, priority: e.target.value as Priority }))}>
          {PRIORITIES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* Geohash */}
      <div className="form-group">
        <label className="form-label" htmlFor="geohash">Location — geohash <span className="form-required">*</span></label>
        <input id="geohash" className={`form-input${errors.geohash ? " is-error" : ""}`}
          type="text" value={values.geohash} maxLength={6} autoComplete="off" inputMode="text"
          placeholder="e.g. tdr1q0"
          style={{ fontFamily: "var(--font-mono)", letterSpacing: "0.1em", fontSize: "var(--text-md)" }}
          onChange={(e) => { setValues(v => ({ ...v, geohash: e.target.value.toLowerCase().trim() })); setErrors(e2 => ({ ...e2, geohash: undefined })); }}
        />
        {errors.geohash
          ? <p className="form-error" role="alert">{errors.geohash}</p>
          : <p className="form-hint">6-character geohash (~1 km area). Find yours at <a href="https://geohash.org" target="_blank" rel="noopener noreferrer" style={{ color: "var(--c-blue)" }}>geohash.org</a>. No exact GPS stored.</p>
        }
      </div>

      {/* Privacy */}
      <div className="privacy-note" style={{ marginBottom: "var(--sp-8)" }}>
        <span style={{ fontSize: 16 }}>🔒</span>
        <p>No name, phone, or exact location collected. Device generates a local signing key. The 6-char geohash covers ≈1.2 km × 0.6 km.</p>
      </div>

      <button type="button" className="btn btn-danger btn-full"
        style={{ minHeight: 54, fontSize: "var(--text-md)", borderRadius: "var(--r-md)", letterSpacing: "-0.01em" }}
        onClick={() => validate() && setStep("confirm")}>
        Review Alert →
      </button>
    </div>
  );

  /* ── Confirm step ──────────────────────────────────────────────────── */
  if (step === "confirm") {
    const need = NEEDS.find(o => o.value === values.need);
    const prio = PRIORITIES.find(o => o.value === values.priority);
    return (
      <div>
        <button type="button" onClick={() => setStep("form")} style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--c-muted)", fontSize: "var(--text-sm)", display: "flex",
          alignItems: "center", gap: "var(--sp-2)", marginBottom: "var(--sp-6)", padding: 0,
        }}>← Edit</button>

        <h2 className="section-title" style={{ marginBottom: "var(--sp-1)" }}>Confirm your alert</h2>
        <p className="section-desc" style={{ marginBottom: "var(--sp-6)" }}>Review carefully. This cannot be recalled once relayed.</p>

        <div className="card" style={{ marginBottom: "var(--sp-6)" }}>
          <div className="card-header">Alert details</div>
          <div className="card-body">
            <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "var(--sp-3) var(--sp-5)" }}>
              {[
                { t: "Emergency type", d: `${need?.icon ?? ""} ${need?.label ?? values.need}` },
                { t: "Severity",       d: prio?.label ?? values.priority },
              ].map(({ t, d }) => (
                <React.Fragment key={t}>
                  <dt style={{ fontSize: "var(--text-xs)", color: "var(--c-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", alignSelf: "center" }}>{t}</dt>
                  <dd style={{ fontSize: "var(--text-base)", fontWeight: 600, color: "var(--c-text)" }}>{d}</dd>
                </React.Fragment>
              ))}
              <dt style={{ fontSize: "var(--text-xs)", color: "var(--c-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.04em", alignSelf: "center" }}>Location</dt>
              <dd><code style={{ fontSize: "var(--text-base)", letterSpacing: "0.1em" }}>{values.geohash}</code></dd>
            </dl>
          </div>
        </div>

        {submitError && <div className="alert alert-error" role="alert" style={{ marginBottom: "var(--sp-4)" }}><strong>Error:</strong> {submitError}</div>}

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-3)" }}>
          <button type="button" className="btn btn-danger btn-full"
            style={{ minHeight: 54, fontSize: "var(--text-md)", borderRadius: "var(--r-md)" }}
            onClick={handleSubmit} disabled={submitting} aria-busy={submitting}>
            {submitting ? <><span className="spinner" />Signing &amp; saving…</> : "Send Emergency Alert"}
          </button>
          <button type="button" className="btn btn-ghost btn-full" onClick={() => setStep("form")}>Go back</button>
        </div>
      </div>
    );
  }

  /* ── Submitted step ────────────────────────────────────────────────── */
  return (
    <div style={{ textAlign: "center", padding: "var(--sp-12) 0" }}>
      <div style={{
        width: 72, height: 72, borderRadius: "50%",
        background: "var(--c-green-light)", border: "2px solid var(--c-green-border)",
        display: "flex", alignItems: "center", justifyContent: "center",
        margin: "0 auto var(--sp-6)", fontSize: 32, color: "var(--c-green)",
      }}>✓</div>

      <h2 className="section-title" style={{ color: "var(--c-green)", fontSize: "var(--text-xl)", marginBottom: "var(--sp-2)" }}>Alert saved</h2>
      <p style={{ fontSize: "var(--text-sm)", color: "var(--c-muted)", marginBottom: "var(--sp-8)", maxWidth: 340, margin: "0 auto var(--sp-8)", lineHeight: "var(--lh-base)" }}>
        Signed with your device key and stored locally. Will relay automatically when a peer or bridge is reachable.
      </p>

      {submittedId && (
        <div style={{
          background: "var(--c-surface-2)", border: "1px solid var(--c-border)",
          borderRadius: "var(--r-md)", padding: "var(--sp-4)",
          marginBottom: "var(--sp-6)", textAlign: "left",
        }}>
          <p style={{ fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--c-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--sp-2)" }}>Event ID</p>
          <code style={{ fontSize: 11, wordBreak: "break-all", background: "none", border: "none", padding: 0, color: "var(--c-text-2)" }}>{submittedId}</code>
        </div>
      )}

      <button type="button" className="btn btn-ghost" style={{ minHeight: 44 }} onClick={reset}>Send another alert</button>
    </div>
  );
}
