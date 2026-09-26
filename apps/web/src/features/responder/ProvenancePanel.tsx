/**
 * ResQMesh — Provenance Panel
 * (apps/web/src/features/responder/ProvenancePanel.tsx)
 *
 * Per docs/TEAM_TASK_DIVISION.md §Member 2 Phase 3 — Responder Console:
 * "Show provenance panel: origin, signature state, relay hops, freshness,
 *  trust state (UNVERIFIED | CORROBORATED | CONFLICTING | REJECTED)"
 *
 * All statuses shown as text labels — not color-only.
 */

import React from "react";
import { TrustState, DeliveryState } from "../../../../packages/contracts/types";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ProvenancePanelProps {
  eventId: string;
  origin: {
    kind: string;
    key_id: string;
  };
  /** Client-side signature verification result */
  signatureState: "VALID" | "INVALID" | "UNVERIFIED";
  relayHops: number;
  /** UTC ISO-8601 of event creation */
  freshness: string;
  trustState: TrustState;
  deliveryState: DeliveryState;
}

// ─── Label maps ──────────────────────────────────────────────────────────────

const TRUST_STATE_LABELS: Record<TrustState, string> = {
  [TrustState.UNVERIFIED]: "⚬ Unverified — integrity proven, identity unknown",
  [TrustState.CORROBORATED]: "✓ Corroborated — multiple independent sources agree",
  [TrustState.CONFLICTING]: "⚡ Conflicting — sources disagree on this observation",
  [TrustState.REJECTED]: "✕ Rejected — failed validation",
};

const DELIVERY_STATE_LABELS: Record<DeliveryState, string> = {
  [DeliveryState.DRAFT]: "Draft",
  [DeliveryState.SAVED_LOCAL]: "Saved locally",
  [DeliveryState.QUEUED_FOR_RELAY]: "Queued for relay",
  [DeliveryState.PEER_ACKED]: "Peer acknowledged",
  [DeliveryState.BRIDGE_ACKED]: "Bridge acknowledged",
  [DeliveryState.SYNCED]: "Synced to server",
  [DeliveryState.RETRY_PENDING]: "Retry pending",
  [DeliveryState.EXPIRED]: "Expired",
  [DeliveryState.REJECTED]: "Rejected",
};

const SIGNATURE_LABELS: Record<"VALID" | "INVALID" | "UNVERIFIED", string> = {
  VALID: "✓ Signature valid — integrity confirmed",
  INVALID: "✕ Signature invalid — do not act on this event",
  UNVERIFIED: "⚬ Signature not yet verified",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function relativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr} hr ${diffMin % 60} min ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ProvenancePanel({
  eventId,
  origin,
  signatureState,
  relayHops,
  freshness,
  trustState,
  deliveryState,
}: ProvenancePanelProps): React.ReactElement {
  const containerStyle: React.CSSProperties = {
    border: "1px solid #ccc",
    borderRadius: "6px",
    padding: "12px 14px",
    background: "#f8f8f8",
    fontFamily: "system-ui, sans-serif",
    fontSize: "13px",
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    gap: "8px",
    marginBottom: "8px",
    alignItems: "flex-start",
  };

  const dtStyle: React.CSSProperties = {
    fontWeight: 600,
    minWidth: "130px",
    flexShrink: 0,
    color: "#333",
  };

  return (
    <section
      style={containerStyle}
      aria-label={`Provenance for event ${eventId.slice(0, 8)}…`}
    >
      <strong style={{ fontSize: "14px", display: "block", marginBottom: "10px" }}>
        Provenance
      </strong>

      <dl style={{ margin: 0 }}>
        {/* Origin kind */}
        <div style={rowStyle}>
          <dt style={dtStyle}>Source kind:</dt>
          <dd style={{ margin: 0 }}>{origin.kind}</dd>
        </div>

        {/* Key ID (first 12 chars — privacy hint only) */}
        <div style={rowStyle}>
          <dt style={dtStyle}>Key ID (hint):</dt>
          <dd style={{ margin: 0, fontFamily: "monospace" }}>
            {origin.key_id.slice(0, 12)}…{" "}
            <span style={{ color: "#666", fontFamily: "system-ui" }}>
              (citizen key — UNVERIFIED identity)
            </span>
          </dd>
        </div>

        {/* Signature state — text, not color-only */}
        <div style={rowStyle}>
          <dt style={dtStyle}>Signature:</dt>
          <dd style={{ margin: 0 }}>{SIGNATURE_LABELS[signatureState]}</dd>
        </div>

        {/* Relay hops */}
        <div style={rowStyle}>
          <dt style={dtStyle}>Relay hops:</dt>
          <dd style={{ margin: 0 }}>
            {relayHops} hop{relayHops !== 1 ? "s" : ""}
          </dd>
        </div>

        {/* Freshness */}
        <div style={rowStyle}>
          <dt style={dtStyle}>Created:</dt>
          <dd style={{ margin: 0 }}>
            {relativeTime(freshness)}{" "}
            <span style={{ color: "#666" }}>({freshness})</span>
          </dd>
        </div>

        {/* Trust state — text label */}
        <div style={rowStyle}>
          <dt style={dtStyle}>Trust state:</dt>
          <dd style={{ margin: 0 }}>{TRUST_STATE_LABELS[trustState]}</dd>
        </div>

        {/* Delivery state */}
        <div style={rowStyle}>
          <dt style={dtStyle}>Delivery state:</dt>
          <dd style={{ margin: 0 }}>{DELIVERY_STATE_LABELS[deliveryState]}</dd>
        </div>

        {/* Event ID (truncated) */}
        <div style={rowStyle}>
          <dt style={dtStyle}>Event ID:</dt>
          <dd style={{ margin: 0, fontFamily: "monospace", fontSize: "12px" }}>
            {eventId}
          </dd>
        </div>
      </dl>
    </section>
  );
}
