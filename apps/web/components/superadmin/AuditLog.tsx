"use client";

import { useState, useEffect, useCallback } from "react";
import { api, ApiResponse, OrgResponse } from "@/lib/api";
import { auditApi, AuditEventDTO, AuditSummaryDTO, AuditQuery } from "@/lib/audit-api";

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
  danger: "#ef4444",
  blue:   "#6B73BF",
};
const ff = { fontFamily: "Poppins, sans-serif" } as const;

const SEVERITY_META: Record<string, { color: string; label: string }> = {
  info:    { color: C.blue,   label: "Info" },
  success: { color: C.green,  label: "Success" },
  warning: { color: C.amber,  label: "Warning" },
  error:   { color: C.danger, label: "Error" },
};

// Categories emitted by the backend today (auth, organization, roles, security).
const CATEGORIES = ["auth", "organization", "roles", "security"];
const PAGE_SIZE = 20;

export default function AuditLog() {
  const [summary, setSummary] = useState<AuditSummaryDTO | null>(null);
  const [orgs, setOrgs] = useState<OrgResponse[]>([]);
  const [events, setEvents] = useState<AuditEventDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [exporting, setExporting] = useState(false);

  // Filter inputs
  const [search, setSearch]     = useState("");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState("");
  const [orgId, setOrgId]       = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");

  // Applied filters (only change on Search / Clear so typing doesn't spam the API)
  const [applied, setApplied] = useState<AuditQuery>({});

  useEffect(() => {
    auditApi.summary().then((r) => setSummary(r.data)).catch(() => {});
    api.get<ApiResponse<OrgResponse[]>>("/organizations").then((r) => setOrgs(r.data ?? [])).catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true); setErr("");
    auditApi.list({ ...applied, page, limit: PAGE_SIZE })
      .then((r) => { setEvents(r.data ?? []); setTotal(r.meta?.total ?? 0); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [applied, page]);

  useEffect(() => { load(); }, [load]);

  function applyFilters() {
    setPage(1);
    setApplied({
      user_search: search.trim() || undefined,
      category:    category || undefined,
      severity:    severity || undefined,
      org_id:      orgId || undefined,
      date_from:   dateFrom || undefined,
      date_to:     dateTo || undefined,
    });
  }

  function clearFilters() {
    setSearch(""); setCategory(""); setSeverity(""); setOrgId(""); setDateFrom(""); setDateTo("");
    setPage(1); setApplied({});
  }

  async function exportCsv() {
    setExporting(true);
    try {
      const blob = await auditApi.exportCsv(applied);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit_events_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  const orgName = (id?: string) => orgs.find((o) => o.id === id)?.name;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div style={{ ...ff, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <SummaryCard label="Total Events Today" value={summary?.total_today} color={C.navy} />
        <SummaryCard label="Errors"             value={summary?.errors}       color={C.danger} />
        <SummaryCard label="Warnings"           value={summary?.warnings}     color={C.amber} />
        <SummaryCard label="Admin Actions"      value={summary?.admin_actions} color={C.slate} />
      </div>

      {/* Filter bar */}
      <div style={cardStyle.plain}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <FilterField label="Search User" grow>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") applyFilters(); }}
              placeholder="Name or email…"
              style={input}
            />
          </FilterField>
          <FilterField label="Category">
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={input}>
              <option value="">All</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </FilterField>
          <FilterField label="Severity">
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} style={input}>
              <option value="">All</option>
              {Object.keys(SEVERITY_META).map((s) => (
                <option key={s} value={s}>{SEVERITY_META[s].label}</option>
              ))}
            </select>
          </FilterField>
          <FilterField label="Organization">
            <select value={orgId} onChange={(e) => setOrgId(e.target.value)} style={input}>
              <option value="">All</option>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="From">
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={input} />
          </FilterField>
          <FilterField label="To">
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={input} />
          </FilterField>
          <button onClick={applyFilters} style={btn.prim}>Search</button>
          <button onClick={clearFilters} style={btn.ghost}>Clear</button>
          <button onClick={exportCsv} disabled={exporting} style={{ ...btn.ghost, opacity: exporting ? 0.6 : 1 }}>
            {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </div>

      {err && <div style={banner.err}>{err}</div>}

      {/* Results table */}
      <div style={cardStyle.table}>
        {loading ? (
          <div style={cardStyle.empty}>Loading audit events…</div>
        ) : events.length === 0 ? (
          <EmptyState hasFilters={Object.keys(applied).length > 0} onClear={clearFilters} />
        ) : (
          <>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: C.page }}>
                  {["Timestamp", "User", "Category", "Action", "Organization", "Severity"].map((h) => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => (
                  <tr key={ev.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td style={{ ...td, fontSize: 12, color: C.slateL, whiteSpace: "nowrap" }}>{fmtTs(ev.created_at)}</td>
                    <td style={td}>
                      {ev.actor_name || ev.actor_email ? (
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.navy }}>{ev.actor_name || ev.actor_email}</div>
                          {ev.actor_role && <div style={{ fontSize: 11, color: C.muted }}>{ev.actor_role}</div>}
                        </div>
                      ) : (
                        <span style={{ fontSize: 12, color: C.muted, fontStyle: "italic" }}>anonymous</span>
                      )}
                    </td>
                    <td style={td}><span style={pill(C.slate)}>{ev.category}</span></td>
                    <td style={{ ...td, fontSize: 12, color: C.navy, fontFamily: "monospace" as const }}>{ev.action}</td>
                    <td style={{ ...td, fontSize: 12, color: C.slateL }}>{ev.org_id ? (orgName(ev.org_id) ?? "—") : "—"}</td>
                    <td style={td}>
                      <span style={pill(SEVERITY_META[ev.severity]?.color ?? C.muted)}>
                        {SEVERITY_META[ev.severity]?.label ?? ev.severity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderTop: `1px solid ${C.border}` }}>
              <span style={{ fontSize: 12, color: C.muted }}>
                {total} event{total === 1 ? "" : "s"} · page {page} of {totalPages}
              </span>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} style={{ ...btn.ghostSm, opacity: page <= 1 ? 0.4 : 1 }}>← Prev</button>
                <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} style={{ ...btn.ghostSm, opacity: page >= totalPages ? 0.4 : 1 }}>Next →</button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value?: number; color: string }) {
  return (
    <div style={{ ...cardStyle.plain, padding: 18 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>
        {value === undefined ? "—" : value.toLocaleString()}
      </div>
    </div>
  );
}

function FilterField({ label, children, grow }: { label: string; children: React.ReactNode; grow?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: grow ? "1 1 200px" : "0 0 auto", minWidth: grow ? 180 : 130 }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>{label}</label>
      {children}
    </div>
  );
}

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div style={{ ...cardStyle.empty, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 56 }}>
      <div style={{ fontSize: 34 }}>≡</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>
        {hasFilters ? "No events match these filters" : "No audit events yet"}
      </div>
      <div style={{ fontSize: 13, color: C.muted, maxWidth: 340, textAlign: "center", lineHeight: 1.6 }}>
        {hasFilters
          ? "Try widening your search or clearing the filters."
          : "Audit events will appear here as actions are performed across the platform."}
      </div>
      {hasFilters && <button onClick={onClear} style={{ ...btn.ghost, marginTop: 6 }}>Clear Filters</button>}
    </div>
  );
}

// ── Helpers & styles ─────────────────────────────────────────────────────────

function fmtTs(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

const pill = (color: string): React.CSSProperties => ({
  display: "inline-block", background: `${color}18`, color,
  fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px", textTransform: "capitalize",
});

const th: React.CSSProperties = { padding: "11px 16px", textAlign: "left", fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.5 };
const td: React.CSSProperties = { padding: "12px 16px", verticalAlign: "middle" };

const input: React.CSSProperties = {
  width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 11px",
  fontSize: 13, color: C.navy, fontFamily: "Poppins, sans-serif", outline: "none", boxSizing: "border-box", background: "#fff",
};

const cardStyle = {
  table: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(28,37,81,0.07)", overflow: "hidden" } as React.CSSProperties,
  plain: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(28,37,81,0.07)", padding: 20 } as React.CSSProperties,
  empty: { padding: 48, textAlign: "center", color: C.muted, fontSize: 13 } as React.CSSProperties,
};

const btn = {
  prim:    { ...ff, padding: "9px 20px", background: C.orange, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff" } as React.CSSProperties,
  ghost:   { ...ff, padding: "8px 16px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.navy } as React.CSSProperties,
  ghostSm: { ...ff, padding: "6px 14px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.navy } as React.CSSProperties,
};

const banner = {
  err: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: C.danger } as React.CSSProperties,
};
