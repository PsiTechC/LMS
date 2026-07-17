"use client";

import React, { useState, useEffect } from "react";
import { programsApi, ProgramDTO } from "@/lib/programs-api";
import {
  analyticsApi, ProgramSummaryResponse, ProgramCohortRow,
  ProgramAnalyticsExtraResponse, PhaseCompletionRow, TypeCompletionRow,
} from "@/lib/analytics-api";
import { StatCard as PMStat, StatDetailOverlay, StatDetail } from "@/components/shared/StatCard";
import { Select } from "@/components/shared/Select";

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
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [aiInsightLoading, setAiInsightLoading] = useState(false);

  useEffect(() => {
    programsApi.list(orgId).then((res) => {
      const progs = res.data ?? [];
      setPrograms(progs);
      // Default to "All Programs" (empty selection) rather than silently
      // picking the first program — this also resets correctly whenever the
      // org scope changes (including to/from "All Orgs").
      setSelectedProgId("");
    }).catch(() => {
      setPrograms([]);
      setSelectedProgId("");
    });
  }, [orgId]);

  useEffect(() => {
    // "All Programs": aggregate across every program in the org — or, with no
    // org selected either (Superadmin "All Orgs"), platform-wide across every
    // org (the backend enforces that only Superadmin may omit org_id).
    if (!selectedProgId) {
      setLoading(true);
      Promise.all([
        analyticsApi.orgSummary(orgId),
        analyticsApi.orgAnalyticsExtra(orgId),
      ]).then(([s, e]) => {
        setSummary(s.data ?? null);
        setExtra(e.data ?? null);
      }).catch(() => { setSummary(null); setExtra(null); })
        .finally(() => setLoading(false));
      return;
    }
    setLoading(true);
    Promise.all([
      analyticsApi.programSummary(selectedProgId),
      analyticsApi.programAnalyticsExtra(selectedProgId),
    ]).then(([s, e]) => {
      setSummary(s.data ?? null);
      setExtra(e.data ?? null);
    }).catch(() => { setSummary(null); setExtra(null); })
      .finally(() => setLoading(false));
  }, [selectedProgId, orgId]);

  // AI Insight — real LLM-generated insight, fetched whenever the org/program
  // scope changes. Falls back to a "Coming soon" placeholder if the AI call
  // fails (e.g. provider not configured).
  useEffect(() => {
    let alive = true;
    setAiInsightLoading(true);
    setAiInsight(null);
    analyticsApi.aiInsight(orgId, selectedProgId)
      .then(r => { if (alive) setAiInsight(r.data?.insight ?? null); })
      .catch(() => { if (alive) setAiInsight(null); })
      .finally(() => { if (alive) setAiInsightLoading(false); });
    return () => { alive = false; };
  }, [orgId, selectedProgId]);

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
        title: "BY WEEK",
        rows: (extra?.weekly_engagement ?? []).map((w) => ({
          label: w.week_label, value: `${w.engagement_pct}%`, bar: w.engagement_pct, color: C.orange,
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
          <Select
            value={selectedProgId}
            onChange={setSelectedProgId}
            style={{ minWidth: 240 }}
            options={programs.length === 0
              ? [{ value: "", label: "No programs found" }]
              : [{ value: "", label: "All Programs" }, ...programs.map((p) => ({ value: p.id, label: p.title }))]}
          />
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
          {[40, 100, 80].map((w, i) => <div key={i} className="xa-skeleton" style={{ background: "#F0F1F7", borderRadius: 8, width: `${w}%`, height: i === 0 ? 20 : 60 }} />)}
        </div>
      ) : programs.length === 0 ? (
        <div style={{ padding: "48px 24px", textAlign: "center", color: C.muted, fontSize: 13 }}>No programs found{orgId ? " for this organization" : ""}. Create a program to see analytics here.</div>
      ) : !summary ? (
        <div style={{ padding: "48px 24px", textAlign: "center", color: C.muted, fontSize: 13 }}>
          No analytics data for {selectedProgId ? "this program" : "these programs"} yet.
        </div>
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
                style={{ padding: "7px 16px", border: `1px solid ${tab === t ? C.navy : C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12, ...ff,
                  ...(tab === t ? { background: C.navy, color: "#fff", fontWeight: 700 } : { background: "#fff", color: C.muted }) }}>
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
                        <div style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>{Math.round(w.engagement_pct)}%</div>
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
                  <div style={{ fontSize: 12, color: C.navy, lineHeight: 1.6 }}>
                    {aiInsightLoading ? "Thinking…" : aiInsight ?? "AI Insight is unavailable right now."}
                  </div>
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
