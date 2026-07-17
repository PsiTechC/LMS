"use client";

import React, { useState, useEffect, useCallback } from "react";
import { analyticsApi, ProgramOverview, ProgramSummaryResponse, ProgramCohortRow, AtRiskParticipant } from "@/lib/analytics-api";
import { programsApi, ProgramDTO } from "@/lib/programs-api";
import { StatCard, useStatDetail } from "@/components/shared/StatCard";

// ── Design tokens ─────────────────────────────────────────────────
const NAVY   = "#182848";
const ORANGE = "#C8A860";
const INDIGO = "#4A5573";
const BG     = "#F7F5F0";
const BORDER = "#E6DED0";
const MUTED  = "#4A5573";
const GREEN  = "#22c55e";
const WARN   = "#f59e0b";
const DANGER = "#ef4444";

// ── Utility ───────────────────────────────────────────────────────
function formatMonth(): string {
  return new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function cohortHealthScore(cohort: ProgramCohortRow): number {
  // Score 0–100 based on completion rate and at-risk ratio
  const completionScore = cohort.avg_completion; // 0-100
  const enrolledSafe    = cohort.total_enrolled || 1;
  const atRiskRatio     = cohort.at_risk_count / enrolledSafe;
  const riskPenalty     = atRiskRatio * 30;
  return Math.max(0, Math.min(100, Math.round(completionScore - riskPenalty)));
}

function healthColor(score: number): string {
  if (score >= 80) return GREEN;
  if (score >= 60) return WARN;
  return DANGER;
}

// ── Component ─────────────────────────────────────────────────────
export default function PMDashboard({ orgId, onNavigate }: { orgId: string; onNavigate?: (page: string) => void }) {
  const [overview,       setOverview]       = useState<ProgramOverview | null>(null);
  const [programs,       setPrograms]       = useState<ProgramDTO[]>([]);
  const [summaries,      setSummaries]      = useState<Map<string, ProgramSummaryResponse>>(new Map());
  const [atRiskMap,      setAtRiskMap]      = useState<Map<string, AtRiskParticipant[]>>(new Map());
  const [loadingOverview, setLoadingOverview] = useState(true);
  const [loadingPrograms, setLoadingPrograms] = useState(true);

  // Top-level overview (programs, participants, completion, at-risk)
  useEffect(() => {
    if (!orgId) return;
    analyticsApi.programOverview(orgId)
      .then(r => setOverview(r.data ?? null))
      .catch(() => {})
      .finally(() => setLoadingOverview(false));
  }, [orgId]);

  // Active programs list → then fetch per-program summaries in parallel
  const loadPrograms = useCallback(async () => {
    if (!orgId) return;
    setLoadingPrograms(true);
    try {
      const res = await programsApi.list(orgId);
      const list = (res.data ?? []).filter(p => p.status === "active");
      setPrograms(list);

      // Fan out: fetch summary for each active program in parallel
      const results = await Promise.allSettled(
        list.map(p => analyticsApi.programSummary(p.id).then(r => ({ id: p.id, data: r.data })))
      );
      const newMap = new Map<string, ProgramSummaryResponse>();
      results.forEach(r => {
        if (r.status === "fulfilled" && r.value.data) {
          newMap.set(r.value.id, r.value.data);
        }
      });
      setSummaries(newMap);

      // For each program's cohorts, fetch at-risk lists in parallel
      const allCohortIds: string[] = [];
      newMap.forEach(summary => {
        summary.cohorts?.forEach(c => allCohortIds.push(c.cohort_id));
      });
      const atRiskResults = await Promise.allSettled(
        allCohortIds.map(id => analyticsApi.atRisk(id).then(r => ({ id, data: r.data?.participants ?? [] })))
      );
      const arMap = new Map<string, AtRiskParticipant[]>();
      atRiskResults.forEach(r => {
        if (r.status === "fulfilled") arMap.set(r.value.id, r.value.data);
      });
      setAtRiskMap(arMap);
    } catch { /* ignore */ } finally {
      setLoadingPrograms(false);
    }
  }, [orgId]);

  useEffect(() => { loadPrograms(); }, [loadPrograms]);

  // Derived AI alerts from at-risk data
  const aiAlerts = buildAlerts(atRiskMap, summaries, programs);

  // Upcoming actions (derived from cohort data)
  const upcomingActions = buildUpcomingActions(summaries);

  // Build cohort health rows for all active programs
  const cohortHealthRows = buildCohortHealthRows(programs, summaries);

  const loading = loadingOverview || loadingPrograms;
  const statDetail = useStatDetail();
  const completionRows = cohortHealthRows.map(r => ({ label: `${r.cohortName} · ${r.programName}`, value: `${r.completion}%`, bar: r.completion, color: NAVY }));
  const atRiskRows = cohortHealthRows.filter(r => r.atRisk > 0).map(r => ({ label: `${r.cohortName} · ${r.programName}`, value: String(r.atRisk), color: DANGER }));
  const activeProgramRows = programs.map(p => ({ label: p.title, value: `${p.phase_count} phases · ${p.activity_count} activities` }));
  const participantRows = cohortHealthRows.map(r => ({ label: `${r.cohortName} · ${r.programName}`, value: String(r.enrolled) }));

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Poppins,sans-serif" }}>

      {/* ── KPI cards ────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <StatCard
          label="Active Programs"
          value={loadingOverview ? "—" : String(overview?.active_programs ?? 0)}
          sub={overview ? `${overview.draft_programs} enrolling soon` : "No data yet"}
          detail={[{ title: "PROGRAMS", rows: activeProgramRows }]}
          onOpen={() => statDetail.open({
            label: "Active Programs", value: String(overview?.active_programs ?? 0), sub: overview ? `${overview.draft_programs} enrolling soon` : "No data yet", color: NAVY,
            sections: [{ title: "PROGRAMS", rows: activeProgramRows }],
          })}
        />
        <StatCard
          label="Total Participants"
          value={loadingOverview ? "—" : String(overview?.total_participants ?? 0)}
          color={ORANGE}
          sub="across all programs"
          detail={[{ title: "BY COHORT", rows: participantRows }]}
          onOpen={() => statDetail.open({
            label: "Total Participants", value: String(overview?.total_participants ?? 0), sub: "across all programs", color: ORANGE,
            sections: [{ title: "BY COHORT", rows: participantRows }],
          })}
        />
        <StatCard
          label="Avg Completion Rate"
          value={loadingOverview ? "—" : `${(overview?.avg_completion ?? 0).toFixed(0)}%`}
          color={NAVY}
          sub={cohortHealthRows.length ? `Across ${cohortHealthRows.length} cohorts` : "No data yet"}
          detail={[{ title: "BY COHORT", rows: completionRows }]}
          onOpen={() => statDetail.open({
            label: "Avg Completion Rate", value: `${(overview?.avg_completion ?? 0).toFixed(0)}%`, sub: "Across active cohorts", color: NAVY,
            sections: [{ title: "BY COHORT", rows: completionRows }],
          })}
        />
        <StatCard
          label="At-Risk Learners"
          value={loadingOverview ? "—" : String(overview?.at_risk_count ?? 0)}
          color={DANGER}
          sub="AI flagged"
          detail={[{ title: "BY COHORT", rows: atRiskRows }]}
          onOpen={() => statDetail.open({
            label: "At-Risk Learners", value: String(overview?.at_risk_count ?? 0), sub: "AI flagged, across all cohorts", color: DANGER,
            sections: [{ title: "BY COHORT", rows: atRiskRows }],
          })}
        />
      </div>
      {statDetail.overlay}

      {/* ── Cohort Health + AI Alerts ─────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 16, alignItems: "start" }}>

        {/* Cohort Health Overview */}
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 16 }}>Cohort Health Overview</div>
          {loading ? (
            <SkeletonRows n={3} />
          ) : cohortHealthRows.length === 0 ? (
            <EmptySection
              icon="◎"
              title="No active cohorts yet"
              body="Active cohorts will appear here with real-time health scores once participants enroll."
              action={onNavigate ? "Manage Cohorts →" : undefined}
              onAction={() => onNavigate?.("pm-cohort")}
            />
          ) : (
            <div style={{ display: "flex", flexDirection: "column" }}>
              {cohortHealthRows.map(row => (
                <CohortHealthRow key={row.cohortId} row={row} />
              ))}
            </div>
          )}
        </div>

        {/* Right column: AI Alerts + Upcoming Actions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

          {/* AI Alerts */}
          <div style={{ ...card, background: `rgba(200, 168, 96,0.03)`, border: `1px solid rgba(200, 168, 96,0.15)` }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: ORANGE, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
              <span>✦</span> AI Alerts
            </div>
            {loading ? (
              <SkeletonRows n={3} compact />
            ) : aiAlerts.length === 0 ? (
              <div style={{ fontSize: 12, color: MUTED, padding: "8px 0" }}>
                No alerts — all cohorts look healthy.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {aiAlerts.slice(0, 5).map((a, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 12, color: NAVY, padding: "8px 0", borderBottom: "1px solid rgba(200, 168, 96,0.1)" }}>
                    <span style={{ color: WARN, flexShrink: 0 }}>⚠</span>
                    <span>{a}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming Actions */}
          <div style={card}>
            <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 10 }}>Upcoming Actions</div>
            {loading ? (
              <SkeletonRows n={3} compact />
            ) : upcomingActions.length === 0 ? (
              <div style={{ fontSize: 12, color: MUTED }}>
                No upcoming actions. Add cohort start/end dates to see scheduled milestones.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {upcomingActions.slice(0, 4).map((a, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 0", borderBottom: `1px solid ${BORDER}` }}>
                    <span style={{ color: ORANGE, fontSize: 12, flexShrink: 0 }}>→</span>
                    <span style={{ fontSize: 12, color: MUTED }}>{a}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ── Program-level quick stats strip ──────────────────────── */}
      {programs.length > 0 && (
        <div style={{ ...card, padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "11px 18px", borderBottom: `1px solid ${BORDER}`, fontSize: 12, fontWeight: 700, color: NAVY }}>
            Active Programs — Quick Stats
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: BG }}>
                {["PROGRAM", "COHORTS", "PARTICIPANTS", "AVG COMPLETION", "AT RISK", "STATUS"].map(h => (
                  <th key={h} style={{ padding: "7px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {programs.map(p => {
                const summary = summaries.get(p.id);
                return (
                  <tr key={p.id} style={{ borderTop: `1px solid ${BORDER}` }}>
                    <td style={{ padding: "9px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <div style={{ width: 7, height: 7, borderRadius: "50%", background: p.color || ORANGE, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>{p.title}</span>
                      </div>
                    </td>
                    <td style={{ padding: "9px 14px", fontSize: 12, color: NAVY }}>{summary?.total_cohorts ?? "—"}</td>
                    <td style={{ padding: "9px 14px", fontSize: 12, color: NAVY, fontWeight: 600 }}>{summary?.total_participants ?? "—"}</td>
                    <td style={{ padding: "9px 14px" }}>
                      {summary ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <div style={{ flex: 1, height: 4, background: "#EFE9DC", borderRadius: 99, minWidth: 50 }}>
                            <div style={{ width: `${summary.avg_completion}%`, height: "100%", background: ORANGE, borderRadius: 99 }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 700, color: NAVY, minWidth: 28 }}>{summary.avg_completion.toFixed(0)}%</span>
                        </div>
                      ) : <span style={{ color: MUTED, fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: "9px 14px" }}>
                      {summary ? (
                        <span style={{
                          background: summary.at_risk_count > 0 ? "#ef444414" : "#22c55e14",
                          color: summary.at_risk_count > 0 ? DANGER : GREEN,
                          fontSize: 11, fontWeight: 700, borderRadius: 6, padding: "2px 7px",
                        }}>
                          {summary.at_risk_count > 0 ? `${summary.at_risk_count} at risk` : "All good"}
                        </span>
                      ) : <span style={{ color: MUTED, fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: "9px 14px" }}>
                      <span style={{ background: `${ORANGE}14`, color: ORANGE, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "2px 8px" }}>
                        ACTIVE
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}

// ── CohortHealthRow ───────────────────────────────────────────────
interface CohortHealthRowData {
  cohortId: string;
  cohortName: string;
  programName: string;
  enrolled: number;
  atRisk: number;
  completion: number;
  currentPhase: string;
  score: number;
}

function CohortHealthRow({ row }: { row: CohortHealthRowData }) {
  const color = healthColor(row.score);
  return (
    <div style={{ padding: "14px 0", borderBottom: `1px solid ${BORDER}` }}>
      {/* Title row */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{row.cohortName}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 3 }}>
            <span style={{ background: `${INDIGO}14`, color: INDIGO, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "2px 7px" }}>
              {row.currentPhase}
            </span>
            <span style={{ fontSize: 11, color: MUTED }}>{row.enrolled} enrolled</span>
            {row.atRisk > 0 && (
              <span style={{ background: "#ef444412", color: DANGER, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "2px 7px" }}>
                {row.atRisk} at risk
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color, lineHeight: 1.1 }}>{row.score}</div>
          <div style={{ fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: 0.5 }}>Health Score</div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: 6, background: "#EFE9DC", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ width: `${Math.max(row.completion, 2)}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────
function EmptySection({ icon, title, body, action, onAction }: { icon: string; title: string; body: string; action?: string; onAction?: () => void }) {
  return (
    <div style={{ padding: "28px 0", textAlign: "center" }}>
      <div style={{ fontSize: 28, color: BORDER, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: NAVY, marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 12, color: MUTED, lineHeight: 1.6, maxWidth: 360, margin: "0 auto" }}>{body}</div>
      {action && onAction && (
        <button onClick={onAction}
          style={{ marginTop: 14, fontSize: 12, color: ORANGE, fontWeight: 600, background: "none", border: "none", cursor: "pointer", fontFamily: "Poppins,sans-serif" }}>
          {action}
        </button>
      )}
    </div>
  );
}

// ── Skeleton rows ─────────────────────────────────────────────────
function SkeletonRows({ n, compact }: { n: number; compact?: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 8 : 16 }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={{ height: compact ? 14 : 24, borderRadius: 6, background: "#EFE9DC", opacity: 1 - i * 0.2 }} />
      ))}
    </div>
  );
}

// ── Data builders ─────────────────────────────────────────────────
function buildCohortHealthRows(
  programs: ProgramDTO[],
  summaries: Map<string, ProgramSummaryResponse>
): CohortHealthRowData[] {
  const rows: CohortHealthRowData[] = [];
  programs.forEach(p => {
    const summary = summaries.get(p.id);
    if (!summary?.cohorts?.length) return;
    summary.cohorts.forEach((c, idx) => {
      rows.push({
        cohortId:    c.cohort_id,
        cohortName:  c.cohort_name,
        programName: p.title,
        enrolled:    c.total_enrolled,
        atRisk:      c.at_risk_count,
        completion:  Math.round(c.avg_completion),
        currentPhase: `Phase ${idx + 1}`,
        score:       cohortHealthScore(c),
      });
    });
  });
  // Deduplicate by cohortId — a cohort may appear in multiple program summaries
  const seen = new Set<string>();
  const unique = rows.filter(r => { if (seen.has(r.cohortId)) return false; seen.add(r.cohortId); return true; });
  return unique.sort((a, b) => a.score - b.score); // worst first (most attention needed)
}

function buildAlerts(
  atRiskMap: Map<string, AtRiskParticipant[]>,
  summaries: Map<string, ProgramSummaryResponse>,
  programs: ProgramDTO[]
): string[] {
  const alerts: string[] = [];

  atRiskMap.forEach((participants, cohortId) => {
    // Find cohort name
    let cohortName = cohortId.slice(0, 8);
    summaries.forEach(s => {
      const c = s.cohorts?.find(c => c.cohort_id === cohortId);
      if (c) cohortName = c.cohort_name;
    });

    // Long inactive participants
    const veryInactive = participants.filter(p => p.days_since_activity >= 5);
    if (veryInactive.length > 0) {
      alerts.push(`${veryInactive[0].name} hasn't logged in for ${veryInactive[0].days_since_activity} days`);
    }

    // Multiple overdue activities
    const overdue = participants.filter(p => p.activities_overdue >= 2);
    if (overdue.length > 0) {
      alerts.push(`${overdue.length} participant${overdue.length > 1 ? "s" : ""} missed pre-work deadline in ${cohortName}`);
    }

    // High risk participants
    const highRisk = participants.filter(p => p.risk_level === "high");
    if (highRisk.length > 0) {
      alerts.push(`${highRisk.length} high-risk learner${highRisk.length > 1 ? "s" : ""} flagged in ${cohortName}`);
    }
  });

  // Low completion cohorts
  summaries.forEach(s => {
    s.cohorts?.forEach(c => {
      if (c.avg_completion < 40 && c.total_enrolled > 0) {
        alerts.push(`${c.cohort_name} completion dropped to ${c.avg_completion.toFixed(0)}%`);
      }
    });
  });

  return alerts.length > 0 ? alerts : [];
}

function buildUpcomingActions(summaries: Map<string, ProgramSummaryResponse>): string[] {
  const actions: string[] = [];

  summaries.forEach(s => {
    s.cohorts?.forEach(c => {
      if (c.end_date) {
        const daysLeft = Math.ceil((new Date(c.end_date).getTime() - Date.now()) / 86_400_000);
        if (daysLeft > 0 && daysLeft <= 14) {
          actions.push(`Review 360 nominations — ${c.cohort_name} ends in ${daysLeft}d`);
        }
        if (daysLeft > 14 && daysLeft <= 30) {
          actions.push(`Finalize capstone panel — ${c.cohort_name}`);
        }
      }
      if (c.start_date) {
        const daysToStart = Math.ceil((new Date(c.start_date).getTime() - Date.now()) / 86_400_000);
        if (daysToStart > 0 && daysToStart <= 7) {
          actions.push(`Send pre-classroom reminder — ${c.cohort_name} starts in ${daysToStart}d`);
        }
      }
    });
  });

  if (actions.length === 0) {
    actions.push("No upcoming milestones in the next 30 days");
  }

  return actions;
}

// ── Styles ────────────────────────────────────────────────────────
const card: React.CSSProperties = {
  background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`,
  boxShadow: "0 1px 4px rgba(24, 40, 72,0.07)", padding: 20,
};
