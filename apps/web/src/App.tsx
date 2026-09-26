/**
 * ResQMesh — Root Application Component
 * (apps/web/src/App.tsx)
 *
 * Integrates all Member 2 features per docs/TEAM_TASK_DIVISION.md §Member 2:
 * - SOS Form (Phase 1)
 * - StatusBar (Phase 1) — shows current network/delivery status
 * - Responder Console (Phase 3) — incident events with Confidence Decay + Provenance
 * - Resource Matches (Phase 3) — candidate resource matches
 * - Relay integration (Phase 2) — RelayManager drives delivery state transitions
 *
 * Navigation is tab-based (keyboard accessible) per Phase 4 requirements:
 * - SOS tab (default): citizen SOS form
 * - Responder tab: incident event list with provenance/confidence
 * - Resources tab: resource match candidates
 *
 * Phase 4 accessibility:
 * - 44px touch targets
 * - Visible focus rings
 * - Status text not color-only
 * - keyboard navigation through entire core journey
 * - prefers-reduced-motion honored in ConfidenceDecay
 * - Labels: "Prototype transport", "Synthetic data", "Planned capability" where applicable
 */

import React, { useState, useEffect, useCallback } from "react";
import { DeliveryState, DEMO_INCIDENT_ID } from "../../../packages/contracts/types";
import { SOSForm } from "./features/sos/SOSForm";
import { StatusBar } from "./features/relay/StatusBar";
import type { NetworkStatus } from "./features/relay/StatusBar";
import { RelayManager } from "./features/relay/RelayClient";
import { ResponderConsole } from "./features/responder/ResponderConsole";
import { ResourceMatches } from "./features/resources/ResourceMatches";

// ─── Types ────────────────────────────────────────────────────────────────────

type AppTab = "sos" | "responder" | "resources";

// ─── Relay manager (singleton, kept alive for app lifetime) ──────────────────

let relayManager: RelayManager | null = null;

// ─── Component ────────────────────────────────────────────────────────────────

export default function App(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<AppTab>("sos");
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>("OFFLINE");

  // For resources demo — a selected event ID to match against
  const [selectedNeedEventId, setSelectedNeedEventId] = useState<string>("");
  const [responderId] = useState<string>("responder-demo-001");

  // ── Relay manager setup ────────────────────────────────────────────────────
  const handleRelayStateChange = useCallback(
    (eventId: string, newState: DeliveryState) => {
      // Update global network status display based on last delivery state
      switch (newState) {
        case DeliveryState.QUEUED_FOR_RELAY:
          setNetworkStatus("RELAYING");
          break;
        case DeliveryState.PEER_ACKED:
          setNetworkStatus(DeliveryState.PEER_ACKED);
          break;
        case DeliveryState.BRIDGE_ACKED:
          setNetworkStatus("BRIDGE_AVAILABLE");
          break;
        case DeliveryState.SYNCED:
          setNetworkStatus(DeliveryState.SYNCED);
          break;
        case DeliveryState.RETRY_PENDING:
          setNetworkStatus("OFFLINE");
          break;
        case DeliveryState.REJECTED:
          setNetworkStatus(DeliveryState.REJECTED);
          break;
        default:
          break;
      }
    },
    []
  );

  useEffect(() => {
    // Initialize relay manager
    relayManager = new RelayManager({ onStateChange: handleRelayStateChange });

    // In demo/local dev, connect to a local relay bridge peer if available
    // (Member 3 will provide the actual WebSocket relay adapter)
    const bridgeWsUrl =
      typeof window !== "undefined"
        ? ((window as unknown as Record<string, string>).__RELAY_WS_URL__ ?? "")
        : "";

    if (bridgeWsUrl) {
      relayManager.addPeer(bridgeWsUrl);
      setNetworkStatus("RELAYING");
    }

    return () => {
      relayManager?.stop();
      relayManager = null;
    };
  }, [handleRelayStateChange]);

  // ── Tab navigation ────────────────────────────────────────────────────────

  const tabStyle = (tab: AppTab): React.CSSProperties => ({
    minHeight: "44px",
    minWidth: "44px",
    padding: "10px 18px",
    fontSize: "15px",
    cursor: "pointer",
    border: "none",
    borderBottom: activeTab === tab ? "3px solid #cc0000" : "3px solid transparent",
    background: "none",
    fontWeight: activeTab === tab ? 700 : 400,
    color: activeTab === tab ? "#cc0000" : "#333",
  });

  const TAB_LABELS: Record<AppTab, string> = {
    sos: "🆘 SOS",
    responder: "📋 Responder",
    resources: "🚑 Resources",
  };

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        maxWidth: "720px",
        margin: "0 auto",
      }}
    >
      {/* App header */}
      <header
        style={{
          background: "#1a1a2e",
          color: "#fff",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <strong style={{ fontSize: "18px" }}>ResQMesh</strong>
          <span
            style={{
              marginLeft: "10px",
              fontSize: "11px",
              background: "#fffbe6",
              color: "#7a5000",
              borderRadius: "3px",
              padding: "2px 6px",
              fontWeight: 600,
            }}
          >
            Prototype transport
          </span>
        </div>
        <span style={{ fontSize: "12px", color: "#aaa" }}>
          Incident: <code style={{ fontSize: "11px" }}>{DEMO_INCIDENT_ID}</code>
        </span>
      </header>

      {/* Status bar — network/delivery status */}
      <StatusBar status={networkStatus} />

      {/* Tab navigation */}
      <nav
        role="tablist"
        aria-label="Application sections"
        style={{
          display: "flex",
          borderBottom: "1px solid #ddd",
          background: "#fff",
        }}
      >
        {(["sos", "responder", "resources"] as AppTab[]).map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            aria-controls={`tabpanel-${tab}`}
            id={`tab-${tab}`}
            onClick={() => setActiveTab(tab)}
            style={tabStyle(tab)}
            tabIndex={activeTab === tab ? 0 : -1}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") {
                const tabs: AppTab[] = ["sos", "responder", "resources"];
                const next = tabs[(tabs.indexOf(tab) + 1) % tabs.length];
                setActiveTab(next);
                document.getElementById(`tab-${next}`)?.focus();
              }
              if (e.key === "ArrowLeft") {
                const tabs: AppTab[] = ["sos", "responder", "resources"];
                const prev = tabs[(tabs.indexOf(tab) + 2) % tabs.length];
                setActiveTab(prev);
                document.getElementById(`tab-${prev}`)?.focus();
              }
            }}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </nav>

      {/* Tab panels */}
      <main style={{ flex: 1, padding: "16px" }}>
        {/* SOS Panel */}
        <div
          id="tabpanel-sos"
          role="tabpanel"
          aria-labelledby="tab-sos"
          hidden={activeTab !== "sos"}
        >
          {activeTab === "sos" && <SOSForm />}
        </div>

        {/* Responder Panel */}
        <div
          id="tabpanel-responder"
          role="tabpanel"
          aria-labelledby="tab-responder"
          hidden={activeTab !== "responder"}
        >
          {activeTab === "responder" && (
            <ResponderConsole incidentId={DEMO_INCIDENT_ID} />
          )}
        </div>

        {/* Resources Panel */}
        <div
          id="tabpanel-resources"
          role="tabpanel"
          aria-labelledby="tab-resources"
          hidden={activeTab !== "resources"}
        >
          {activeTab === "resources" && (
            <div>
              <div style={{ marginBottom: "16px" }}>
                <label
                  htmlFor="need-event-id-input"
                  style={{ display: "block", fontWeight: 600, marginBottom: "6px" }}
                >
                  SOS Need Event ID
                </label>
                <input
                  id="need-event-id-input"
                  type="text"
                  value={selectedNeedEventId}
                  onChange={(e) => setSelectedNeedEventId(e.target.value)}
                  placeholder="Paste event_id from SOS form…"
                  style={{
                    width: "100%",
                    minHeight: "44px",
                    fontSize: "14px",
                    padding: "8px 12px",
                    border: "2px solid #666",
                    borderRadius: "6px",
                    boxSizing: "border-box",
                    fontFamily: "monospace",
                  }}
                  aria-describedby="need-event-id-hint"
                />
                <span
                  id="need-event-id-hint"
                  style={{ fontSize: "12px", color: "#666", display: "block", marginTop: "4px" }}
                >
                  Enter the UUID from a submitted SOS to see resource candidates.
                </span>
              </div>

              {selectedNeedEventId ? (
                <ResourceMatches
                  needEventId={selectedNeedEventId}
                  responderId={responderId}
                />
              ) : (
                <div
                  style={{
                    padding: "32px",
                    textAlign: "center",
                    color: "#777",
                    border: "1px dashed #ccc",
                    borderRadius: "8px",
                  }}
                >
                  <p style={{ margin: 0 }}>Enter an SOS event ID above to view resource matches.</p>
                  <p style={{ margin: "8px 0 0", fontSize: "13px" }}>
                    <span
                      style={{
                        background: "#fffbe6",
                        border: "1px solid #cca300",
                        borderRadius: "3px",
                        padding: "1px 5px",
                      }}
                    >
                      Synthetic data
                    </span>
                    {" — "}Resource matching is rule-based, not AI-scored.{" "}
                    <span
                      style={{
                        background: "#f0f0ff",
                        border: "1px solid #9999cc",
                        borderRadius: "3px",
                        padding: "1px 5px",
                      }}
                    >
                      Planned capability
                    </span>
                    {" — "}Live routing is deferred.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          borderTop: "1px solid #eee",
          padding: "8px 16px",
          fontSize: "12px",
          color: "#888",
          textAlign: "center",
        }}
      >
        ResQMesh prototype — Synthetic data — Not for real emergencies
      </footer>
    </div>
  );
}
