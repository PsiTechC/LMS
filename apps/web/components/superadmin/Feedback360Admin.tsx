"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  feedback360AdminApi,
  AdminCycle360,
  Breakdown360,
} from "@/lib/feedback360-admin-api";

// ── Slate / Admin design tokens (apps/CLAUDE.md) ────────────────────────────
const C = {
  navy: "#1C2551", slate: "#334155", orange: "#EF4E24",
  page: "#F5F7FB", card: "#FFFFFF", alt: "#F0F1F7", border: "#EAECF4",
  muted: "#8b90a7", green: "#22c55e", indigo: "#6B73BF", amber: "#f59e0b",
};
const ff = { fontFamily: "Poppins, sans-serif" } as const;

const MAX = 5; // scores are 0–5

function scoreColor(v: number): string {
  if (v >= 4) return C.green;
  if (v >= 3) return C.amber;
  return C.orange;
}

export default function Feedback360Admin({ orgId }: { orgId?: string }) {
  const [cycles, setCycles] = useState<AdminCycle360[]>([]);
  const [loading, setLoad]  = useState(true);
  const [err, setErr]       = useState("");
  const [openId, setOpenId] = useState<string>("");

  const load = useCallback(() => {
    setLoad(true); setErr("");
    feedback360AdminApi.list(orgId || undefined)
      .then((r) => setCycles(r.data ?? []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoad(false));
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const avgOverall = useMemo(() => {
    const vals = cycles.map((c) => c.overall_score).filter((v): v is number => v != null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  }, [cycles]);

  const cards = [
    { label: "Completed 360s", value: loading ? "—" : String(cycles.length), color: C.navy },
    { label: "Organizations", value: loading ? "—" : String(new Set(cycles.map((c) => c.org_id)).size), color: C.indigo },
    { label: "Avg Overall Score", value: loading ? "—" : avgOverall != null ? `${avgOverall}/5` : "—", color: C.green },
  ];

  return (
    <div style={{ ...ff, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {cards.map((c) => (
          <div key={c.label} style={card.plain}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 5 }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {err && <div style={banner.err}>{err}</div>}

      {loading ? (
        <div style={{ ...card.plain, ...card.empty }}>Loading 360 cycles…</div>
      ) : cycles.length === 0 ? (
        <div style={{ ...card.plain, ...card.empty }}>
          No completed 360° cycles yet. Once a participant&apos;s feedback cycle closes with rater
          responses, it appears here with the full score breakdown.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {cycles.map((cy) => (
            <CycleRow
              key={cy.cycle_id}
              cy={cy}
              open={openId === cy.cycle_id}
              onToggle={() => setOpenId(openId === cy.cycle_id ? "" : cy.cycle_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── One participant row (click to expand) ───────────────────────────────────

function CycleRow({ cy, open, onToggle }: { cy: AdminCycle360; open: boolean; onToggle: () => void }) {
  return (
    <div style={{ ...card.plain, padding: 0, overflow: "hidden" }}>
      {/* Summary header */}
      <button onClick={onToggle} style={{
        ...ff, width: "100%", textAlign: "left", cursor: "pointer", background: open ? C.page : "#fff",
        border: "none", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12,
      }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{cy.participant}</div>
          <div style={{ fontSize: 11, color: C.muted }}>
            {cy.org}{cy.program ? ` · ${cy.program}` : ""} · {cy.title}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
          <span style={pill(C.slate)}>{cy.cycle_type.toUpperCase()}</span>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: C.muted }}>Overall</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: cy.overall_score != null ? scoreColor(cy.overall_score) : C.muted }}>
              {cy.overall_score != null ? `${cy.overall_score}` : "—"}<span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>/5</span>
            </div>
          </div>
          <span style={{ fontSize: 12, color: C.muted, transform: open ? "rotate(90deg)" : "none", transition: "transform .15s" }}>▶</span>
        </div>
      </button>

      {/* Expanded detail panel */}
      {open && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: 18, display: "flex", flexDirection: "column", gap: 18 }}>
          <BreakdownPanel breakdown={cy.breakdown} />
          <CompetencyChart competencies={cy.competencies} />
          <PsychometricPanel />
        </div>
      )}
    </div>
  );
}

// ── Score breakdown bars (self / manager / peer / direct report) ─────────────

function BreakdownPanel({ breakdown }: { breakdown: Breakdown360 }) {
  const rows: { label: string; value: number | null }[] = [
    { label: "Self", value: breakdown.self },
    { label: "Manager", value: breakdown.manager },
    { label: "Peer", value: breakdown.peer },
    { label: "Direct Report", value: breakdown.direct_report },
  ];
  return (
    <div>
      <SectionLabel>Score Breakdown</SectionLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 100, fontSize: 12, color: C.navy }}>{r.label}</div>
            <div style={{ flex: 1, height: 12, background: C.alt, borderRadius: 99, overflow: "hidden" }}>
              {r.value != null && (
                <div style={{ height: "100%", width: `${(r.value / MAX) * 100}%`, background: scoreColor(r.value), borderRadius: 99 }} />
              )}
            </div>
            <div style={{ width: 40, fontSize: 12, fontWeight: 700, color: r.value != null ? C.navy : C.muted, textAlign: "right" }}>
              {r.value != null ? r.value.toFixed(1) : "N/A"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Competency chart (horizontal bars) ──────────────────────────────────────

function CompetencyChart({ competencies }: { competencies: { competency_id: string; title: string; score: number }[] }) {
  return (
    <div>
      <SectionLabel>Competency Scores</SectionLabel>
      {competencies.length === 0 ? (
        <div style={{ fontSize: 12, color: C.muted }}>No competency scores recorded for this cycle.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {competencies.map((c) => (
            <div key={c.competency_id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 160, fontSize: 12, color: C.navy, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={c.title}>{c.title}</div>
              <div style={{ flex: 1, height: 12, background: C.alt, borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${(c.score / MAX) * 100}%`, background: C.indigo, borderRadius: 99 }} />
              </div>
              <div style={{ width: 40, fontSize: 12, fontWeight: 700, color: C.navy, textAlign: "right" }}>{c.score.toFixed(1)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Psychometric panel — honest "not configured" (no DISC/Hogan data source) ─

function PsychometricPanel() {
  return (
    <div>
      <SectionLabel>Psychometric Profile (DISC / Hogan)</SectionLabel>
      <div style={{
        background: C.page, border: `1px dashed ${C.border}`, borderRadius: 10,
        padding: "16px 18px", fontSize: 12, color: C.muted, lineHeight: 1.6,
      }}>
        Psychometric integration not yet configured. DISC / Hogan profiles will appear here once an
        assessment provider is connected — there is no data source for this section today.
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 }}>
      {children}
    </div>
  );
}

const pill = (color: string): React.CSSProperties => ({
  display: "inline-block", background: `${color}18`, color,
  fontSize: 9, fontWeight: 700, borderRadius: 10, padding: "3px 8px", whiteSpace: "nowrap",
});
const card = {
  plain: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(28,37,81,0.06)", padding: "16px 18px" } as React.CSSProperties,
  empty: { padding: 40, textAlign: "center", color: C.muted, fontSize: 13, lineHeight: 1.6 } as React.CSSProperties,
};
const banner = {
  err: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#ef4444" } as React.CSSProperties,
};
