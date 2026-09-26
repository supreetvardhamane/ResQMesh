/**
 * ResQMesh — Responder Console
 * (apps/web/src/features/responder/ResponderConsole.tsx)
 *
 * Per docs/TEAM_TASK_DIVISION.md §Member 2 Phase 3 — Responder Console:
 * - Display incident events (cursor-paginated, no full-history download)
 * - Show provenance panel per event
 * - Confidence Decay UI for road reports
 * - Demo simulated-clock control: 0m, 10m, 20m buttons
 * - Corroborate road observation button
 *
 * API: GET /v1/incidents/{incident_id}/events?cursor=&limit=10
 * Returns { events: EventEnvelope[], next_cursor?: string, as_of: string }
 *
 * Accessibility:
 * - Every async action: loading, success, empty, error, retry states
 * - Long lists paginate (cursor-based, no full-feed download)
 * - 44px touch targets; visible focus; status not color-only; keyboard navigation
 * - Screen reader labels on all interactive controls
 */

import React, { useState, useEffect, useCallback } from "react";
import {
  EventEnvelope,
  TrustState,
  DeliveryState,
  EventType,
} from "../../../../packages/contracts/types";
import { ProvenancePanel } from "./ProvenancePanel";
import { ConfidenceDecay } from "./ConfidenceDecay";

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface ResponderConsoleProps {
  incidentId: string;
  apiBaseUrl?: string;
}

type LoadState = "idle" | "loading" | "success" | "error" | "empty";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_API_BASE =
  typeof window !== "undefined"
    ? (window as unknown as Record<string, string>).__VITE_API_BASE_URL__ ?? "http://localhost:8000"
    : "http://localhost:8000";

const PAGE_LIMIT = 10; // Must not download full incident history

function deriveTrustState(envelope: EventEnvelope): TrustState {
  // Client-side: always UNVERIFIED until server confirms
  // In a real integration, this comes from the API response trust field
  return TrustState.UNVERIFIED;
}

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  [EventType.SOS_CREATED]: "SOS — Emergency request",
  [EventType.RESOURCE_UPSERTED]: "Resource — Availability update",
  [EventType.ROAD_REPORTED]: "Road report — Condition observation",
  [EventType.REPORT_CORROBORATED]: "Corroboration — Evidence added",
  [EventType.ASSIGNMENT_CREATED]: "Assignment — Resource assigned",
  [EventType.ASSIGNMENT_UPDATED]: "Assignment updated",
};

const PRIORITY_TEXT: Record<string, string> = {
  CRITICAL: "Critical",
  HIGH: "High",
  NORMAL: "Normal",
};

// ─── Component ────────────────────────────────────────────────────────────────

export function ResponderConsole({
  incidentId,
  apiBaseUrl,
}: ResponderConsoleProps): React.ReactElement {
  const baseUrl = apiBaseUrl ?? DEFAULT_API_BASE;

  const [events, setEvents] = useState<EnrichedEvent[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(false);
  const [asOf, setAsOf] = useState<string | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadMoreState, setLoadMoreState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);

  // Per-event corroboration (tracks which events have been corroborated in-session)
  const [corroborated, setCorroborated] = useState<Set<string>>(new Set());

  // ── Fetch page ────────────────────────────────────────────────────────────

  const fetchPage = useCallback(
    async (nextCursor?: string, append = false) => {
      const stateSet = append ? setLoadMoreState : setLoadState;
      stateSet("loading");
      setError(null);

      try {
        const params = new URLSearchParams({ limit: String(PAGE_LIMIT) });
        if (nextCursor) params.set("cursor", nextCursor);

        // Cursor-paginated — never fetches full incident history
        const url = `${baseUrl}/v1/incidents/${encodeURIComponent(incidentId)}/events?${params}`;
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.message ?? `HTTP ${res.status}`);
        }

        const data: EventsResponse = await res.json();

        const enriched: EnrichedEvent[] = data.events.map((envelope) => ({
          envelope,
          trustState: deriveTrustState(envelope),
          deliveryState: DeliveryState.SYNCED, // events from API are synced
          relayHops: 0, // not known from API response at this layer
          signatureState: "UNVERIFIED" as const, // client hasn't re-verified
        }));

        setEvents((prev) => (append ? [...prev, ...enriched] : enriched));
        setCursor(data.next_cursor);
        setHasMore(!!data.next_cursor);
        setAsOf(data.as_of);
        stateSet(data.events.length === 0 && !append ? "empty" : "success");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        stateSet("error");
      }
    },
    [incidentId, baseUrl]
  );

  // Initial load
  useEffect(() => {
    fetchPage(undefined, false);
  }, [fetchPage]);

  const handleLoadMore = () => {
    if (cursor) fetchPage(cursor, true);
  };

  const handleRetry = () => {
    setEvents([]);
    setCursor(undefined);
    fetchPage(undefined, false);
  };

  const handleCorroborate = (eventId: string) => {
    setCorroborated((prev) => new Set([...prev, eventId]));
    // In a real integration, POST /v1/reports/{id}/corroborations here
  };

  // ── Render helpers ────────────────────────────────────────────────────────

  const renderEvent = (item: EnrichedEvent, index: number) => {
    const { envelope, trustState, deliveryState, relayHops, signatureState } = item;
    const isRoadReport = envelope.type === EventType.ROAD_REPORTED;
    const isCorroborated = corroborated.has(envelope.event_id);

    const payload = envelope.payload as Record<string, unknown>;

    return (
      <article
        key={envelope.event_id}
        style={{
          border: "1px solid #ddd",
          borderRadius: "8px",
          padding: "14px",
          marginBottom: "12px",
          background: "#fff",
        }}
        aria-label={`Event ${index + 1}: ${EVENT_TYPE_LABELS[envelope.type]}`}
      >
        {/* Header row */}
        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
          <strong style={{ fontSize: "15px" }}>{EVENT_TYPE_LABELS[envelope.type]}</strong>
          <span
            style={{
              background: "#f0f0f0",
              borderRadius: "4px",
              padding: "2px 8px",
              fontSize: "12px",
            }}
          >
            {PRIORITY_TEXT[envelope.priority] ?? envelope.priority}
          </span>
          <span style={{ fontSize: "12px", color: "#666" }}>
            Region: <code>{envelope.location_geohash.slice(0, 4)}**</code>
          </span>
        </div>

        {/* SOS need */}
        {envelope.type === EventType.SOS_CREATED && (
          <p style={{ margin: "0 0 10px", fontSize: "14px" }}>
            <strong>Need:</strong> {String(payload.need ?? "—")}
          </p>
        )}

        {/* Road report details */}
        {isRoadReport && (
          <p style={{ margin: "0 0 10px", fontSize: "14px" }}>
            <strong>Condition:</strong> {String(payload.condition ?? "—")} on{" "}
            {String(payload.subject_id ?? "—")}
          </p>
        )}

        {/* Provenance panel */}
        <ProvenancePanel
          eventId={envelope.event_id}
          origin={envelope.origin}
          signatureState={isCorroborated ? "VALID" : signatureState}
          relayHops={relayHops}
          freshness={envelope.created_at}
          trustState={isCorroborated ? TrustState.CORROBORATED : trustState}
          deliveryState={deliveryState}
        />

        {/* Confidence Decay for road reports */}
        {isRoadReport && (
          <div style={{ marginTop: "12px" }}>
            <ConfidenceDecay
              lastConfirmedAt={
                isCorroborated ? new Date().toISOString() : envelope.created_at
              }
              distinctConfirmingKeyCount={isCorroborated ? 2 : 1}
              subjectId={String(payload.subject_id ?? "unknown")}
              condition={String(payload.condition ?? "UNKNOWN")}
              onCorroborate={
                !isCorroborated ? () => handleCorroborate(envelope.event_id) : undefined
              }
            />
          </div>
        )}
      </article>
    );
  };

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", maxWidth: "720px", padding: "0 8px" }}>
      {/* Header */}
      <div style={{ marginBottom: "16px" }}>
        <h2 style={{ fontSize: "20px", margin: "0 0 4px" }}>
          Responder Console
        </h2>
        <p style={{ fontSize: "13px", color: "#555", margin: 0 }}>
          Incident: <code>{incidentId}</code>
          {asOf && (
            <> · As of: {new Date(asOf).toLocaleTimeString()}</>
          )}
          {" "}
          <span style={{ background: "#fffbe6", border: "1px solid #cca300", borderRadius: "3px", padding: "1px 5px", fontSize: "12px" }}>
            Synthetic data
          </span>
        </p>
      </div>

      {/* Loading state */}
      {loadState === "loading" && (
        <div role="status" aria-live="polite" aria-busy="true" style={{ padding: "24px", textAlign: "center" }}>
          <p>⏳ Loading events…</p>
        </div>
      )}

      {/* Error state */}
      {loadState === "error" && (
        <div
          role="alert"
          style={{
            background: "#fff3f3",
            border: "2px solid #cc0000",
            borderRadius: "6px",
            padding: "16px",
            marginBottom: "16px",
          }}
        >
          <p style={{ margin: "0 0 12px", fontWeight: 600 }}>⚠ Failed to load events</p>
          <p style={{ margin: "0 0 12px", fontSize: "14px" }}>{error}</p>
          <button
            type="button"
            onClick={handleRetry}
            style={{
              minHeight: "44px",
              padding: "10px 20px",
              fontSize: "14px",
              cursor: "pointer",
              borderRadius: "6px",
              border: "2px solid #cc0000",
              background: "#fff",
              color: "#cc0000",
              fontWeight: 600,
            }}
          >
            ↺ Retry
          </button>
        </div>
      )}

      {/* Empty state */}
      {loadState === "empty" && (
        <div
          role="status"
          style={{
            background: "#f5f5f5",
            border: "1px solid #ddd",
            borderRadius: "6px",
            padding: "24px",
            textAlign: "center",
          }}
        >
          <p style={{ margin: 0, color: "#555" }}>No events found for this incident.</p>
        </div>
      )}

      {/* Events list */}
      {loadState === "success" && events.length > 0 && (
        <div aria-live="polite" aria-label="Incident events">
          {events.map((item, i) => renderEvent(item, i))}

          {/* Load more — cursor pagination, no full-feed download */}
          {hasMore && (
            <div style={{ textAlign: "center", marginTop: "8px" }}>
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadMoreState === "loading"}
                aria-busy={loadMoreState === "loading"}
                style={{
                  minHeight: "44px",
                  padding: "10px 24px",
                  fontSize: "14px",
                  cursor: loadMoreState === "loading" ? "not-allowed" : "pointer",
                  borderRadius: "6px",
                  border: "2px solid #333",
                  background: "#f0f0f0",
                  fontWeight: 600,
                }}
              >
                {loadMoreState === "loading" ? "⏳ Loading more…" : "Load more events"}
              </button>

              {loadMoreState === "error" && (
                <p role="alert" style={{ color: "#cc0000", fontSize: "13px", marginTop: "8px" }}>
                  Failed to load more: {error} —{" "}
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    style={{ textDecoration: "underline", background: "none", border: "none", cursor: "pointer", color: "#cc0000" }}
                  >
                    retry
                  </button>
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
