"use client";

import { useState, useEffect, useCallback } from "react";
import { nudgeAdminApi, AtRiskParticipant } from "@/lib/nudge-admin-api";
import PMComms from "@/components/communications/PMComms";

// ── Slate / Admin design tokens (apps/CLAUDE.md) ────────────────────────────
const C = {
  navy: "#182848", slate: "#334155", orange: "#C8A860",
  page: "#F7F5F0", card: "#FFFFFF", alt: "#EFE9DC", border: "#E6DED0",
  muted: "#4A5573", green: "#22c55e", amber: "#f59e0b", danger: "#ef4444",
};
const ff = { fontFamily: "Poppins, sans-serif" } as const;

const TABS = ["At-Risk Nudges", "Broadcast Message"] as const;
type Tab = (typeof TABS)[number];

export default function NudgeComms({ orgId }: { orgId?: string }) {
  const [tab, setTab] = useState<Tab>("At-Risk Nudges");

  return (
    <div style={{ ...ff, padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Tabs */}
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
              {t}
            </button>
          );
        })}
      </div>

      {tab === "At-Risk Nudges" ? (
        <AtRiskTab orgId={orgId} />
      ) : (
        <BroadcastTab orgId={orgId} />
      )}
    </div>
  );
}

// ── At-Risk Nudges tab ──────────────────────────────────────────────────────

function AtRiskTab({ orgId }: { orgId?: string }) {
  const [rows, setRows]    = useState<AtRiskParticipant[]>([]);
  const [loading, setLoad] = useState(true);
  const [err, setErr]      = useState("");
  const [busy, setBusy]    = useState<string>("");            // user_id in-flight
  const [nudged, setNudged] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    setLoad(true); setErr("");
    nudgeAdminApi.atRisk(orgId || undefined)
      .then((r) => setRows(r.data ?? []))
      .catch((e) => setErr(e.message))
      .finally(() => setLoad(false));
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const sendNudge = useCallback((p: AtRiskParticipant) => {
    setBusy(p.user_id); setErr("");
    nudgeAdminApi.nudge(p.user_id, p.cohort_id)
      .then(() => setNudged((m) => ({ ...m, [p.user_id]: true })))
      .catch((e) => setErr(e.message))
      .finally(() => setBusy(""));
  }, []);

  const high = rows.filter((r) => r.risk_level === "high").length;
  const medium = rows.filter((r) => r.risk_level === "medium").length;

  const cards = [
    { label: "At-Risk Participants", value: rows.length, color: C.navy },
    { label: "High Risk",   value: high,   color: C.danger },
    { label: "Medium Risk", value: medium, color: C.amber },
  ];

  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {cards.map((c) => (
          <div key={c.label} style={card.plain}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 5 }}>{c.label}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: c.color }}>{loading ? "—" : c.value}</div>
          </div>
        ))}
      </div>

      {err && <div style={banner.err}>{err}</div>}

      {loading ? (
        <div style={{ ...card.plain, ...card.empty }}>Loading at-risk participants…</div>
      ) : rows.length === 0 ? (
        <div style={{ ...card.plain, ...card.empty }}>
          No at-risk participants right now. Everyone enrolled is on track — nudges appear here when a
          participant&apos;s risk level rises to medium or high.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map((p) => (
            <RiskCard
              key={p.user_id + p.cohort_id}
              p={p}
              busy={busy === p.user_id}
              done={nudged[p.user_id]}
              onNudge={() => sendNudge(p)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function RiskCard({ p, busy, done, onNudge }: {
  p: AtRiskParticipant; busy: boolean; done?: boolean; onNudge: () => void;
}) {
  const high = p.risk_level === "high";
  const riskColor = high ? C.danger : C.amber;
  return (
    <div style={{ ...card.plain, padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{p.name}</span>
          <span style={pill(riskColor)}>{p.risk_level.toUpperCase()} RISK</span>
        </div>
        <div style={{ fontSize: 11, color: C.muted }}>{p.email} · {p.org} · {p.program} · {p.cohort}</div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 4, display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span>Completion <strong style={{ color: C.navy }}>{Math.round(p.completion_percent)}%</strong></span>
          <span>Inactive <strong style={{ color: C.navy }}>{p.days_since_activity >= 999 ? "—" : `${p.days_since_activity}d`}</strong></span>
          <span>Last nudge <strong style={{ color: C.navy }}>{p.nudged_at ? fmtDate(p.nudged_at) : "Never"}</strong></span>
        </div>
      </div>
      <button
        onClick={onNudge}
        disabled={busy || done}
        style={{
          ...ff, flexShrink: 0, padding: "9px 18px", borderRadius: 8, fontSize: 12, fontWeight: 700,
          cursor: busy || done ? "default" : "pointer",
          background: done ? C.green : C.navy, border: "none", color: "#fff",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {done ? "✓ Nudged" : busy ? "Sending…" : "Send Nudge"}
      </button>
    </div>
  );
}

// ── Broadcast Message tab (reuses PM's campaign composer) ────────────────────

function BroadcastTab({ orgId }: { orgId?: string }) {
  if (!orgId) {
    return (
      <div style={{ ...card.plain, ...card.empty }}>
        Select an organization from the header dropdown to compose and send a broadcast campaign.
        Broadcasts are scoped to a single organization&apos;s cohorts.
      </div>
    );
  }
  // Reuse the Program Manager campaign composer verbatim — no second composer.
  return <PMComms orgId={orgId} />;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

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
