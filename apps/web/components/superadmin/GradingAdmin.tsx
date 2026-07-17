"use client";

import { useState, useEffect, useCallback } from "react";
import { gradingAdminApi, GradingAdminDTO } from "@/lib/grading-admin-api";

// ── Slate / Admin design tokens (apps/CLAUDE.md) ────────────────────────────
const C = {
  navy: "#182848", slate: "#334155", orange: "#C8A860",
  page: "#F7F5F0", card: "#FFFFFF", alt: "#EFE9DC", border: "#E6DED0",
  muted: "#4A5573", green: "#22c55e", indigo: "#4A5573", amber: "#f59e0b", danger: "#ef4444",
};
const ff = { fontFamily: "Poppins, sans-serif" } as const;

const TABS = ["All", "Pending", "Graded", "Capstone Only"] as const;
type Tab = (typeof TABS)[number];

// Tab → server-side `status` filter (see submissions.ListGradingAdminQuery).
const TAB_STATUS: Record<Tab, "pending" | "graded" | "capstone" | undefined> = {
  All: undefined, Pending: "pending", Graded: "graded", "Capstone Only": "capstone",
};

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

const PER_PAGE = 20;

export default function GradingAdmin({ orgId }: { orgId?: string }) {
  const [items, setItems]   = useState<GradingAdminDTO[]>([]);
  const [loading, setLoad]  = useState(true);
  const [err, setErr]       = useState("");
  const [tab, setTab]       = useState<Tab>("All");
  const [page, setPage]     = useState(1);
  const [total, setTotal]   = useState(0);

  // Summary-card counts: one cheap (LIMIT 1) request per tab's real
  // server-side total — not a client-side tally of one loaded page.
  const [counts, setCounts] = useState({ all: 0, pending: 0, graded: 0, capstone: 0 });

  // Reset to page 1 whenever the org or tab filter changes.
  useEffect(() => { setPage(1); }, [orgId, tab]);

  const load = useCallback(() => {
    setLoad(true); setErr("");
    gradingAdminApi.list(orgId || undefined, TAB_STATUS[tab], page, PER_PAGE)
      .then((r) => {
        setItems(r.data ?? []);
        setTotal(r.meta?.total ?? 0);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoad(false));
  }, [orgId, tab, page]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    Promise.all([
      gradingAdminApi.list(orgId || undefined, undefined, 1, 1),
      gradingAdminApi.list(orgId || undefined, "pending", 1, 1),
      gradingAdminApi.list(orgId || undefined, "graded", 1, 1),
      gradingAdminApi.list(orgId || undefined, "capstone", 1, 1),
    ])
      .then(([all, pending, graded, capstone]) => setCounts({
        all: all.meta?.total ?? 0,
        pending: pending.meta?.total ?? 0,
        graded: graded.meta?.total ?? 0,
        capstone: capstone.meta?.total ?? 0,
      }))
      .catch(() => {});
  }, [orgId]);

  const filtered = items; // server already applies the tab's status filter

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const cards: { label: string; value: number; color: string }[] = [
    { label: "Total Submissions", value: counts.all,      color: C.navy },
    { label: "Pending Review",    value: counts.pending,  color: C.amber },
    { label: "Graded",            value: counts.graded,   color: C.green },
    { label: "Capstones",         value: counts.capstone, color: C.indigo },
  ];

  const tabCount: Record<Tab, number> = {
    All: counts.all, Pending: counts.pending, Graded: counts.graded, "Capstone Only": counts.capstone,
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
          <Pager page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  );
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const btn = (disabled: boolean): React.CSSProperties => ({
    ...ff, padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.border}`,
    background: "#fff", color: disabled ? "#C9BFA8" : C.navy, fontSize: 12, fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  });
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "14px 16px", borderTop: `1px solid ${C.border}` }}>
      <button style={btn(page <= 1)} disabled={page <= 1} onClick={() => onChange(page - 1)}>← Prev</button>
      <span style={{ ...ff, fontSize: 12, color: C.muted, fontWeight: 600 }}>Page {page} of {totalPages}</span>
      <button style={btn(page >= totalPages)} disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next →</button>
    </div>
  );
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
  plain: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(24, 40, 72,0.06)", padding: "16px 18px" } as React.CSSProperties,
  empty: { padding: 40, textAlign: "center", color: C.muted, fontSize: 13 } as React.CSSProperties,
};
const banner = {
  err: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#ef4444" } as React.CSSProperties,
};
