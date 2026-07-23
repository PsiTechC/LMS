"use client";

import React, { useEffect, useMemo, useState } from "react";
import { programsApi, ProgramDTO } from "@/lib/programs-api";
import { analyticsApi, OrganizationAnalyticsRow, ProgramAnalyticsExtraResponse, ProgramSummaryResponse } from "@/lib/analytics-api";
import { Select } from "@/components/shared/Select";

const C = { navy: "#1C2551", indigo: "#6B73BF", orange: "#EF4E24", green: "#22c55e", teal: "#0891b2", red: "#ef4444", muted: "#8b90a7", border: "#EAECF4", bg: "#F6F7FB" };
const font = { fontFamily: "Poppins, sans-serif" } as const;
type View = "overview" | "organizations" | "programs" | "learners";
const COLORS = [C.orange, C.navy, C.indigo, C.green, "#f59e0b", C.teal];

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <section style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: "0 1px 4px rgba(28,37,81,.06)", padding: 16, ...style }}>{children}</section>;
}
function Bar({ value, color = C.indigo }: { value: number; color?: string }) {
  return <div style={{ height: 6, background: "#eef0f6", borderRadius: 99, overflow: "hidden" }}><div style={{ height: "100%", width: `${Math.min(100, Math.max(0, value))}%`, background: color, borderRadius: 99 }} /></div>;
}
function Metric({ label, value, color, onClick }: { label: string; value: string | number; color: string; onClick?: () => void }) {
  const [hover, setHover] = useState(false);
  const clickable = !!onClick;
  return (
    <section
      onClick={onClick}
      onMouseEnter={() => clickable && setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: "#fff",
        border: `1px solid ${clickable && hover ? `${color}33` : C.border}`,
        borderRadius: 12,
        boxShadow: hover && clickable ? "0 4px 12px rgba(28,37,81,.08)" : "0 1px 4px rgba(28,37,81,.06)",
        padding: "14px 16px",
        minHeight: 74,
        cursor: clickable ? "pointer" : "default",
        transform: hover && clickable ? "translateY(-2px)" : "translateY(0)",
        transition: "box-shadow 0.2s cubic-bezier(0.2,0,0,1), transform 0.2s cubic-bezier(0.2,0,0,1), border-color 0.2s ease"
      }}
    >
      <div style={{ fontSize: 10, color: C.muted }}>{label}</div>
      <div style={{ fontSize: 21, lineHeight: 1.2, fontWeight: 800, color, marginTop: 7 }}>{value}</div>
    </section>
  );
}
function Empty({ children }: { children: React.ReactNode }) { return <div style={{ color: C.muted, fontSize: 13, textAlign: "center", padding: "32px 16px" }}>{children}</div>; }

export default function PMAnalytics({ orgId, externalProgramId }: { orgId: string;
  // When set, analytics for this program show directly with no internal
  // "PROGRAM" dropdown rendered - the caller (e.g. the PM dashboard's
  // top-level PMProgramSwitcher) is driving the selection instead. undefined
  // (the default) preserves the original self-contained "All Programs" +
  // dropdown behavior used by SA.
  externalProgramId?: string;
}) {
  const isExternallyControlled = externalProgramId !== undefined;
  const [programs, setPrograms] = useState<ProgramDTO[]>([]);
  const [programId, setProgramId] = useState("");
  const [summary, setSummary] = useState<ProgramSummaryResponse | null>(null);
  const [extra, setExtra] = useState<ProgramAnalyticsExtraResponse | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [organizationRows, setOrganizationRows] = useState<OrganizationAnalyticsRow[]>([]);
  const [organizationLoading, setOrganizationLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("overview");

  useEffect(() => { programsApi.list(orgId).then(r => setPrograms(r.data ?? [])).catch(() => setPrograms([])); if (!isExternallyControlled) setProgramId(""); }, [orgId, isExternallyControlled]);

  const effectiveProgramId = isExternallyControlled ? (externalProgramId || "") : programId;

  useEffect(() => {
    setLoading(true);
    const request = effectiveProgramId
      ? Promise.all([analyticsApi.programSummary(effectiveProgramId), analyticsApi.programAnalyticsExtra(effectiveProgramId)])
      : Promise.all([analyticsApi.orgSummary(orgId), analyticsApi.orgAnalyticsExtra(orgId)]);
    request.then(([summaryResponse, extraResponse]) => {
      setSummary(summaryResponse.data ?? null);
      setExtra(extraResponse.data ?? null);
    }).catch(() => { setSummary(null); setExtra(null); }).finally(() => setLoading(false));
  }, [orgId, effectiveProgramId]);
  useEffect(() => { let active = true; setInsight(null); analyticsApi.aiInsight(orgId, effectiveProgramId).then(r => active && setInsight(r.data?.insight ?? null)).catch(() => active && setInsight(null)); return () => { active = false; }; }, [orgId, effectiveProgramId]);
  useEffect(() => {
    if (orgId) { setOrganizationRows([]); return; }
    setOrganizationLoading(true);
    analyticsApi.organizationRollup().then(r => setOrganizationRows(r.data ?? [])).catch(() => setOrganizationRows([])).finally(() => setOrganizationLoading(false));
  }, [orgId]);

  const completion = Math.round(summary?.avg_completion ?? 0);
  const engagement = Math.round(extra?.engagement_pct ?? 0);
  const risk = summary?.at_risk_count ?? 0;
  const learners = summary?.total_participants ?? 0;
  const selected = programs.find(p => p.id === effectiveProgramId);
  const maxEnrolled = Math.max(1, ...programs.map(p => p.enrolled_count));
  const tabs: { id: View; label: string }[] = [{ id: "overview", label: "Overview" }, { id: "organizations", label: "By Organization" }, { id: "programs", label: "Programs" }, { id: "learners", label: "Learners" }];

  return <main style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, background: C.bg, minHeight: "100%", ...font }}>
    {/* Hidden when externally controlled (e.g. PM's top-level
        PMProgramSwitcher already picks the program - showing this too would
        be a redundant second filter). */}
    {!isExternallyControlled && (
      <div style={{ display: "flex", alignItems: "end", justifyContent: "flex-end", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 230 }}><div style={{ color: C.muted, fontSize: 10, fontWeight: 700, marginBottom: 4 }}>PROGRAM</div><Select value={programId} onChange={setProgramId} options={[{ value: "", label: "All Programs" }, ...programs.map(p => ({ value: p.id, label: p.title }))]} /></div>
      </div>
    )}
    <section style={{ background: "linear-gradient(110deg,#1C2551,#303d83)", borderRadius: 12, color: "#fff", padding: "15px 18px" }}><div style={{ fontSize: 13, fontWeight: 800 }}>✦ AI Platform Pulse</div><div style={{ fontSize: 11, opacity: .9, marginTop: 3 }}>{insight ?? (loading ? "Preparing analytics insight…" : `${risk} learner${risk === 1 ? " is" : "s are"} currently flagged at risk across this scope.`)}</div></section>
    {loading ? <Card><Empty>Loading analytics…</Empty></Card> : <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(155px,1fr))", gap: 10 }}>
        <Metric label="Total Programs" value={programs.length} color={C.navy} onClick={() => setView("programs")} />
        <Metric label="Total Learners" value={learners} color={C.orange} onClick={() => setView("learners")} />
        <Metric label="Avg Completion" value={`${completion}%`} color={C.green} onClick={() => setView("overview")} />
        <Metric label="Avg Engagement" value={`${engagement}%`} color={C.teal} onClick={() => setView("overview")} />
        <Metric label="At-Risk" value={risk} color={C.red} onClick={() => setView("learners")} />
        <Metric label="Platform NPS" value="-" color={C.indigo} />
      </div>
      <nav aria-label="Analytics views" style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{tabs.map(t => <button key={t.id} onClick={() => setView(t.id)} style={{ border: `1px solid ${view === t.id ? C.navy : C.border}`, borderRadius: 8, padding: "7px 15px", background: view === t.id ? C.navy : "#fff", color: view === t.id ? "#fff" : C.muted, font: "inherit", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{t.label}</button>)}</nav>
      {view === "overview" && <Overview extra={extra} completion={completion} engagement={engagement} risk={risk} />}
      {view === "programs" && <Programs programs={programs} />}
      {view === "learners" && <Learners programs={programs} learners={learners} completion={completion} risk={risk} max={maxEnrolled} />}
      {view === "organizations" && <Organizations orgId={orgId} programs={programs} learners={learners} completion={completion} engagement={engagement} risk={risk} rows={organizationRows} loading={organizationLoading} />}
    </>}
  </main>;
}
// A row with every metric at exactly 0 reads as "broken" (a wall of empty
// bars), not "genuinely zero" - most real orgs have at least some nonzero
// signal somewhere. Treat all-zero as "not enough data yet" and show the
// same Empty state as a truly empty array, rather than rendering dead bars.
function hasSignal(values: number[]): boolean {
  return values.some(v => v > 0);
}

function Overview({ extra, completion, engagement, risk }: { extra: ProgramAnalyticsExtraResponse | null; completion: number; engagement: number; risk: number }) {
  const weeks = extra?.weekly_engagement ?? []; const activities = extra?.activity_breakdown ?? [];
  const weeksHaveSignal = hasSignal(weeks.map(w => w.engagement_pct));
  const activitiesHaveSignal = hasSignal(activities.map(a => a.completion_pct));
  return <><div className="xa-two-col" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 260px", gap: 12, alignItems: "start" }}><Card style={{ alignSelf: "start" }}><h2 style={heading}>Platform Engagement Trend</h2>{weeksHaveSignal ? <div style={{ display: "flex", height: 170, gap: 8, alignItems: "end" }}>{weeks.map(w => <div key={w.week_label} style={{ flex: 1, textAlign: "center", minWidth: 28, alignSelf: "flex-end" }}><b style={{ fontSize: 10, color: C.navy }}>{Math.round(w.engagement_pct)}%</b><div style={{ height: `${Math.max(4, w.engagement_pct / 100 * 120)}px`, background: C.indigo, borderRadius: "5px 5px 0 0", margin: "6px 0" }} /><span style={{ fontSize: 9, color: C.muted }}>{w.week_label}</span></div>)}</div> : <Empty>Not enough activity yet to show an engagement trend.</Empty>}</Card><div style={{ display: "grid", gap: 12, alignSelf: "start" }}><Card><h2 style={heading}>Activity Breakdown</h2>{activitiesHaveSignal ? activities.map((a, i) => <div key={a.activity_type} style={{ marginBottom: 12 }}><div style={row}><span style={{ fontSize: 11, color: C.navy }}>{a.activity_type.replaceAll("_", " ")}</span><b style={{ fontSize: 11, color: COLORS[i % COLORS.length] }}>{Math.round(a.completion_pct)}%</b></div><Bar value={a.completion_pct} color={COLORS[i % COLORS.length]} /></div>) : <Empty>No activity completions yet.</Empty>}</Card><Card style={{ background: "#fff8f6", borderColor: "#ffd9d0" }}><b style={{ color: C.orange, fontSize: 11 }}>✦ Insight</b><p style={{ margin: "7px 0 0", fontSize: 11, color: C.navy, lineHeight: 1.55 }}>Engagement is {engagement}% and {risk} learner{risk === 1 ? " is" : "s are"} flagged at risk in this scope.</p></Card></div></div><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 12 }}><Card><h2 style={heading}>Completion</h2><b style={{ color: C.green, fontSize: 18 }}>{completion}%</b><p style={muted}>Current average completion</p></Card><Card><h2 style={heading}>At-Risk Learners</h2><b style={{ color: C.red, fontSize: 18 }}>{risk}</b><p style={muted}>Flagged by current analytics signals</p></Card><Card><h2 style={heading}>Engagement</h2><b style={{ color: C.teal, fontSize: 18 }}>{engagement}%</b><p style={muted}>Attendance-based engagement</p></Card></div></>;
}
function Programs({ programs }: { programs: ProgramDTO[] }) { return <Card style={{ padding: 0, overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}><thead><tr>{["Program", "Participants", "Completion", "Status"].map(x => <th key={x} style={th}>{x}</th>)}</tr></thead><tbody>{programs.length ? programs.map((p, i) => <tr key={p.id}><td style={td}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: p.color || COLORS[i % COLORS.length], marginRight: 8 }} /><b>{p.title}</b></td><td style={{ ...td, color: C.orange, fontWeight: 700 }}>{p.enrolled_count}</td><td style={td}><div style={{ display: "flex", gap: 8, alignItems: "center" }}><div style={{ width: 95 }}><Bar value={p.avg_completion} color={p.color || C.green} /></div><b style={{ fontSize: 11, color: p.color || C.green }}>{Math.round(p.avg_completion)}%</b></div></td><td style={td}><span style={{ color: C.green, background: "#eaf9f0", padding: "3px 8px", borderRadius: 99, fontSize: 10, fontWeight: 700, textTransform: "uppercase" }}>{p.status}</span></td></tr>) : <tr><td colSpan={4}><Empty>No programs found for this scope.</Empty></td></tr>}</tbody></table></Card>; }
function Learners({ programs, learners, completion, risk, max }: { programs: ProgramDTO[]; learners: number; completion: number; risk: number; max: number }) { return <><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12 }}><Metric label="Total Learners" value={learners} color={C.orange} /><Metric label="Avg Completion" value={`${completion}%`} color={C.green} /><Metric label="At-Risk" value={risk} color={C.red} /></div><Card><h2 style={heading}>Learner Distribution by Program</h2>{programs.length ? programs.map((p, i) => <div key={p.id} style={{ margin: "13px 0" }}><div style={row}><span style={{ color: C.navy, fontSize: 12 }}><i style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: p.color || COLORS[i % COLORS.length], marginRight: 6 }} />{p.title}</span><b style={{ fontSize: 11, color: C.orange }}>{p.enrolled_count} learners</b></div><Bar value={p.enrolled_count / max * 100} color={p.color || COLORS[i % COLORS.length]} /></div>) : <Empty>No learner distribution data yet.</Empty>}</Card></>; }
function Organizations({ orgId, programs, learners, completion, engagement, risk, rows, loading }: { orgId: string; programs: ProgramDTO[]; learners: number; completion: number; engagement: number; risk: number; rows: OrganizationAnalyticsRow[]; loading: boolean }) {
  const displayRows = orgId ? [{ organization_id: orgId, organization_name: "Selected organization", total_programs: programs.length, total_learners: learners, avg_completion: completion, avg_engagement: engagement, at_risk_count: risk }] : rows;
  if (loading) return <Card><Empty>Loading organization rollups?</Empty></Card>;
  if (!displayRows.length) return <Card><Empty>No organization rollup data is available for this scope.</Empty></Card>;
  return <><Card style={{ padding: 0, overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}><thead><tr>{["Organization", "Programs", "Learners", "Avg Completion", "Avg Engagement", "At-Risk", "NPS"].map(x => <th key={x} style={th}>{x}</th>)}</tr></thead><tbody>{displayRows.map((row, i) => <tr key={row.organization_id}><td style={td}><i style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: COLORS[i % COLORS.length], marginRight: 7 }} /><b>{row.organization_name}</b></td><td style={td}>{row.total_programs}</td><td style={{ ...td, color: C.orange, fontWeight: 700 }}>{row.total_learners}</td><td style={td}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 90 }}><Bar value={row.avg_completion} color={C.green} /></div><b style={{ fontSize: 11, color: C.green }}>{Math.round(row.avg_completion)}%</b></div></td><td style={td}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 90 }}><Bar value={row.avg_engagement} color={C.teal} /></div><b style={{ fontSize: 11, color: C.teal }}>{row.avg_engagement}%</b></div></td><td style={{ ...td, color: C.red, fontWeight: 700 }}>{row.at_risk_count}</td><td style={td}>?</td></tr>)}</tbody></table></Card><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>{displayRows.map((row, i) => <Card key={row.organization_id} style={{ borderTop: `3px solid ${COLORS[i % COLORS.length]}` }}><b style={{ fontSize: 12, color: C.navy }}>{row.organization_name}</b><div style={{ color: COLORS[i % COLORS.length], fontWeight: 800, fontSize: 20, margin: "11px 0 6px" }}>{Math.round(row.avg_completion)}%</div><Bar value={row.avg_completion} color={COLORS[i % COLORS.length]} /></Card>)}</div></>;
}
const heading: React.CSSProperties = { margin: "0 0 14px", color: C.navy, fontSize: 13, fontWeight: 800 }; const muted: React.CSSProperties = { margin: "4px 0 0", fontSize: 11, color: C.muted }; const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 5 }; const th: React.CSSProperties = { textAlign: "left", fontSize: 10, color: C.muted, padding: "12px 15px", background: "#fafbfe", borderBottom: `1px solid ${C.border}` }; const td: React.CSSProperties = { padding: "13px 15px", color: C.navy, fontSize: 12, borderBottom: `1px solid ${C.border}` };