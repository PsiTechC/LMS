"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  discussionsAdminApi,
  AdminThreadDTO,
  ModerationAction,
} from "@/lib/discussions-admin-api";

// ── Slate / Admin design tokens (apps/CLAUDE.md) ────────────────────────────
const C = {
  navy: "#1C2551", slate: "#334155", orange: "#EF4E24",
  page: "#F5F7FB", card: "#FFFFFF", alt: "#F0F1F7", border: "#EAECF4",
  muted: "#8b90a7", green: "#22c55e", indigo: "#6B73BF", danger: "#ef4444",
};
const ff = { fontFamily: "Poppins, sans-serif" } as const;

const TABS = ["All", "Flagged", "Pinned", "Active"] as const;
type Tab = (typeof TABS)[number];

export default function DiscussionsAdmin({ orgId }: { orgId?: string }) {
  const [threads, setThreads] = useState<AdminThreadDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr]         = useState("");
  const [tab, setTab]         = useState<Tab>("All");
  const [busy, setBusy]       = useState<string>("");

  const load = useCallback(() => {
    setLoading(true); setErr("");
    discussionsAdminApi.list(orgId || undefined)
      .then((r) => setThreads(r.data ?? []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    All: threads.length,
    Flagged: threads.filter((t) => t.status === "flagged").length,
    Pinned: threads.filter((t) => t.status === "pinned").length,
    Active: threads.filter((t) => t.status === "active").length,
  }), [threads]);

  const filtered = useMemo(
    () => threads.filter((t) => tab === "All" || t.status === tab.toLowerCase()),
    [threads, tab],
  );

  const moderate = useCallback((id: string, action: ModerationAction) => {
    setBusy(id + action);
    discussionsAdminApi.moderate(id, action)
      .then(() => load())
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(""));
  }, [load]);

  // Summary cards.
  const cards: { label: string; value: string; color: string }[] = [
    { label: "Total Threads", value: String(counts.All),     color: C.navy },
    { label: "Flagged",       value: String(counts.Flagged), color: C.danger },
    { label: "Pinned",        value: String(counts.Pinned),  color: C.indigo },
    { label: "Active",        value: String(counts.Active),  color: C.green },
  ];

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
        </div>
      )}
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
  plain: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(28,37,81,0.06)", padding: "16px 18px" } as React.CSSProperties,
  empty: { padding: 40, textAlign: "center", color: C.muted, fontSize: 13 } as React.CSSProperties,
};
const banner = {
  err: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#ef4444" } as React.CSSProperties,
};
