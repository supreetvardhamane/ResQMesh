/**
 * ResQMesh — Confidence Decay Component
 * (apps/web/src/features/responder/ConfidenceDecay.tsx)
 *
 * Per docs/16_BUILD_CONTRACT.md §Deterministic match, trust, and Confidence Decay rules:
 *
 * Formula (exact):
 *   minutes_elapsed = max(0, (demo_or_system_now - last_confirmed_at) / 60000)
 *   corroboration_multiplier = 1 + 0.05 * max(0, distinct_confirming_key_count - 1)
 *   decay_multiplier = max(CONFIDENCE_FLOOR_PERCENT/100, 1 - CONFIDENCE_DECAY_PER_MINUTE * minutes_elapsed)
 *   confidence_pct = round(min(CONFIDENCE_BASE_PERCENT, CONFIDENCE_BASE_PERCENT * corroboration_multiplier * decay_multiplier))
 *
 * UI per contract:
 *   80–94   → solid red label
 *   60–79   → amber (0.72 opacity)
 *   <60     → dim red/gray (0.45 opacity)
 *
 * - Updates once per second via setInterval
 * - Demo simulated clock: 0m, 10m, 20m controls
 * - prefers-reduced-motion: color/text only, no 250ms pulse
 * - "last confirmed" text and source time shown
 * - Corroborate button resets confidence
 * - Labels: "Confidence Decay — freshness heuristic only", "Synthetic data"
 */

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  CONFIDENCE_BASE_PERCENT,
  CONFIDENCE_DECAY_PER_MINUTE,
  CONFIDENCE_FLOOR_PERCENT,
} from "../../../../packages/contracts/types";

// ─── Types ───────────────────────────────────────────────────────────────────

interface ConfidenceDecayProps {
  /** UTC ISO-8601 — timestamp of last valid confirmation */
  lastConfirmedAt: string;
  /** Number of distinct confirming key_id values */
  distinctConfirmingKeyCount: number;
  /** Demo clock offset in minutes (0 | 10 | 20) */
  demoOffsetMinutes?: 0 | 10 | 20;
  /** Called when responder clicks Corroborate */
  onCorroborate?: () => void;
  /** Road subject identifier */
  subjectId: string;
  /** Road condition (BLOCKED | OPEN) */
  condition: string;
}

// ─── Formula ─────────────────────────────────────────────────────────────────

function computeConfidence(
  lastConfirmedAt: string,
  distinctConfirmingKeyCount: number,
  nowMs: number
): number {
  const confirmedMs = new Date(lastConfirmedAt).getTime();
  const minutesElapsed = Math.max(0, (nowMs - confirmedMs) / 60000);
  const corroborationMultiplier =
    1 + 0.05 * Math.max(0, distinctConfirmingKeyCount - 1);
  const decayMultiplier = Math.max(
    CONFIDENCE_FLOOR_PERCENT / 100,
    1 - CONFIDENCE_DECAY_PER_MINUTE * minutesElapsed
  );
  return Math.round(
    Math.min(
      CONFIDENCE_BASE_PERCENT,
      CONFIDENCE_BASE_PERCENT * corroborationMultiplier * decayMultiplier
    )
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ConfidenceDecay({
  lastConfirmedAt,
  distinctConfirmingKeyCount,
  demoOffsetMinutes: externalDemoOffset,
  onCorroborate,
  subjectId,
  condition,
}: ConfidenceDecayProps): React.ReactElement {
  const [demoOffset, setDemoOffset] = useState<0 | 10 | 20>(externalDemoOffset ?? 0);
  const [confidencePct, setConfidencePct] = useState<number>(CONFIDENCE_BASE_PERCENT);
  const [pulse, setPulse] = useState(false);
  const prefersReducedMotion = useRef(
    typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  // ── Recalculate once per second ─────────────────────────────────────────────
  useEffect(() => {
    function tick() {
      const offsetMs = demoOffset * 60 * 1000;
      const simulatedNow = Date.now() + offsetMs;
      setConfidencePct(
        computeConfidence(lastConfirmedAt, distinctConfirmingKeyCount, simulatedNow)
      );
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastConfirmedAt, distinctConfirmingKeyCount, demoOffset]);

  // ── Corroborate handler ─────────────────────────────────────────────────────
  const handleCorroborate = useCallback(() => {
    onCorroborate?.();
    // Pulse effect on reset (honor prefers-reduced-motion)
    if (!prefersReducedMotion.current) {
      setPulse(true);
      setTimeout(() => setPulse(false), 250);
    }
  }, [onCorroborate]);

  // ── Styling per contract thresholds ────────────────────────────────────────
  let confidenceColor = "#cc0000";
  let confidenceOpacity = 1;
  let confidenceLabel = "High confidence";

  if (confidencePct >= 80) {
    confidenceColor = "#cc0000";
    confidenceOpacity = 1;
    confidenceLabel = "High confidence (solid red)";
  } else if (confidencePct >= 60) {
    confidenceColor = "#cc7700";
    confidenceOpacity = 0.72;
    confidenceLabel = "Medium confidence (amber)";
  } else {
    confidenceColor = "#888888";
    confidenceOpacity = 0.45;
    confidenceLabel = "Low confidence (dim)";
  }

  const containerStyle: React.CSSProperties = {
    border: "2px solid #ddd",
    borderRadius: "8px",
    padding: "14px 16px",
    background: "#fafafa",
    fontFamily: "system-ui, sans-serif",
    maxWidth: "420px",
  };

  const valuStyle: React.CSSProperties = {
    fontSize: "36px",
    fontWeight: 700,
    color: confidenceColor,
    opacity: confidenceOpacity,
    transition: pulse && !prefersReducedMotion.current ? "opacity 0.25s ease" : undefined,
    display: "block",
    lineHeight: 1.1,
  };

  const demoButtonStyle: React.CSSProperties = {
    minHeight: "36px",
    minWidth: "44px",
    padding: "6px 14px",
    fontSize: "14px",
    cursor: "pointer",
    borderRadius: "4px",
    border: "2px solid #666",
    background: "#f0f0f0",
  };

  return (
    <section
      style={containerStyle}
      aria-label={`Confidence decay for ${subjectId} (${condition})`}
    >
      {/* Header */}
      <div style={{ marginBottom: "10px" }}>
        <strong style={{ fontSize: "14px" }}>Confidence Decay</strong>
        <span
          style={{
            marginLeft: "8px",
            fontSize: "12px",
            background: "#fffbe6",
            border: "1px solid #cca300",
            borderRadius: "3px",
            padding: "1px 6px",
          }}
        >
          Synthetic data
        </span>
      </div>

      <p style={{ fontSize: "12px", color: "#666", margin: "0 0 10px" }}>
        Freshness heuristic only — not a probability. Not an automated routing decision.
      </p>

      {/* Confidence value */}
      <div style={{ marginBottom: "12px" }}>
        <span style={valuStyle} aria-label={`${confidencePct} percent confidence`}>
          {confidencePct}%
        </span>
        <span style={{ fontSize: "13px", color: "#555" }}>{confidenceLabel}</span>
      </div>

      {/* Subject info */}
      <dl style={{ fontSize: "13px", margin: "0 0 12px", color: "#444" }}>
        <dt style={{ fontWeight: 600, display: "inline" }}>Subject: </dt>
        <dd style={{ display: "inline", margin: 0 }}>{subjectId}</dd>
        <br />
        <dt style={{ fontWeight: 600, display: "inline" }}>Condition: </dt>
        <dd style={{ display: "inline", margin: 0 }}>{condition}</dd>
        <br />
        <dt style={{ fontWeight: 600, display: "inline" }}>Last confirmed: </dt>
        <dd style={{ display: "inline", margin: 0 }}>
          {new Date(lastConfirmedAt).toLocaleTimeString()} UTC
        </dd>
        <br />
        <dt style={{ fontWeight: 600, display: "inline" }}>Confirming sources: </dt>
        <dd style={{ display: "inline", margin: 0 }}>{distinctConfirmingKeyCount}</dd>
      </dl>

      {/* Demo clock control */}
      <div style={{ marginBottom: "12px" }}>
        <p style={{ fontSize: "12px", color: "#666", margin: "0 0 6px" }}>
          <strong>Demo clock offset</strong> (simulated time since confirmation):
        </p>
        <div style={{ display: "flex", gap: "8px" }} role="group" aria-label="Demo clock control">
          {([0, 10, 20] as const).map((offset) => (
            <button
              key={offset}
              type="button"
              onClick={() => setDemoOffset(offset)}
              style={{
                ...demoButtonStyle,
                background: demoOffset === offset ? "#333" : "#f0f0f0",
                color: demoOffset === offset ? "#fff" : "#333",
                borderColor: demoOffset === offset ? "#333" : "#666",
              }}
              aria-pressed={demoOffset === offset}
              aria-label={`Simulate ${offset} minutes elapsed`}
            >
              {offset}m
            </button>
          ))}
        </div>
      </div>

      {/* Corroborate button */}
      {onCorroborate && (
        <button
          type="button"
          onClick={handleCorroborate}
          style={{
            minHeight: "44px",
            padding: "10px 18px",
            fontSize: "14px",
            cursor: "pointer",
            borderRadius: "6px",
            border: "2px solid #006600",
            background: "#f0fff4",
            color: "#006600",
            fontWeight: 600,
          }}
          aria-label={`Corroborate road observation for ${subjectId}`}
        >
          ✓ Corroborate road observation
        </button>
      )}
    </section>
  );
}
