"use client";

import React, { useState, useEffect } from "react";
import ReactDOM from "react-dom";
import { programsApi, ProgramDTO } from "@/lib/programs-api";
import {
  analyticsApi, ProgramSummaryResponse, ProgramCohortRow,
  ProgramAnalyticsExtraResponse, PhaseCompletionRow, TypeCompletionRow,
} from "@/lib/analytics-api";

const C = { navy: "#1C2551", orange: "#EF4E24", indigo: "#6B73BF", muted: "#8b90a7", border: "#EAECF4", green: "#22c55e", red: "#ef4444", amber: "#f59e0b" };
const ff = { fontFamily: "Poppins,sans-serif" } as const;

function PMCard({ children, style, onClick }: { children: React.ReactNode; style?: React.CSSProperties; onClick?: () => void }) {
  return <div onClick={onClick} style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(28,37,81,0.07)", border: `1px solid ${C.border}`, padding: 20, ...style }}>{children}</div>;
}

function PMBar({ pct, color = C.orange, height = 6 }: { pct: number; color?: string; height?: number }) {
  return (
    <div style={{ height, background: "#F0F1F7", borderRadius: 99 }}>
      <div style={{ height: "100%", width: `${Math.min(Math.max(pct, 0), 100)}%`, background: color, borderRadius: 99, transition: "width 0.4s ease" }} />
    </div>
  );
}

interface DetailRow { label: string; value: string; bar?: number; color?: string; dot?: string }
interface DetailSection { title: string; rows: DetailRow[] }
interface StatDetail { label: string; value: string; sub?: string; color?: string; sections: DetailSection[] }

function PMStat({ label, value, sub, color, detail, onOpen }: { label: string; value: string | number; sub?: string; color?: string; detail?: DetailSection[]; onOpen?: () => void }) {
  return (
    <PMCard style={{ flex: 1, cursor: detail ? "pointer" : "default" }} onClick={detail ? onOpen : undefined}>
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 5, ...ff }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color ?? C.navy, ...ff }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2, ...ff }}>{sub}</div>}
      {detail && <div style={{ fontSize: 9, color: C.muted, fontWeight: 600, marginTop: 6, ...ff }}>TAP FOR DETAILS</div>}
    </PMCard>
  );
}

function StatDetailOverlay({ data, onClose }: { data: StatDetail | null; onClose: () => void }) {
  if (!data) return null;
  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.45)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, ...ff }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "82vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.22)" }}>
        <div style={{ padding: "18px 22px 14px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontSize: 12, color: C.muted, fontWeight: 600, marginBottom: 4 }}>{data.label}</div>
            <div style={{ fontSize: 34, fontWeight: 800, color: data.color ?? C.navy, lineHeight: 1 }}>{data.value}</div>
            {data.sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>{data.sub}</div>}
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, border: `1px solid ${C.border}`, borderRadius: "50%", background: "#fff", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, flexShrink: 0 }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px", display: "flex", flexDirection: "column", gap: 18 }}>
          {data.sections.map((sec, si) => (
            <div key={si}>
              <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 10 }}>{sec.title}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {sec.rows.length === 0
                  ? <div style={{ fontSize: 12, color: C.muted }}>No data yet.</div>
                  : sec.rows.map((row, ri) => (
                    <div key={ri} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {row.dot && <div style={{ width: 8, height: 8, borderRadius: "50%", background: row.dot, flexShrink: 0 }} />}
                      <span style={{ flex: 1, fontSize: 13, color: C.navy }}>{row.label}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: row.color ?? data.color ?? C.navy }}>{row.value}</span>
                      {row.bar != null && (
                        <div style={{ width: 80, height: 5, background: "#F0F1F7", borderRadius: 99, flexShrink: 0 }}>
                          <div style={{ height: "100%", width: `${row.bar}%`, background: row.color ?? data.color ?? C.orange, borderRadius: 99 }} />
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}

const TABS = ["engagement", "completion", "assessment", "survey"] as const;
type Tab = typeof TABS[number];

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

export default function PMAnalytics({ orgId }: { orgId: string }) {
  const [programs, setPrograms] = useState<ProgramDTO[]>([]);
  const [selectedProgId, setSelectedProgId] = useState("");
  const [summary, setSummary] = useState<ProgramSummaryResponse | null>(null);
  const [extra, setExtra] = useState<ProgramAnalyticsExtraResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<Tab>("engagement");
  const [statDetail, setStatDetail] = useState<StatDetail | null>(null);

  useEffect(() => {
    programsApi.list(orgId).then((res) => {
      const progs = res.data ?? [];
      setPrograms(progs);
      if (progs.length > 0) setSelectedProgId(progs[0].id);
    }).catch(() => {});
  }, [orgId]);

  useEffect(() => {
    if (!selectedProgId) return;
    setLoading(true);
    Promise.all([
      analyticsApi.programSummary(selectedProgId),
      analyticsApi.programAnalyticsExtra(selectedProgId),
    ]).then(([s, e]) => {
      setSummary(s.data ?? null);
      setExtra(e.data ?? null);
    }).catch(() => { setSummary(null); setExtra(null); })
      .finally(() => setLoading(false));
  }, [selectedProgId]);

  const selectedProg = programs.find((p) => p.id === selectedProgId);

  const engagementPct = extra?.engagement_pct ?? 0;
  const completionPct = summary ? Math.round(summary.avg_completion) : 0;
  const riskLabel = extra?.risk_distribution.label ?? "Low";
  const riskColor = riskLabel === "High" ? C.red : riskLabel === "Moderate" ? C.orange : C.green;
  const weeklyEngagement = extra?.weekly_engagement ?? [];
  const activityBreakdown = extra?.activity_breakdown ?? [];
  const completionByPhase = extra?.completion_by_phase ?? [];

  function openEngagementDetail() {
    setStatDetail({
      label: "Avg Engagement", value: `${engagementPct}%`, sub: "Attendance-based, this program", color: C.orange,
      sections: [{
        title: "BY ACTIVITY",
        rows: (extra?.activity_breakdown ?? []).map((a: TypeCompletionRow) => ({
          label: a.activity_type.replace(/_/g, " "), value: `${Math.round(a.completion_pct)}%`, bar: a.completion_pct, color: C.orange,
        })),
      }],
    });
  }
  function openCompletionDetail() {
    setStatDetail({
      label: "Completion Rate", value: `${completionPct}%`, sub: "On track for target", color: C.navy,
      sections: [{
        title: "BY COHORT",
        rows: (summary?.cohorts ?? []).map((c: ProgramCohortRow) => ({
          label: c.cohort_name, value: `${Math.round(c.avg_completion)}%`, bar: c.avg_completion, color: C.indigo,
        })),
      }],
    });
  }
  function openAtRiskDetail() {
    const r = extra?.risk_distribution;
    setStatDetail({
      label: "At-Risk Score", value: riskLabel, sub: `${summary?.at_risk_count ?? 0} flagged learners`, color: riskColor,
      sections: [{
        title: "RISK DISTRIBUTION",
        rows: [
          { label: "High Risk", value: String(r?.high_count ?? 0), bar: r ? pct(r.high_count, r.high_count + r.medium_count + r.low_count) : 0, color: C.red },
          { label: "Medium Risk", value: String(r?.medium_count ?? 0), bar: r ? pct(r.medium_count, r.high_count + r.medium_count + r.low_count) : 0, color: C.orange },
          { label: "Low Risk", value: String(r?.low_count ?? 0), bar: r ? pct(r.low_count, r.high_count + r.medium_count + r.low_count) : 0, color: C.green },
        ],
      }],
    });
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, ...ff }}>

      {/* Program selector */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, display: "block", marginBottom: 4, textTransform: "uppercase" }}>Program</label>
          <select value={selectedProgId} onChange={(e) => setSelectedProgId(e.target.value)}
            style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: C.navy, ...ff, background: "#fff", minWidth: 240 }}>
            {programs.length === 0 && <option value="">No programs found</option>}
            {programs.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          {[40, 100, 80].map((w, i) => <div key={i} className="xa-skeleton" style={{ background: "#F0F1F7", borderRadius: 8, width: `${w}%`, height: i === 0 ? 20 : 60 }} />)}
        </div>
      ) : !summary ? (
        <div style={{ padding: "48px 24px", textAlign: "center", color: C.muted, fontSize: 13 }}>No analytics data for this program yet.</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
            <PMStat label="Avg Engagement" value={`${engagementPct}%`} sub="Attendance-based" color={C.orange} detail={[]} onOpen={openEngagementDetail} />
            <PMStat label="Completion Rate" value={`${completionPct}%`} sub="On track for target" color={C.navy} detail={[]} onOpen={openCompletionDetail} />
            <PMStat label="At-Risk Score" value={riskLabel} sub={`${summary.at_risk_count} flagged learners`} color={riskColor} detail={[]} onOpen={openAtRiskDetail} />
            <PMStat label="NPS Score" value="—" sub="Coming soon" color={C.muted} />
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)}
                style={{ padding: "7px 16px", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12, ...ff,
                  ...(tab === t ? { background: C.navy, color: "#fff", borderColor: C.navy, fontWeight: 700 } : { background: "#fff", color: C.muted }) }}>
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>

          {tab === "engagement" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
              <PMCard>
                <div style={{ fontWeight: 700, fontSize: 14, color: C.navy, marginBottom: 16 }}>Weekly Engagement Trend</div>
                {weeklyEngagement.length === 0 ? (
                  <div style={{ padding: "32px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>No scheduled sessions with attendance data yet.</div>
                ) : (
                  <div style={{ display: "flex", alignItems: "flex-end", gap: 12, height: 160 }}>
                    {weeklyEngagement.map((w, i) => (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>{w.engagement_pct}%</div>
                        <div style={{ width: "100%", height: (w.engagement_pct / 100) * 120, background: `rgba(239,78,36,${0.4 + w.engagement_pct / 200})`, borderRadius: "6px 6px 0 0" }} />
                        <div style={{ fontSize: 10, color: C.muted }}>{w.week_label}</div>
                      </div>
                    ))}
                  </div>
                )}
              </PMCard>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <PMCard>
                  <div style={{ fontWeight: 700, fontSize: 13, color: C.navy, marginBottom: 12 }}>Activity Breakdown</div>
                  {activityBreakdown.length === 0 ? (
                    <div style={{ fontSize: 12, color: C.muted }}>No activity data yet.</div>
                  ) : activityBreakdown.map((a, i) => (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontSize: 12, color: C.navy, textTransform: "capitalize" }}>{a.activity_type.replace(/_/g, " ")}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: C.orange }}>{Math.round(a.completion_pct)}%</span>
                      </div>
                      <PMBar pct={a.completion_pct} />
                    </div>
                  ))}
                </PMCard>
                <PMCard style={{ background: "rgba(239,78,36,0.03)", border: "1px solid rgba(239,78,36,0.15)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.orange, marginBottom: 8 }}>✦ AI Insight</div>
                  <div style={{ fontSize: 12, color: C.navy, lineHeight: 1.6 }}>Coming soon — personalized engagement recommendations powered by AI.</div>
                </PMCard>
              </div>
            </div>
          )}

          {tab === "completion" && (
            <PMCard>
              <div style={{ fontWeight: 700, fontSize: 14, color: C.navy, marginBottom: 16 }}>Completion by Phase</div>
              {completionByPhase.length === 0 ? (
                <div style={{ padding: "24px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>No phases found for this program.</div>
              ) : completionByPhase.map((p: PhaseCompletionRow) => (
                <div key={p.phase_id} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ fontSize: 12, color: C.navy }}>{p.phase_name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: p.completion_pct === 100 ? C.green : p.completion_pct > 0 ? C.orange : "#D0D3E0" }}>{Math.round(p.completion_pct)}%</span>
                  </div>
                  <PMBar pct={p.completion_pct} color={p.completion_pct === 100 ? C.green : p.completion_pct > 0 ? C.orange : "#D0D3E0"} />
                </div>
              ))}
            </PMCard>
          )}

          {(tab === "assessment" || tab === "survey") && (
            <PMCard><div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: 40 }}>Coming soon — {tab} analytics for {selectedProg?.title ?? "this program"}.</div></PMCard>
          )}
        </>
      )}

      <StatDetailOverlay data={statDetail} onClose={() => setStatDetail(null)} />
    </div>
  );
}

function pct(part: number, total: number) {
  return total > 0 ? Math.round((part / total) * 100) : 0;
}
