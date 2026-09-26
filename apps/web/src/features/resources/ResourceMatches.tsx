/**
 * ResQMesh — Resource Matches Component
 *
 * Displays candidate resource matches for an SOS need event.
 * Per: docs/TEAM_TASK_DIVISION.md §Member 2 Phase 5
 * Per: docs/16_BUILD_CONTRACT.md §Resource matching
 *
 * API: GET /v1/resources/matches?need_event_id=
 * Assignment: POST /v1/assignments (responder only)
 *
 * Accessibility:
 * - Loading, empty, error states
 * - 44px touch targets
 * - Text labels (not color-only)
 * - Keyboard navigation
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  ResourceStatus,
  ResourceCapability,
} from '../../../../packages/contracts/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type AsyncStatus = 'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR';

interface ResourceMatch {
  resource_id: string;
  capability: ResourceCapability;
  status: ResourceStatus;
  available_units: number;
  /** First 4 chars of geohash for display */
  region: string;
  /** Full geohash (never displayed raw — region is sliced) */
  region_geohash?: string;
  observed_at: string;
  rationale: string[];
}

interface ApiMatchesResponse {
  matches: ResourceMatch[];
}

interface AssignmentPayload {
  need_event_id: string;
  resource_id: string;
  rationale: string;
  created_by: string;
}

interface AssignmentResponse {
  assignment_id: string;
}

interface ResourceMatchesProps {
  /** Event ID of the SOS need to match against */
  needEventId: string;
  /** Base API URL; falls back to VITE_API_BASE_URL or localhost:8000 */
  apiBaseUrl?: string;
  /** If provided, enables the assignment creation flow */
  responderId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function capabilityLabel(cap: ResourceCapability): string {
  switch (cap) {
    case ResourceCapability.AMBULANCE:
      return '🚑 Ambulance';
    case ResourceCapability.HOSPITAL_BED:
      return '🏥 Hospital bed';
    case ResourceCapability.SHELTER_BED:
      return '🏠 Shelter bed';
    case ResourceCapability.FOOD_WATER:
      return '🍶 Food / Water';
    case ResourceCapability.GENERATOR:
      return '⚡ Generator';
    default:
      return String(cap);
  }
}

function statusLabel(status: ResourceStatus): string {
  switch (status) {
    case ResourceStatus.AVAILABLE:
      return '✓ Available';
    case ResourceStatus.RESERVED:
      return '⏸ Reserved';
    case ResourceStatus.UNAVAILABLE:
      return '✕ Unavailable';
    default:
      return String(status);
  }
}

function relativeTime(isoString: string): string {
  try {
    const then = new Date(isoString).getTime();
    const diffMs = Date.now() - then;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin === 1) return '1 min ago';
    if (diffMin < 60) return `${diffMin} min ago`;
    const hr = Math.floor(diffMin / 60);
    return `${hr}h ago`;
  } catch {
    return isoString;
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

/**
 * ResourceMatches — Shows candidate resource matches for a need event.
 *
 * Responders can propose an assignment (POST /v1/assignments).
 * Shows rationale array per match (factual, not AI score).
 * Max 3 matches per spec; handles more gracefully.
 */
export function ResourceMatches({
  needEventId,
  apiBaseUrl,
  responderId,
}: ResourceMatchesProps): React.ReactElement {
  const resolvedBase =
    apiBaseUrl ??
    (typeof import.meta !== 'undefined' && (import.meta as { env?: { VITE_API_BASE_URL?: string } }).env?.VITE_API_BASE_URL) ??
    'http://localhost:8000';

  const [matches, setMatches] = useState<ResourceMatch[]>([]);
  const [fetchStatus, setFetchStatus] = useState<AsyncStatus>('IDLE');
  const [fetchError, setFetchError] = useState<string>('');

  // Per-resource assignment state
  const [assignmentStatus, setAssignmentStatus] = useState<
    Record<string, AsyncStatus>
  >({});
  const [assignmentIds, setAssignmentIds] = useState<Record<string, string>>({});
  const [assignmentErrors, setAssignmentErrors] = useState<Record<string, string>>({});

  // ── Fetch matches ──────────────────────────────────────────────────────────

  const fetchMatches = useCallback(async () => {
    setFetchStatus('LOADING');
    setFetchError('');

    try {
      const url = `${resolvedBase}/v1/resources/matches?need_event_id=${encodeURIComponent(needEventId)}`;
      const resp = await fetch(url);
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        throw new Error(`HTTP ${resp.status}: ${body || resp.statusText}`);
      }
      const data: ApiMatchesResponse = await resp.json() as ApiMatchesResponse;
      setMatches(data.matches ?? []);
      setFetchStatus('SUCCESS');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown fetch error';
      setFetchError(msg);
      setFetchStatus('ERROR');
    }
  }, [resolvedBase, needEventId]);

  useEffect(() => {
    void fetchMatches();
  }, [fetchMatches]);

  // ── Create assignment ──────────────────────────────────────────────────────

  const handleAssign = useCallback(
    async (resourceId: string, rationale: string[]) => {
      if (!responderId) return;
      if (assignmentStatus[resourceId] === 'LOADING') return;

      setAssignmentStatus((prev) => ({ ...prev, [resourceId]: 'LOADING' }));
      setAssignmentErrors((prev) => {
        const next = { ...prev };
        delete next[resourceId];
        return next;
      });

      try {
        const payload: AssignmentPayload = {
          need_event_id: needEventId,
          resource_id: resourceId,
          rationale: rationale.join('; '),
          created_by: responderId,
        };

        const resp = await fetch(`${resolvedBase}/v1/assignments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!resp.ok) {
          const body = await resp.text().catch(() => '');
          throw new Error(`HTTP ${resp.status}: ${body || resp.statusText}`);
        }

        const data: AssignmentResponse = await resp.json() as AssignmentResponse;
        setAssignmentIds((prev) => ({ ...prev, [resourceId]: data.assignment_id }));
        setAssignmentStatus((prev) => ({ ...prev, [resourceId]: 'SUCCESS' }));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Assignment failed';
        setAssignmentErrors((prev) => ({ ...prev, [resourceId]: msg }));
        setAssignmentStatus((prev) => ({ ...prev, [resourceId]: 'ERROR' }));
      }
    },
    [responderId, needEventId, resolvedBase, assignmentStatus]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        maxWidth: '600px',
        fontFamily: 'system-ui, sans-serif',
        boxSizing: 'border-box',
      }}
    >
      <h2 style={{ fontSize: '17px', marginTop: 0, marginBottom: '12px' }}>
        Resource Matches
      </h2>
      <p style={{ fontSize: '12px', color: '#777', marginBottom: '14px', marginTop: 0 }}>
        Need event: <code style={{ fontSize: '11px' }}>{needEventId.slice(0, 12)}…</code>
      </p>

      {/* Loading */}
      {fetchStatus === 'LOADING' && (
        <div
          role="status"
          aria-live="polite"
          style={{ padding: '24px', textAlign: 'center', color: '#555', fontSize: '15px' }}
        >
          ⏳ Loading resource matches…
        </div>
      )}

      {/* Error */}
      {fetchStatus === 'ERROR' && (
        <div role="alert" style={{ padding: '14px', background: '#fff0f0', border: '1px solid #f99', borderRadius: '8px', marginBottom: '12px' }}>
          <p style={{ fontWeight: 700, margin: '0 0 6px 0' }}>✕ Failed to load matches</p>
          <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#555' }}>{fetchError}</p>
          <button
            onClick={() => { void fetchMatches(); }}
            style={{
              minHeight: '44px',
              padding: '0 18px',
              fontSize: '14px',
              fontWeight: 600,
              background: '#333',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
            onFocus={(e) => { (e.currentTarget as HTMLButtonElement).style.outline = '3px solid #0066cc'; }}
            onBlur={(e) => { (e.currentTarget as HTMLButtonElement).style.outline = 'none'; }}
          >
            ↺ Retry
          </button>
        </div>
      )}

      {/* Empty */}
      {fetchStatus === 'SUCCESS' && matches.length === 0 && (
        <div style={{ padding: '24px', textAlign: 'center', color: '#777', fontSize: '14px', border: '1px dashed #ccc', borderRadius: '8px' }}>
          No matching resources found for this need.
        </div>
      )}

      {/* Match cards */}
      {matches.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {matches.map((match) => {
            const aStatus = assignmentStatus[match.resource_id] ?? 'IDLE';
            const aId = assignmentIds[match.resource_id];
            const aErr = assignmentErrors[match.resource_id];
            // Display only first 4 chars of region geohash
            const regionDisplay = (match.region_geohash
              ? match.region_geohash.slice(0, 4)
              : match.region.slice(0, 4));

            return (
              <li
                key={match.resource_id}
                style={{
                  border: '1px solid #ddd',
                  borderRadius: '10px',
                  marginBottom: '14px',
                  background: '#fff',
                  overflow: 'hidden',
                }}
              >
                {/* 'Suggested from this report' label per spec */}
                <div style={{ background: '#f0f4ff', padding: '6px 14px', fontSize: '11px', fontWeight: 700, color: '#0044cc', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  Suggested from this report
                </div>

                <div style={{ padding: '12px 14px' }}>
                  {/* Capability + status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '6px', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 700, fontSize: '15px' }}>
                      {capabilityLabel(match.capability)}
                    </span>
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>
                      {statusLabel(match.status)}
                    </span>
                  </div>

                  {/* Details */}
                  <dl style={{ margin: '0 0 10px 0', fontSize: '13px' }}>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <dt style={{ fontWeight: 600, color: '#555' }}>Units available:</dt>
                      <dd style={{ margin: 0 }}>{match.available_units}</dd>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <dt style={{ fontWeight: 600, color: '#555' }}>Region:</dt>
                      <dd style={{ margin: 0, fontFamily: 'monospace' }}>{regionDisplay}…</dd>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <dt style={{ fontWeight: 600, color: '#555' }}>Observed:</dt>
                      <dd style={{ margin: 0 }}>{relativeTime(match.observed_at)}</dd>
                    </div>
                  </dl>

                  {/* Rationale list */}
                  {match.rationale.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <p style={{ margin: '0 0 4px 0', fontSize: '12px', fontWeight: 700, color: '#555', textTransform: 'uppercase' }}>
                        Match rationale
                      </p>
                      <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '13px', color: '#444' }}>
                        {match.rationale.map((r, i) => (
                          <li key={i}>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Assignment flow (responder only) */}
                  {responderId && (
                    <>
                      {aStatus === 'IDLE' && (
                        <button
                          onClick={() => { void handleAssign(match.resource_id, match.rationale); }}
                          style={{
                            minHeight: '44px',
                            width: '100%',
                            fontSize: '15px',
                            fontWeight: 700,
                            background: '#0066cc',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            boxSizing: 'border-box',
                          }}
                          onFocus={(e) => { (e.currentTarget as HTMLButtonElement).style.outline = '3px solid #003d99'; }}
                          onBlur={(e) => { (e.currentTarget as HTMLButtonElement).style.outline = 'none'; }}
                        >
                          📋 Propose assignment
                        </button>
                      )}

                      {aStatus === 'LOADING' && (
                        <div
                          role="status"
                          aria-live="polite"
                          style={{ padding: '10px', textAlign: 'center', fontSize: '14px', color: '#555' }}
                        >
                          ⏳ Creating assignment…
                        </div>
                      )}

                      {aStatus === 'SUCCESS' && aId && (
                        <div
                          role="status"
                          style={{ padding: '10px 12px', background: '#f0fff4', border: '1px solid #9be', borderRadius: '6px', fontSize: '14px', fontWeight: 600 }}
                        >
                          ✓ Assignment created — ID: <code style={{ fontSize: '12px' }}>{aId.slice(0, 12)}…</code>
                        </div>
                      )}

                      {aStatus === 'ERROR' && aErr && (
                        <div role="alert" style={{ padding: '10px 12px', background: '#fff0f0', border: '1px solid #f99', borderRadius: '6px', marginBottom: '6px' }}>
                          <p style={{ fontWeight: 700, margin: '0 0 4px 0', fontSize: '14px' }}>✕ Assignment failed</p>
                          <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#555' }}>{aErr}</p>
                          <button
                            onClick={() => {
                              setAssignmentStatus((prev) => ({ ...prev, [match.resource_id]: 'IDLE' }));
                            }}
                            style={{
                              minHeight: '36px',
                              padding: '0 14px',
                              fontSize: '13px',
                              background: '#333',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                            }}
                            onFocus={(e) => { (e.currentTarget as HTMLButtonElement).style.outline = '3px solid #0066cc'; }}
                            onBlur={(e) => { (e.currentTarget as HTMLButtonElement).style.outline = 'none'; }}
                          >
                            ↺ Retry
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
