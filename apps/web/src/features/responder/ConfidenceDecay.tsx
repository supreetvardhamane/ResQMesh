/**
 * ResQMesh — Confidence Decay Component
 * Per docs/16_BUILD_CONTRACT.md §Confidence decay formula.
 * Per FRONTEND.md: purposeful motion, prefers-reduced-motion, no fake metrics.
 */

import React, { useState, useEffect, useRef } from "react";
import {
  CONFIDENCE_BASE_PERCENT,
  CONFIDENCE_DECAY_PER_MINUTE,
  CONFIDENCE_FLOOR_PERCENT,
} from "@contracts";

// ── Formula (exact from contract) ──────────────────────────────────────────

function computeConfidence(
  lastConfirmedAt: string,
  distinctConfirmingKeyCount: number,
  demoOffsetMs: number
): number {
  const now = Date.now() + demoOffsetMs;
  const lastMs = new Date(lastConfirmedAt).getTime();
  const minutesElapsed = Math.max(0, (now - lastMs) / 60000);
  const corrobMult = 1 + 0.05 * Math.max(0, distinctConfirmingKeyCount - 1);
  const decayMult = Math.max(
    CONFIDENCE_FLOOR_PERCENT / 100,
    1 - CONFIDENCE_DECAY_PER_MINUTE * minutesElapsed
  );
  return Math.round(
    Math.min(
      CONFIDENCE_BASE_PERCENT,
      CONFIDENCE_BASE_PERCENT * corrobMult * decayMult
    )
  );
}

// ── Color thresholds ───────────────────────────────────────────────────────

function getConfidenceStyle(pct: number): { color: string; opacity: number; label: string } {
  if (pct >= 80) return { color: "var(--c-red)",   opacity: 1,    label: "High confidence" };
  if (pct >= 60) return { color: "var(--c-amber)",  opacity: 0.72, label: "Moderate confidence" };
  return              { color: "var(--c-muted)",  opacity: 0.45, label: "Low confidence" };
}

// ── Component ──────────────────────────────────────────────────────────────

interface ConfidenceDecayProps {
  lastConfirmedAt: string;
  distinctConfirmingKeyCount: number;
  subjectId: string;
  condition: string;
  onCorroborate?: () => void;
}

const DEMO_OFFSETS: { label: string; ms: number }[] = [
  { label: "Now",  ms: 0 },
  { label: "+10m", ms: 10 * 60000 },
  { label: "+20m", ms: 20 * 60000 },
];

export function ConfidenceDecay({
  lastConfirmedAt,
  distinctConfirmingKeyCount,
  subjectId,
  condition,
  onCorroborate,
}: ConfidenceDecayProps): React.ReactElement {
  const prefersReducedMotion =
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;

  const [demoOffsetIdx, setDemoOffsetIdx] = useState(0);
  const [confirmedAt, setConfirmedAt] = useState(lastConfirmedAt);
  const [keyCount, setKeyCount] = useState(distinctConfirmingKeyCount);
  const [confidence, setConfidence] = useState(() =>
    computeConfidence(lastConfirmedAt, distinctConfirmingKeyCount, 0)
  );
  const [corroborating, setCorroborating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick every second
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setConfidence(computeConfidence(confirmedAt, keyCount, DEMO_OFFSETS[demoOffsetIdx].ms));
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [confirmedAt, keyCount, demoOffsetIdx]);

  const { color, opacity, label: confidenceLabel } = getConfidenceStyle(confidence);

  const handleCorroborate = () => {
    if (!onCorroborate) return;
    if (!prefersReducedMotion) setCorroborating(true);
    setTimeout(() => setCorroborating(false), 250);
    setConfirmedAt(new Date().toISOString());
    setKeyCount((k) => k + 1);
    onCorroborate();
  };

  return (
    <div style={{
      background: "var(--c-surface-2)",
      border: "1px solid var(--c-border)",
      borderRadius: "var(--r-md)",
      padding: "var(--sp-4)",
    }}>
      {/* Header row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--sp-3)" }}>
        <div>
          <p style={{ fontSize: "var(--text-xs)", color: "var(--c-muted)", textTransform: "uppercase", letterSpacing: "0.06em", fontWeight: "var(--weight-semibold)" }}>
            Road Report Confidence
          </p>
          <p style={{ fontSize: "var(--text-xs)", color: "var(--c-muted)", marginTop: 2 }}>
            {subjectId} — {condition}
          </p>
        </div>
        {/* Demo clock controls */}
        <div style={{ display: "flex", gap: 4 }}>
          {DEMO_OFFSETS.map((o, i) => (
            <button
              key={o.label}
              type="button"
              aria-pressed={demoOffsetIdx === i}
              onClick={() => setDemoOffsetIdx(i)}
              style={{
                padding: "2px 8px",
                fontSize: "var(--text-xs)",
                borderRadius: "var(--r-sm)",
                border: "1.5px solid",
                borderColor: demoOffsetIdx === i ? "var(--c-brand)" : "var(--c-border-strong)",
                background: demoOffsetIdx === i ? "var(--c-brand)" : "transparent",
                color: demoOffsetIdx === i ? "#fff" : "var(--c-muted)",
                cursor: "pointer",
                minHeight: 28,
                fontFamily: "var(--font-mono)",
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {/* Confidence display */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--sp-4)", marginBottom: "var(--sp-3)" }}>
        <span
          aria-label={`${confidence}% — ${confidenceLabel}`}
          style={{
            fontSize: 36,
            fontWeight: "var(--weight-bold)",
            fontVariantNumeric: "tabular-nums",
            color,
            opacity,
            transition: prefersReducedMotion ? "none" : `color 0.4s, opacity 0.4s`,
            letterSpacing: "-0.03em",
            animation: corroborating ? "pulse-corroborate 250ms ease-out" : "none",
          }}
        >
          {confidence}%
        </span>
        <style>{`
          @keyframes pulse-corroborate {
            0%   { transform: scale(1); }
            50%  { transform: scale(1.12); }
            100% { transform: scale(1); }
          }
        `}</style>
        <div>
          <p style={{ fontSize: "var(--text-sm)", fontWeight: "var(--weight-semibold)", color: "var(--c-text-2)" }}>
            {confidenceLabel}
          </p>
          <p style={{ fontSize: "var(--text-xs)", color: "var(--c-muted)", marginTop: 2 }}>
            {keyCount} source{keyCount !== 1 ? "s" : ""} · decaying at {(CONFIDENCE_DECAY_PER_MINUTE * 100).toFixed(1)}%/min
          </p>
        </div>
      </div>

      {/* Corroborate button */}
      {onCorroborate && (
        <button
          type="button"
          className="btn btn-ghost"
          style={{ minHeight: 40, fontSize: "var(--text-sm)", width: "100%" }}
          onClick={handleCorroborate}
        >
          ✓ Corroborate observation
        </button>
      )}
    </div>
  );
}
