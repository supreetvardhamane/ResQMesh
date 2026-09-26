/**
 * ResQMesh — Network/Status Bar (Member 2 / apps/web/src/features/relay/StatusBar.tsx)
 *
 * Per docs/TEAM_TASK_DIVISION.md §Member 2 Phase 1 — Network/Status Bar:
 * - Show OFFLINE, RELAYING, BRIDGE_AVAILABLE, SYNCED, FAILED — plain text, not color-only
 * - Status must distinguish: local-saved vs peer-acked vs bridge-confirmed vs server-synced
 *
 * Accessible: role="status", aria-live="polite", text labels beyond color.
 */

import React from "react";
import { DeliveryState } from "../../../../packages/contracts/types";

// ─── Types ───────────────────────────────────────────────────────────────────

export type NetworkStatus =
  | DeliveryState
  | "OFFLINE"
  | "RELAYING"
  | "BRIDGE_AVAILABLE";

interface StatusBarProps {
  /** Current network/delivery status */
  status: NetworkStatus;
  /** Number of events currently queued (optional display) */
  eventCount?: number;
}

// ─── Status definitions ───────────────────────────────────────────────────────

interface StatusDef {
  icon: string;    // Unicode symbol — NOT color-only
  label: string;   // Plain text label
  detail: string;  // Detailed description
}

const STATUS_MAP: Record<NetworkStatus, StatusDef> = {
  // Custom network-level statuses
  OFFLINE: {
    icon: "⊗",
    label: "Offline",
    detail: "Events saved locally — no peer connection",
  },
  RELAYING: {
    icon: "⟳",
    label: "Relaying",
    detail: "Sending to nearby peer via prototype transport",
  },
  BRIDGE_AVAILABLE: {
    icon: "⇡",
    label: "Bridge available",
    detail: "Rescue vehicle bridge — syncing to server",
  },
  // Delivery states
  [DeliveryState.DRAFT]: {
    icon: "✎",
    label: "Draft",
    detail: "Not yet saved locally",
  },
  [DeliveryState.SAVED_LOCAL]: {
    icon: "💾",
    label: "Saved locally",
    detail: "In local queue — awaiting relay peer",
  },
  [DeliveryState.QUEUED_FOR_RELAY]: {
    icon: "📡",
    label: "Queued for relay",
    detail: "Waiting for nearby peer connection",
  },
  [DeliveryState.PEER_ACKED]: {
    icon: "↔",
    label: "Peer acknowledged",
    detail: "Peer accepted — not yet at server",
  },
  [DeliveryState.BRIDGE_ACKED]: {
    icon: "⇡",
    label: "Bridge acknowledged",
    detail: "Bridge node received — syncing to server",
  },
  [DeliveryState.SYNCED]: {
    icon: "✓",
    label: "Synced",
    detail: "Server confirmed receipt",
  },
  [DeliveryState.RETRY_PENDING]: {
    icon: "↺",
    label: "Retry pending",
    detail: "Will retry relay automatically",
  },
  [DeliveryState.EXPIRED]: {
    icon: "⚠",
    label: "Expired",
    detail: "Event TTL elapsed — not relayed",
  },
  [DeliveryState.REJECTED]: {
    icon: "✕",
    label: "Rejected",
    detail: "Validation failed — check event",
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function StatusBar({ status, eventCount }: StatusBarProps): React.ReactElement {
  const def = STATUS_MAP[status] ?? {
    icon: "?",
    label: "Unknown",
    detail: "Status unknown",
  };

  // Accessible color hints — text is always the primary indicator
  const barStyle: React.CSSProperties = {
    minHeight: "44px",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "8px 16px",
    borderBottom: "2px solid #ddd",
    background: "#f9f9f9",
    fontFamily: "system-ui, sans-serif",
    fontSize: "14px",
  };

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Network status: ${def.label}. ${def.detail}`}
      style={barStyle}
    >
      {/* Icon — supplemental, never sole indicator */}
      <span aria-hidden="true" style={{ fontSize: "18px", flexShrink: 0 }}>
        {def.icon}
      </span>

      {/* Text label — primary indicator */}
      <span>
        <strong>{def.label}</strong>
        {" — "}
        <span style={{ color: "#444" }}>{def.detail}</span>
      </span>

      {/* Queue count if provided */}
      {typeof eventCount === "number" && eventCount > 0 && (
        <span
          style={{
            marginLeft: "auto",
            background: "#e0e0e0",
            borderRadius: "12px",
            padding: "2px 10px",
            fontSize: "13px",
            flexShrink: 0,
          }}
          aria-label={`${eventCount} event${eventCount !== 1 ? "s" : ""} queued`}
        >
          {eventCount} queued
        </span>
      )}
    </div>
  );
}
