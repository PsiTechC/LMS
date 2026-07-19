"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  sessionsAdminApi,
  AdminSession,
  AdminSessionsSummary,
  SessionStatus,
} from "@/lib/sessions-admin-api";
import { resolveJoinLink } from "@/lib/session-link";

// ── Slate / Admin design tokens (apps/CLAUDE.md) ────────────────────────────
const C = {
  navy: "#182848", slate: "#334155", orange: "#C8A860",
  page: "#F7F5F0", card: "#FFFFFF", alt: "#EFE9DC", border: "#E6DED0",
  muted: "#4A5573", green: "#22c55e", teal: "#14b8a6", indigo: "#4A5573", amber: "#f59e0b", danger: "#ef4444",
};
const ff = { fontFamily: "Poppins, sans-serif" } as const;

const TABS = ["All", "Live", "Upcoming", "Done"] as const;
type Tab = (typeof TABS)[number];

const STATUS_META: Record<SessionStatus, { label: string; color: string }> = {
  live_now: { label: "LIVE NOW", color: C.teal },
  upcoming: { label: "UPCOMING", color: C.indigo },
  done:     { label: "DONE", color: C.slate },
};

// Attendance bar colour — green high, amber mid, red low (ref: 94%/84% green).
function attColor(pct: number): string {
  if (pct >= 80) return C.green;
  if (pct >= 60) return C.amber;
  return C.danger;
}

export default function LiveSessionsAdmin({ orgId }: { orgId?: string }) {
  const [summary, setSummary]   = useState<AdminSessionsSummary | null>(null);
  const [sessions, setSessions] = useState<AdminSession[]>([]);
  const [loading, setLoad]      = useState(true);
  const [err, setErr]           = useState("");
  const [tab, setTab]           = useState<Tab>("All");

  const load = useCallback(() => {
    setLoad(true); setErr("");
    sessionsAdminApi.list(orgId || undefined)
      .then((r) => { setSummary(r.data?.summary ?? null); setSessions(r.data?.sessions ?? []); })
      .catch((e) => setErr(e.message))
      .finally(() => setLoad(false));
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const live = useMemo(() => sessions.filter((s) => s.status === "live_now"), [sessions]);

  const counts = {
    All: sessions.length,
    Live: live.length,
    Upcoming: sessions.filter((s) => s.status === "upcoming").length,
    Done: sessions.filter((s) => s.status === "done").length,
  };

  const filtered = sessions.filter((s) => {
    if (tab === "All") return true;
    if (tab === "Live") return s.status === "live_now";
    if (tab === "Upcoming") return s.status === "upcoming";
    return s.status === "done";
  });

  const cards = [
    { label: "Sessions This Month", value: summary?.sessions_this_month ?? 0, color: C.navy, accent: false },
    { label: "Live Now", value: summary?.live_now ?? 0, color: C.teal, accent: true },
    { label: "Upcoming", value: summary?.upcoming ?? 0, color: C.indigo, accent: false },
    { label: "Avg Attendance", value: summary?.avg_attendance != null ? `${summary.avg_attendance}%` : "—", color: C.green, accent: false },
  ];

  return (
    <div style={{ ...ff, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Summary cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        {cards.map((c) => (
          <div key={c.label} style={{ ...card.plain, ...(c.accent ? { borderColor: C.teal, background: "rgba(20,184,166,0.05)" } : {}) }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 5 }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: c.color }}>{loading ? "—" : c.value}</div>
          </div>
        ))}
      </div>

      {/* Live-now banner — only rendered when something is actually live */}
      {live.map((s) => <LiveBanner key={s.id} s={s} />)}

      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 6 }}>
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

      {/* Table */}
      {loading ? (
        <div style={{ ...card.plain, ...card.empty }}>Loading sessions…</div>
      ) : filtered.length === 0 ? (
        <div style={{ ...card.plain, ...card.empty }}>
          {sessions.length === 0
            ? "No sessions scheduled yet. Live and past sessions will appear here once faculty schedule them."
            : "No sessions match this filter."}
        </div>
      ) : (
        <div style={{ ...card.plain, padding: 0, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 960 }}>
            <thead>
              <tr style={{ background: C.page }}>
                {["Session", "Program / Org", "Date & Time", "Platform", "Enrolled", "Attendance", "Status", "Actions"].map((h) => (
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s, i) => <Row key={s.id} s={s} first={i === 0} />)}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Live-now banner ─────────────────────────────────────────────────────────

function LiveBanner({ s }: { s: AdminSession }) {
  return (
    <div style={{
      ...ff, background: "linear-gradient(90deg, rgba(34,197,94,0.12), rgba(20,184,166,0.10))",
      border: `1px solid ${C.green}`, borderRadius: 12, padding: "14px 18px",
      display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ width: 8, height: 8, borderRadius: 99, background: C.green, boxShadow: `0 0 0 3px rgba(34,197,94,0.25)` }} />
          <span style={{ fontSize: 10, fontWeight: 800, color: C.green, letterSpacing: 0.5 }}>LIVE NOW</span>
        </div>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{s.title}</div>
        <div style={{ fontSize: 11, color: C.slate, marginTop: 2 }}>
          {s.org} · {s.enrolled} enrolled · {s.present} joined · {s.platform}
        </div>
      </div>
      {resolveJoinLink(s.meeting_type, s.join_url, s.virtual_link) && (
        <a href={resolveJoinLink(s.meeting_type, s.join_url, s.virtual_link)} target="_blank" rel="noreferrer" style={{
          ...ff, flexShrink: 0, padding: "10px 20px", borderRadius: 8, fontSize: 12, fontWeight: 700,
          background: C.green, color: "#fff", textDecoration: "none",
        }}>Join Session</a>
      )}
    </div>
  );
}

// ── Table row ───────────────────────────────────────────────────────────────

function Row({ s, first }: { s: AdminSession; first: boolean }) {
  const meta = STATUS_META[s.status];
  return (
    <tr style={{ borderTop: first ? "none" : `1px solid ${C.border}` }}>
      <td style={td}>
        <div style={{ fontWeight: 600, color: C.navy }}>{s.title}</div>
        <div style={{ fontSize: 10, color: C.muted }}>{s.faculty || "—"} · {s.duration_mins} min</div>
      </td>
      <td style={td}>
        <div>{s.program}</div>
        <div style={{ fontSize: 10, color: C.muted }}>{s.org}</div>
      </td>
      <td style={td}>{fmtDateTime(s.scheduled_at)}</td>
      <td style={td}><span style={pill(C.slate)}>{s.platform}</span></td>
      <td style={td}>{s.enrolled}</td>
      <td style={td}>
        {s.status === "done" && s.attendance_pct != null ? (
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 120 }}>
            <div style={{ flex: 1, height: 6, background: C.alt, borderRadius: 99, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.min(100, s.attendance_pct)}%`, background: attColor(s.attendance_pct), borderRadius: 99 }} />
            </div>
            <span style={{ fontSize: 11, fontWeight: 700, color: attColor(s.attendance_pct), width: 32, textAlign: "right" }}>{s.attendance_pct}%</span>
          </div>
        ) : (
          <span style={{ color: C.muted }}>—</span>
        )}
      </td>
      <td style={td}><span style={pill(meta.color)}>{meta.label}</span></td>
      <td style={td}><Actions s={s} /></td>
    </tr>
  );
}

function Actions({ s }: { s: AdminSession }) {
  const joinLink = resolveJoinLink(s.meeting_type, s.join_url, s.virtual_link);
  if (s.status === "live_now" && joinLink) {
    return <ActionLink href={joinLink} label="Join" solid />;
  }
  if (s.status === "upcoming") {
    return joinLink
      ? <ActionLink href={joinLink} label="View" />
      : <span style={{ color: C.muted, fontSize: 11 }}>—</span>;
  }
  // done — only show Recording when one actually exists.
  if (s.status === "done" && s.recording_url) {
    return <ActionLink href={s.recording_url} label="Recording" />;
  }
  return <span style={{ color: C.muted, fontSize: 11 }}>—</span>;
}

function ActionLink({ href, label, solid }: { href: string; label: string; solid?: boolean }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" style={{
      ...ff, padding: "6px 12px", borderRadius: 7, fontSize: 11, fontWeight: 600, textDecoration: "none",
      background: solid ? C.green : C.page, color: solid ? "#fff" : C.navy,
      border: `1px solid ${solid ? C.green : C.border}`, whiteSpace: "nowrap",
    }}>{label}</a>
  );
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

const th: React.CSSProperties = {
  textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 700,
  color: C.muted, letterSpacing: 0.5, textTransform: "uppercase", whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "11px 14px", fontSize: 12, color: C.navy, verticalAlign: "middle", whiteSpace: "nowrap",
};
const pill = (color: string): React.CSSProperties => ({
  display: "inline-block", background: `${color}18`, color,
  fontSize: 9, fontWeight: 700, borderRadius: 10, padding: "3px 8px", whiteSpace: "nowrap",
});
const card = {
  plain: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(24, 40, 72,0.06)", padding: "16px 18px" } as React.CSSProperties,
  empty: { padding: 40, textAlign: "center", color: C.muted, fontSize: 13, lineHeight: 1.6 } as React.CSSProperties,
};
const banner = {
  err: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#ef4444" } as React.CSSProperties,
};
