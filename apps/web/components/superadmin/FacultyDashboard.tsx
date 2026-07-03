"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  facultyMgmtApi, FacultyRosterItemDTO, FacultyDashboardSummaryDTO, FacultyStatus,
} from "@/lib/faculty-mgmt-api";
import ManageFacultyAccessModal from "./ManageFacultyAccessModal";

// ── Slate / Admin design tokens (FRONTEND_CLAUDE.md) ────────────────────────
const C = {
  navy:   "#1C2551",
  slate:  "#334155",
  slateL: "#64748b",
  orange: "#EF4E24",
  page:   "#F5F7FB",
  card:   "#FFFFFF",
  alt:    "#F0F1F7",
  border: "#EAECF4",
  muted:  "#8b90a7",
  green:  "#22c55e",
  amber:  "#f59e0b",
  indigo: "#6B73BF",
  danger: "#ef4444",
};
const ff = { fontFamily: "Poppins, sans-serif" } as const;

const STATUS_META: Record<FacultyStatus, { color: string; label: string }> = {
  active:     { color: C.green, label: "Active" },
  onboarding: { color: C.amber, label: "Onboarding" },
  inactive:   { color: C.muted, label: "Inactive" },
};

export default function FacultyDashboard({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const [summary, setSummary] = useState<FacultyDashboardSummaryDTO | null>(null);
  const [roster, setRoster]   = useState<FacultyRosterItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [manageFor, setManageFor] = useState<FacultyRosterItemDTO | null>(null);
  const [err, setErr]         = useState("");

  const load = useCallback(() => {
    setLoading(true); setErr("");
    Promise.all([
      facultyMgmtApi.summary().then((r) => r.data).catch(() => null),
      facultyMgmtApi.roster().then((r) => r.data ?? []).catch((e) => { setErr(e.message); return []; }),
    ]).then(([s, r]) => { setSummary(s); setRoster(r); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  // Faculty Performance Overview — most active first.
  const performance = useMemo(
    () => [...roster].sort((a, b) => b.sessions_delivered - a.sessions_delivered || b.engagement_pct - a.engagement_pct),
    [roster],
  );

  // Programs by Faculty — invert roster.assigned_programs into program → faculty[].
  const programGroups = useMemo(() => {
    const map = new Map<string, { title: string; faculty: FacultyRosterItemDTO[] }>();
    for (const f of roster) {
      for (const p of f.assigned_programs) {
        const g = map.get(p.id) ?? { title: p.title, faculty: [] };
        g.faculty.push(f);
        map.set(p.id, g);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.faculty.length - a.faculty.length);
  }, [roster]);

  const cards: { label: string; value: string; color: string; sub?: string }[] = [
    { label: "Total Faculty",     value: summary ? String(summary.total_faculty) : "—",             color: C.navy,   sub: summary ? `${summary.onboarding_count} onboarding` : undefined },
    { label: "Sessions Delivered",value: summary ? summary.total_sessions_delivered.toLocaleString() : "—", color: C.slate },
    { label: "Avg Engagement",    value: summary ? `${summary.avg_engagement_pct}%` : "—",           color: C.indigo, sub: "attendance-based" },
    { label: "Onboarding",        value: summary ? String(summary.onboarding_count) : "—",           color: C.amber,  sub: "in progress" },
  ];

  return (
    <div style={{ ...ff, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ ...card.plain, display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>{c.label}</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: c.color, lineHeight: 1.1 }}>{c.value}</div>
            <div style={{ fontSize: 11, color: C.muted, minHeight: 14 }}>{c.sub ?? ""}</div>
          </div>
        ))}
      </div>

      {err && <div style={banner.err}>{err}</div>}

      {loading ? (
        <div style={card.empty}>Loading dashboard…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Faculty Performance Overview */}
          <div style={card.table}>
            <div style={sectionHead}>Faculty Performance Overview</div>
            {performance.length === 0 ? (
              <div style={card.empty}>No faculty yet.</div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: C.page }}>
                    {["Faculty", "Specialization", "Sessions", "Scheduled", "Engagement", "Status", "Actions"].map((h, i) => (
                      <th key={h} style={{ ...th, textAlign: i === 0 || i === 1 ? "left" : "center" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {performance.map((f) => {
                    const meta = STATUS_META[f.status];
                    return (
                      <tr key={f.user_id} style={{ borderTop: `1px solid ${C.border}` }}>
                        <td style={td}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={avatar(f.status === "onboarding" ? C.amber : C.navy)}>{initials(f.name)}</div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{f.name}</div>
                              {f.location && <div style={{ fontSize: 11, color: C.muted }}>{f.location}</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{ ...td, fontSize: 12, color: C.slateL, maxWidth: 200 }}>{f.specialization || "—"}</td>
                        <td style={{ ...td, textAlign: "center", fontSize: 13, fontWeight: 700, color: C.navy }}>{f.sessions_delivered}</td>
                        <td style={{ ...td, textAlign: "center", fontSize: 13, color: C.orange, fontWeight: 600 }}>{f.sessions_scheduled}</td>
                        <td style={{ ...td, textAlign: "center" }}><EngagementBar pct={f.engagement_pct} /></td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <span style={{ ...pill(meta.color), display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <span style={{ width: 6, height: 6, borderRadius: "50%", background: meta.color }} />
                            {meta.label}
                          </span>
                        </td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <button onClick={() => setManageFor(f)} style={{ ...ff, padding: "5px 12px", fontSize: 11, fontWeight: 600, color: C.orange, background: "rgba(239,78,36,0.06)", border: `1px solid ${C.orange}40`, borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap" }}>Manage Access</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Programs by Faculty */}
          <div style={card.plain}>
            <div style={{ ...sectionHead, marginBottom: 14, padding: 0 }}>Programs by Faculty</div>
            {programGroups.length === 0 ? (
              <div style={{ fontSize: 13, color: C.muted }}>No program assignments yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {programGroups.map((g) => (
                  <div key={g.title}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{g.title}</span>
                      <span style={pill(C.slate)}>{g.faculty.length} faculty</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {g.faculty.map((f) => (
                        <span key={f.user_id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.navy, background: C.page, border: `1px solid ${C.border}`, borderRadius: 20, padding: "4px 10px 4px 4px" }}>
                          <span style={{ ...avatar(C.indigo), width: 22, height: 22, fontSize: 9 }}>{initials(f.name)}</span>
                          {f.name}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {manageFor && (
        <ManageFacultyAccessModal faculty={manageFor} onClose={() => setManageFor(null)} onChanged={load} />
      )}
    </div>
  );
}

// ── bits ─────────────────────────────────────────────────────────────────────

function EngagementBar({ pct }: { pct: number }) {
  const color = pct >= 75 ? C.green : pct >= 40 ? C.amber : C.danger;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center" }}>
      <div style={{ width: 60, height: 6, background: C.alt, borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: color, borderRadius: 99 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: C.navy, minWidth: 34, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

function initials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2) || "F";
}

const avatar = (bg: string): React.CSSProperties => ({
  width: 30, height: 30, borderRadius: "50%", background: bg, color: "#fff",
  fontWeight: 700, fontSize: 11, flexShrink: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
});
const pill = (color: string): React.CSSProperties => ({
  display: "inline-block", background: `${color}18`, color,
  fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap",
});
const sectionHead: React.CSSProperties = { fontSize: 13, fontWeight: 700, color: C.navy, padding: "14px 18px" };
const th: React.CSSProperties = { padding: "11px 16px", fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: "12px 16px", verticalAlign: "middle" };
const card = {
  table: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(28,37,81,0.07)", overflow: "hidden" } as React.CSSProperties,
  plain: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(28,37,81,0.07)", padding: 20 } as React.CSSProperties,
  empty: { padding: 40, textAlign: "center", color: C.muted, fontSize: 13 } as React.CSSProperties,
};
const banner = {
  err: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.danger } as React.CSSProperties,
};
