"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { gradingAdminApi, GradingAdminDTO } from "@/lib/grading-admin-api";

// ── Slate / Admin design tokens (apps/CLAUDE.md) ────────────────────────────
const C = {
  navy: "#1C2551", slate: "#334155", orange: "#EF4E24",
  page: "#F5F7FB", card: "#FFFFFF", alt: "#F0F1F7", border: "#EAECF4",
  muted: "#8b90a7", green: "#22c55e", indigo: "#6B73BF", amber: "#f59e0b", danger: "#ef4444",
};
const ff = { fontFamily: "Poppins, sans-serif" } as const;

const TABS = ["All", "Pending", "Graded", "Capstone Only"] as const;
type Tab = (typeof TABS)[number];

// Status → pill colour. Grading statuses (graded/submitted) + capstone statuses.
function statusColor(status: string): string {
  switch (status) {
    case "graded":        return C.green;
    case "submitted":     return C.amber;
    case "resubmitted":   return C.amber;
    case "not_submitted": return C.muted;
    default:              return C.indigo;
  }
}
function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function GradingAdmin({ orgId }: { orgId?: string }) {
  const [items, setItems]   = useState<GradingAdminDTO[]>([]);
  const [loading, setLoad]  = useState(true);
  const [err, setErr]       = useState("");
  const [tab, setTab]       = useState<Tab>("All");

  const load = useCallback(() => {
    setLoad(true); setErr("");
    gradingAdminApi.list(orgId || undefined)
      .then((r) => setItems(r.data ?? []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoad(false));
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const isSubmission = (x: GradingAdminDTO) => x.source === "submission";
  const isGraded     = (x: GradingAdminDTO) => x.source === "submission" && x.status === "graded";
  const isPending    = (x: GradingAdminDTO) => x.source === "submission" && x.status !== "graded";
  const isCapstone   = (x: GradingAdminDTO) => x.source === "capstone";

  const counts = useMemo(() => ({
    submissions: items.filter(isSubmission).length,
    pending:     items.filter(isPending).length,
    graded:      items.filter(isGraded).length,
    capstones:   items.filter(isCapstone).length,
  }), [items]);

  const filtered = useMemo(() => items.filter((x) => {
    switch (tab) {
      case "Pending":       return isPending(x);
      case "Graded":        return isGraded(x);
      case "Capstone Only": return isCapstone(x);
      default:              return true;
    }
  }), [items, tab]);

  const cards: { label: string; value: number; color: string }[] = [
    { label: "Total Submissions", value: counts.submissions, color: C.navy },
    { label: "Pending Review",    value: counts.pending,     color: C.amber },
    { label: "Graded",            value: counts.graded,      color: C.green },
    { label: "Capstones",         value: counts.capstones,   color: C.indigo },
  ];

  const tabCount: Record<Tab, number> = {
    All: items.length, Pending: counts.pending, Graded: counts.graded, "Capstone Only": counts.capstones,
  };

  return (
    <div style={{ ...ff, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {cards.map((c) => (
          <div key={c.label} style={card.plain}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 5 }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: c.color }}>{loading ? "—" : c.value}</div>
          </div>
        ))}
      </div>

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {TABS.map((t) => {
          const on = tab === t;
          return (
            <button key={t} onClick={() => setTab(t)} style={{
              ...ff, padding: "7px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer",
              fontWeight: on ? 700 : 500,
              background: on ? C.navy : "#fff", color: on ? "#fff" : C.muted,
              border: `1px solid ${on ? C.navy : C.border}`,
            }}>
              {t} ({tabCount[t]})
            </button>
          );
        })}
      </div>

      {err && <div style={banner.err}>{err}</div>}

      {/* Table */}
      {loading ? (
        <div style={{ ...card.plain, ...card.empty }}>Loading grading items…</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card.plain, ...card.empty }}>
          {items.length === 0
            ? "No submissions or capstones yet. Items will appear here once participants submit work."
            : "No items match this filter."}
        </div>
      ) : (
        <div style={{ ...card.plain, padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
            <thead>
              <tr style={{ background: C.page }}>
                {["Participant", "Organization", "Program", "Type", "Title", "Submitted", "Faculty", "Status", "Grade"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((x, i) => (
                <tr key={x.id} style={{ borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}>
                  <td style={{ ...td, fontWeight: 600 }}>{x.participant}</td>
                  <td style={td}>{x.org}</td>
                  <td style={td}>{x.program}</td>
                  <td style={td}><span style={pill(x.source === "capstone" ? C.indigo : C.slate)}>{x.type}</span></td>
                  <td style={td}>{x.title}</td>
                  <td style={td}>{x.submitted_at ? fmtDate(x.submitted_at) : "—"}</td>
                  <td style={td}>{x.faculty || "—"}</td>
                  <td style={td}><span style={pill(statusColor(x.status))}>{humanize(x.status)}</span></td>
                  <td style={{ ...td, fontWeight: 700, color: x.grade != null ? C.navy : C.muted }}>
                    {x.grade != null ? x.grade : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

const th: React.CSSProperties = {
  textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 700,
  color: C.muted, letterSpacing: 0.5, textTransform: "uppercase", whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "11px 14px", fontSize: 12, color: C.navy, whiteSpace: "nowrap",
};
const pill = (color: string): React.CSSProperties => ({
  display: "inline-block", background: `${color}18`, color,
  fontSize: 9, fontWeight: 700, borderRadius: 10, padding: "3px 8px", whiteSpace: "nowrap",
});
const card = {
  plain: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(28,37,81,0.06)", padding: "16px 18px" } as React.CSSProperties,
  empty: { padding: 40, textAlign: "center", color: C.muted, fontSize: 13 } as React.CSSProperties,
};
const banner = {
  err: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#ef4444" } as React.CSSProperties,
};
