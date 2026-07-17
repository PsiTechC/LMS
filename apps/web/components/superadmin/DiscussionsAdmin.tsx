"use client";

import { useState, useEffect, useCallback } from "react";
import {
  discussionsAdminApi,
  AdminThreadDTO,
  ModerationAction,
  ThreadStatus,
} from "@/lib/discussions-admin-api";
import { StatCard } from "@/components/shared/StatCard";

// ── Slate / Admin design tokens (apps/CLAUDE.md) ────────────────────────────
const C = {
  navy: "#182848", slate: "#334155", orange: "#C8A860",
  page: "#F7F5F0", card: "#FFFFFF", alt: "#EFE9DC", border: "#E6DED0",
  muted: "#4A5573", green: "#22c55e", indigo: "#4A5573", danger: "#ef4444",
};
const ff = { fontFamily: "Poppins, sans-serif" } as const;

const TABS = ["All", "Flagged", "Pinned", "Active"] as const;
type Tab = (typeof TABS)[number];

// Tab → server-side `status` filter (see discussions.ListAdminThreadsQuery).
const TAB_STATUS: Record<Tab, ThreadStatus | undefined> = {
  All: undefined, Flagged: "flagged", Pinned: "pinned", Active: "active",
};

const PER_PAGE = 20;

export default function DiscussionsAdmin({ orgId }: { orgId?: string }) {
  const [threads, setThreads] = useState<AdminThreadDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");
  const [tab, setTab]         = useState<Tab>("All");
  const [busy, setBusy]       = useState<string>("");
  const [page, setPage]       = useState(1);
  const [total, setTotal]     = useState(0);

  // Summary-card counts: one cheap (LIMIT 1) request per tab's real
  // server-side total — not a client-side tally of one loaded page.
  const [counts, setCounts] = useState({ All: 0, Flagged: 0, Pinned: 0, Active: 0 });

  // Reset to page 1 whenever the org or tab filter changes.
  useEffect(() => { setPage(1); }, [orgId, tab]);

  const load = useCallback(() => {
    setLoading(true); setErr("");
    discussionsAdminApi.list(orgId || undefined, TAB_STATUS[tab], page, PER_PAGE)
      .then((r) => {
        setThreads(r.data ?? []);
        setTotal(r.meta?.total ?? 0);
      })
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [orgId, tab, page]);

  useEffect(() => { load(); }, [load]);

  const loadCounts = useCallback(() => {
    Promise.all([
      discussionsAdminApi.list(orgId || undefined, undefined, 1, 1),
      discussionsAdminApi.list(orgId || undefined, "flagged", 1, 1),
      discussionsAdminApi.list(orgId || undefined, "pinned", 1, 1),
      discussionsAdminApi.list(orgId || undefined, "active", 1, 1),
    ])
      .then(([all, flagged, pinned, active]) => setCounts({
        All: all.meta?.total ?? 0,
        Flagged: flagged.meta?.total ?? 0,
        Pinned: pinned.meta?.total ?? 0,
        Active: active.meta?.total ?? 0,
      }))
      .catch(() => {});
  }, [orgId]);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  const filtered = threads; // server already applies the tab's status filter
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const moderate = useCallback((id: string, action: ModerationAction) => {
    setBusy(id + action);
    discussionsAdminApi.moderate(id, action)
      .then(() => { load(); loadCounts(); })
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(""));
  }, [load, loadCounts]);

  // Summary cards — clicking one filters the tab below to that status.
  const cards: { label: string; value: string; color: string; tab: Tab }[] = [
    { label: "Total Threads", value: String(counts.All),     color: C.navy,    tab: "All" },
    { label: "Flagged",       value: String(counts.Flagged), color: C.danger,  tab: "Flagged" },
    { label: "Pinned",        value: String(counts.Pinned),  color: C.indigo,  tab: "Pinned" },
    { label: "Active",        value: String(counts.Active),  color: C.green,   tab: "Active" },
  ];

  return (
    <div style={{ ...ff, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {cards.map((c) => (
          <StatCard key={c.label} label={c.label} value={loading ? "—" : c.value} color={c.color} onNavigate={() => setTab(c.tab)} />
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
              {t} ({counts[t]})
            </button>
          );
        })}
      </div>

      {err && <div style={banner.err}>{err}</div>}

      {/* Thread card list */}
      {loading ? (
        <div style={card.empty}>Loading discussions…</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card.plain, ...card.empty }}>No threads found for this scope.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((t) => (
            <ThreadCard key={t.id} t={t} busy={busy} onModerate={moderate} />
          ))}
          <Pager page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}
    </div>
  );
}

function Pager({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const btn = (disabled: boolean): React.CSSProperties => ({
    ...ff, padding: "7px 14px", borderRadius: 8, border: `1px solid ${C.border}`,
    background: "#fff", color: disabled ? "#C9BFA8" : C.navy, fontSize: 12, fontWeight: 600,
    cursor: disabled ? "not-allowed" : "pointer",
  });
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "6px 0" }}>
      <button style={btn(page <= 1)} disabled={page <= 1} onClick={() => onChange(page - 1)}>← Prev</button>
      <span style={{ ...ff, fontSize: 12, color: C.muted, fontWeight: 600 }}>Page {page} of {totalPages}</span>
      <button style={btn(page >= totalPages)} disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next →</button>
    </div>
  );
}

function ThreadCard({
  t, busy, onModerate,
}: {
  t: AdminThreadDTO;
  busy: string;
  onModerate: (id: string, action: ModerationAction) => void;
}) {
  const statusColor =
    t.status === "flagged" ? C.danger : t.status === "pinned" ? C.indigo : C.green;
  const isBusy = (a: ModerationAction) => busy === t.id + a;

  return (
    <div style={{ ...card.plain, padding: "16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12, gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 2 }}>{t.title}</div>
          <div style={{ fontSize: 11, color: C.muted }}>
            {t.program} · {t.org} · by {t.author} · {fmtWhen(t.last_activity)}
          </div>
        </div>
        <span style={pill(statusColor)}>{t.status.toUpperCase()}</span>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", gap: 18 }}>
          <Metric label="Replies" value={t.replies} />
          <Metric label="Views" value={t.views} />
        </div>

        {/* Moderation actions */}
        <div style={{ display: "flex", gap: 6 }}>
          {t.status === "pinned" ? (
            <ActionBtn label="Unpin" busy={isBusy("unpin")} onClick={() => onModerate(t.id, "unpin")} />
          ) : (
            <ActionBtn label="Pin" busy={isBusy("pin")} onClick={() => onModerate(t.id, "pin")} />
          )}
          {t.status === "flagged" ? (
            <>
              <ActionBtn label="Unflag" busy={isBusy("unflag")} onClick={() => onModerate(t.id, "unflag")} />
              <ActionBtn label="Delete" danger busy={isBusy("delete")} onClick={() => onModerate(t.id, "delete")} />
            </>
          ) : (
            <ActionBtn label="Flag" busy={isBusy("flag")} onClick={() => onModerate(t.id, "flag")} />
          )}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: C.muted, marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{value}</div>
    </div>
  );
}

function ActionBtn({
  label, onClick, busy, danger,
}: {
  label: string; onClick: () => void; busy: boolean; danger?: boolean;
}) {
  const solid = danger || label === "Delete";
  return (
    <button onClick={onClick} disabled={busy} style={{
      ...ff, padding: "6px 12px", borderRadius: 7, fontSize: 11, fontWeight: 600,
      cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1,
      background: solid ? C.danger : C.page,
      border: `1px solid ${solid ? C.danger : C.border}`,
      color: solid ? "#fff" : C.navy,
    }}>
      {busy ? "…" : label}
    </button>
  );
}

function fmtWhen(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

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
