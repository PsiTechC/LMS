"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  feedback360AdminApi,
  AdminCycle360,
  Breakdown360,
} from "@/lib/feedback360-admin-api";

// ── Slate / Admin design tokens (apps/CLAUDE.md) ────────────────────────────
const C = {
  navy: "#182848", slate: "#334155", orange: "#C8A860",
  page: "#F7F5F0", card: "#FFFFFF", alt: "#EFE9DC", border: "#E6DED0",
  muted: "#4A5573", green: "#22c55e", indigo: "#4A5573", amber: "#f59e0b",
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
  const [selectedId, setSelectedId] = useState<string>("");

  const load = useCallback(() => {
    setLoad(true); setErr("");
    feedback360AdminApi.list(orgId || undefined)
      .then((r) => setCycles(r.data ?? []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoad(false));
  }, [orgId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSelectedId(""); }, [orgId]);

  const avgOverall = useMemo(() => {
    const vals = cycles.map((c) => c.overall_score).filter((v): v is number => v != null);
    return vals.length ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10 : null;
  }, [cycles]);

  // cycle_id alone isn't unique — an admin cycle can carry multiple completed
  // participants — so panel identity is the (cycle_id, participant_id) pair.
  const panelKey = (c: AdminCycle360) => `${c.cycle_id}|${c.participant_id}`;
  const selected = cycles.find((c) => panelKey(c) === selectedId) ?? null;

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
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start" }}>
          <div style={card.plain}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, marginBottom: 14 }}>360° Scores by Participant</div>
            {cycles.map((cy) => (
              <CycleRow
                key={panelKey(cy)}
                cy={cy}
                selected={selectedId === panelKey(cy)}
                onClick={() => setSelectedId(selectedId === panelKey(cy) ? "" : panelKey(cy))}
              />
            ))}
          </div>

          {selected ? (
            <div style={{ ...card.plain, border: `1.5px solid ${C.orange}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{selected.participant} — Detail</div>
                <button onClick={() => setSelectedId("")} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16, color: C.muted }}>✕</button>
              </div>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 14, marginTop: -8 }}>
                {selected.org}{selected.program ? ` · ${selected.program}` : ""} · {selected.title}
              </div>
              <BreakdownPanel breakdown={selected.breakdown} />
              <div style={{ height: 18 }} />
              <CompetencyChart competencies={selected.competencies} />
              <div style={{ height: 18 }} />
              <PsychometricPanel />
            </div>
          ) : (
            <div style={{ ...card.plain, minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center", background: C.page }}>
              <div style={{ textAlign: "center", color: C.muted }}>
                <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.3 }}>◎</div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Select a participant</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>to view detailed 360° and psychometric data</div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── One participant row (click to select) ───────────────────────────────────

function CycleRow({ cy, selected, onClick }: { cy: AdminCycle360; selected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
        background: selected ? "rgba(200, 168, 96,0.04)" : C.page, borderRadius: 10, marginBottom: 8,
        cursor: "pointer", border: `1px solid ${selected ? C.orange : "transparent"}`,
      }}
    >
      <div style={{ width: 32, height: 32, borderRadius: "50%", background: C.navy, color: "#fff", fontWeight: 800, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {initials(cy.participant)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{cy.participant}</div>
        <div style={{ fontSize: 10, color: C.muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {cy.org} · {cy.cycle_type.toUpperCase()}
        </div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: cy.overall_score != null ? scoreColor(cy.overall_score) : C.muted }}>
          {cy.overall_score != null ? cy.overall_score : "—"}
        </div>
        <div style={{ fontSize: 9, color: C.muted }}>360° score</div>
      </div>
    </div>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

// ── Score breakdown bars (self / manager / peer / direct report) ─────────────

function BreakdownPanel({ breakdown }: { breakdown: Breakdown360 }) {
  const rows: { label: string; value: number | null; color: string }[] = [
    { label: "Self", value: breakdown.self, color: C.indigo },
    { label: "Manager", value: breakdown.manager, color: C.navy },
    { label: "Peers", value: breakdown.peer, color: C.green },
    { label: "Direct Reports", value: breakdown.direct_report, color: C.orange },
  ];
  return (
    <div>
      <SectionLabel>Score Breakdown</SectionLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {rows.map((r) => (
          <div key={r.label} style={{ background: C.page, borderRadius: 9, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 3 }}>{r.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: r.value != null ? r.color : C.muted }}>
              {r.value != null ? r.value.toFixed(1) : "N/A"}
            </div>
            <div style={{ height: 4, background: "#E0E3EF", borderRadius: 99, marginTop: 5 }}>
              {r.value != null && (
                <div style={{ height: "100%", width: `${(r.value / MAX) * 100}%`, background: r.color, borderRadius: 99 }} />
              )}
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
      <SectionLabel>Competency Breakdown</SectionLabel>
      {competencies.length === 0 ? (
        <div style={{ fontSize: 12, color: C.muted }}>No competency scores recorded for this cycle.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {competencies.map((c) => (
            <div key={c.competency_id}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 11, color: C.navy }}>{c.title}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.orange }}>{c.score.toFixed(1)}</span>
              </div>
              <div style={{ height: 5, background: C.alt, borderRadius: 99 }}>
                <div style={{ height: "100%", width: `${(c.score / MAX) * 100}%`, background: C.orange, borderRadius: 99 }} />
              </div>
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
      <SectionLabel>Psychometric Profile</SectionLabel>
      <div style={{
        background: "rgba(74, 85, 115,0.05)", border: "1px solid rgba(74, 85, 115,0.2)", borderRadius: 8,
        padding: "10px 12px", fontSize: 11, color: C.navy, lineHeight: 1.6,
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

const card = {
  plain: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(24, 40, 72,0.06)", padding: "16px 18px" } as React.CSSProperties,
  empty: { padding: 40, textAlign: "center", color: C.muted, fontSize: 13, lineHeight: 1.6 } as React.CSSProperties,
};
const banner = {
  err: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#ef4444" } as React.CSSProperties,
};
