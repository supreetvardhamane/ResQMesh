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

  const handleRelayStateChange = useCallback((_id: string, newState: DeliveryState) => {
    const map: Partial<Record<DeliveryState, NetworkStatus>> = {
      [DeliveryState.QUEUED_FOR_RELAY]: "RELAYING",
      [DeliveryState.PEER_ACKED]:       DeliveryState.PEER_ACKED,
      [DeliveryState.BRIDGE_ACKED]:     "BRIDGE_AVAILABLE",
      [DeliveryState.SYNCED]:           DeliveryState.SYNCED,
      [DeliveryState.RETRY_PENDING]:    "OFFLINE",
    };
    if (map[newState]) setNetworkStatus(map[newState]!);
  }, []);

  useEffect(() => {
    relayManager = new RelayManager({ onStateChange: handleRelayStateChange });
    const wsUrl = (window as Record<string, unknown>).__RELAY_WS_URL__ as string | undefined;
    if (wsUrl) { relayManager.addPeer(wsUrl); setNetworkStatus("RELAYING"); }
    return () => { relayManager?.stop(); relayManager = null; };
  }, [handleRelayStateChange]);

  const tabs: { id: AppTab; label: string; icon: string }[] = [
    { id: "sos",       label: "Send SOS",   icon: "🆘" },
    { id: "responder", label: "Responder",  icon: "📋" },
    { id: "resources", label: "Resources",  icon: "🚑" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>

      {/* ── Header ────────────────────────────────────────────────────── */}
      <header style={{
        height: "var(--header-h)", background: "var(--c-brand)", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 var(--sp-5)", flexShrink: 0,
        boxShadow: "0 1px 0 rgba(255,255,255,0.06), 0 2px 8px rgba(15,23,42,0.3)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
          <div style={{
            width: 30, height: 30, background: "var(--c-red)",
            borderRadius: "var(--r-sm)", display: "flex",
            alignItems: "center", justifyContent: "center",
            fontSize: 15, fontWeight: 800, flexShrink: 0,
            boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
            letterSpacing: "-0.03em",
          }}>R</div>
          <span style={{ fontSize: "var(--text-md)", fontWeight: 700, letterSpacing: "-0.02em" }}>
            ResQMesh
          </span>
          <span style={{
            fontSize: "var(--text-2xs)", background: "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.15)", borderRadius: "var(--r-xs)",
            padding: "2px 6px", color: "rgba(255,255,255,0.6)", fontWeight: 600,
            letterSpacing: "0.04em", textTransform: "uppercase",
          }}>Prototype</span>
        </div>
        <span style={{ fontSize: "var(--text-2xs)", color: "rgba(255,255,255,0.4)", fontFamily: "var(--font-mono)" }}>
          {DEMO_INCIDENT_ID}
        </span>
      </header>

      {/* ── Status Bar ────────────────────────────────────────────────── */}
      <StatusBar status={networkStatus} />

      {/* ── Tabs ──────────────────────────────────────────────────────── */}
      <nav role="tablist" aria-label="Application sections" style={{
        display: "flex", background: "var(--c-surface)",
        borderBottom: "1px solid var(--c-border)", flexShrink: 0,
        boxShadow: "0 1px 0 var(--c-border)",
      }}>
        {tabs.map((tab, i) => {
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} role="tab" id={`tab-${tab.id}`}
              aria-selected={active} aria-controls={`panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              tabIndex={active ? 0 : -1}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") { const n = tabs[(i+1)%tabs.length]; setActiveTab(n.id); document.getElementById(`tab-${n.id}`)?.focus(); }
                if (e.key === "ArrowLeft")  { const p = tabs[(i+tabs.length-1)%tabs.length]; setActiveTab(p.id); document.getElementById(`tab-${p.id}`)?.focus(); }
              }}
              style={{
                flex: 1, height: "var(--tab-h)",
                display: "flex", alignItems: "center", justifyContent: "center",
                gap: "var(--sp-2)",
                fontSize: "var(--text-sm)", fontFamily: "var(--font)",
                fontWeight: active ? 600 : 400,
                color: active ? "var(--c-text)" : "var(--c-muted)",
                background: "none", border: "none",
                borderBottom: active ? "2.5px solid var(--c-brand)" : "2.5px solid transparent",
                paddingBottom: "1px", cursor: "pointer",
                transition: "color var(--dur-fast), border-color var(--dur-fast)",
              }}
            >
              <span aria-hidden="true" style={{ fontSize: 15 }}>{tab.icon}</span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* ── Content ───────────────────────────────────────────────────── */}
      <main style={{
        flex: 1, maxWidth: "var(--max-w)", width: "100%",
        margin: "0 auto", padding: "var(--sp-6) var(--sp-4) var(--sp-10)",
      }}>
        <div id="panel-sos" role="tabpanel" aria-labelledby="tab-sos" hidden={activeTab !== "sos"}>
          {activeTab === "sos" && <SOSForm />}
        </div>
        <div id="panel-responder" role="tabpanel" aria-labelledby="tab-responder" hidden={activeTab !== "responder"}>
          {activeTab === "responder" && <ResponderConsole incidentId={DEMO_INCIDENT_ID} />}
        </div>
        <div id="panel-resources" role="tabpanel" aria-labelledby="tab-resources" hidden={activeTab !== "resources"}>
          {activeTab === "resources" && (
            <ResourcesPanel needEventId={selectedNeedEventId} onChange={setSelectedNeedEventId} />
          )}
        </div>
      </main>

      {/* ── Footer ────────────────────────────────────────────────────── */}
      <footer style={{
        padding: "var(--sp-4) var(--sp-5)", borderTop: "1px solid var(--c-border)",
        background: "var(--c-surface)",
        display: "flex", justifyContent: "space-between", alignItems: "center",
        flexWrap: "wrap", gap: "var(--sp-2)",
      }}>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--c-muted)" }}>
          ResQMesh · Offline-first emergency coordination
        </span>
        <span style={{ fontSize: "var(--text-xs)", color: "var(--c-placeholder)" }}>
          Demo — synthetic data only
        </span>
      </footer>
    </div>
  );
}

function ResourcesPanel({ needEventId, onChange }: { needEventId: string; onChange: (s: string) => void }) {
  return (
    <div>
      <div style={{ marginBottom: "var(--sp-6)" }}>
        <h2 className="section-title">Resource Matches</h2>
        <p className="section-desc">Enter an SOS event ID to find nearby available resources.</p>
      </div>
      <div className="form-group">
        <label className="form-label" htmlFor="need-event-id">SOS Event ID</label>
        <input id="need-event-id" className="form-input" type="text" value={needEventId}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste event UUID from SOS form…"
          style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", letterSpacing: "0.03em" }} />
        <p className="form-hint">Copy the event_id shown after submitting an SOS alert.</p>
      </div>
      {needEventId
        ? <ResourceMatches needEventId={needEventId} responderId="responder-demo-001" />
        : <div className="empty-state">
            <p className="empty-state-title">No event selected</p>
            <p className="empty-state-desc">Enter an SOS event ID above to view resource matches for that incident.</p>
          </div>
      }
    </div>
  );
}
