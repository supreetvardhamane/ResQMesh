/**
 * ResQMesh — Root Application
 * Per FRONTEND.md: serious infrastructure product, India-first, no AI slop.
 */

import React, { useState, useEffect, useCallback } from "react";
import { DeliveryState } from "@contracts";
import { SOSForm } from "./features/sos/SOSForm";
import { StatusBar } from "./features/relay/StatusBar";
import type { NetworkStatus } from "./features/relay/StatusBar";
import { RelayManager } from "./features/relay/RelayClient";
import { ResponderConsole } from "./features/responder/ResponderConsole";
import { ResourceMatches } from "./features/resources/ResourceMatches";

type AppTab = "sos" | "responder" | "resources";

const DEMO_INCIDENT_ID = "demo-flood-2026";

let relayManager: RelayManager | null = null;

export default function App(): React.ReactElement {
  const [activeTab, setActiveTab] = useState<AppTab>("sos");
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>("OFFLINE");
  const [selectedNeedEventId, setSelectedNeedEventId] = useState("");

  const handleRelayStateChange = useCallback(
    (_eventId: string, newState: DeliveryState) => {
      switch (newState) {
        case DeliveryState.QUEUED_FOR_RELAY: setNetworkStatus("RELAYING"); break;
        case DeliveryState.PEER_ACKED:       setNetworkStatus(DeliveryState.PEER_ACKED); break;
        case DeliveryState.BRIDGE_ACKED:     setNetworkStatus("BRIDGE_AVAILABLE"); break;
        case DeliveryState.SYNCED:           setNetworkStatus(DeliveryState.SYNCED); break;
        case DeliveryState.RETRY_PENDING:    setNetworkStatus("OFFLINE"); break;
        default: break;
      }
    },
    []
  );

  useEffect(() => {
    relayManager = new RelayManager({ onStateChange: handleRelayStateChange });
    const bridgeWsUrl = (window as Record<string, unknown>).__RELAY_WS_URL__ as string | undefined;
    if (bridgeWsUrl) {
      relayManager.addPeer(bridgeWsUrl);
      setNetworkStatus("RELAYING");
    }
    return () => { relayManager?.stop(); relayManager = null; };
  }, [handleRelayStateChange]);

  const tabs: { id: AppTab; label: string; icon: string }[] = [
    { id: "sos",       label: "SOS",       icon: "🆘" },
    { id: "responder", label: "Responder",  icon: "📋" },
    { id: "resources", label: "Resources",  icon: "🚑" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header style={{
        height: "var(--header-height)",
        background: "var(--c-brand)",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 var(--sp-5)",
        flexShrink: 0,
        boxShadow: "0 1px 0 rgba(255,255,255,0.06)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
          <span style={{
            width: 28, height: 28,
            background: "var(--c-red)",
            borderRadius: "var(--r-sm)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, fontWeight: "bold", flexShrink: 0,
          }}>R</span>
          <span style={{
            fontSize: "var(--text-md)",
            fontWeight: "var(--weight-bold)",
            letterSpacing: "-0.01em",
          }}>ResQMesh</span>
          <span style={{
            fontSize: "var(--text-xs)",
            background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: "var(--r-sm)",
            padding: "2px 7px",
            color: "rgba(255,255,255,0.7)",
            fontWeight: "var(--weight-medium)",
          }}>Prototype</span>
        </div>
        <span style={{
          fontSize: "var(--text-xs)",
          color: "rgba(255,255,255,0.5)",
          fontFamily: "var(--font-mono)",
        }}>
          {DEMO_INCIDENT_ID}
        </span>
      </header>

      {/* ── Status Bar ─────────────────────────────────────────────────── */}
      <StatusBar status={networkStatus} />

      {/* ── Tab Navigation ─────────────────────────────────────────────── */}
      <nav
        role="tablist"
        aria-label="Application sections"
        style={{
          display: "flex",
          background: "var(--c-surface)",
          borderBottom: "1px solid var(--c-border)",
          flexShrink: 0,
        }}
      >
        {tabs.map((tab, i) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              id={`tab-${tab.id}`}
              aria-selected={isActive}
              aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              tabIndex={isActive ? 0 : -1}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") {
                  const next = tabs[(i + 1) % tabs.length];
                  setActiveTab(next.id);
                  document.getElementById(`tab-${next.id}`)?.focus();
                }
                if (e.key === "ArrowLeft") {
                  const prev = tabs[(i + tabs.length - 1) % tabs.length];
                  setActiveTab(prev.id);
                  document.getElementById(`tab-${prev.id}`)?.focus();
                }
              }}
              style={{
                flex: 1,
                minHeight: "var(--tab-height)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "var(--sp-2)",
                fontSize: "var(--text-sm)",
                fontWeight: isActive ? "var(--weight-semibold)" : "var(--weight-normal)",
                color: isActive ? "var(--c-text)" : "var(--c-muted)",
                background: "none",
                border: "none",
                borderBottom: isActive
                  ? "2px solid var(--c-brand)"
                  : "2px solid transparent",
                cursor: "pointer",
                transition: "color var(--duration-fast), border-color var(--duration-fast)",
                paddingBottom: "2px",
              }}
            >
              <span aria-hidden="true">{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ── Tab Panels ─────────────────────────────────────────────────── */}
      <main style={{
        flex: 1,
        maxWidth: "var(--max-content)",
        width: "100%",
        margin: "0 auto",
        padding: "var(--sp-5) var(--sp-4)",
        boxSizing: "border-box",
      }}>
        <div
          id="panel-sos"
          role="tabpanel"
          aria-labelledby="tab-sos"
          hidden={activeTab !== "sos"}
        >
          {activeTab === "sos" && <SOSForm />}
        </div>

        <div
          id="panel-responder"
          role="tabpanel"
          aria-labelledby="tab-responder"
          hidden={activeTab !== "responder"}
        >
          {activeTab === "responder" && (
            <ResponderConsole incidentId={DEMO_INCIDENT_ID} />
          )}
        </div>

        <div
          id="panel-resources"
          role="tabpanel"
          aria-labelledby="tab-resources"
          hidden={activeTab !== "resources"}
        >
          {activeTab === "resources" && (
            <ResourcesPanel
              needEventId={selectedNeedEventId}
              onNeedEventIdChange={setSelectedNeedEventId}
            />
          )}
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer style={{
        padding: "var(--sp-4)",
        borderTop: "1px solid var(--c-border)",
        background: "var(--c-surface)",
        textAlign: "center",
        fontSize: "var(--text-xs)",
        color: "var(--c-muted)",
      }}>
        ResQMesh — Offline-first emergency coordination — Synthetic demo data
      </footer>
    </div>
  );
}

// ── Resources Panel (internal) ─────────────────────────────────────────────
function ResourcesPanel({
  needEventId,
  onNeedEventIdChange,
}: {
  needEventId: string;
  onNeedEventIdChange: (id: string) => void;
}) {
  return (
    <div>
      <div style={{ marginBottom: "var(--sp-5)" }}>
        <h2 style={{
          fontSize: "var(--text-lg)",
          fontWeight: "var(--weight-bold)",
          marginBottom: "var(--sp-1)",
          letterSpacing: "-0.01em",
        }}>Resource Matches</h2>
        <p style={{ fontSize: "var(--text-sm)", color: "var(--c-muted)" }}>
          Enter an SOS event ID to find nearby available resources.
        </p>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="need-event-id">
          SOS Event ID
        </label>
        <input
          id="need-event-id"
          className="form-input"
          type="text"
          value={needEventId}
          onChange={(e) => onNeedEventIdChange(e.target.value)}
          placeholder="Paste event UUID from SOS form…"
          style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)" }}
        />
        <p className="form-hint">
          Copy the event_id shown after submitting an SOS.
        </p>
      </div>

      {needEventId ? (
        <ResourceMatches needEventId={needEventId} responderId="responder-demo-001" />
      ) : (
        <div style={{
          border: "1.5px dashed var(--c-border-strong)",
          borderRadius: "var(--r-lg)",
          padding: "var(--sp-10) var(--sp-6)",
          textAlign: "center",
          color: "var(--c-muted)",
        }}>
          <p style={{ fontSize: "var(--text-md)", marginBottom: "var(--sp-2)", color: "var(--c-text-2)" }}>
            No event selected
          </p>
          <p style={{ fontSize: "var(--text-sm)" }}>
            Enter an SOS event ID above to view candidate resource matches.
          </p>
          <p style={{ fontSize: "var(--text-xs)", marginTop: "var(--sp-3)" }}>
            Resource matching is rule-based — capability, availability, region, and freshness.
          </p>
        </div>
      )}
    </div>
  );
}
