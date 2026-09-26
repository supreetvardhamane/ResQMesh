/**
 * ResQMesh — Provenance Panel
 * Per FRONTEND.md: status not color-only, meaningful information only.
 */

import React from "react";
import { TrustState, DeliveryState } from "@contracts";
import type { OriginInfo } from "@contracts";

// ── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "just now";
    if (min === 1) return "1 min ago";
    if (min < 60) return `${min} min ago`;
    const hr = Math.floor(min / 60);
    return `${hr}h ago`;
  } catch { return iso; }
}

const TRUST_LABELS: Record<string, { label: string; cls: string }> = {
  [TrustState.UNVERIFIED]:   { label: "Unverified",   cls: "badge-gray" },
  [TrustState.CORROBORATED]: { label: "Corroborated", cls: "badge-green" },
  [TrustState.CONFLICTING]:  { label: "Conflicting",  cls: "badge-amber" },
  [TrustState.REJECTED]:     { label: "Rejected",     cls: "badge-red" },
};

const DELIVERY_LABELS: Record<string, string> = {
  [DeliveryState.DRAFT]:             "Draft",
  [DeliveryState.SAVED_LOCAL]:       "Saved locally",
  [DeliveryState.QUEUED_FOR_RELAY]:  "Queued for relay",
  [DeliveryState.PEER_ACKED]:        "Peer acknowledged",
  [DeliveryState.BRIDGE_ACKED]:      "Bridge acknowledged",
  [DeliveryState.SYNCED]:            "Synced",
  [DeliveryState.RETRY_PENDING]:     "Retry pending",
  [DeliveryState.EXPIRED]:           "Expired",
  [DeliveryState.REJECTED]:          "Rejected",
};

const SIG_LABELS: Record<string, { label: string; cls: string }> = {
  VALID:      { label: "Signature valid",    cls: "badge-green" },
  INVALID:    { label: "Signature invalid",  cls: "badge-red" },
  UNVERIFIED: { label: "Not verified",       cls: "badge-gray" },
};

// ── Component ──────────────────────────────────────────────────────────────

interface ProvenancePanelProps {
  eventId: string;
  origin: OriginInfo;
  signatureState: "VALID" | "INVALID" | "UNVERIFIED";
  relayHops: number;
  freshness: string;
  trustState: TrustState;
  deliveryState: DeliveryState;
}

export function ProvenancePanel({
  eventId,
  origin,
  signatureState,
  relayHops,
  freshness,
  trustState,
  deliveryState,
}: ProvenancePanelProps): React.ReactElement {
  const trust = TRUST_LABELS[trustState] ?? { label: trustState, cls: "badge-gray" };
  const sig   = SIG_LABELS[signatureState] ?? { label: signatureState, cls: "badge-gray" };

  return (
    <div style={{
      borderTop: "1px solid var(--c-border)",
      paddingTop: "var(--sp-3)",
      marginTop: "var(--sp-3)",
    }}>
      <p style={{
        fontSize: "var(--text-xs)",
        fontWeight: "var(--weight-semibold)",
        color: "var(--c-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        marginBottom: "var(--sp-3)",
      }}>
        Provenance
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-2)", marginBottom: "var(--sp-3)" }}>
        <span className={`badge ${trust.cls}`}>{trust.label}</span>
        <span className={`badge ${sig.cls}`}>{sig.label}</span>
        <span className="badge badge-gray">{relayHops} hop{relayHops !== 1 ? "s" : ""}</span>
        <span className="badge badge-gray">{relativeTime(freshness)}</span>
      </div>

      <dl style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: "var(--sp-1) var(--sp-4)",
        fontSize: "var(--text-xs)",
        color: "var(--c-muted)",
      }}>
        <dt>Origin</dt>
        <dd style={{ color: "var(--c-text-2)", fontWeight: "var(--weight-medium)" }}>
          {origin.kind}
        </dd>
        <dt>Key</dt>
        <dd style={{ fontFamily: "var(--font-mono)", color: "var(--c-text-2)", fontSize: 10, wordBreak: "break-all" }}>
          {origin.key_id?.slice(0, 20)}…
        </dd>
        <dt>Delivery</dt>
        <dd style={{ color: "var(--c-text-2)", fontWeight: "var(--weight-medium)" }}>
          {DELIVERY_LABELS[deliveryState] ?? deliveryState}
        </dd>
        <dt>Event ID</dt>
        <dd style={{ fontFamily: "var(--font-mono)", color: "var(--c-text-2)", fontSize: 10, wordBreak: "break-all" }}>
          {eventId.slice(0, 16)}…
        </dd>
      </dl>
    </div>
  );
}
