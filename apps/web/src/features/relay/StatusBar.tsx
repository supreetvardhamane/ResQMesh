/**
 * ResQMesh — Network Status Bar
 * Per FRONTEND.md: network-aware UI, status not color-only, fast and subtle.
 */

import React from "react";
import { DeliveryState } from "@contracts";

export type NetworkStatus =
  | "OFFLINE"
  | "RELAYING"
  | "BRIDGE_AVAILABLE"
  | DeliveryState.PEER_ACKED
  | DeliveryState.BRIDGE_ACKED
  | DeliveryState.SYNCED
  | DeliveryState.EXPIRED
  | DeliveryState.REJECTED
  | DeliveryState.RETRY_PENDING
  | DeliveryState.SAVED_LOCAL
  | DeliveryState.QUEUED_FOR_RELAY;

interface StatusConfig {
  dot: string;   // CSS color for the dot
  bg: string;    // Background color
  border: string;
  text: string;  // Text color
  label: string;
  detail: string;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  OFFLINE:                   { dot: "#94A3B8", bg: "#F8FAFC",           border: "#E2E8F0",  text: "#475569", label: "Offline",               detail: "Events saved locally. Will relay when connection available." },
  RELAYING:                  { dot: "#2563EB", bg: "var(--c-blue-light)",  border: "var(--c-blue-border)",  text: "#1E40AF", label: "Relaying",              detail: "Sending event through peer-to-peer network." },
  BRIDGE_AVAILABLE:          { dot: "#16A34A", bg: "var(--c-green-light)", border: "var(--c-green-border)", text: "#15803D", label: "Bridge available",       detail: "Internet bridge is reachable." },
  [DeliveryState.SAVED_LOCAL]:       { dot: "#D97706", bg: "var(--c-amber-light)", border: "var(--c-amber-border)", text: "#92400E", label: "Saved locally",          detail: "Queued for relay when network is available." },
  [DeliveryState.QUEUED_FOR_RELAY]:  { dot: "#2563EB", bg: "var(--c-blue-light)",  border: "var(--c-blue-border)",  text: "#1E40AF", label: "Queued for relay",      detail: "Waiting to send to peer." },
  [DeliveryState.PEER_ACKED]:        { dot: "#16A34A", bg: "var(--c-green-light)", border: "var(--c-green-border)", text: "#15803D", label: "Peer acknowledged",      detail: "A nearby peer has received the event." },
  [DeliveryState.BRIDGE_ACKED]:      { dot: "#16A34A", bg: "var(--c-green-light)", border: "var(--c-green-border)", text: "#15803D", label: "Bridge acknowledged",    detail: "Bridge relay has confirmed receipt." },
  [DeliveryState.SYNCED]:            { dot: "#16A34A", bg: "var(--c-green-light)", border: "var(--c-green-border)", text: "#15803D", label: "Synced",                 detail: "Server confirmed. Event is in the system." },
  [DeliveryState.RETRY_PENDING]:     { dot: "#D97706", bg: "var(--c-amber-light)", border: "var(--c-amber-border)", text: "#92400E", label: "Retry pending",          detail: "Will retry with backoff." },
  [DeliveryState.EXPIRED]:           { dot: "#DC2626", bg: "var(--c-red-light)",   border: "var(--c-red-border)",   text: "#991B1B", label: "Expired",               detail: "Event TTL elapsed. Not forwarded." },
  [DeliveryState.REJECTED]:          { dot: "#DC2626", bg: "var(--c-red-light)",   border: "var(--c-red-border)",   text: "#991B1B", label: "Rejected",              detail: "Event failed validation." },
};

interface StatusBarProps {
  status: NetworkStatus;
}

export function StatusBar({ status }: StatusBarProps): React.ReactElement {
  const cfg = STATUS_MAP[status as string] ?? STATUS_MAP["OFFLINE"];
  const isAnimated = status === "RELAYING" || status === DeliveryState.QUEUED_FOR_RELAY;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-label={`Network status: ${cfg.label}. ${cfg.detail}`}
      style={{
        height: "var(--statusbar-height)",
        background: cfg.bg,
        borderBottom: `1px solid ${cfg.border}`,
        display: "flex",
        alignItems: "center",
        padding: "0 var(--sp-5)",
        gap: "var(--sp-3)",
        flexShrink: 0,
      }}
    >
      {/* Animated dot */}
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: cfg.dot,
          flexShrink: 0,
          animation: isAnimated ? "pulse-dot 1.4s ease-in-out infinite" : "none",
        }}
      />
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.5; transform: scale(0.75); }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes pulse-dot { from, to { opacity: 1; } }
        }
      `}</style>

      {/* Label */}
      <span style={{
        fontSize: "var(--text-xs)",
        fontWeight: "var(--weight-semibold)",
        color: cfg.text,
        letterSpacing: "0.04em",
        textTransform: "uppercase",
      }}>
        {cfg.label}
      </span>

      {/* Detail — hidden on small screens, useful for context */}
      <span style={{
        fontSize: "var(--text-xs)",
        color: cfg.text,
        opacity: 0.7,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        display: "none",
      }} className="status-detail">
        — {cfg.detail}
      </span>

      <style>{`
        @media (min-width: 480px) { .status-detail { display: block !important; } }
      `}</style>
    </div>
  );
}
