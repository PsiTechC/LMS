"use client";

import { useState, useEffect, useCallback } from "react";
import {
  leaderboardAdminApi,
  AdminLeaderboardDTO,
  AdminLeaderRow,
  AdminOrgRow,
} from "@/lib/leaderboard-admin-api";

// ── Slate / Admin design tokens (apps/CLAUDE.md) ────────────────────────────
const C = {
  navy: "#1C2551", slate: "#334155", orange: "#EF4E24",
  page: "#F5F7FB", card: "#FFFFFF", alt: "#F0F1F7", border: "#EAECF4",
  muted: "#8b90a7", green: "#22c55e", indigo: "#6B73BF", amber: "#f59e0b",
};
const ff = { fontFamily: "Poppins, sans-serif" } as const;

const MEDAL = ["#f59e0b", "#94a3b8", "#b45309"]; // gold, silver, bronze
const VIEWS = ["Top Participants", "By Organization"] as const;
type View = (typeof VIEWS)[number];

export default function LeaderboardAdmin({ orgId }: { orgId?: string }) {
  const [data, setData]    = useState<AdminLeaderboardDTO | null>(null);
  const [loading, setLoad] = useState(true);
  const [err, setErr]      = useState("");
  const [view, setView]    = useState<View>("Top Participants");

  const load = useCallback(() => {
    setLoad(true); setErr("");
    leaderboardAdminApi.get(orgId || undefined)
      .then((r) => setData(r.data ?? null))
      .catch((e) => setErr(e.message))
      .finally(() => setLoad(false));
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const participants = data?.participants ?? [];
  const organizations = data?.organizations ?? [];
  const isOrg = view === "By Organization";
  const empty = isOrg ? organizations.length === 0 : participants.length === 0;

  return (
    <div style={{ ...ff, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* View toggle */}
      <div style={{ display: "flex", gap: 6 }}>
        {VIEWS.map((v) => {
          const on = view === v;
          return (
            <button key={v} onClick={() => setView(v)} style={{
              ...ff, padding: "7px 16px", borderRadius: 8, fontSize: 12, cursor: "pointer",
              fontWeight: on ? 700 : 500,
              background: on ? C.navy : "#fff", color: on ? "#fff" : C.muted,
              border: `1px solid ${on ? C.navy : C.border}`,
            }}>
              {v} ({v === "By Organization" ? organizations.length : participants.length})
            </button>
          );
        })}
      </div>

      {err && <div style={banner.err}>{err}</div>}

      {loading ? (
        <div style={{ ...card.plain, ...card.empty }}>Loading rankings…</div>
      ) : empty ? (
        <div style={{ ...card.plain, ...card.empty }}>
          No participants have opted in to the leaderboard yet. Rankings appear here once
          enrolled participants have leaderboard visibility enabled.
        </div>
      ) : isOrg ? (
        <>
          <Podium items={organizations.slice(0, 3).map((o) => ({
            title: o.org, subtitle: `${o.participants} participant${o.participants === 1 ? "" : "s"}`,
            metric: o.total_points, metricLabel: "total pts",
          }))} />
          <OrgTable rows={organizations} />
        </>
      ) : (
        <>
          <Podium items={participants.slice(0, 3).map((p) => ({
            title: p.participant, subtitle: `${p.org} · ${p.program}`,
            metric: p.points, metricLabel: "points",
          }))} />
          <ParticipantTable rows={participants} />
        </>
      )}
    </div>
  );
}

// ── Top-3 podium ────────────────────────────────────────────────────────────

function Podium({ items }: { items: { title: string; subtitle: string; metric: number; metricLabel: string }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.max(1, items.length)}, 1fr)`, gap: 14 }}>
      {items.map((it, i) => (
        <div key={i} style={{
          ...card.plain, padding: "16px 18px", position: "relative",
          borderTop: `3px solid ${MEDAL[i]}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <div style={{
              width: 24, height: 24, borderRadius: 99, background: `${MEDAL[i]}22`, color: MEDAL[i],
              fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
            }}>{i + 1}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase" }}>
              {i === 0 ? "Leader" : `Rank ${i + 1}`}
            </div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.title}</div>
          <div style={{ fontSize: 11, color: C.muted, marginBottom: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{it.subtitle}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: C.orange }}>
            {it.metric.toLocaleString()} <span style={{ fontSize: 11, fontWeight: 600, color: C.muted }}>{it.metricLabel}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Participant table ───────────────────────────────────────────────────────

function ParticipantTable({ rows }: { rows: AdminLeaderRow[] }) {
  return (
    <div style={{ ...card.plain, padding: 0, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 860 }}>
        <thead>
          <tr style={{ background: C.page }}>
            {["Rank", "Participant", "Organization", "Program", "Points", "Streak", "Progress", "Change"].map((h) => (
              <th key={h} style={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={`${r.user_id}-${r.program}`} style={{ borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}>
              <td style={td}><RankBadge rank={r.rank} /></td>
              <td style={{ ...td, fontWeight: 600 }}>{r.participant}</td>
              <td style={td}>{r.org}</td>
              <td style={td}>{r.program}</td>
              <td style={{ ...td, fontWeight: 700, color: C.orange }}>{r.points.toLocaleString()}</td>
              <td style={td}>{r.streak > 0 ? `🔥 ${r.streak}d` : "—"}</td>
              <td style={td}><ProgressBar pct={r.progress} /></td>
              <td style={td}><Change value={r.change} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Organization table ──────────────────────────────────────────────────────

function OrgTable({ rows }: { rows: AdminOrgRow[] }) {
  return (
    <div style={{ ...card.plain, padding: 0, overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
        <thead>
          <tr style={{ background: C.page }}>
            {["Rank", "Organization", "Participants", "Total Points", "Avg Points", "Avg Progress"].map((h) => (
              <th key={h} style={th}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.org_id} style={{ borderTop: i === 0 ? "none" : `1px solid ${C.border}` }}>
              <td style={td}><RankBadge rank={r.rank} /></td>
              <td style={{ ...td, fontWeight: 600 }}>{r.org}</td>
              <td style={td}>{r.participants}</td>
              <td style={{ ...td, fontWeight: 700, color: C.orange }}>{r.total_points.toLocaleString()}</td>
              <td style={td}>{r.avg_points.toLocaleString()}</td>
              <td style={td}><ProgressBar pct={r.avg_progress} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Cell helpers ────────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  const color = rank <= 3 ? MEDAL[rank - 1] : C.muted;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      minWidth: 22, height: 22, padding: "0 6px", borderRadius: 99,
      background: `${color}18`, color, fontSize: 11, fontWeight: 800,
    }}>{rank}</span>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 110 }}>
      <div style={{ flex: 1, height: 6, background: C.alt, borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(100, pct)}%`, background: C.green, borderRadius: 99 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.navy, width: 30, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

function Change({ value }: { value: number | null }) {
  // No historical snapshot stored → genuinely unavailable, shown as a neutral dash.
  if (value == null) return <span style={{ color: C.muted, fontSize: 12 }}>—</span>;
  if (value === 0) return <span style={{ color: C.muted, fontSize: 12 }}>0</span>;
  const up = value > 0;
  return (
    <span style={{ color: up ? C.green : C.orange, fontSize: 12, fontWeight: 700 }}>
      {up ? "▲" : "▼"} {Math.abs(value)}
    </span>
  );
}

const th: React.CSSProperties = {
  textAlign: "left", padding: "10px 14px", fontSize: 11, fontWeight: 700,
  color: C.muted, letterSpacing: 0.5, textTransform: "uppercase", whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "11px 14px", fontSize: 12, color: C.navy, whiteSpace: "nowrap",
};
const card = {
  plain: { background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(28,37,81,0.06)", padding: "16px 18px" } as React.CSSProperties,
  empty: { padding: 40, textAlign: "center", color: C.muted, fontSize: 13 } as React.CSSProperties,
};
const banner = {
  err: { background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#ef4444" } as React.CSSProperties,
};
