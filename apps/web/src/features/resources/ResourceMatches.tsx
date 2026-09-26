/**
 * ResQMesh — Resource Matches
 * Per FRONTEND.md: rationale-based matching, no fake AI scores, clear assignment flow.
 */

import React, { useState, useEffect, useCallback } from "react";
import { ResourceStatus, ResourceCapability } from "@contracts";

// ── Types ──────────────────────────────────────────────────────────────────

type AsyncStatus = "IDLE" | "LOADING" | "SUCCESS" | "ERROR";

interface ResourceMatch {
  resource_id: string;
  capability: ResourceCapability;
  status: ResourceStatus;
  available_units: number;
  region: string;
  region_geohash?: string;
  observed_at: string;
  rationale: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const CAPABILITY_LABELS: Record<string, string> = {
  [ResourceCapability.AMBULANCE]:     "Ambulance",
  [ResourceCapability.HOSPITAL_BED]:  "Hospital Bed",
  [ResourceCapability.SHELTER_BED]:   "Shelter Bed",
  [ResourceCapability.FOOD_WATER]:    "Food / Water",
  [ResourceCapability.GENERATOR]:     "Generator",
};

const CAPABILITY_ICONS: Record<string, string> = {
  [ResourceCapability.AMBULANCE]:     "🚑",
  [ResourceCapability.HOSPITAL_BED]:  "🏥",
  [ResourceCapability.SHELTER_BED]:   "🏠",
  [ResourceCapability.FOOD_WATER]:    "🍶",
  [ResourceCapability.GENERATOR]:     "⚡",
};

function relativeTime(iso: string): string {
  try {
    const diff = Date.now() - new Date(iso).getTime();
    const min = Math.floor(diff / 60000);
    if (min < 1) return "just now";
    if (min === 1) return "1 min ago";
    if (min < 60) return `${min} min ago`;
    return `${Math.floor(min / 60)}h ago`;
  } catch { return iso; }
}

// ── Component ──────────────────────────────────────────────────────────────

interface ResourceMatchesProps {
  needEventId: string;
  apiBaseUrl?: string;
  responderId?: string;
}

export function ResourceMatches({ needEventId, apiBaseUrl, responderId }: ResourceMatchesProps): React.ReactElement {
  const resolvedBase = apiBaseUrl
    ?? (typeof window !== "undefined"
        ? (window as Record<string, unknown>).__VITE_API_BASE_URL__ as string ?? "http://localhost:8000"
        : "http://localhost:8000");

  const [matches, setMatches] = useState<ResourceMatch[]>([]);
  const [fetchStatus, setFetchStatus] = useState<AsyncStatus>("IDLE");
  const [fetchError, setFetchError] = useState("");
  const [assignStatus, setAssignStatus] = useState<Record<string, AsyncStatus>>({});
  const [assignIds, setAssignIds] = useState<Record<string, string>>({});
  const [assignErrors, setAssignErrors] = useState<Record<string, string>>({});

  const fetchMatches = useCallback(async () => {
    setFetchStatus("LOADING");
    setFetchError("");
    try {
      const res = await fetch(`${resolvedBase}/v1/resources/matches?need_event_id=${encodeURIComponent(needEventId)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { matches: ResourceMatch[] };
      setMatches(data.matches ?? []);
      setFetchStatus("SUCCESS");
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Unknown error");
      setFetchStatus("ERROR");
    }
  }, [resolvedBase, needEventId]);

  useEffect(() => { void fetchMatches(); }, [fetchMatches]);

  const handleAssign = useCallback(async (resourceId: string, rationale: string[]) => {
    if (!responderId || assignStatus[resourceId] === "LOADING") return;
    setAssignStatus((p) => ({ ...p, [resourceId]: "LOADING" }));
    setAssignErrors((p) => { const n = { ...p }; delete n[resourceId]; return n; });
    try {
      const res = await fetch(`${resolvedBase}/v1/assignments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ need_event_id: needEventId, resource_id: resourceId, rationale: rationale.join("; "), created_by: responderId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json() as { assignment_id: string };
      setAssignIds((p) => ({ ...p, [resourceId]: data.assignment_id }));
      setAssignStatus((p) => ({ ...p, [resourceId]: "SUCCESS" }));
    } catch (err) {
      setAssignErrors((p) => ({ ...p, [resourceId]: err instanceof Error ? err.message : "Failed" }));
      setAssignStatus((p) => ({ ...p, [resourceId]: "ERROR" }));
    }
  }, [responderId, needEventId, resolvedBase, assignStatus]);

  // ── Loading ────────────────────────────────────────────────────────────
  if (fetchStatus === "LOADING") {
    return (
      <div aria-busy="true" aria-label="Loading matches">
        {[1, 2].map((i) => (
          <div key={i} className="card" style={{ marginBottom: "var(--sp-3)" }}>
            <div className="card-body">
              <div className="skeleton" style={{ width: "50%", height: 18, marginBottom: "var(--sp-3)" }} />
              <div className="skeleton" style={{ width: "80%", height: 14 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────
  if (fetchStatus === "ERROR") {
    return (
      <div>
        <div className="alert alert-error" style={{ marginBottom: "var(--sp-4)" }} role="alert">
          <strong>Failed to load matches</strong>
          <p style={{ marginTop: "var(--sp-1)", fontSize: "var(--text-xs)" }}>{fetchError}</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => void fetchMatches()}>↺ Retry</button>
      </div>
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────────
  if (fetchStatus === "SUCCESS" && matches.length === 0) {
    return (
      <div style={{
        border: "1.5px dashed var(--c-border-strong)",
        borderRadius: "var(--r-lg)",
        padding: "var(--sp-10) var(--sp-6)",
        textAlign: "center",
        color: "var(--c-muted)",
      }}>
        <p style={{ fontSize: "var(--text-md)", color: "var(--c-text-2)", marginBottom: "var(--sp-2)" }}>No matches found</p>
        <p style={{ fontSize: "var(--text-sm)" }}>
          No available resources found for this need event.
        </p>
      </div>
    );
  }

  // ── Results ────────────────────────────────────────────────────────────
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
      {matches.map((match) => {
        const aStatus = assignStatus[match.resource_id] ?? "IDLE";
        const aId = assignIds[match.resource_id];
        const aErr = assignErrors[match.resource_id];
        const region = (match.region_geohash ?? match.region ?? "").slice(0, 4);
        const isAvailable = match.status === ResourceStatus.AVAILABLE && match.available_units > 0;

        return (
          <li key={match.resource_id} className="card" style={{ marginBottom: "var(--sp-3)" }}>
            {/* Suggested banner */}
            <div style={{
              background: "var(--c-surface-2)",
              borderBottom: "1px solid var(--c-border)",
              padding: "var(--sp-2) var(--sp-5)",
              fontSize: "var(--text-xs)",
              fontWeight: "var(--weight-semibold)",
              color: "var(--c-muted)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              borderRadius: "var(--r-lg) var(--r-lg) 0 0",
            }}>
              Suggested match
            </div>

            <div className="card-body">
              {/* Resource header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "var(--sp-2)", marginBottom: "var(--sp-4)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-3)" }}>
                  <span style={{ fontSize: 24 }} aria-hidden="true">
                    {CAPABILITY_ICONS[match.capability] ?? "📦"}
                  </span>
                  <div>
                    <p style={{ fontWeight: "var(--weight-bold)", fontSize: "var(--text-base)" }}>
                      {CAPABILITY_LABELS[match.capability] ?? match.capability}
                    </p>
                    <p style={{ fontSize: "var(--text-xs)", color: "var(--c-muted)", marginTop: 2, fontFamily: "var(--font-mono)" }}>
                      {region}… · {relativeTime(match.observed_at)}
                    </p>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "var(--sp-1)" }}>
                  <span className={`badge ${isAvailable ? "badge-green" : "badge-gray"}`}>
                    {match.status === ResourceStatus.AVAILABLE ? "Available" : match.status}
                  </span>
                  <span style={{ fontSize: "var(--text-xs)", color: "var(--c-muted)" }}>
                    {match.available_units} unit{match.available_units !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>

              {/* Rationale */}
              {match.rationale.length > 0 && (
                <div style={{ marginBottom: "var(--sp-4)" }}>
                  <p style={{
                    fontSize: "var(--text-xs)",
                    fontWeight: "var(--weight-semibold)",
                    color: "var(--c-muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: "var(--sp-2)",
                  }}>
                    Match rationale
                  </p>
                  <ul style={{ margin: 0, paddingLeft: "var(--sp-5)", fontSize: "var(--text-sm)", color: "var(--c-text-2)" }}>
                    {match.rationale.map((r, j) => <li key={j} style={{ marginBottom: 4 }}>{r}</li>)}
                  </ul>
                </div>
              )}

              {/* Assignment actions */}
              {responderId && (
                <>
                  {aStatus === "IDLE" && (
                    <button
                      type="button"
                      className="btn btn-primary btn-full"
                      onClick={() => void handleAssign(match.resource_id, match.rationale)}
                    >
                      Propose assignment
                    </button>
                  )}
                  {aStatus === "LOADING" && (
                    <div role="status" aria-live="polite" style={{ padding: "var(--sp-3)", textAlign: "center", fontSize: "var(--text-sm)", color: "var(--c-muted)" }}>
                      Creating assignment…
                    </div>
                  )}
                  {aStatus === "SUCCESS" && aId && (
                    <div className="alert alert-success" role="status" style={{ fontSize: "var(--text-sm)" }}>
                      Assignment created — <code>{aId.slice(0, 12)}…</code>
                    </div>
                  )}
                  {aStatus === "ERROR" && aErr && (
                    <div className="alert alert-error" role="alert" style={{ fontSize: "var(--text-sm)" }}>
                      <strong>Failed:</strong> {aErr}
                      <div style={{ marginTop: "var(--sp-2)" }}>
                        <button type="button" className="btn btn-ghost" style={{ minHeight: 36, fontSize: "var(--text-sm)" }}
                          onClick={() => setAssignStatus((p) => ({ ...p, [match.resource_id]: "IDLE" }))}>
                          ↺ Retry
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
