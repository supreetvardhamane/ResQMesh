/**
 * ResQMesh — Responder Console
 * Per FRONTEND.md: meaningful info only, cursor-pagination, loading/empty/error states.
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  EventEnvelope,
  TrustState,
  DeliveryState,
  EventType,
} from "@contracts";
import { ProvenancePanel } from "./ProvenancePanel";
import { ConfidenceDecay } from "./ConfidenceDecay";

// ── Types ──────────────────────────────────────────────────────────────────

interface EventsResponse {
  events: EventEnvelope[];
  next_cursor?: string;
  as_of: string;
}

interface EnrichedEvent {
  envelope: EventEnvelope;
  trustState: TrustState;
  deliveryState: DeliveryState;
  relayHops: number;
  signatureState: "VALID" | "INVALID" | "UNVERIFIED";
}

const PAGE_LIMIT = 10;
const DEFAULT_API = typeof window !== "undefined"
  ? (window as Record<string, unknown>).__VITE_API_BASE_URL__ as string ?? "http://localhost:8000"
  : "http://localhost:8000";

const EVENT_LABELS: Record<string, string> = {
  [EventType.SOS_CREATED]:         "SOS — Emergency request",
  [EventType.RESOURCE_UPSERTED]:   "Resource update",
  [EventType.ROAD_REPORTED]:       "Road condition report",
  [EventType.REPORT_CORROBORATED]: "Corroboration added",
  [EventType.ASSIGNMENT_CREATED]:  "Assignment created",
  [EventType.ASSIGNMENT_UPDATED]:  "Assignment updated",
};

const PRIORITY_BADGE: Record<string, string> = {
  CRITICAL: "badge-red",
  HIGH:     "badge-amber",
  NORMAL:   "badge-gray",
};

// ── Component ──────────────────────────────────────────────────────────────

interface ResponderConsoleProps {
  incidentId: string;
  apiBaseUrl?: string;
}

export function ResponderConsole({ incidentId, apiBaseUrl }: ResponderConsoleProps): React.ReactElement {
  const base = apiBaseUrl ?? DEFAULT_API;
  const [events, setEvents] = useState<EnrichedEvent[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error" | "empty">("idle");
  const [moreStatus, setMoreStatus] = useState<"idle" | "loading" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [corroborated, setCorroborated] = useState<Set<string>>(new Set());

  const fetchPage = useCallback(async (nextCursor?: string, append = false) => {
    const setS = append ? setMoreStatus : setStatus;
    (setS as (s: "loading") => void)("loading");
    setError(null);

    try {
      const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
      if (nextCursor) params.set("cursor", nextCursor);
      const res = await fetch(
        `${base}/v1/incidents/${encodeURIComponent(incidentId)}/events?${params}`,
        { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(10000) }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      const data: EventsResponse = await res.json() as EventsResponse;
      const enriched: EnrichedEvent[] = data.events.map((e) => ({
        envelope: e,
        trustState: TrustState.UNVERIFIED,
        deliveryState: DeliveryState.SYNCED,
        relayHops: 0,
        signatureState: "UNVERIFIED" as const,
      }));
      setEvents((prev) => append ? [...prev, ...enriched] : enriched);
      setCursor(data.next_cursor);
      setHasMore(!!data.next_cursor);
      setAsOf(data.as_of);
      if (append) setMoreStatus("idle");
      else setStatus(data.events.length === 0 ? "empty" : "success");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      if (append) setMoreStatus("error");
      else setStatus("error");
    }
  }, [incidentId, base]);

  useEffect(() => { void fetchPage(); }, [fetchPage]);

  const handleCorroborate = (eventId: string) =>
    setCorroborated((prev) => new Set([...prev, eventId]));

  // ── Skeleton ────────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div aria-busy="true" aria-label="Loading events">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "var(--sp-5)" }}>
          <div className="skeleton" style={{ width: 160, height: 24 }} />
          <div className="skeleton" style={{ width: 80, height: 16 }} />
        </div>
        {[1, 2, 3].map((i) => (
          <div key={i} className="card" style={{ marginBottom: "var(--sp-3)" }}>
            <div className="card-body">
              <div className="skeleton" style={{ width: "60%", height: 18, marginBottom: "var(--sp-3)" }} />
              <div className="skeleton" style={{ width: "40%", height: 14, marginBottom: "var(--sp-2)" }} />
              <div className="skeleton" style={{ width: "80%", height: 14 }} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (status === "error") {
    return (
      <div>
        <h2 style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-bold)", marginBottom: "var(--sp-4)", letterSpacing: "-0.01em" }}>
          Responder Console
        </h2>
        <div className="alert alert-error" role="alert" style={{ marginBottom: "var(--sp-4)" }}>
          <strong>Failed to load events</strong>
          <p style={{ marginTop: "var(--sp-1)", fontSize: "var(--text-xs)" }}>{error}</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => { setEvents([]); setCursor(undefined); void fetchPage(); }}>
          ↺ Retry
        </button>
      </div>
    );
  }

  // ── Empty ─────────────────────────────────────────────────────────────
  if (status === "empty") {
    return (
      <div>
        <h2 style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-bold)", marginBottom: "var(--sp-4)", letterSpacing: "-0.01em" }}>
          Responder Console
        </h2>
        <div style={{
          border: "1.5px dashed var(--c-border-strong)",
          borderRadius: "var(--r-lg)",
          padding: "var(--sp-10) var(--sp-6)",
          textAlign: "center",
          color: "var(--c-muted)",
        }}>
          <p style={{ fontSize: "var(--text-md)", color: "var(--c-text-2)", marginBottom: "var(--sp-2)" }}>No events yet</p>
          <p style={{ fontSize: "var(--text-sm)" }}>
            No events found for incident <code>{incidentId}</code>.
          </p>
        </div>
      </div>
    );
  }

  // ── Success ──────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--sp-5)" }}>
        <div>
          <h2 style={{ fontSize: "var(--text-lg)", fontWeight: "var(--weight-bold)", letterSpacing: "-0.01em", marginBottom: "var(--sp-1)" }}>
            Responder Console
          </h2>
          <p style={{ fontSize: "var(--text-xs)", color: "var(--c-muted)" }}>
            Incident: <code>{incidentId}</code>
            {asOf && <> · As of {new Date(asOf).toLocaleTimeString()}</>}
            {" "}<span className="badge badge-amber" style={{ verticalAlign: "middle" }}>Synthetic data</span>
          </p>
        </div>
      </div>

      {/* Event list */}
      <div role="feed" aria-label="Incident events" aria-live="polite">
        {events.map((item, i) => {
          const { envelope, trustState, deliveryState, relayHops, signatureState } = item;
          const isRoad = envelope.type === EventType.ROAD_REPORTED;
          const isCorrob = corroborated.has(envelope.event_id);
          const payload = envelope.payload as Record<string, unknown>;
          const priorityCls = PRIORITY_BADGE[envelope.priority] ?? "badge-gray";

          return (
            <article
              key={envelope.event_id}
              className="card"
              style={{ marginBottom: "var(--sp-3)" }}
              aria-label={`Event ${i + 1}: ${EVENT_LABELS[envelope.type] ?? envelope.type}`}
            >
              <div className="card-body">
                {/* Header */}
                <div style={{ display: "flex", gap: "var(--sp-2)", flexWrap: "wrap", alignItems: "center", marginBottom: "var(--sp-3)" }}>
                  <strong style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)" }}>
                    {EVENT_LABELS[envelope.type] ?? envelope.type}
                  </strong>
                  <span className={`badge ${priorityCls}`}>{envelope.priority}</span>
                  <span className="badge badge-gray" style={{ fontFamily: "var(--font-mono)" }}>
                    {envelope.location_geohash.slice(0, 4)}**
                  </span>
                </div>

                {/* SOS payload */}
                {envelope.type === EventType.SOS_CREATED && payload.need && (
                  <p style={{ fontSize: "var(--text-sm)", marginBottom: "var(--sp-3)", color: "var(--c-text-2)" }}>
                    Need: <strong>{String(payload.need)}</strong>
                  </p>
                )}

                {/* Road report payload */}
                {isRoad && (
                  <p style={{ fontSize: "var(--text-sm)", marginBottom: "var(--sp-3)", color: "var(--c-text-2)" }}>
                    Condition: <strong>{String(payload.condition ?? "—")}</strong> on {String(payload.subject_id ?? "—")}
                  </p>
                )}

                {/* Provenance */}
                <ProvenancePanel
                  eventId={envelope.event_id}
                  origin={envelope.origin}
                  signatureState={isCorrob ? "VALID" : signatureState}
                  relayHops={relayHops}
                  freshness={envelope.created_at}
                  trustState={isCorrob ? TrustState.CORROBORATED : trustState}
                  deliveryState={deliveryState}
                />

                {/* Confidence decay for road reports */}
                {isRoad && (
                  <div style={{ marginTop: "var(--sp-4)" }}>
                    <ConfidenceDecay
                      lastConfirmedAt={isCorrob ? new Date().toISOString() : envelope.created_at}
                      distinctConfirmingKeyCount={isCorrob ? 2 : 1}
                      subjectId={String(payload.subject_id ?? "unknown")}
                      condition={String(payload.condition ?? "UNKNOWN")}
                      onCorroborate={!isCorrob ? () => handleCorroborate(envelope.event_id) : undefined}
                    />
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Pagination */}
      {hasMore && (
        <div style={{ textAlign: "center", marginTop: "var(--sp-4)" }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => { if (cursor) void fetchPage(cursor, true); }}
            disabled={moreStatus === "loading"}
            aria-busy={moreStatus === "loading"}
          >
            {moreStatus === "loading" ? "Loading…" : "Load more events"}
          </button>
          {moreStatus === "error" && (
            <p role="alert" className="text-sm" style={{ color: "var(--c-red)", marginTop: "var(--sp-2)" }}>
              Failed to load more — <button type="button" onClick={() => { if (cursor) void fetchPage(cursor, true); }} style={{ background: "none", border: "none", color: "var(--c-red)", cursor: "pointer", textDecoration: "underline" }}>retry</button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
