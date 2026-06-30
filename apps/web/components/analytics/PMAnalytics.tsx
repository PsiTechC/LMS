"use client";

import React, { useState, useEffect, useCallback } from "react";
import { cohortsApi, CohortDTO } from "@/lib/cohorts-api";
import { programsApi, ProgramDTO } from "@/lib/programs-api";
import {
  analyticsApi,
  ProgramOverview, CohortProgressResponse, ActivityCompletionResponse,
  AttendanceHeatmapResponse, SubmissionGradesResponse, SessionSummary,
  CompetencyScore, ParticipantProgress, CompletionRollup, EngagementSummaryResponse,
  AssessmentPerformanceResponse, AssessmentPerformer, AtRiskResponse, ROIResponse,
  ProgramSummaryResponse, ProgramCohortRow,
} from "@/lib/analytics-api";

const TABS = [
  { id: "program",      label: "Program" },
  { id: "overview",     label: "Overview" },
  { id: "completion",   label: "Completion" },
  { id: "engagement",   label: "Engagement" },
  { id: "progress",     label: "Cohort Progress" },
  { id: "activities",   label: "Activities" },
  { id: "attendance",   label: "Attendance" },
  { id: "assessment",   label: "Assessment" },
  { id: "at-risk",      label: "At-Risk" },
  { id: "grades",       label: "Grades" },
  { id: "roi",          label: "ROI" },
  { id: "competencies", label: "Competencies" },
  { id: "survey",       label: "Survey" },
  { id: "feedback360",  label: "360° Feedback" },
];

const RISK_COLORS: Record<string, string> = { high: "#ef4444", medium: "#f59e0b", low: "#22c55e" };
const TYPE_COLORS: Record<string, string> = {
  video: "#EF4E24", assessment: "#EF4E24", journal: "#EF4E24",
  pdf: "#1C2551", live_session: "#1C2551", assignment: "#1C2551",
  case_study: "#6B73BF", coaching: "#6B73BF", survey: "#8b90a7", peer_review: "#22c55e",
};

function riskBadge(level: string) {
  const c = RISK_COLORS[level] ?? "#8b90a7";
  return <span style={{ background: `${c}14`, color: c, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px" }}>{level.toUpperCase()}</span>;
}

function statusBadge(status: string) {
  const map: Record<string, [string, string]> = {
    enrolled: ["#1C2551", "#1C255114"], completed: ["#22c55e", "#22c55e14"],
    withdrawn: ["#8b90a7", "#8b90a714"], on_hold: ["#f59e0b", "#f59e0b14"],
  };
  const [c, bg] = map[status] ?? ["#8b90a7", "#8b90a714"];
  return <span style={{ background: bg, color: c, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px" }}>{status.replace(/_/g, " ").toUpperCase()}</span>;
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF4", boxShadow: "0 1px 4px rgba(28,37,81,0.07)", padding: 20, fontFamily: "Poppins,sans-serif" }}>
      <div style={{ fontSize: 11, color: "#8b90a7", marginBottom: 5, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: color ?? "#1C2551" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Skeleton() {
  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
      {[40, 100, 80, 100].map((w, i) => (
        <div key={i} className="xa-skeleton" style={{ background: "#F0F1F7", borderRadius: 8, width: `${w}%`, height: i === 0 ? 20 : 14 }} />
      ))}
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return <div style={{ padding: "48px 24px", textAlign: "center", color: "#8b90a7", fontSize: 13 }}>{msg}</div>;
}

function ComingSoon({ feature }: { feature: string }) {
  return (
    <div style={{ padding: "64px 24px", textAlign: "center" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🔜</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>{feature}</div>
      <div style={{ fontSize: 13, color: "#8b90a7", maxWidth: 360, margin: "0 auto" }}>
        This feature requires additional database tables not yet provisioned. Coming in a future release.
      </div>
    </div>
  );
}

function ProgressBar({ pct, color = "#EF4E24", height = 6 }: { pct: number; color?: string; height?: number }) {
  return (
    <div style={{ height, background: "#F0F1F7", borderRadius: 99, overflow: "hidden", flex: 1 }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 99, transition: "width 0.4s ease" }} />
    </div>
  );
}

function attColor(rate: number) {
  if (rate >= 90) return "#22c55e";
  if (rate >= 70) return "#f59e0b";
  return "#ef4444";
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 700, color: "#1C2551", marginBottom: 14 }}>{children}</div>;
}

// ═══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════

export default function PMAnalytics({ orgId }: { orgId: string }) {
  const [programs,       setPrograms]       = useState<ProgramDTO[]>([]);
  const [selectedProgId, setSelectedProgId] = useState("");
  const [allCohorts,     setAllCohorts]     = useState<CohortDTO[]>([]);
  const [cohorts,        setCohorts]        = useState<CohortDTO[]>([]);
  const [selectedId,     setSelectedId]     = useState("");
  const [activeTab,      setActiveTab]      = useState("program");
  const [loading,        setLoading]        = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [sortCol,        setSortCol]        = useState<keyof ParticipantProgress>("completion_percent");
  const [sortDir,        setSortDir]        = useState<"asc" | "desc">("desc");
  const [search,         setSearch]         = useState("");

  const [overview,       setOverview]       = useState<ProgramOverview | null>(null);
  const [programSum,     setProgramSum]     = useState<ProgramSummaryResponse | null>(null);
  const [progress,       setProgress]       = useState<CohortProgressResponse | null>(null);
  const [activities,     setActivities]     = useState<ActivityCompletionResponse | null>(null);
  const [attendance,     setAttendance]     = useState<AttendanceHeatmapResponse | null>(null);
  const [grades,         setGrades]         = useState<SubmissionGradesResponse | null>(null);
  const [sessionSum,     setSessionSum]     = useState<SessionSummary | null>(null);
  const [competencies,   setCompetencies]   = useState<CompetencyScore[]>([]);
  const [rollup,         setRollup]         = useState<CompletionRollup | null>(null);
  const [engagement,     setEngagement]     = useState<EngagementSummaryResponse | null>(null);
  const [assessment,     setAssessment]     = useState<AssessmentPerformanceResponse | null>(null);
  const [atRiskData,     setAtRiskData]     = useState<AtRiskResponse | null>(null);
  const [roi,            setRoi]            = useState<ROIResponse | null>(null);

  // Load programs + all cohorts on mount
  useEffect(() => {
    if (!orgId) return;
    analyticsApi.programOverview(orgId).then(res => { if (res.data) setOverview(res.data); }).catch(() => {});
    Promise.all([
      programsApi.list(orgId),
      cohortsApi.list(orgId),
    ]).then(([pRes, cRes]) => {
      const progs = pRes.data ?? [];
      const cols = cRes.data ?? [];
      setPrograms(progs);
      setAllCohorts(cols);
      if (progs.length > 0) {
        setSelectedProgId(progs[0].id);
        // filtered cohorts will cascade via the program-select useEffect
      } else if (cols.length > 0) {
        setCohorts(cols);
        setSelectedId(cols[0].id);
      }
    }).catch(() => {});
  }, [orgId]);

  // When program selection changes: filter cohorts + load program summary
  useEffect(() => {
    if (!selectedProgId) return;
    const filtered = allCohorts.filter(c => c.program_id === selectedProgId);
    setCohorts(filtered);
    setSelectedId(filtered.length > 0 ? filtered[0].id : "");
    setProgramSum(null);
    analyticsApi.programSummary(selectedProgId).then(res => {
      if (res.data) setProgramSum(res.data);
    }).catch(() => {});
  }, [selectedProgId, allCohorts]);

  const loadCohortData = useCallback(async (cohortId: string) => {
    if (!cohortId) return;
    setLoading(true); setError(null);
    const results = await Promise.allSettled([
      analyticsApi.cohortProgress(cohortId),
      analyticsApi.activityCompletion(cohortId),
      analyticsApi.attendanceHeatmap(cohortId),
      analyticsApi.submissionGrades(cohortId),
      analyticsApi.sessionSummary(cohortId),
      analyticsApi.competencyScores(cohortId),
      analyticsApi.completionRollup(cohortId),
      analyticsApi.engagementSummary(cohortId),
      analyticsApi.assessmentPerformance(cohortId),
      analyticsApi.atRisk(cohortId),
      analyticsApi.roi(cohortId),
    ]);
    const [prog, act, att, gr, sess, comp, roll, eng, assess, risk, roiRes] = results;
    if (prog.status    === "fulfilled" && prog.value.data)    setProgress(prog.value.data);
    if (act.status     === "fulfilled" && act.value.data)     setActivities(act.value.data);
    if (att.status     === "fulfilled" && att.value.data)     setAttendance(att.value.data);
    if (gr.status      === "fulfilled" && gr.value.data)      setGrades(gr.value.data);
    if (sess.status    === "fulfilled" && sess.value.data)    setSessionSum(sess.value.data);
    if (comp.status    === "fulfilled")                       setCompetencies(comp.value.data ?? []);
    if (roll.status    === "fulfilled" && roll.value.data)    setRollup(roll.value.data);
    if (eng.status     === "fulfilled" && eng.value.data)     setEngagement(eng.value.data);
    if (assess.status  === "fulfilled" && assess.value.data)  setAssessment(assess.value.data);
    if (risk.status    === "fulfilled" && risk.value.data)    setAtRiskData(risk.value.data);
    if (roiRes.status  === "fulfilled" && roiRes.value.data)  setRoi(roiRes.value.data);
    const failCount = results.filter(r => r.status === "rejected").length;
    if (failCount === results.length) setError("Failed to load analytics data.");
    setLoading(false);
  }, []);

  useEffect(() => { if (selectedId) loadCohortData(selectedId); }, [selectedId, loadCohortData]);

  const kpiEnrolled   = progress?.summary.total_enrolled ?? overview?.total_participants ?? 0;
  const kpiCompletion = rollup ? Math.round(rollup.overall_pct) : Math.round(progress?.summary.avg_completion ?? overview?.avg_completion ?? 0);
  const kpiAtRisk     = progress?.summary.at_risk_count ?? overview?.at_risk_count ?? 0;
  const kpiDelivered  = sessionSum?.total_delivered ?? 0;
  const kpiTotal      = sessionSum?.total_scheduled ?? 0;

  const sortedParticipants = [...(progress?.participants ?? [])]
    .sort((a, b) => {
      const va = (a[sortCol] as number | string | null) ?? "";
      const vb = (b[sortCol] as number | string | null) ?? "";
      return va < vb ? (sortDir === "asc" ? -1 : 1) : va > vb ? (sortDir === "asc" ? 1 : -1) : 0;
    })
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.email.toLowerCase().includes(search.toLowerCase()));

  function toggleSort(col: keyof ParticipantProgress) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }
  function SortArrow({ col }: { col: keyof ParticipantProgress }): React.ReactElement {
    if (sortCol !== col) return <span style={{ color: "#ccc" }}>↕</span>;
    return <span style={{ color: "#EF4E24" }}>{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Poppins,sans-serif" }}>

      {/* Program + Cohort selectors */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, display: "block", marginBottom: 4, textTransform: "uppercase" }}>Program</label>
          <select value={selectedProgId} onChange={e => setSelectedProgId(e.target.value)}
            style={{ border: "1px solid #EAECF4", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#1C2551", fontFamily: "Poppins,sans-serif", background: "#fff", minWidth: 240 }}>
            {programs.length === 0 && <option value="">No programs found</option>}
            {programs.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", color: "#EAECF4", fontSize: 18, paddingBottom: 2 }}>›</div>
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, display: "block", marginBottom: 4, textTransform: "uppercase" }}>Cohort</label>
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
            style={{ border: "1px solid #EAECF4", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "#1C2551", fontFamily: "Poppins,sans-serif", background: "#fff", minWidth: 240 }}>
            {cohorts.length === 0 && <option value="">No cohorts for this program</option>}
            {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button onClick={() => { if (selectedId) loadCohortData(selectedId); if (selectedProgId) analyticsApi.programSummary(selectedProgId).then(r => { if (r.data) setProgramSum(r.data); }).catch(() => {}); }}
          style={{ border: "1px solid #EAECF4", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 600, color: "#1C2551", background: "#fff", cursor: "pointer", fontFamily: "Poppins,sans-serif" }}>
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        <StatCard label="Enrolled"           value={kpiEnrolled}         sub="participants" />
        <StatCard label="Avg Completion"     value={`${kpiCompletion}%`} sub="across cohort"   color="#EF4E24" />
        <StatCard label="At Risk"            value={kpiAtRisk}           sub="need attention"  color="#ef4444" />
        <StatCard label="Sessions Delivered" value={kpiDelivered}        sub={`of ${kpiTotal} scheduled`} />
      </div>

      {error && (
        <div style={{ background: "#FFF0F0", border: "1px solid #ef4444", borderRadius: 8, padding: "12px 16px", fontSize: 13, color: "#ef4444", display: "flex", alignItems: "center", gap: 10 }}>
          {error}
          <button onClick={() => selectedId && loadCohortData(selectedId)}
            style={{ marginLeft: "auto", fontSize: 12, color: "#ef4444", border: "1px solid #ef4444", borderRadius: 6, padding: "4px 10px", background: "none", cursor: "pointer" }}>
            Retry
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", background: "#fff", border: "1px solid #EAECF4", borderRadius: 10, padding: "6px 8px", boxShadow: "0 1px 4px rgba(28,37,81,0.07)" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, cursor: "pointer", fontFamily: "Poppins,sans-serif", border: "none", transition: "all 0.15s",
              ...(activeTab === t.id
                ? { background: "#1C2551", color: "#fff", fontWeight: 700 }
                : { background: "transparent", color: "#8b90a7", fontWeight: 500 }) }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF4", boxShadow: "0 1px 4px rgba(28,37,81,0.07)", overflow: "hidden" }}>
        {loading ? <Skeleton /> : (
          <div key={activeTab} className="xa-tab-panel">
            {activeTab === "program"      && <TabProgram data={programSum} programs={programs} selectedProgId={selectedProgId} />}
            {activeTab === "overview"     && <TabOverview overview={overview} progress={progress} sessionSum={sessionSum} rollup={rollup} />}
            {activeTab === "completion"   && <TabCompletion rollup={rollup} />}
            {activeTab === "engagement"   && <TabEngagement data={engagement} />}
            {activeTab === "progress"     && <TabProgress participants={sortedParticipants} search={search} setSearch={setSearch} toggleSort={toggleSort} SortArrow={SortArrow} />}
            {activeTab === "activities"   && <TabActivities data={activities} />}
            {activeTab === "attendance"   && <TabAttendance data={attendance} />}
            {activeTab === "assessment"   && <TabAssessment data={assessment} />}
            {activeTab === "at-risk"      && <TabAtRisk data={atRiskData} />}
            {activeTab === "grades"       && <TabGrades data={grades} />}
            {activeTab === "roi"          && <TabROI data={roi} />}
            {activeTab === "competencies" && <TabCompetencies data={competencies} />}
            {activeTab === "survey"       && <ComingSoon feature="Survey Results Dashboard" />}
            {activeTab === "feedback360"  && <ComingSoon feature="360° Feedback Aggregated Views" />}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PROGRAM TAB
// ═══════════════════════════════════════════════════════════

function TabProgram({ data, programs, selectedProgId }: {
  data: ProgramSummaryResponse | null;
  programs: ProgramDTO[];
  selectedProgId: string;
}) {
  const prog = programs.find(p => p.id === selectedProgId);
  if (!data) return <EmptyState msg="Loading program summary..." />;

  const deliveryPct = data.total_sessions > 0
    ? Math.round((data.sessions_delivered / data.total_sessions) * 100)
    : 0;
  const circum = 2 * Math.PI * 54;
  const cPct = Math.round(data.avg_completion);

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Program header */}
      {prog && (
        <div style={{ display: "flex", alignItems: "center", gap: 14, paddingBottom: 16, borderBottom: "1px solid #EAECF4" }}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: prog.color || "#1C2551", flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "#1C2551" }}>{prog.title}</div>
            <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 2 }}>
              {prog.status.toUpperCase()} &nbsp;·&nbsp; {prog.phase_count} phases &nbsp;·&nbsp; {prog.activity_count} activities &nbsp;·&nbsp; {prog.duration_weeks}w
            </div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <span style={{ background: `${prog.color || "#1C2551"}14`, color: prog.color || "#1C2551", fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "4px 12px" }}>
              {prog.status.replace(/_/g, " ").toUpperCase()}
            </span>
          </div>
        </div>
      )}

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        <StatCard label="Total Cohorts"      value={data.total_cohorts}        sub="across program" />
        <StatCard label="Total Participants" value={data.total_participants}    sub="enrolled" color="#EF4E24" />
        <StatCard label="At Risk"            value={data.at_risk_count}        sub="high risk"      color="#ef4444" />
        <StatCard label="Sessions Delivered" value={data.sessions_delivered}   sub={`of ${data.total_sessions} scheduled`} />
      </div>

      {/* Charts row: donut + competency improvement + session delivery */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>
        {/* Avg completion donut */}
        <div style={{ border: "1px solid #EAECF4", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <SectionTitle>Avg Completion</SectionTitle>
          <div style={{ position: "relative", width: 120, height: 120 }}>
            <svg width={120} height={120} viewBox="0 0 120 120">
              <circle cx={60} cy={60} r={46} fill="none" stroke="#F0F1F7" strokeWidth={14} />
              <circle cx={60} cy={60} r={46} fill="none" stroke="#EF4E24" strokeWidth={14}
                strokeDasharray={`${(cPct / 100) * (2 * Math.PI * 46)} ${2 * Math.PI * 46}`}
                strokeLinecap="round" transform="rotate(-90 60 60)"
                style={{ transition: "stroke-dasharray 0.6s ease" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#1C2551", lineHeight: 1 }}>{cPct}%</span>
              <span style={{ fontSize: 9, color: "#8b90a7", marginTop: 2 }}>avg across cohorts</span>
            </div>
          </div>
          <div style={{ fontSize: 11, color: "#8b90a7" }}>{data.total_participants} participants total</div>
        </div>

        {/* Session delivery */}
        <div style={{ border: "1px solid #EAECF4", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          <SectionTitle>Session Delivery</SectionTitle>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: "#1C2551" }}>{deliveryPct}%</span>
            <span style={{ fontSize: 11, color: "#8b90a7" }}>delivered</span>
          </div>
          <ProgressBar pct={deliveryPct} height={10} />
          <div style={{ fontSize: 12, color: "#8b90a7" }}>{data.sessions_delivered} of {data.total_sessions} sessions</div>
        </div>

        {/* Competency improvement */}
        <div style={{ border: "1px solid #EAECF4", borderRadius: 12, padding: 20, display: "flex", flexDirection: "column", gap: 8 }}>
          <SectionTitle>Avg Competency Improvement</SectionTitle>
          <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: data.avg_competency_improvement >= 0 ? "#22c55e" : "#ef4444" }}>
              {data.avg_competency_improvement >= 0 ? "+" : ""}{data.avg_competency_improvement.toFixed(1)}
            </span>
            <span style={{ fontSize: 13, color: "#8b90a7" }}>pp</span>
          </div>
          <div style={{ fontSize: 11, color: "#8b90a7" }}>pre → post program delta</div>
          {data.avg_competency_improvement === 0 && (
            <div style={{ fontSize: 11, color: "#f59e0b", marginTop: 4 }}>No competency scores recorded yet</div>
          )}
        </div>
      </div>

      {/* Cohorts breakdown table */}
      <div>
        <SectionTitle>Cohorts in this Program ({data.total_cohorts})</SectionTitle>
        {data.cohorts.length === 0
          ? <EmptyState msg="No cohorts found for this program." />
          : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#F5F7FB" }}>
                {["COHORT", "DATES", "ENROLLED", "AVG COMPLETION", "AT RISK", "SESSIONS"].map(h => (
                  <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {data.cohorts.map((c: ProgramCohortRow) => (
                  <tr key={c.cohort_id} style={{ borderTop: "1px solid #EAECF4" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: "#1C2551", fontSize: 13 }}>{c.cohort_name}</td>
                    <td style={{ padding: "10px 14px", fontSize: 11, color: "#8b90a7", whiteSpace: "nowrap" }}>
                      {c.start_date ? c.start_date : "—"} → {c.end_date ? c.end_date : "—"}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 600, color: "#1C2551" }}>{c.total_enrolled}</td>
                    <td style={{ padding: "10px 14px", minWidth: 140 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <ProgressBar pct={c.avg_completion} />
                        <span style={{ fontSize: 11, color: "#8b90a7", whiteSpace: "nowrap" }}>{Math.round(c.avg_completion)}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px" }}>
                      {c.at_risk_count > 0
                        ? <span style={{ background: "#ef444414", color: "#ef4444", fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px" }}>{c.at_risk_count}</span>
                        : <span style={{ color: "#22c55e", fontSize: 11, fontWeight: 600 }}>0</span>}
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 13, color: "#1C2551" }}>
                      {c.sessions_delivered}/{c.sessions_scheduled}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// OVERVIEW TAB
// ═══════════════════════════════════════════════════════════

function TabOverview({ overview, progress, sessionSum, rollup }: {
  overview: ProgramOverview | null;
  progress: CohortProgressResponse | null;
  sessionSum: SessionSummary | null;
  rollup: CompletionRollup | null;
}) {
  const topAtRisk = [...(progress?.participants ?? [])]
    .filter(p => p.risk_level === "high" || p.risk_level === "medium")
    .sort((a, b) => a.completion_percent - b.completion_percent)
    .slice(0, 5);

  const total     = progress?.participants.length ?? 0;
  const completed = progress?.participants.filter(p => p.enrollment_status === "completed").length ?? 0;
  const cPct      = rollup ? Math.round(rollup.overall_pct) : (total > 0 ? Math.round(completed * 100 / total) : 0);
  const circum    = 2 * Math.PI * 54;

  return (
    <div style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, alignItems: "start" }}>
      <div>
        <SectionTitle>Organization Overview</SectionTitle>
        {overview && [
          ["Total Programs", overview.total_programs],
          ["Active", overview.active_programs],
          ["Draft", overview.draft_programs],
          ["Delivered", overview.delivered_programs],
          ["Total Cohorts", overview.total_cohorts],
        ].map(([lbl, val]) => (
          <div key={String(lbl)} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid #EAECF4", padding: "8px 0" }}>
            <span style={{ color: "#8b90a7" }}>{lbl}</span>
            <span style={{ fontWeight: 700, color: "#1C2551" }}>{val}</span>
          </div>
        ))}
        {sessionSum && (
          <>
            <SectionTitle><span style={{ display: "block", marginTop: 24 }}>Session Stats</span></SectionTitle>
            {[
              ["Delivered / Scheduled", `${sessionSum.total_delivered} / ${sessionSum.total_scheduled}`],
              ["Total Hours", `${sessionSum.total_hours.toFixed(1)}h`],
              ["Avg Duration", `${Math.round(sessionSum.avg_duration_mins)} min`],
              ["Open Action Items", sessionSum.action_items_open],
              ["Overdue Action Items", sessionSum.action_items_overdue],
              ["Poll Participation", `${Math.round(sessionSum.poll_participation_rate)}%`],
            ].map(([lbl, val]) => (
              <div key={String(lbl)} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderBottom: "1px solid #EAECF4", padding: "8px 0" }}>
                <span style={{ color: "#8b90a7" }}>{lbl}</span>
                <span style={{ fontWeight: 700, color: "#1C2551" }}>{val}</span>
              </div>
            ))}
          </>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Donut */}
        <div style={{ border: "1px solid #EAECF4", borderRadius: 12, padding: "24px 20px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <SectionTitle>Cohort Completion</SectionTitle>
          <div style={{ position: "relative", width: 140, height: 140 }}>
            <svg width={140} height={140} viewBox="0 0 140 140">
              <circle cx={70} cy={70} r={54} fill="none" stroke="#F0F1F7" strokeWidth={18} />
              <circle cx={70} cy={70} r={54} fill="none" stroke="#EF4E24" strokeWidth={18}
                strokeDasharray={`${(cPct / 100) * circum} ${circum}`}
                strokeLinecap="round" transform="rotate(-90 70 70)"
                style={{ transition: "stroke-dasharray 0.6s ease" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: "#1C2551", lineHeight: 1 }}>{cPct}%</span>
              <span style={{ fontSize: 10, color: "#8b90a7", marginTop: 2 }}>completed</span>
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#8b90a7" }}>{completed} of {total} participants</div>
        </div>

        {/* At-risk */}
        <div>
          <SectionTitle>Participants Needing Attention</SectionTitle>
          {topAtRisk.length === 0
            ? <div style={{ fontSize: 13, color: "#8b90a7" }}>No at-risk participants.</div>
            : (
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead><tr style={{ background: "#F5F7FB" }}>
                  {["NAME", "COMPLETION", "RISK"].map(h => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {topAtRisk.map(p => (
                    <tr key={p.user_id} style={{ borderTop: "1px solid #EAECF4" }}>
                      <td style={{ padding: "8px 10px" }}>
                        <div style={{ fontWeight: 600, color: "#1C2551" }}>{p.name}</div>
                        <div style={{ fontSize: 10, color: "#8b90a7" }}>{p.email}</div>
                      </td>
                      <td style={{ padding: "8px 10px", minWidth: 90 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <ProgressBar pct={p.completion_percent} />
                          <span style={{ fontSize: 10, color: "#8b90a7", whiteSpace: "nowrap" }}>{Math.round(p.completion_percent)}%</span>
                        </div>
                      </td>
                      <td style={{ padding: "8px 10px" }}>{riskBadge(p.risk_level)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPLETION TAB
// ═══════════════════════════════════════════════════════════

function TabCompletion({ rollup }: { rollup: CompletionRollup | null }) {
  if (!rollup) return <EmptyState msg="No completion data for this cohort." />;
  return (
    <div style={{ padding: 24, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
      <div>
        <SectionTitle>Completion by Phase</SectionTitle>
        {rollup.by_phase.length === 0
          ? <div style={{ fontSize: 13, color: "#8b90a7" }}>No phases found.</div>
          : rollup.by_phase.map(p => (
            <div key={p.phase_id} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
                <span style={{ fontWeight: 600, color: "#1C2551" }}>{p.phase_name}</span>
                <span style={{ color: "#EF4E24", fontWeight: 700 }}>{Math.round(p.completion_pct)}%</span>
              </div>
              <ProgressBar pct={p.completion_pct} height={8} />
              <div style={{ fontSize: 10, color: "#8b90a7", marginTop: 4 }}>
                {p.completed_activities} of {p.total_activities} activities completed
              </div>
            </div>
          ))}
      </div>
      <div>
        <SectionTitle>Completion by Activity Type</SectionTitle>
        {rollup.by_type.length === 0
          ? <div style={{ fontSize: 13, color: "#8b90a7" }}>No activity types found.</div>
          : rollup.by_type.map(t => {
            const tc = TYPE_COLORS[t.activity_type] ?? "#8b90a7";
            return (
              <div key={t.activity_type} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ background: `${tc}14`, color: tc, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "2px 8px" }}>
                      {t.activity_type.replace(/_/g, " ").toUpperCase()}
                    </span>
                    <span style={{ fontSize: 11, color: "#8b90a7" }}>{t.total_activities} activities</span>
                  </div>
                  <span style={{ fontWeight: 700, color: "#1C2551", fontSize: 13 }}>{Math.round(t.completion_pct)}%</span>
                </div>
                <ProgressBar pct={t.completion_pct} color={tc} height={8} />
                {t.avg_score > 0 && (
                  <div style={{ fontSize: 10, color: "#8b90a7", marginTop: 4 }}>Avg score: {t.avg_score.toFixed(1)}</div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ENGAGEMENT TAB
// ═══════════════════════════════════════════════════════════

function TabEngagement({ data }: { data: EngagementSummaryResponse | null }) {
  if (!data || data.participants.length === 0) return <EmptyState msg="No engagement data for this cohort." />;
  const maxLogins = Math.max(...data.participants.map(p => p.login_count), 1);
  return (
    <div style={{ padding: 0 }}>
      <div style={{ padding: "14px 20px 10px", borderBottom: "1px solid #EAECF4" }}>
        <div style={{ fontSize: 11, color: "#8b90a7" }}>
          Engagement is measured by login sessions, activities started/completed, and average progress.
        </div>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#F5F7FB" }}>
            {["PARTICIPANT", "LOGINS", "ACTIVITIES STARTED", "COMPLETED", "AVG PROGRESS"].map(h => (
              <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.participants.map(p => (
            <tr key={p.user_id} style={{ borderTop: "1px solid #EAECF4" }}>
              <td style={{ padding: "10px 14px" }}>
                <div style={{ fontWeight: 600, color: "#1C2551", fontSize: 13 }}>{p.name}</div>
                <div style={{ fontSize: 10, color: "#8b90a7" }}>{p.email}</div>
              </td>
              <td style={{ padding: "10px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: Math.round((p.login_count / maxLogins) * 60), height: 6, background: "#1C2551", borderRadius: 99, minWidth: 4 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1C2551" }}>{p.login_count}</span>
                </div>
              </td>
              <td style={{ padding: "10px 14px", fontSize: 13, color: "#1C2551" }}>{p.activities_started}</td>
              <td style={{ padding: "10px 14px" }}>
                <span style={{ background: p.activities_completed > 0 ? "#22c55e14" : "#F0F1F7", color: p.activities_completed > 0 ? "#22c55e" : "#8b90a7", fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "3px 9px" }}>
                  {p.activities_completed}
                </span>
              </td>
              <td style={{ padding: "10px 14px", minWidth: 140 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ProgressBar pct={p.avg_progress_pct} />
                  <span style={{ fontSize: 11, color: "#8b90a7", whiteSpace: "nowrap" }}>{Math.round(p.avg_progress_pct)}%</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COHORT PROGRESS TAB
// ═══════════════════════════════════════════════════════════

function TabProgress({ participants, search, setSearch, toggleSort, SortArrow }: {
  participants: ParticipantProgress[];
  search: string;
  setSearch: (v: string) => void;
  toggleSort: (col: keyof ParticipantProgress) => void;
  SortArrow: (props: { col: keyof ParticipantProgress }) => React.ReactElement;
}) {
  const cols: { label: string; col: keyof ParticipantProgress }[] = [
    { label: "PARTICIPANT",  col: "name" },
    { label: "COMPLETION",   col: "completion_percent" },
    { label: "RISK",         col: "risk_level" },
    { label: "SESSIONS",     col: "sessions_attended" },
    { label: "SUBMISSIONS",  col: "submissions_graded" },
    { label: "STATUS",       col: "enrollment_status" },
  ];
  return (
    <div>
      <div style={{ padding: "14px 20px", borderBottom: "1px solid #EAECF4" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search participants..."
          style={{ border: "1px solid #EAECF4", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#1C2551", fontFamily: "Poppins,sans-serif", width: 280 }} />
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ background: "#F5F7FB" }}>
          {cols.map(({ label, col }) => (
            <th key={col} onClick={() => toggleSort(col)}
              style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
              {label} <SortArrow col={col} />
            </th>
          ))}
        </tr></thead>
        <tbody>
          {participants.length === 0 && <tr><td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#8b90a7", fontSize: 13 }}>No participants found.</td></tr>}
          {participants.map(p => (
            <tr key={p.user_id} style={{ borderTop: "1px solid #EAECF4" }}>
              <td style={{ padding: "10px 14px" }}>
                <div style={{ fontWeight: 600, color: "#1C2551", fontSize: 13 }}>{p.name}</div>
                <div style={{ fontSize: 10, color: "#8b90a7" }}>{p.email}</div>
              </td>
              <td style={{ padding: "10px 14px", minWidth: 130 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ProgressBar pct={p.completion_percent} />
                  <span style={{ fontSize: 11, color: "#8b90a7", whiteSpace: "nowrap" }}>{Math.round(p.completion_percent)}%</span>
                </div>
              </td>
              <td style={{ padding: "10px 14px" }}>{riskBadge(p.risk_level)}</td>
              <td style={{ padding: "10px 14px", fontSize: 13, color: "#1C2551" }}>{p.sessions_attended} / {p.total_sessions}</td>
              <td style={{ padding: "10px 14px", fontSize: 13, color: "#1C2551" }}>{p.submissions_graded} / {p.total_submissions}</td>
              <td style={{ padding: "10px 14px" }}>{statusBadge(p.enrollment_status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ACTIVITIES TAB
// ═══════════════════════════════════════════════════════════

function TabActivities({ data }: { data: ActivityCompletionResponse | null }) {
  if (!data || data.activities.length === 0) return <EmptyState msg="No activity data for this cohort." />;
  const byPhase = data.activities.reduce<Record<string, typeof data.activities>>((acc, a) => {
    (acc[a.phase_name] ??= []).push(a); return acc;
  }, {});
  return (
    <div>
      {Object.entries(byPhase).map(([phase, acts]) => (
        <div key={phase}>
          <div style={{ background: "#F5F7FB", padding: "8px 20px", fontSize: 11, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5 }}>
            {phase.toUpperCase()}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr>
              {["ACTIVITY", "TYPE", "COMPLETION", "AVG SCORE", "OVERDUE"].map(h => (
                <th key={h} style={{ padding: "8px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {acts.map(a => {
                const tc = TYPE_COLORS[a.activity_type] ?? "#8b90a7";
                return (
                  <tr key={a.activity_id} style={{ borderTop: "1px solid #EAECF4" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600, color: "#1C2551", fontSize: 13 }}>{a.title}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <span style={{ background: `${tc}14`, color: tc, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px" }}>
                        {a.activity_type.replace(/_/g, " ").toUpperCase()}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", minWidth: 160 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <ProgressBar pct={a.completion_pct} />
                        <span style={{ fontSize: 11, color: "#8b90a7", whiteSpace: "nowrap" }}>{a.completed_count}/{a.total_participants}</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px", fontSize: 13, color: "#1C2551" }}>{a.avg_score != null ? `${a.avg_score.toFixed(1)}%` : "—"}</td>
                    <td style={{ padding: "10px 14px" }}>
                      {a.overdue_count > 0
                        ? <span style={{ background: "#ef444414", color: "#ef4444", fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px" }}>{a.overdue_count} OVERDUE</span>
                        : <span style={{ color: "#8b90a7", fontSize: 11 }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ATTENDANCE TAB
// ═══════════════════════════════════════════════════════════

function TabAttendance({ data }: { data: AttendanceHeatmapResponse | null }) {
  if (!data || data.sessions.length === 0) return <EmptyState msg="No session attendance data yet." />;
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <SectionTitle>Session Attendance</SectionTitle>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: attColor(data.overall_rate) }}>{Math.round(data.overall_rate)}%</div>
          <div style={{ fontSize: 11, color: "#8b90a7" }}>overall attendance</div>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {data.sessions.map(s => {
          const c = attColor(s.attendance_rate);
          const opacity = 0.2 + (s.attendance_rate / 100) * 0.8;
          return (
            <div key={s.session_id} title={`${s.title}: ${Math.round(s.attendance_rate)}%`}
              style={{ width: 52, height: 52, borderRadius: 8, background: c, opacity, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#fff" }}>{Math.round(s.attendance_rate)}%</div>
            </div>
          );
        })}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ background: "#F5F7FB" }}>
          {["SESSION", "DATE", "PRESENT", "ABSENT", "LATE", "RATE"].map(h => (
            <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5 }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {data.sessions.map(s => (
            <tr key={s.session_id} style={{ borderTop: "1px solid #EAECF4" }}>
              <td style={{ padding: "10px 12px", fontWeight: 600, color: "#1C2551", fontSize: 13 }}>{s.title}</td>
              <td style={{ padding: "10px 12px", fontSize: 12, color: "#8b90a7" }}>{new Date(s.scheduled_at).toLocaleDateString()}</td>
              <td style={{ padding: "10px 12px", fontWeight: 600, color: "#22c55e", fontSize: 13 }}>{s.present_count}</td>
              <td style={{ padding: "10px 12px", fontWeight: 600, color: "#ef4444", fontSize: 13 }}>{s.absent_count}</td>
              <td style={{ padding: "10px 12px", fontWeight: 600, color: "#f59e0b", fontSize: 13 }}>{s.late_count}</td>
              <td style={{ padding: "10px 12px", fontWeight: 700, color: attColor(s.attendance_rate), fontSize: 13 }}>{Math.round(s.attendance_rate)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ASSESSMENT TAB
// ═══════════════════════════════════════════════════════════

function TabAssessment({ data }: { data: AssessmentPerformanceResponse | null }) {
  if (!data) return <EmptyState msg="No assessment data for this cohort." />;
  if (data.top_performers.length === 0 && data.low_performers.length === 0)
    return <EmptyState msg="No graded submissions yet for this cohort." />;

  function PerformerTable({ title, performers, color }: { title: string; performers: AssessmentPerformer[]; color: string }) {
    return (
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <SectionTitle>{title}</SectionTitle>
          <span style={{ background: `${color}14`, color, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "2px 8px", marginTop: -14 }}>
            Top {performers.length}
          </span>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "#F5F7FB" }}>
            {["PARTICIPANT", "AVG GRADE", "GRADED", "SUBMITTED"].map(h => (
              <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5 }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {performers.map((p, i) => (
              <tr key={p.user_id} style={{ borderTop: "1px solid #EAECF4" }}>
                <td style={{ padding: "10px 12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 20, height: 20, borderRadius: "50%", background: `${color}14`, color, fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {i + 1}
                    </span>
                    <div>
                      <div style={{ fontWeight: 600, color: "#1C2551", fontSize: 13 }}>{p.name}</div>
                      <div style={{ fontSize: 10, color: "#8b90a7" }}>{p.email}</div>
                    </div>
                  </div>
                </td>
                <td style={{ padding: "10px 12px" }}>
                  <span style={{ fontSize: 20, fontWeight: 800, color }}>{p.avg_grade.toFixed(1)}</span>
                  <span style={{ fontSize: 11, color: "#8b90a7" }}>%</span>
                </td>
                <td style={{ padding: "10px 12px", fontSize: 13, color: "#1C2551" }}>{p.graded}</td>
                <td style={{ padding: "10px 12px", fontSize: 13, color: "#1C2551" }}>{p.submitted}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ border: "1px solid #EAECF4", borderRadius: 10, padding: "14px 20px", marginBottom: 24, display: "flex", gap: 32 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, marginBottom: 4 }}>COHORT AVERAGE</div>
          <span style={{ fontSize: 32, fontWeight: 800, color: "#1C2551" }}>{data.cohort_avg.toFixed(1)}</span>
          <span style={{ fontSize: 14, color: "#8b90a7" }}>%</span>
        </div>
        <div style={{ width: 1, background: "#EAECF4" }} />
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, marginBottom: 4 }}>PARTICIPANTS GRADED</div>
          <span style={{ fontSize: 32, fontWeight: 800, color: "#1C2551" }}>{data.top_performers.length + data.low_performers.length}</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
        <PerformerTable title="Top Performers" performers={data.top_performers} color="#22c55e" />
        <PerformerTable title="Needs Support"  performers={data.low_performers} color="#ef4444" />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// AT-RISK TAB
// ═══════════════════════════════════════════════════════════

function TabAtRisk({ data }: { data: AtRiskResponse | null }) {
  if (!data || data.participants.length === 0)
    return <EmptyState msg="No at-risk participants in this cohort. All learners are on track." />;
  return (
    <div style={{ padding: 0 }}>
      <div style={{ padding: "14px 20px 10px", borderBottom: "1px solid #EAECF4", display: "flex", alignItems: "center", gap: 12 }}>
        <span style={{ background: "#ef444414", color: "#ef4444", fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "3px 10px" }}>
          {data.participants.filter(p => p.risk_level === "high").length} HIGH RISK
        </span>
        <span style={{ background: "#f59e0b14", color: "#f59e0b", fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "3px 10px" }}>
          {data.participants.filter(p => p.risk_level === "medium").length} MEDIUM RISK
        </span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ background: "#F5F7FB" }}>
          {["PARTICIPANT", "RISK", "COMPLETION", "ATTENDANCE", "OVERDUE", "INACTIVE DAYS"].map(h => (
            <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5 }}>{h}</th>
          ))}
        </tr></thead>
        <tbody>
          {data.participants.map(p => (
            <tr key={p.user_id} style={{ borderTop: "1px solid #EAECF4", background: p.risk_level === "high" ? "#fff8f8" : undefined }}>
              <td style={{ padding: "10px 14px" }}>
                <div style={{ fontWeight: 600, color: "#1C2551", fontSize: 13 }}>{p.name}</div>
                <div style={{ fontSize: 10, color: "#8b90a7" }}>{p.email}</div>
              </td>
              <td style={{ padding: "10px 14px" }}>{riskBadge(p.risk_level)}</td>
              <td style={{ padding: "10px 14px", minWidth: 120 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <ProgressBar pct={p.completion_percent} color={p.risk_level === "high" ? "#ef4444" : "#f59e0b"} />
                  <span style={{ fontSize: 11, color: "#8b90a7", whiteSpace: "nowrap" }}>{Math.round(p.completion_percent)}%</span>
                </div>
              </td>
              <td style={{ padding: "10px 14px", fontSize: 13, color: "#1C2551" }}>{p.sessions_attended}/{p.total_sessions}</td>
              <td style={{ padding: "10px 14px" }}>
                {p.activities_overdue > 0
                  ? <span style={{ background: "#ef444414", color: "#ef4444", fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px" }}>{p.activities_overdue}</span>
                  : <span style={{ color: "#8b90a7", fontSize: 11 }}>0</span>}
              </td>
              <td style={{ padding: "10px 14px" }}>
                <span style={{ fontWeight: 700, color: p.days_since_activity > 7 ? "#ef4444" : p.days_since_activity > 3 ? "#f59e0b" : "#22c55e", fontSize: 13 }}>
                  {p.days_since_activity >= 999 ? "Never" : `${p.days_since_activity}d`}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// GRADES TAB
// ═══════════════════════════════════════════════════════════

function TabGrades({ data }: { data: SubmissionGradesResponse | null }) {
  if (!data || data.activities.length === 0) return <EmptyState msg="No grade data for this cohort." />;
  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 28 }}>
      {data.activities.map(a => {
        const maxCount = Math.max(...a.buckets.map(b => b.count), 1);
        return (
          <div key={a.activity_id}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1C2551", marginBottom: 12 }}>{a.title}</div>
            <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 80 }}>
              {a.buckets.map(b => {
                const pct = maxCount > 0 ? (b.count / maxCount) * 100 : 0;
                const isMax = b.count === maxCount && b.count > 0;
                return (
                  <div key={b.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, height: "100%", justifyContent: "flex-end" }}>
                    <div style={{ fontSize: 10, color: "#8b90a7", fontWeight: 600 }}>{b.count}</div>
                    <div style={{ width: "100%", height: `${Math.max(pct, 4)}%`, background: isMax ? "#EF4E24" : "#1C2551", borderRadius: "4px 4px 0 0", transition: "height 0.4s ease" }} />
                    <div style={{ fontSize: 9, color: "#8b90a7", whiteSpace: "nowrap" }}>{b.label}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 20, fontSize: 12, color: "#8b90a7", marginTop: 10 }}>
              <span style={{ fontSize: 20, fontWeight: 800, color: "#1C2551" }}>{a.avg_grade.toFixed(1)}</span>
              <span style={{ alignSelf: "flex-end" }}>avg &nbsp;|&nbsp; Graded: <strong style={{ color: "#1C2551" }}>{a.graded_count}</strong> &nbsp;|&nbsp; Pending: <strong style={{ color: "#f59e0b" }}>{a.pending_count}</strong></span>
            </div>
            <div style={{ height: 1, background: "#EAECF4", marginTop: 16 }} />
          </div>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ROI TAB
// ═══════════════════════════════════════════════════════════

function TabROI({ data }: { data: ROIResponse | null }) {
  if (!data || data.competencies.length === 0)
    return <EmptyState msg="No competency scores recorded yet. Add pre/post scores in the Competencies tab." />;
  const improved = data.competencies.filter(c => c.improvement_abs > 0).length;
  return (
    <div style={{ padding: 24 }}>
      {/* Summary banner */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 28 }}>
        <div style={{ border: "1px solid #EAECF4", borderRadius: 10, padding: 16, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#8b90a7", marginBottom: 4 }}>AVG IMPROVEMENT</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: data.avg_improvement >= 0 ? "#22c55e" : "#ef4444" }}>
            {data.avg_improvement >= 0 ? "+" : ""}{data.avg_improvement.toFixed(1)}
          </div>
          <div style={{ fontSize: 11, color: "#8b90a7" }}>percentage points</div>
        </div>
        <div style={{ border: "1px solid #EAECF4", borderRadius: 10, padding: 16, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#8b90a7", marginBottom: 4 }}>COMPETENCIES TRACKED</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#1C2551" }}>{data.competencies.length}</div>
        </div>
        <div style={{ border: "1px solid #EAECF4", borderRadius: 10, padding: 16, textAlign: "center" }}>
          <div style={{ fontSize: 11, color: "#8b90a7", marginBottom: 4 }}>SHOWING IMPROVEMENT</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#22c55e" }}>{improved}</div>
          <div style={{ fontSize: 11, color: "#8b90a7" }}>of {data.competencies.length}</div>
        </div>
      </div>

      {/* Per-competency bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {data.competencies.map(c => {
          const positive = c.improvement_abs >= 0;
          return (
            <div key={c.competency_id} style={{ border: "1px solid #EAECF4", borderRadius: 10, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 700, color: "#1C2551", fontSize: 13 }}>{c.title}</div>
                  <div style={{ fontSize: 10, color: "#8b90a7", marginTop: 2 }}>{c.category}</div>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: positive ? "#22c55e" : "#ef4444", background: positive ? "#22c55e14" : "#ef444414", borderRadius: 20, padding: "4px 12px" }}>
                  {positive ? "+" : ""}{c.improvement_abs.toFixed(1)}pp
                </span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#8b90a7", marginBottom: 4 }}>
                    <span>Pre-program</span><span>{c.pre_program_pct.toFixed(1)}%</span>
                  </div>
                  <ProgressBar pct={c.pre_program_pct} color="#8b90a7" height={8} />
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#8b90a7", marginBottom: 4 }}>
                    <span>Current</span><span>{c.current_pct.toFixed(1)}%</span>
                  </div>
                  <ProgressBar pct={c.current_pct} color={positive ? "#22c55e" : "#ef4444"} height={8} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// COMPETENCIES TAB
// ═══════════════════════════════════════════════════════════

function TabCompetencies({ data }: { data: CompetencyScore[] }) {
  if (data.length === 0) return <EmptyState msg="No competency scores recorded for this cohort." />;
  return (
    <div style={{ padding: 20, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      {data.map(c => {
        const improvement = c.current_pct - c.pre_program_pct;
        return (
          <div key={c.id} style={{ border: "1px solid #EAECF4", borderRadius: 10, padding: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5 }}>{c.title.toUpperCase()}</span>
              {improvement !== 0 && (
                <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "2px 8px",
                  color: improvement > 0 ? "#22c55e" : "#ef4444",
                  background: improvement > 0 ? "#22c55e14" : "#ef444414" }}>
                  {improvement > 0 ? "+" : ""}{improvement.toFixed(1)}%
                </span>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8b90a7", marginBottom: 4 }}>
                  <span>Pre</span><span>{c.pre_program_pct.toFixed(1)}%</span>
                </div>
                <ProgressBar pct={c.pre_program_pct} color="#8b90a7" height={8} />
              </div>
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#8b90a7", marginBottom: 4 }}>
                  <span>Now</span><span>{c.current_pct.toFixed(1)}%</span>
                </div>
                <ProgressBar pct={c.current_pct} color="#1C2551" height={8} />
              </div>
            </div>
            <div style={{ fontSize: 10, color: "#8b90a7", marginTop: 8 }}>{c.category}</div>
          </div>
        );
      })}
    </div>
  );
}
