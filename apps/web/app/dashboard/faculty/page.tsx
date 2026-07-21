"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import ReactDOM from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardShell from "@/components/layout/DashboardShell";
import CapstoneManage from "@/components/capstone/CapstoneManage";
import { useAuth, hasRole } from "@/lib/auth-context";
import {
  coachApi,
  type CoachSummaryDTO,
  type CoachSessionDTO,
  type CoachActionDTO,
  type CoachingEngagementDTO,
} from "@/lib/coach-api";
import CoachEngagementsPanel from "@/components/coach/CoachEngagements";
import CoachCalendar from "@/components/coach/CoachCalendar";
import CoachSessionNotes from "@/components/coach/CoachSessionNotes";
import CoachProgramOutline from "@/components/coach/CoachProgramOutline";
import CoachDocuments from "@/components/coach/CoachDocuments";
import PMDesignStudio from "@/components/programs/PMDesignStudio";
import { ProgramDesignList } from "@/components/programs/ProgramDesignList";
import { cohortsApi, MyEnrollmentDTO, ParticipantDTO, CohortStatsDTO } from "@/lib/cohorts-api";
import { programsApi, ProgramDetailDTO, PhaseDTO, ActivityDTO, FacultyAssignmentDTO } from "@/lib/programs-api";
import {
  sessionsApi, gradingApi, coachingApi, zoomApi, ApiError,
  SessionDTO, GradingQueueItemDTO, GradingDetailDTO, GradingQuestionDTO, CoachingNoteDTO,
  CoachingParticipantDTO, CoachingTrackerDTO, CoachingKPIDTO, GoalDTO, DevNoteDTO,
  AgendaItemDTO, PollDTO, PollResultsDTO, ActionItemDTO, AttendanceDTO, ZoomMeetingDTO,
} from "@/lib/faculty-api";
import { resolveJoinLink } from "@/lib/session-link";
import { competenciesApi, submissionsStatsApi, CompetencyDTO, TemplateDTO } from "@/lib/competencies-api";
import { analyticsApi, EngagementPoint, CompetencyScore } from "@/lib/analytics-api";
import { discussionsApi, ThreadDTO, ReplyDTO, AnnouncementDTO } from "@/lib/discussions-api";
import ProfilePage from "@/components/shared/ProfilePage";
import SettingsPage from "@/components/shared/SettingsPage";
import { StatCard, useStatDetail } from "@/components/shared/StatCard";
import { SessionsPage } from "@/components/sessions/SessionsPage";
import CohortManagement from "@/components/cohorts/CohortManagement";
import ProgramParticipants from "@/components/programs/ProgramParticipants";
import ContentLibrary from "@/components/content/ContentLibrary";

const ff = { fontFamily: "Poppins, sans-serif" } as const;

// ── AI Cohort Intelligence Brief ────────────────────────────────────
// Default view is the three quick-glance tiles (cheap, computed client-side
// from data already fetched for other purposes). "Generate AI Brief" is a
// separate on-demand action - a real LLM call synthesizing attendance-based
// engagement, at-risk participants, and competency gaps (if recorded) - not
// run automatically on every dashboard load.
function AICohortBriefing({ cohortId, title, subtitle, programStatus, avgCompletion, atRiskCount }: {
  cohortId: string; title: string; subtitle: string; programStatus: string;
  avgCompletion: number; atRiskCount: number;
}) {
  const [brief, setBrief] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleGenerate() {
    setLoading(true); setError(""); setBrief(null);
    try {
      const res = await analyticsApi.cohortBrief(cohortId);
      setBrief(res.data?.brief ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't generate the brief right now.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ background: "linear-gradient(135deg,var(--xa-sidebar) 0%,#2d3a7c 100%)", borderRadius: 16, padding: "20px 28px", color: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "rgba(255,255,255,0.5)" }}>✦ AI COHORT BRIEFING - {subtitle}</div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{
            ...ff, fontSize: 10.5, fontWeight: 700, padding: "5px 12px", borderRadius: 6, cursor: loading ? "default" : "pointer",
            border: "1px solid rgba(255,255,255,0.3)", background: "rgba(255,255,255,0.1)", color: "#fff", opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Generating…" : brief ? "Regenerate AI Brief" : "Generate AI Brief"}
        </button>
      </div>
      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>{title}</div>

      {!brief && !loading && !error && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {[
            { label: "Program Status", value: programStatus.charAt(0).toUpperCase() + programStatus.slice(1) },
            { label: "Engagement Level", value: `${avgCompletion >= 80 ? "High" : avgCompletion >= 50 ? "Medium" : "Low"} - ${avgCompletion}% active` },
            { label: "Recommended Focus", value: atRiskCount > 0 ? `Follow up with ${atRiskCount} at-risk` : "All participants on track ✓" },
          ].map(item => (
            <div key={item.label} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 4, letterSpacing: 0.5 }}>{item.label.toUpperCase()}</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{item.value}</div>
            </div>
          ))}
        </div>
      )}

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 0" }}>
          <span className="xa-typing-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.6)", display: "inline-block" }} />
          <span className="xa-typing-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.6)", display: "inline-block" }} />
          <span className="xa-typing-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: "rgba(255,255,255,0.6)", display: "inline-block" }} />
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", marginLeft: 4 }}>Analyzing engagement, risk, and competency data...</span>
        </div>
      )}

      {!loading && error && <div style={{ fontSize: 12, color: "#fca5a5" }}>{error}</div>}

      {!loading && brief && (
        <div style={{ background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "14px 16px", fontSize: 12.5, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
          {brief}
        </div>
      )}
    </div>
  );
}

// ── Shared primitives ─────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    scheduled: { bg: "#4A557320", color: "#4A5573" },
    live:       { bg: "#22c55e20", color: "#22c55e" },
    completed:  { bg: "#4A557320", color: "#4A5573" },
    cancelled:  { bg: "#ef444420", color: "#ef4444" },
    submitted:  { bg: "#f59e0b20", color: "#f59e0b" },
    graded:     { bg: "#22c55e20", color: "#22c55e" },
  };
  const c = map[status] ?? { bg: "#4A557320", color: "#4A5573" };
  return (
    <span style={{ ...ff, background: c.bg, color: c.color, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 10px", textTransform: "capitalize" }}>
      {status}
    </span>
  );
}

function Btn({ onClick, children, variant = "primary", disabled, small }: {
  onClick?: () => void; children: React.ReactNode;
  variant?: "primary" | "ghost" | "orange"; disabled?: boolean; small?: boolean;
}) {
  const base: React.CSSProperties = { ...ff, border: "none", borderRadius: 8, fontSize: small ? 11 : 12, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", padding: small ? "5px 12px" : "8px 16px", opacity: disabled ? 0.5 : 1, whiteSpace: "nowrap" as const };
  if (variant === "orange") return <button onClick={onClick} disabled={disabled} style={{ ...base, background: "var(--xa-primary)", color: "#fff" }}>{children}</button>;
  if (variant === "primary") return <button onClick={onClick} disabled={disabled} style={{ ...base, background: "var(--xa-sidebar)", color: "#fff" }}>{children}</button>;
  return <button onClick={onClick} disabled={disabled} style={{ ...base, background: "#fff", color: "var(--xa-text)", border: "1.5px solid #E6DED0" }}>{children}</button>;
}

function Modal({ onClose, title, children, wide }: { onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  // Rendered via a portal to <body> - the page's <main> (DashboardShell) has a
  // CSS `transform` for its entrance animation, which creates a new containing
  // block for `position: fixed` descendants. Without the portal, this overlay
  // would be pinned to <main>'s box instead of the real viewport, leaving the
  // header undimmed and exposing bright gaps on scroll.
  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: wide ? 680 : 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)", ...ff }}>
        <div style={{ background: "linear-gradient(135deg,var(--xa-sidebar),#2d3a7c)", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 1 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{title}</div>
          <button onClick={onClose} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "50%", width: 26, height: 26, color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 12 }}>✕</button>
        </div>
        <div style={{ padding: "20px 24px 24px" }}>{children}</div>
      </div>
    </div>,
    document.body
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: "var(--xa-text)", display: "block", marginBottom: 5, letterSpacing: 0.5, textTransform: "uppercase", ...ff }}>{label}</label>
      {children}
    </div>
  );
}
const inp: React.CSSProperties = { width: "100%", border: "1.5px solid #E6DED0", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: "var(--xa-text)", outline: "none", boxSizing: "border-box" };
const sel: React.CSSProperties = { ...inp, background: "#fff", cursor: "pointer" };
const ta: React.CSSProperties = { ...inp, minHeight: 80, resize: "vertical" as const };

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div style={{ textAlign: "center", padding: 56, background: "#fff", borderRadius: 16, border: "1px solid #E6DED0", ...ff }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "var(--xa-text)", marginBottom: 6 }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: "#4A5573" }}>{sub}</div>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// ANALYTICS PANELS
// ══════════════════════════════════════════════════════════════════

function WeeklyEngagementChart({ cohortId }: { cohortId: string }) {
  const [data, setData] = useState<EngagementPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cohortId) return;
    setLoading(true);
    analyticsApi.engagement(cohortId)
      .then(r => setData(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [cohortId]);

  if (loading) return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E6DED0", padding: 24, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 220, ...ff }}>
      <span style={{ fontSize: 12, color: "#4A5573" }}>Loading engagement data…</span>
    </div>
  );

  if (data.length === 0) return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E6DED0", padding: 24, ...ff }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "var(--xa-text)", marginBottom: 6 }}>Weekly Participant Engagement</div>
      <div style={{ textAlign: "center", padding: "32px 0", color: "#4A5573", fontSize: 12 }}>
        No session attendance data yet. Mark attendance after running sessions.
      </div>
    </div>
  );

  const maxPct = Math.max(...data.map(d => d.engagement_pct), 1);
  const avg = Math.round(data.reduce((s, d) => s + d.engagement_pct, 0) / data.length);
  const lastWeek = data[data.length - 1];
  const prevWeek = data[data.length - 2];
  const trend = prevWeek ? lastWeek.engagement_pct - prevWeek.engagement_pct : 0;
  const currentWeekNum = lastWeek?.week_number ?? 0;

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E6DED0", padding: "20px 24px", ...ff }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--xa-text)" }}>Weekly Participant Engagement</div>
        <span style={{ fontSize: 10, color: "#4A5573", fontWeight: 500 }}>{data.length}-week view · Avg: {avg}%</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
        {data.map(d => {
          const isCurrentWeek = d.week_number === currentWeekNum;
          const barH = Math.max(Math.round((d.engagement_pct / maxPct) * 100), 4);
          return (
            <div key={d.week_number} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: isCurrentWeek ? "var(--xa-primary)" : "#4A5573" }}>
                {d.engagement_pct}%
              </div>
              <div style={{ width: "100%", display: "flex", alignItems: "flex-end", height: 88 }}>
                <div style={{
                  width: "100%", height: `${barH}%`,
                  background: isCurrentWeek ? "var(--xa-primary)" : "#4A557325",
                  borderRadius: "4px 4px 0 0",
                  transition: "height 0.3s ease",
                  minHeight: 4,
                }} />
              </div>
              <div style={{ fontSize: 9, color: isCurrentWeek ? "var(--xa-primary)" : "#4A5573", fontWeight: isCurrentWeek ? 700 : 500 }}>
                {d.week_label}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ borderTop: "1px solid #E6DED0", marginTop: 16, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#4A5573" }}>This week: <strong style={{ color: lastWeek?.engagement_pct >= 70 ? "#22c55e" : "var(--xa-primary)" }}>{lastWeek?.engagement_pct ?? 0}%</strong></span>
        {trend !== 0 && (
          <span style={{ fontSize: 11, color: trend > 0 ? "#22c55e" : "#ef4444", fontWeight: 700 }}>
            {trend > 0 ? "↑" : "↓"} {Math.abs(trend)}% vs last week
          </span>
        )}
      </div>
    </div>
  );
}

function CompetencySnapshotPanel({ cohortId, orgId }: { cohortId: string; orgId?: string }) {
  const [scores, setScores] = useState<CompetencyScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRecord, setShowRecord] = useState(false);
  const [competencies, setCompetencies] = useState<CompetencyDTO[]>([]);
  const [recForm, setRecForm] = useState({ competency_id: "", pre_program_pct: 0, current_pct: 0 });
  const [saving, setSaving] = useState(false);

  function load() {
    setLoading(true);
    analyticsApi.competencyScores(cohortId)
      .then(r => setScores(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!cohortId) return;
    load();
    if (orgId) {
      competenciesApi.list(orgId).then(r => setCompetencies(r.data ?? [])).catch(() => {});
    }
  }, [cohortId, orgId]);

  async function saveScore() {
    if (!recForm.competency_id) return;
    setSaving(true);
    try {
      await analyticsApi.upsertCompetencyScore({ cohort_id: cohortId, ...recForm });
      load();
      setShowRecord(false);
      setRecForm({ competency_id: "", pre_program_pct: 0, current_pct: 0 });
    } catch {} finally { setSaving(false); }
  }

  if (loading) return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E6DED0", padding: 24, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 220, ...ff }}>
      <span style={{ fontSize: 12, color: "#4A5573" }}>Loading competency data…</span>
    </div>
  );

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E6DED0", padding: "20px 24px", ...ff }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--xa-text)" }}>Cohort Competency Snapshot</div>
        <button
          onClick={() => { setShowRecord(!showRecord); }}
          style={{ ...ff, fontSize: 11, fontWeight: 700, color: "var(--xa-primary)", background: "#C8A86010", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}>
          + Record Scores
        </button>
      </div>

      {showRecord && (
        <div style={{ background: "#EFE9DC", borderRadius: 10, padding: 14, marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <Field label="Competency">
            <select style={sel} value={recForm.competency_id}
              onChange={e => setRecForm(f => ({ ...f, competency_id: e.target.value }))}>
              <option value="">- Select -</option>
              {competencies.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </Field>
          {competencies.length === 0 && (
            <div style={{ fontSize: 11, color: "#4A5573" }}>No competencies defined. Use Program Design → Competencies to add them.</div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Pre-Program (%)">
              <input type="number" style={inp} min={0} max={100} value={recForm.pre_program_pct}
                onChange={e => setRecForm(f => ({ ...f, pre_program_pct: Number(e.target.value) }))} />
            </Field>
            <Field label="Current (%)">
              <input type="number" style={inp} min={0} max={100} value={recForm.current_pct}
                onChange={e => setRecForm(f => ({ ...f, current_pct: Number(e.target.value) }))} />
            </Field>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Btn variant="ghost" small onClick={() => setShowRecord(false)}>Cancel</Btn>
            <Btn small onClick={saveScore} disabled={saving || !recForm.competency_id}>{saving ? "Saving…" : "Save"}</Btn>
          </div>
        </div>
      )}

      {scores.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "#4A5573", fontSize: 12 }}>
          No scores recorded yet. Use "Record Scores" after running competency assessments.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {scores.map(s => {
            const gain = s.current_pct - s.pre_program_pct;
            return (
              <div key={s.id}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "var(--xa-text)" }}>{s.title}</span>
                  <span style={{ fontSize: 11, color: gain >= 0 ? "#22c55e" : "#ef4444", fontWeight: 700 }}>
                    {s.pre_program_pct}% → {s.current_pct}%
                    {gain !== 0 && <span style={{ marginLeft: 4 }}>{gain > 0 ? "↑" : "↓"}{Math.abs(gain)}%</span>}
                  </span>
                </div>
                <div style={{ position: "relative", height: 8, background: "#E6DED0", borderRadius: 4, overflow: "hidden" }}>
                  {/* Pre-program bar (behind) */}
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${s.pre_program_pct}%`, background: "#18284840", borderRadius: 4 }} />
                  {/* Current bar (on top) */}
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${s.current_pct}%`, background: "var(--xa-primary)", borderRadius: 4, opacity: 0.85 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {scores.length > 0 && (
        <div style={{ display: "flex", gap: 16, marginTop: 16, borderTop: "1px solid #E6DED0", paddingTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 12, height: 8, background: "#18284840", borderRadius: 2 }} />
            <span style={{ fontSize: 10, color: "#4A5573" }}>Pre-program</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 12, height: 8, background: "var(--xa-primary)", borderRadius: 2, opacity: 0.85 }} />
            <span style={{ fontSize: 10, color: "#4A5573" }}>Current</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════

function FacultyDashboard({
  enrollments, activeEnrollment, program, participants, sessions,
  loadingData, loadingCohort, pendingGrades, onSelectEnrollment, onNavigate,
}: {
  enrollments: MyEnrollmentDTO[]; activeEnrollment: MyEnrollmentDTO | null;
  program: ProgramDetailDTO | null; participants: ParticipantDTO[]; sessions: SessionDTO[];
  loadingData: boolean; loadingCohort: boolean; pendingGrades: number;
  onSelectEnrollment: (e: MyEnrollmentDTO) => void; onNavigate: (id: string) => void;
}) {
  const statDetail = useStatDetail();
  if (loadingData) return <div style={{ padding: 40, textAlign: "center", color: "#4A5573", fontSize: 13, ...ff }}>Loading dashboard…</div>;

  if (!activeEnrollment) return (
    <div style={{ padding: 40, display: "flex", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E6DED0", padding: "48px 40px", textAlign: "center", maxWidth: 420, ...ff }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>👩‍🏫</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "var(--xa-text)", marginBottom: 8 }}>No cohorts assigned yet</div>
        <div style={{ fontSize: 13, color: "#4A5573", lineHeight: 1.6 }}>Your Program Manager will invite you to a cohort.</div>
      </div>
    </div>
  );

  const e = activeEnrollment;
  const today = new Date().toDateString();
  const now = new Date();

  const todaySession = sessions.find(s => new Date(s.scheduled_at).toDateString() === today && s.status !== "cancelled");
  const upcomingSessions = sessions
    .filter(s => (new Date(s.scheduled_at) >= now || s.status === "live") && s.status !== "cancelled")
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    .slice(0, 5);

  const realParticipants = participants.filter(p => p.role === "participant");
  const atRisk = realParticipants.filter(p => p.risk_level === "high" || p.risk_level === "medium");
  const avgCompletion = realParticipants.length
    ? Math.round(realParticipants.reduce((s, p) => s + p.completion_percent, 0) / realParticipants.length)
    : 0;

  const typeLabel: Record<string, string> = { classroom: "Classroom", coaching_group: "Group", coaching_individual: "1:1" };
  const typeBg: Record<string, string> = { classroom: "#18284820", coaching_group: "#4A557320", coaching_individual: "#C8A86020" };
  const typeColor: Record<string, string> = { classroom: "var(--xa-text)", coaching_group: "#4A5573", coaching_individual: "var(--xa-primary)" };
  const typeIcon: Record<string, string> = { classroom: "🏫", coaching_group: "👥", coaching_individual: "🎯" };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, ...ff }}>

      {/* Cohort switcher */}
      {enrollments.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {enrollments.map(en => (
            <button key={en.enrollment_id} onClick={() => onSelectEnrollment(en)}
              style={{ padding: "5px 14px", borderRadius: 20, cursor: "pointer", border: `1.5px solid ${en.enrollment_id === e.enrollment_id ? e.program_color : "#E6DED0"}`, background: en.enrollment_id === e.enrollment_id ? e.program_color : "#fff", color: en.enrollment_id === e.enrollment_id ? "#fff" : "#4A5573", fontSize: 11, fontWeight: 600, ...ff }}>
              {en.cohort_name}
            </button>
          ))}
        </div>
      )}

      {/* AI Cohort Briefing */}
      <AICohortBriefing
        cohortId={e.cohort_id}
        title={todaySession ? `${todaySession.title} · ${realParticipants.length} Participants` : `${e.program_title} · ${realParticipants.length} Participants`}
        subtitle={todaySession ? "Today's Session" : "Program Overview"}
        programStatus={e.program_status}
        avgCompletion={avgCompletion}
        atRiskCount={atRisk.length}
      />

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
        <StatCard label="Participants" value={realParticipants.length} sub="Active this cohort" icon="◎" color={e.program_color}
          detail={[{ title: "BY RISK LEVEL", rows: realParticipants.map(p => ({ label: p.name, value: `${p.completion_percent}%`, bar: p.completion_percent, color: p.risk_level === "high" ? "#ef4444" : p.risk_level === "medium" ? "#f59e0b" : "#22c55e" })) }]}
          onOpen={() => statDetail.open({ label: "Participants", value: String(realParticipants.length), sub: "Active this cohort", color: e.program_color, sections: [{ title: "BY RISK LEVEL", rows: realParticipants.map(p => ({ label: p.name, value: `${p.completion_percent}%`, bar: p.completion_percent, color: p.risk_level === "high" ? "#ef4444" : p.risk_level === "medium" ? "#f59e0b" : "#22c55e" })) }] })} />
        <StatCard label="Sessions" value={sessions.length} sub="Scheduled this program" icon="⬡" color="#4A5573" onNavigate={() => onNavigate("fac-sessions")} />
        <StatCard label="Pending Grades" value={pendingGrades} sub="Awaiting review" icon="✦" color={pendingGrades > 0 ? "var(--xa-primary)" : "#22c55e"} onNavigate={() => onNavigate("fac-grading")} />
        <StatCard label="Avg Engagement" value={`${avgCompletion}%`} sub="Participant activity this week" icon="◆" color={avgCompletion >= 70 ? "#22c55e" : "#f59e0b"}
          detail={[{ title: "BY PARTICIPANT", rows: realParticipants.map(p => ({ label: p.name, value: `${p.completion_percent}%`, bar: p.completion_percent, color: "#22c55e" })) }]}
          onOpen={() => statDetail.open({ label: "Avg Engagement", value: `${avgCompletion}%`, sub: "Participant activity this week", color: avgCompletion >= 70 ? "#22c55e" : "#f59e0b", sections: [{ title: "BY PARTICIPANT", rows: realParticipants.map(p => ({ label: p.name, value: `${p.completion_percent}%`, bar: p.completion_percent, color: "#22c55e" })) }] })} />
      </div>
      {statDetail.overlay}

      {/* Analytics panels */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <WeeklyEngagementChart cohortId={e.cohort_id} />
        <CompetencySnapshotPanel cohortId={e.cohort_id} orgId={program?.org_id} />
      </div>

      {/* Two-column */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>

        {/* Upcoming Sessions */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E6DED0", overflow: "hidden" }}>
          <div style={{ padding: "16px 22px", borderBottom: "1px solid #E6DED0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--xa-text)" }}>Upcoming Sessions</div>
            <button onClick={() => onNavigate("fac-sessions")} style={{ ...ff, fontSize: 11, fontWeight: 600, color: "#4A5573", background: "transparent", border: "none", cursor: "pointer" }}>View all →</button>
          </div>
          {loadingCohort ? (
            <div style={{ padding: 32, textAlign: "center", fontSize: 12, color: "#4A5573" }}>Loading…</div>
          ) : upcomingSessions.length === 0 ? (
            <div style={{ padding: "28px 22px", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#4A5573" }}>No upcoming sessions. <button onClick={() => onNavigate("fac-sessions")} style={{ ...ff, color: "#4A5573", background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Create one →</button></div>
            </div>
          ) : upcomingSessions.map(s => {
            const isToday = new Date(s.scheduled_at).toDateString() === today;
            const isLive = s.status === "live";
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 22px", borderBottom: "1px solid #F7F5F0" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: typeBg[s.session_type] ?? "#4A557320", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                  {typeIcon[s.session_type] ?? "📅"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--xa-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 10, background: typeBg[s.session_type] ?? "#4A557320", color: typeColor[s.session_type] ?? "#4A5573", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>{typeLabel[s.session_type] ?? "Session"}</span>
                    <span style={{ fontSize: 10, color: "#4A5573" }}>
                      {isToday ? "Today" : new Date(s.scheduled_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}, {new Date(s.scheduled_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
                {(() => {
                  const sessionJoinLink = resolveJoinLink(s.meeting_type, s.join_url, s.virtual_link);
                  const canJoinTeams = Boolean(
                    sessionJoinLink && (
                      s.meeting_type === "microsoft_teams" ||
                      /(^|\.)teams\.microsoft\.com(?=[:/]|$)/i.test(sessionJoinLink)
                    )
                  );

                  return (isLive || isToday || canJoinTeams) ? (
                  <Btn variant="orange" small onClick={() => {
                    // isLive: the real Zoom meeting already exists - prefer its
                    // join_url over the possibly-stale virtual_link. Not-yet-live
                    // ("Start Session"): no join_url exists yet regardless, so this
                    // still opens virtual_link - actually starting the meeting
                    // requires sessionsApi.start(), which this quick-glance card
                    // doesn't call (see SessionsPage.tsx's startSession for that flow).
                    const link = resolveJoinLink(s.meeting_type, s.join_url, s.virtual_link);
                    if (link) window.open(link, "_blank");
                  }}>
                    {canJoinTeams ? "Join Teams" : isLive ? "Join Live" : "Start Session"}
                  </Btn>
                ) : (
                  <Btn variant="ghost" small>Prepare</Btn>
                );
                })()}
              </div>
            );
          })}
        </div>

        {/* Right panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Grading Queue */}
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E6DED0", padding: "18px 20px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--xa-text)", marginBottom: 8 }}>Grading Queue</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: pendingGrades > 0 ? "var(--xa-primary)" : "#22c55e", lineHeight: 1, marginBottom: 4 }}>{pendingGrades}</div>
            <div style={{ fontSize: 11, color: "#4A5573", marginBottom: 14 }}>Submissions awaiting review</div>
            <button onClick={() => onNavigate("fac-grading")}
              style={{ ...ff, width: "100%", padding: "10px 0", background: "var(--xa-primary)", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Open Grading Queue →
            </button>
          </div>

          {/* At-Risk Participants */}
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #E6DED0", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #E6DED0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--xa-text)" }}>At-Risk Participants</div>
              <span style={{ fontSize: 10, background: atRisk.length > 0 ? "#ef444420" : "#22c55e20", color: atRisk.length > 0 ? "#ef4444" : "#22c55e", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>{atRisk.length}</span>
            </div>
            {atRisk.length === 0 ? (
              <div style={{ padding: "20px 18px", textAlign: "center", fontSize: 12, color: "#22c55e", fontWeight: 600 }}>All participants on track ✓</div>
            ) : atRisk.slice(0, 5).map(p => (
              <div key={p.enrollment_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 18px", borderBottom: "1px solid #F7F5F0" }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: p.risk_level === "high" ? "#ef444420" : "#f59e0b20", color: p.risk_level === "high" ? "#ef4444" : "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {p.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--xa-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: "#4A5573" }}>{p.completion_percent}% · {p.risk_level} risk</div>
                </div>
                <button onClick={() => onNavigate("fac-coaching")}
                  style={{ ...ff, fontSize: 10, fontWeight: 700, color: p.risk_level === "high" ? "#ef4444" : "#f59e0b", background: p.risk_level === "high" ? "#ef444415" : "#f59e0b15", border: "none", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                  Nudge
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// FacultyProgramDesign removed - faculty now uses ProgramDesignList + PMDesignStudio directly.
// See the fac-program-design case in renderContent() and imports at top of file.

function _FacultyProgramDesign_DELETED({ enrollments, facultyUserId }: { enrollments: MyEnrollmentDTO[]; facultyUserId: string }) {
  // ── View mode ────────────────────────────────────────────────────
  const [studioId, setStudioId] = useState<string | null>(null);

  // ── Card grid state ──────────────────────────────────────────────
  type PCard = { en: MyEnrollmentDTO; prog: ProgramDetailDTO | null; stats: CohortStatsDTO | null; assignedOnly?: boolean };
  const [cards, setCards] = useState<PCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [cardFilter, setCardFilter] = useState("all");

  useEffect(() => {
    if (!facultyUserId) { setLoadingCards(false); return; }
    setLoadingCards(true);
    // Load enrollment-based programs + assignment-based programs (faculty assigned to activities)
    Promise.all([
      // Enrollment-based (faculty enrolled in cohort)
      Promise.all(
        [...new Map(enrollments.map(e => [e.program_id, e])).values()].map(async (en): Promise<PCard> => {
          const [pRes, sRes] = await Promise.all([
            programsApi.get(en.program_id).catch(() => null),
            cohortsApi.stats(en.cohort_id).catch(() => null),
          ]);
          return { en, prog: pRes?.data ?? null, stats: sRes?.data ?? null };
        })
      ),
      // Assignment-based (faculty assigned to activities in programs, not enrolled)
      programsApi.getFacultyAssignments(facultyUserId).catch(() => null),
    ]).then(async ([enrollmentCards, assignmentsRes]) => {
      const enrolledProgramIds = new Set(enrollmentCards.map(c => c.en.program_id));
      const assignments = assignmentsRes?.data ?? [];
      const assignedProgramIds = [...new Set(assignments.map(a => a.program_id))].filter(id => !enrolledProgramIds.has(id));
      const assignedCards: PCard[] = await Promise.all(assignedProgramIds.map(async (programId): Promise<PCard> => {
        const pRes = await programsApi.get(programId).catch(() => null);
        const prog = pRes?.data ?? null;
        const syntheticEn: MyEnrollmentDTO = {
          enrollment_id: `assigned-${programId}`,
          cohort_id: "",
          cohort_name: "Assigned (no cohort)",
          program_id: programId,
          program_title: prog?.title ?? programId,
          program_status: prog?.status ?? "active",
          program_color: prog?.color ?? "#4A5573",
          program_duration_weeks: prog?.duration_weeks ?? 0,
          cohort_start_date: undefined,
          cohort_end_date: undefined,
          role: "faculty",
          status: "active",
          completion_percent: 0,
          risk_level: "low",
          enrolled_at: "",
        };
        return { en: syntheticEn, prog, stats: null, assignedOnly: true };
      }));
      setCards([...enrollmentCards, ...assignedCards]);
    }).finally(() => setLoadingCards(false));
  }, [enrollments, facultyUserId]);

  // ── Studio state ─────────────────────────────────────────────────
  const [selectedProgramId, setSelectedProgramId] = useState("");
  const [program, setProgram] = useState<ProgramDetailDTO | null>(null);
  const [phases, setPhases] = useState<PhaseDTO[]>([]);
  const [competencies, setCompetencies] = useState<CompetencyDTO[]>([]);
  const [templates, setTemplates] = useState<TemplateDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAddPhase, setShowAddPhase] = useState(false);
  const [showAddActivity, setShowAddActivity] = useState<string | null>(null);
  const [showCompMgr, setShowCompMgr] = useState(false);
  const [actCompPanel, setActCompPanel] = useState<{ actId: string; actTitle: string } | null>(null);
  const [actMapped, setActMapped] = useState<{ activity_id: string; competency_id: string; title: string; level: string }[]>([]);
  const dragPhaseRef = useRef<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [editPhaseId, setEditPhaseId] = useState<string | null>(null);
  const [editPhaseForm, setEditPhaseForm] = useState({ title: "", week_label: "", color: "#4A5573" });
  const [menuPhaseId, setMenuPhaseId] = useState<string | null>(null);
  const [savingPhase, setSavingPhase] = useState(false);

  useEffect(() => { if (studioId) setSelectedProgramId(studioId); }, [studioId]);

  const load = useCallback(() => {
    if (!selectedProgramId) return;
    setLoading(true);
    programsApi.get(selectedProgramId)
      .then(r => {
        setProgram(r.data);
        const ps = r.data?.phases ?? [];
        setPhases(ps);
        if (ps.length > 0) setExpanded(new Set([ps[0].id]));
        const orgId = r.data?.org_id;
        if (orgId) {
          competenciesApi.list(orgId).then(cr => setCompetencies(cr.data ?? [])).catch(() => {});
          competenciesApi.listTemplates(orgId).then(tr => setTemplates(tr.data ?? [])).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedProgramId]);

  useEffect(() => { load(); }, [load]);

  // ── Helpers ───────────────────────────────────────────────────────
  function fmtMonth(d?: string) {
    if (!d) return "TBD";
    return new Date(d).toLocaleDateString("en-US", { month: "short", year: "numeric" });
  }

  function getCurrentPhase(prog: ProgramDetailDTO | null, status: string, completion: number): string {
    if (status === "draft") return "Design Phase";
    if (status === "upcoming") return "Not Started";
    if (status === "delivered" || status === "archived" || completion >= 100) return "Completed";
    if (!prog || prog.phases.length === 0) return "In Progress";
    const sorted = [...prog.phases].sort((a, b) => a.phase_number - b.phase_number);
    const idx = Math.min(Math.floor((completion / 100) * sorted.length), sorted.length - 1);
    return `Phase ${sorted[idx].phase_number}: ${sorted[idx].title}`;
  }

  function barColor(pct: number) {
    return pct >= 80 ? "#22c55e" : pct >= 50 ? "var(--xa-primary)" : "#ef4444";
  }

  const statusMeta: Record<string, { bg: string; color: string; label: string }> = {
    active:    { bg: "#22c55e15", color: "#22c55e", label: "Active" },
    upcoming:  { bg: "#C8A86015", color: "var(--xa-primary)", label: "Upcoming" },
    delivered: { bg: "#4A557320", color: "#4A5573", label: "Delivered" },
    draft:     { bg: "#4A557320", color: "#4A5573", label: "Draft" },
    archived:  { bg: "#4A557320", color: "#4A5573", label: "Archived" },
  };

  // ── Studio helpers ────────────────────────────────────────────────
  function toggleExpand(id: string) {
    setExpanded(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  }

  async function onPhaseDrop(targetId: string) {
    const dragId = dragPhaseRef.current;
    if (!dragId || dragId === targetId || !program) { setDragOver(null); return; }
    const newOrder = [...phases];
    const from = newOrder.findIndex(p => p.id === dragId);
    const to = newOrder.findIndex(p => p.id === targetId);
    if (from === -1 || to === -1) return;
    const [moved] = newOrder.splice(from, 1);
    newOrder.splice(to, 0, moved);
    setPhases(newOrder);
    setDragOver(null);
    dragPhaseRef.current = null;
    try { await programsApi.reorderPhases(program.id, newOrder.map(p => p.id)); }
    catch { load(); }
  }

  async function openActComp(actId: string, actTitle: string) {
    setActCompPanel({ actId, actTitle });
    const r = await competenciesApi.listForActivity(actId).catch(() => null);
    setActMapped((r?.data ?? []) as any[]);
  }

  async function applyTemplate(tpl: TemplateDTO) {
    if (!program) return;
    setShowTemplates(false);
    for (const ph of (tpl.structure.phases ?? [])) {
      const phRes = await programsApi.createPhase(program.id, {
        title: ph.title, phase_number: phases.length + 1, week_label: ph.week_label,
      }).catch(() => null);
      if (!phRes?.data) continue;
      for (const act of (ph.activities ?? [])) {
        await programsApi.createActivity(program.id, {
          phase_id: phRes.data.id, title: act.title, type: act.type, duration_mins: act.duration_mins,
        }).catch(() => {});
      }
    }
    load();
  }

  // ── CARD GRID VIEW ────────────────────────────────────────────────
  if (!studioId) {
    const filterOpts = ["all", "active", "upcoming", "delivered", "draft"];
    const filtered = cardFilter === "all" ? cards : cards.filter(c => c.en.program_status === cardFilter);

    return (
      <div style={{ padding: 24, ...ff }}>
        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" }}>
          {filterOpts.map(f => (
            <button key={f} onClick={() => setCardFilter(f)}
              style={{ ...ff, padding: "7px 18px", borderRadius: 20, border: `1.5px solid ${cardFilter === f ? "var(--xa-primary)" : "#E6DED0"}`, background: cardFilter === f ? "rgba(200, 168, 96,0.08)" : "#fff", color: cardFilter === f ? "var(--xa-primary)" : "#4A5573", fontSize: 12, fontWeight: cardFilter === f ? 700 : 500, cursor: "pointer" }}>
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {loadingCards ? (
          <div style={{ textAlign: "center", padding: 56, color: "#4A5573", fontSize: 13 }}>Loading programs…</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon="📋"
            title={cardFilter === "all" ? "No programs assigned" : `No ${cardFilter} programs`}
            sub="Your Program Manager will assign you to a cohort." />
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
            {filtered.map(({ en, prog, stats, assignedOnly }) => {
              const sm = statusMeta[en.program_status] ?? statusMeta.draft;
              const completion = Math.round(stats?.avg_completion ?? 0);
              const enrolled = stats?.total_enrolled ?? 0;
              const currentPhase = getCurrentPhase(prog, en.program_status, completion);
              const bc = barColor(completion);
              const isDraft = en.program_status === "draft";

              return (
                <div key={en.enrollment_id}
                  style={{ background: "#fff", borderRadius: 16, border: `1px solid ${assignedOnly ? "#4A557340" : "#E6DED0"}`, padding: "22px 24px", display: "flex", flexDirection: "column", boxShadow: "0 1px 6px rgba(24, 40, 72,0.04)" }}>

                  {/* Avatar + title + badge */}
                  <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
                    <div style={{ width: 46, height: 46, borderRadius: 12, background: en.program_color || "var(--xa-sidebar)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 20, fontWeight: 800, flexShrink: 0 }}>
                      {en.program_title.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--xa-text)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{en.program_title}</div>
                        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                          {assignedOnly && (
                            <span style={{ ...ff, fontSize: 10, fontWeight: 700, background: "#4A557314", color: "#4A5573", borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap" }}>Facilitator</span>
                          )}
                          <span style={{ ...ff, fontSize: 11, fontWeight: 700, background: sm.bg, color: sm.color, borderRadius: 20, padding: "3px 11px", whiteSpace: "nowrap" }}>{sm.label}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: "#4A5573", marginTop: 3 }}>
                        {en.program_duration_weeks > 0 ? `${en.program_duration_weeks}-week · ` : ""}{fmtMonth(en.cohort_start_date)} - {fmtMonth(en.cohort_end_date)}
                      </div>
                    </div>
                  </div>

                  {/* Current phase */}
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#4A5573", marginBottom: 12 }}>{currentPhase}</div>

                  {/* Enrolled + completion */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                    <span style={{ fontSize: 12, color: "#4A5573" }}>{enrolled} enrolled</span>
                    {!isDraft && (
                      <span style={{ fontSize: 13, fontWeight: 700, color: bc }}>{completion}%</span>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div style={{ height: 6, background: "#EFE9DC", borderRadius: 3, marginBottom: 18 }}>
                    {!isDraft && (
                      <div style={{ height: "100%", width: `${Math.min(completion, 100)}%`, background: bc, borderRadius: 3, transition: "width 0.4s ease" }} />
                    )}
                  </div>

                  {/* View Studio button */}
                  <button onClick={() => setStudioId(en.program_id)}
                    style={{ ...ff, background: "transparent", border: "1.5px solid #E6DED0", borderRadius: 8, padding: "10px 16px", fontSize: 12, fontWeight: 700, color: "var(--xa-text)", cursor: "pointer", textAlign: "left" as const }}>
                    {isDraft ? "Continue Design →" : "View Studio →"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // ── STUDIO VIEW ───────────────────────────────────────────────────
  const studioEnrollment = enrollments.find(e => e.program_id === studioId);
  const sortedPhases = [...phases].sort((a, b) => a.phase_number - b.phase_number);

  async function savePhaseEdit(phaseId: string) {
    if (!program) return;
    setSavingPhase(true);
    await programsApi.updatePhase(program.id, phaseId, {
      title: editPhaseForm.title,
      week_label: editPhaseForm.week_label || undefined,
      color: editPhaseForm.color,
    }).catch(() => {});
    setEditPhaseId(null);
    setSavingPhase(false);
    load();
  }

  async function deletePhase(phaseId: string) {
    if (!program) return;
    setMenuPhaseId(null);
    await programsApi.deletePhase(program.id, phaseId).catch(() => {});
    load();
  }

  async function handlePublish() {
    if (!program) return;
    await programsApi.publish(program.id).catch(() => {});
    load();
  }

  if (loading) return (
    <div style={{ padding: 40, textAlign: "center", color: "#4A5573", fontSize: 13, ...ff }}>Loading studio…</div>
  );

  return (
    <div style={{ ...ff }}>

      {/* ── Studio header ──────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "4px 24px 16px", borderBottom: "1px solid #E6DED0", marginBottom: 20, flexWrap: "wrap", rowGap: 10 }}>
        {/* Back breadcrumb */}
        <button
          onClick={() => { setStudioId(null); setSelectedProgramId(""); setProgram(null); setPhases([]); setEditPhaseId(null); }}
          style={{ ...ff, background: "transparent", border: "none", fontSize: 13, fontWeight: 600, color: "#4A5573", cursor: "pointer", padding: "0 16px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
          ← Programs
        </button>
        <div style={{ width: 1, height: 22, background: "#E6DED0", marginRight: 16, flexShrink: 0 }} />
        {/* Avatar + title */}
        <div style={{ width: 34, height: 34, borderRadius: 9, background: studioEnrollment?.program_color || "var(--xa-sidebar)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 16, fontWeight: 800, flexShrink: 0, marginRight: 10 }}>
          {(studioEnrollment?.program_title ?? "P").charAt(0).toUpperCase()}
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: "var(--xa-text)", marginRight: "auto" }}>{studioEnrollment?.program_title}</span>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
          <button
            onClick={() => setShowTemplates(true)}
            style={{ ...ff, background: "#fff", border: "1.5px solid #E6DED0", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "var(--xa-text)", cursor: "pointer" }}>
            📋 Templates
          </button>
          <button
            onClick={() => setShowCompMgr(true)}
            style={{ ...ff, background: "#fff", border: "1.5px solid #E6DED0", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "var(--xa-text)", cursor: "pointer" }}>
            ✦ Competencies
          </button>
          <button
            style={{ ...ff, background: "#fff", border: "1.5px solid #E6DED0", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "var(--xa-text)", cursor: "default", opacity: 0.6 }}>
            👁 Preview as Participant
          </button>
          <button
            style={{ ...ff, background: "#fff", border: "1.5px solid #E6DED0", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "var(--xa-text)", cursor: "pointer" }}>
            Save Draft
          </button>
          <button
            onClick={handlePublish}
            style={{ ...ff, background: "var(--xa-primary)", border: "none", borderRadius: 8, padding: "7px 18px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
            Publish Program
          </button>
        </div>
      </div>

      {/* ── Phase list ─────────────────────────────────────────── */}
      <div style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
        {sortedPhases.length === 0 ? (
          <EmptyState icon="📐" title="No phases yet" sub='Click "+ Add Phase" to start building the curriculum.' />
        ) : sortedPhases.map(phase => {
          const phColor = phase.color || "#4A5573";
          const isDefault = phColor === "#4A5573";
          const chipBg  = isDefault ? "#fff"          : phColor + "15";
          const chipBdr = isDefault ? "#E6DED0"       : phColor + "50";
          const chipClr = isDefault ? "var(--xa-text)"       : phColor;
          const isEditingThis = editPhaseId === phase.id;
          const isMenuOpen    = menuPhaseId === phase.id;
          const sortedActs = [...(phase.activities ?? [])].sort((a, b) => a.sort_order - b.sort_order);

          return (
            <div key={phase.id}
              style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${dragOver === phase.id ? "#4A5573" : "#E6DED0"}`, padding: isEditingThis ? "16px 20px" : "18px 22px", transition: "border-color 0.15s" }}
              draggable
              onDragStart={() => { dragPhaseRef.current = phase.id; }}
              onDragOver={e => { e.preventDefault(); setDragOver(phase.id); }}
              onDrop={() => onPhaseDrop(phase.id)}
              onDragEnd={() => setDragOver(null)}>

              {isEditingThis ? (
                /* ── Inline phase edit ── */
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <input style={{ ...inp, flex: "1 1 180px", minWidth: 140 }} value={editPhaseForm.title}
                    onChange={e => setEditPhaseForm(f => ({ ...f, title: e.target.value }))} placeholder="Phase title" autoFocus />
                  <input style={{ ...inp, flex: "0 0 120px" }} value={editPhaseForm.week_label}
                    onChange={e => setEditPhaseForm(f => ({ ...f, week_label: e.target.value }))} placeholder="Wk 1-4" />
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 11, color: "#4A5573" }}>Color</span>
                    <input type="color" value={editPhaseForm.color}
                      onChange={e => setEditPhaseForm(f => ({ ...f, color: e.target.value }))}
                      style={{ width: 32, height: 32, borderRadius: 6, border: "1.5px solid #E6DED0", cursor: "pointer", padding: 2 }} />
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn small onClick={() => savePhaseEdit(phase.id)} disabled={savingPhase || !editPhaseForm.title}>{savingPhase ? "…" : "Save"}</Btn>
                    <Btn small variant="ghost" onClick={() => setEditPhaseId(null)}>Cancel</Btn>
                  </div>
                </div>
              ) : (
                /* ── Normal phase row ── */
                <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>

                  {/* Phase label - left col, fixed width */}
                  <div style={{ minWidth: 152, flexShrink: 0, paddingRight: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: phColor, letterSpacing: 0.3, marginBottom: 3 }}>
                      Phase {phase.phase_number}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--xa-text)", lineHeight: 1.25 }}>{phase.title}</div>
                    {phase.week_label && (
                      <div style={{ fontSize: 11, color: "#4A5573", marginTop: 4 }}>{phase.week_label}</div>
                    )}
                  </div>

                  {/* Vertical divider */}
                  <div style={{ width: 1, background: "#E6DED0", alignSelf: "stretch", flexShrink: 0, marginRight: 20 }} />

                  {/* Activity chips - fills remaining space */}
                  <div style={{ flex: 1, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                    {sortedActs.map(act => (
                      <button key={act.id}
                        onClick={() => openActComp(act.id, act.title)}
                        style={{ ...ff, padding: "6px 15px", borderRadius: 20, fontSize: 12, fontWeight: 500, border: `1.5px solid ${chipBdr}`, background: chipBg, color: chipClr, cursor: "pointer", whiteSpace: "nowrap" as const }}>
                        {act.title}
                      </button>
                    ))}
                    <button
                      onClick={e => { e.stopPropagation(); setShowAddActivity(phase.id); }}
                      style={{ ...ff, padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500, border: "1.5px dashed #D1D5E4", background: "transparent", color: "#4A5573", cursor: "pointer", whiteSpace: "nowrap" as const }}>
                      + Add Activity
                    </button>
                  </div>

                  {/* Edit + menu icons - right */}
                  <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 12, alignItems: "center" }}>
                    <button
                      onClick={() => { setEditPhaseId(phase.id); setMenuPhaseId(null); setEditPhaseForm({ title: phase.title, week_label: phase.week_label ?? "", color: phase.color || "#4A5573" }); }}
                      style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "#EFE9DC", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#4A5573" }}>
                      ✏
                    </button>
                    <div style={{ position: "relative" }}>
                      <button
                        onClick={() => setMenuPhaseId(isMenuOpen ? null : phase.id)}
                        style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "#EFE9DC", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#4A5573", fontWeight: 700 }}>
                        ⋮
                      </button>
                      {isMenuOpen && (
                        <div onClick={() => setMenuPhaseId(null)}
                          style={{ position: "fixed", inset: 0, zIndex: 200 }}>
                          <div onClick={e => e.stopPropagation()}
                            style={{ position: "absolute", right: 0, top: 34, background: "#fff", border: "1px solid #E6DED0", borderRadius: 10, boxShadow: "0 8px 24px rgba(24, 40, 72,0.12)", minWidth: 160, overflow: "hidden", zIndex: 201 }}>
                            <button
                              onClick={() => { setShowAddActivity(phase.id); setMenuPhaseId(null); }}
                              style={{ ...ff, width: "100%", padding: "11px 16px", background: "transparent", border: "none", textAlign: "left" as const, fontSize: 13, color: "var(--xa-text)", cursor: "pointer", fontWeight: 500 }}>
                              + Add Activity
                            </button>
                            <div style={{ height: 1, background: "#EFE9DC" }} />
                            <button
                              onClick={() => deletePhase(phase.id)}
                              style={{ ...ff, width: "100%", padding: "11px 16px", background: "transparent", border: "none", textAlign: "left" as const, fontSize: 13, color: "#ef4444", cursor: "pointer", fontWeight: 500 }}>
                              Delete Phase
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {/* Add Phase row */}
        <button
          onClick={() => setShowAddPhase(true)}
          style={{ ...ff, width: "100%", padding: "14px 0", background: "transparent", border: "2px dashed #E6DED0", borderRadius: 14, fontSize: 13, fontWeight: 700, color: "#4A5573", cursor: "pointer", textAlign: "center" as const, marginTop: 4 }}>
          + Add Phase
        </button>
      </div>

      {/* Modals */}
      {showTemplates && <TemplateLibraryModal templates={templates} onClose={() => setShowTemplates(false)} onApply={applyTemplate} />}
      {showAddPhase && program && (
        <AddPhaseModal programId={program.id} phaseNumber={phases.length + 1} onClose={() => setShowAddPhase(false)} onCreated={() => { setShowAddPhase(false); load(); }} />
      )}
      {showAddActivity && program && (
        <AddActivityModal programId={program.id} phaseId={showAddActivity} onClose={() => setShowAddActivity(null)} onCreated={() => { setShowAddActivity(null); load(); }} />
      )}
      {showCompMgr && program && (
        <ManageCompetenciesModal orgId={program.org_id} competencies={competencies} onClose={() => { setShowCompMgr(false); load(); }} />
      )}
      {actCompPanel && (
        <ActivityCompetencyModal
          actId={actCompPanel.actId} actTitle={actCompPanel.actTitle}
          allCompetencies={competencies} mapped={actMapped}
          onClose={() => setActCompPanel(null)}
          onChanged={async () => {
            const r = await competenciesApi.listForActivity(actCompPanel.actId).catch(() => null);
            setActMapped((r?.data ?? []) as any[]);
          }}
        />
      )}
    </div>
  );
}

function AddPhaseModal({ programId, phaseNumber, onClose, onCreated }: { programId: string; phaseNumber: number; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ title: "", week_label: "", color: "#4A5573" });
  const [saving, setSaving] = useState(false);
  async function submit() {
    if (!form.title) return;
    setSaving(true);
    try { await programsApi.createPhase(programId, { title: form.title, phase_number: phaseNumber, week_label: form.week_label || undefined, color: form.color }); onCreated(); }
    catch {} finally { setSaving(false); }
  }
  return (
    <Modal onClose={onClose} title="Add Phase">
      <Field label="Phase Title"><input style={inp} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Foundation" /></Field>
      <Field label="Week Label"><input style={inp} value={form.week_label} onChange={e => setForm(f => ({ ...f, week_label: e.target.value }))} placeholder="e.g. Week 1-4" /></Field>
      <Field label="Color"><input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={{ width: "100%", height: 40, borderRadius: 8, border: "1.5px solid #E6DED0", cursor: "pointer" }} /></Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={submit} disabled={saving || !form.title}>{saving ? "Adding…" : "Add Phase"}</Btn>
      </div>
    </Modal>
  );
}

function AddActivityModal({ programId, phaseId, onClose, onCreated }: { programId: string; phaseId: string; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ title: "", type: "content", delivery_mode: "self_paced", duration_mins: 60, is_mandatory: true, description: "" });
  const [saving, setSaving] = useState(false);
  async function submit() {
    if (!form.title) return;
    setSaving(true);
    try {
      await programsApi.createActivity(programId, { phase_id: phaseId, title: form.title, type: form.type, delivery_mode: form.delivery_mode, duration_mins: form.duration_mins, is_mandatory: form.is_mandatory, description: form.description || undefined });
      onCreated();
    } catch {} finally { setSaving(false); }
  }
  return (
    <Modal onClose={onClose} title="Add Activity">
      <Field label="Title"><input style={inp} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Leadership Assessment" /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Type">
          <select style={sel} value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
            {["content","assessment","survey","feedback_360","coaching","capstone","discussion"].map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
          </select>
        </Field>
        <Field label="Delivery Mode">
          <select style={sel} value={form.delivery_mode} onChange={e => setForm(f => ({ ...f, delivery_mode: e.target.value }))}>
            <option value="self_paced">Self-Paced</option>
            <option value="instructor_led">Instructor-Led</option>
            <option value="blended">Blended</option>
          </select>
        </Field>
        <Field label="Duration (mins)"><input type="number" style={inp} value={form.duration_mins} min={5} onChange={e => setForm(f => ({ ...f, duration_mins: Number(e.target.value) }))} /></Field>
        <Field label="Mandatory">
          <select style={sel} value={String(form.is_mandatory)} onChange={e => setForm(f => ({ ...f, is_mandatory: e.target.value === "true" }))}>
            <option value="true">Yes</option><option value="false">No</option>
          </select>
        </Field>
      </div>
      <Field label="Description (optional)"><textarea style={ta} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="What will participants learn?" /></Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={submit} disabled={saving || !form.title}>{saving ? "Adding…" : "Add Activity"}</Btn>
      </div>
    </Modal>
  );
}

function TemplateLibraryModal({ templates, onClose, onApply }: { templates: TemplateDTO[]; onClose: () => void; onApply: (t: TemplateDTO) => void }) {
  const [selected, setSelected] = useState<TemplateDTO | null>(null);
  return (
    <Modal onClose={onClose} title="Template Library" wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
        {templates.map(t => (
          <div key={t.id} onClick={() => setSelected(t)}
            style={{ border: `2px solid ${selected?.id === t.id ? "#4A5573" : "#E6DED0"}`, borderRadius: 12, padding: 16, cursor: "pointer", background: selected?.id === t.id ? "#4A557308" : "#fff" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--xa-text)", marginBottom: 4 }}>{t.title}</div>
            <div style={{ fontSize: 10, color: "#4A5573", marginBottom: 8 }}>{t.description}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <span style={{ fontSize: 9, background: "#4A557315", color: "#4A5573", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>{t.duration_weeks}w</span>
              <span style={{ fontSize: 9, background: "#C8A86015", color: "var(--xa-primary)", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>{t.structure.phases?.length ?? 0} phases</span>
              {t.is_system && <span style={{ fontSize: 9, background: "#22c55e15", color: "#22c55e", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>System</span>}
            </div>
          </div>
        ))}
        {templates.length === 0 && <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "32px 0", fontSize: 12, color: "#4A5573" }}>No templates available yet.</div>}
      </div>
      {selected && (
        <div style={{ background: "#EFE9DC", borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--xa-text)", marginBottom: 10 }}>Preview: {selected.title}</div>
          {(selected.structure.phases ?? []).map((ph, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
              <div style={{ width: 20, height: 20, borderRadius: 5, background: "#4A5573", color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--xa-text)" }}>{ph.title}</div>
                <div style={{ fontSize: 10, color: "#4A5573" }}>{(ph.activities ?? []).map(a => a.title).join(" · ")}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn onClick={() => selected && onApply(selected)} disabled={!selected} variant="orange">Apply Template</Btn>
      </div>
    </Modal>
  );
}

function ManageCompetenciesModal({ orgId, competencies, onClose }: { orgId: string; competencies: CompetencyDTO[]; onClose: () => void }) {
  const [list, setList] = useState<CompetencyDTO[]>(competencies);
  const [form, setForm] = useState({ title: "", category: "leadership" });
  const [saving, setSaving] = useState(false);

  async function add() {
    if (!form.title) return;
    setSaving(true);
    try {
      const r = await competenciesApi.create(orgId, { title: form.title, category: form.category });
      if (r.data) setList(prev => [...prev, r.data!]);
      setForm({ title: "", category: "leadership" });
    } catch {} finally { setSaving(false); }
  }

  async function remove(id: string) {
    await competenciesApi.delete(id).catch(() => {});
    setList(prev => prev.filter(c => c.id !== id));
  }

  const cats = [...new Set(list.map(c => c.category))];

  return (
    <Modal onClose={onClose} title="Competency Framework" wide>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 140px auto", gap: 10, marginBottom: 16, alignItems: "end" }}>
        <Field label="Competency Name"><input style={inp} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Strategic Thinking" /></Field>
        <Field label="Category"><input style={inp} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} /></Field>
        <div style={{ paddingBottom: 14 }}><Btn onClick={add} disabled={saving || !form.title}>{saving ? "…" : "+ Add"}</Btn></div>
      </div>
      {cats.length === 0 ? (
        <div style={{ textAlign: "center", padding: "20px 0", fontSize: 12, color: "#4A5573" }}>No competencies yet.</div>
      ) : cats.map(cat => (
        <div key={cat} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#4A5573", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>{cat}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {list.filter(c => c.category === cat).map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "#EFE9DC", border: "1px solid #E6DED0", borderRadius: 20, padding: "5px 12px" }}>
                <span style={{ fontSize: 12, color: "var(--xa-text)" }}>{c.title}</span>
                <button onClick={() => remove(c.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#4A5573", padding: 0 }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 8 }}>
        <Btn onClick={onClose}>Done</Btn>
      </div>
    </Modal>
  );
}

function ActivityCompetencyModal({ actId, actTitle, allCompetencies, mapped, onClose, onChanged }: {
  actId: string; actTitle: string; allCompetencies: CompetencyDTO[];
  mapped: { activity_id: string; competency_id: string; title: string; level: string }[];
  onClose: () => void; onChanged: () => void;
}) {
  const [selectedId, setSelectedId] = useState("");
  const [level, setLevel] = useState("intermediate");
  const [saving, setSaving] = useState(false);
  const mappedIds = new Set(mapped.map(m => m.competency_id));
  const available = allCompetencies.filter(c => !mappedIds.has(c.id));

  async function map() {
    if (!selectedId) return;
    setSaving(true);
    await competenciesApi.mapToActivity(actId, selectedId, level).catch(() => {});
    setSelectedId("");
    await onChanged();
    setSaving(false);
  }

  return (
    <Modal onClose={onClose} title={`Competencies - ${actTitle}`}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--xa-text)", marginBottom: 8 }}>Mapped</div>
        {mapped.length === 0 ? <div style={{ fontSize: 12, color: "#4A5573" }}>None yet.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {mapped.map(m => (
              <div key={m.competency_id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#EFE9DC", borderRadius: 8, padding: "8px 12px" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--xa-text)", flex: 1 }}>{m.title}</span>
                <span style={{ fontSize: 9, background: "#4A557315", color: "#4A5573", padding: "2px 8px", borderRadius: 10, fontWeight: 700, textTransform: "capitalize" }}>{m.level}</span>
                <button onClick={async () => { await competenciesApi.unmapFromActivity(actId, m.competency_id).catch(() => {}); onChanged(); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#4A5573" }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
      {available.length > 0 && (
        <div style={{ borderTop: "1px solid #E6DED0", paddingTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--xa-text)", marginBottom: 8 }}>Add Competency</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px auto", gap: 8 }}>
            <select style={sel} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
              <option value="">- Select -</option>
              {available.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <select style={sel} value={level} onChange={e => setLevel(e.target.value)}>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
            </select>
            <Btn onClick={map} disabled={saving || !selectedId}>{saving ? "…" : "Map"}</Btn>
          </div>
        </div>
      )}
      {allCompetencies.length === 0 && <div style={{ fontSize: 11, color: "#4A5573", marginTop: 10 }}>No competencies defined yet. Use "✦ Competencies" to add them.</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <Btn onClick={onClose}>Close</Btn>
      </div>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════
// MY SESSIONS TAB - Session Management
// ══════════════════════════════════════════════════════════════════

const agendaTypeIcon: Record<string, string> = {
  presentation: "🎯", discussion: "💬", activity: "⚡", break: "☕", poll: "📊",
};
const agendaTypeColor: Record<string, string> = {
  presentation: "#4A5573", discussion: "#22c55e", activity: "var(--xa-primary)", break: "#4A5573", poll: "#f59e0b",
};

function genId() { return Math.random().toString(36).slice(2, 11); }

function FacultySessions({ enrollments, activeEnrollment, userId }: { enrollments: MyEnrollmentDTO[]; activeEnrollment: MyEnrollmentDTO | null; userId: string }) {
  // ── List state ──────────────────────────────────────────────
  const [sessions, setSessions] = useState<SessionDTO[]>([]);
  const [assignments, setAssignments] = useState<FacultyAssignmentDTO[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [creatingNew, setCreatingNew] = useState(false);

  // ── Detail state ────────────────────────────────────────────
  const [selected, setSelected] = useState<SessionDTO | null>(null);
  const [agenda, setAgenda] = useState<AgendaItemDTO[]>([]);
  const [polls, setPolls] = useState<PollDTO[]>([]);
  const [pollResults, setPollResults] = useState<PollResultsDTO | null>(null);
  const [actionItems, setActionItems] = useState<ActionItemDTO[]>([]);
  const [sessionAttendance, setSessionAttendance] = useState<AttendanceDTO[]>([]);
  const [cohortParts, setCohortParts] = useState<ParticipantDTO[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [sessionNotes, setSessionNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  // ── Tool panels ─────────────────────────────────────────────
  const [activeTool, setActiveTool] = useState<"poll"|"breakout"|"timer"|"attendance"|null>(null);
  // ── Agenda edit ──────────────────────────────────────────────
  const [editAgendaId, setEditAgendaId] = useState<string|null>(null);
  const [editAgendaForm, setEditAgendaForm] = useState({ title: "", duration_mins: 15, type: "presentation" });
  const [showAddAgenda, setShowAddAgenda] = useState(false);
  const [newAgendaItem, setNewAgendaItem] = useState({ title: "", duration_mins: 15, type: "presentation" });
  const [savingAgenda, setSavingAgenda] = useState(false);

  // ── Poll state ───────────────────────────────────────────────
  const [showPollForm, setShowPollForm] = useState(false);
  const [newPoll, setNewPoll] = useState({ question: "", options: ["", ""] });
  const [creatingPoll, setCreatingPoll] = useState(false);

  // ── Breakout state ───────────────────────────────────────────
  const [groupCount, setGroupCount] = useState(4);
  const [breakoutGroups, setBreakoutGroups] = useState<{ name: string; members: { id: string; name: string }[] }[]>([]);

  // ── Attendance state ─────────────────────────────────────────
  const [attMap, setAttMap] = useState<Record<string, string>>({});
  const [savingAtt, setSavingAtt] = useState(false);

  // ── Timer state ──────────────────────────────────────────────
  const [timerMins, setTimerMins] = useState(10);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerRemaining, setTimerRemaining] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval>|null>(null);

  // ── Action item state ────────────────────────────────────────
  const [showAddAction, setShowAddAction] = useState(false);
  const [newAction, setNewAction] = useState({ description: "", participant_id: "", due_date: "" });
  const [savingAction, setSavingAction] = useState(false);

  // ── Poll / breakout / timer extras ──────────────────────────
  const [pollResponseType, setPollResponseType] = useState<"single"|"multiple">("single");
  const [breakoutDuration, setBreakoutDuration] = useState(15);
  const [timerCustom, setTimerCustom] = useState("");
  const [timerVisible, setTimerVisible] = useState(true);

  const pollRefreshRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const notesTimerRef = useRef<ReturnType<typeof setTimeout>|null>(null);

  // ── Load list ────────────────────────────────────────────────
  const loadSessions = useCallback(() => {
    setLoadingList(true);
    Promise.allSettled([
      sessionsApi.list(),
      userId ? programsApi.getFacultyAssignments(userId) : Promise.resolve(null),
    ]).then(([sessResult, assignResult]) => {
      if (sessResult.status === "fulfilled") setSessions(sessResult.value?.data ?? []);
      if (assignResult.status === "fulfilled" && assignResult.value) {
        setAssignments(assignResult.value.data ?? []);
      }
    }).finally(() => setLoadingList(false));
  }, [userId]);
  useEffect(() => { loadSessions(); }, [loadSessions]);

  // ── Timer effect ─────────────────────────────────────────────
  useEffect(() => {
    if (timerRunning) {
      timerRef.current = setInterval(() => {
        setTimerRemaining(prev => {
          if (prev <= 1) { setTimerRunning(false); return 0; }
          return prev - 1;
        });
      }, 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  // ── Poll auto-refresh (3 s) ───────────────────────────────────
  useEffect(() => {
    const activePoll = polls.find(p => p.is_active);
    if (activeTool === "poll" && activePoll && selected) {
      pollRefreshRef.current = setInterval(async () => {
        const r = await sessionsApi.getPollResults(selected.id, activePoll.id).catch(() => null);
        if (r?.data) setPollResults(r.data);
      }, 3000);
    } else if (pollRefreshRef.current) {
      clearInterval(pollRefreshRef.current);
    }
    return () => { if (pollRefreshRef.current) clearInterval(pollRefreshRef.current); };
  }, [activeTool, polls, selected]);

  // ── Open session detail ───────────────────────────────────────
  async function openSession(s: SessionDTO) {
    setSelected(null);
    setLoadingDetail(true);
    setActiveTool(null);
    setPollResults(null);
    setBreakoutGroups([]);

    const [full, pollList, actions, att, parts] = await Promise.all([
      sessionsApi.get(s.id).catch(() => ({ data: s as any })),
      sessionsApi.listPolls(s.id).catch(() => ({ data: [] as PollDTO[] })),
      sessionsApi.listActionItems(s.id).catch(() => ({ data: [] as ActionItemDTO[] })),
      sessionsApi.getAttendance(s.id).catch(() => ({ data: [] as AttendanceDTO[] })),
      cohortsApi.listParticipants(s.cohort_id).catch(() => ({ data: [] as ParticipantDTO[] })),
    ]);

    const fullSession = full.data as SessionDTO;
    setSelected(fullSession);
    setAgenda(fullSession.agenda ?? []);
    setSessionNotes(fullSession.notes ?? "");
    setPolls(pollList.data ?? []);
    setActionItems(actions.data ?? []);
    setSessionAttendance(att.data ?? []);

    const realParts = (parts.data ?? []).filter((p: ParticipantDTO) => p.role === "participant");
    setCohortParts(realParts);

    const map: Record<string, string> = {};
    realParts.forEach((p: ParticipantDTO) => { map[p.user_id] = "present"; });
    (att.data ?? []).forEach((a: AttendanceDTO) => { map[a.user_id] = a.status; });
    setAttMap(map);
    setLoadingDetail(false);
  }

  // ── Notes auto-save ───────────────────────────────────────────
  function handleNotesChange(v: string) {
    setSessionNotes(v);
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(async () => {
      if (!selected) return;
      setSavingNotes(true);
      await sessionsApi.updateNotes(selected.id, v).catch(() => {});
      setSavingNotes(false);
    }, 1500);
  }

  // ── Agenda CRUD ───────────────────────────────────────────────
  async function persistAgenda(items: AgendaItemDTO[]) {
    if (!selected) return;
    setSavingAgenda(true);
    await sessionsApi.updateAgenda(selected.id, items).catch(() => {});
    setAgenda(items);
    setSavingAgenda(false);
  }
  async function addAgendaItem() {
    if (!newAgendaItem.title) return;
    await persistAgenda([...agenda, { id: genId(), ...newAgendaItem } as AgendaItemDTO]);
    setNewAgendaItem({ title: "", duration_mins: 15, type: "presentation" });
    setShowAddAgenda(false);
  }
  async function removeAgendaItem(id: string) {
    await persistAgenda(agenda.filter(a => a.id !== id));
  }
  async function saveEditAgenda(id: string) {
    await persistAgenda(agenda.map(a => a.id === id ? { ...a, ...editAgendaForm } as AgendaItemDTO : a));
    setEditAgendaId(null);
  }

  // ── Poll CRUD ─────────────────────────────────────────────────
  async function createPoll() {
    if (!selected || !newPoll.question) return;
    const opts = newPoll.options.filter(o => o.trim());
    if (opts.length < 2) return;
    setCreatingPoll(true);
    const r = await sessionsApi.createPoll(selected.id, { question: newPoll.question, options: opts }).catch(() => null);
    if (r?.data) {
      const created = r.data!;
      await sessionsApi.activatePoll(selected.id, created.id).catch(() => {});
      setPolls(prev => [...prev.map(p => ({ ...p, is_active: false })), { ...created, is_active: true }]);
      const res = await sessionsApi.getPollResults(selected.id, created.id).catch(() => null);
      if (res?.data) setPollResults(res.data);
    }
    setNewPoll({ question: "", options: ["", ""] });
    setShowPollForm(false);
    setCreatingPoll(false);
    setActiveTool(null);
  }
  async function activatePoll(pollId: string) {
    if (!selected) return;
    await sessionsApi.activatePoll(selected.id, pollId).catch(() => {});
    setPolls(prev => prev.map(p => ({ ...p, is_active: p.id === pollId })));
    const r = await sessionsApi.getPollResults(selected.id, pollId).catch(() => null);
    if (r?.data) setPollResults(r.data);
  }
  async function deactivatePoll(pollId: string) {
    if (!selected) return;
    await sessionsApi.deactivatePoll(selected.id, pollId).catch(() => {});
    setPolls(prev => prev.map(p => p.id === pollId ? { ...p, is_active: false } : p));
    setPollResults(null);
  }

  // ── Breakout groups ───────────────────────────────────────────
  function randomizeGroups() {
    const shuffled = [...cohortParts].sort(() => Math.random() - 0.5);
    const groups = Array.from({ length: groupCount }, (_, i) => ({
      name: `Group ${i + 1}`,
      members: [] as { id: string; name: string }[],
    }));
    shuffled.forEach((p, i) => { groups[i % groupCount].members.push({ id: p.user_id, name: p.name }); });
    setBreakoutGroups(groups);
  }

  // ── Attendance ────────────────────────────────────────────────
  async function submitAttendance() {
    if (!selected) return;
    setSavingAtt(true);
    const entries = Object.entries(attMap).map(([user_id, status]) => ({ user_id, status }));
    await sessionsApi.markAttendance(selected.id, entries).catch(() => {});
    setSavingAtt(false);
  }

  // ── Action items ──────────────────────────────────────────────
  async function addActionItem() {
    if (!selected || !newAction.description) return;
    setSavingAction(true);
    const r = await sessionsApi.createActionItem(selected.id, {
      description: newAction.description,
      participant_id: newAction.participant_id || undefined,
      due_date: newAction.due_date || undefined,
    }).catch(() => null);
    if (r?.data) setActionItems(prev => [...prev, r.data!]);
    setNewAction({ description: "", participant_id: "", due_date: "" });
    setShowAddAction(false);
    setSavingAction(false);
  }
  async function toggleAction(item: ActionItemDTO) {
    if (!selected) return;
    const ns = item.status === "open" ? "completed" : "open";
    await sessionsApi.updateActionItem(selected.id, item.id, { status: ns }).catch(() => {});
    setActionItems(prev => prev.map(a => a.id === item.id ? { ...a, status: ns } : a));
  }

  // ── Session lifecycle ─────────────────────────────────────────
  async function startSession() {
    if (!selected) return;
    const r = await sessionsApi.start(selected.id).catch(() => null);
    if (r?.data) { setSelected(r.data); setSessions(prev => prev.map(s => s.id === r.data!.id ? r.data! : s)); }
  }
  async function endSession() {
    if (!selected) return;
    const r = await sessionsApi.end(selected.id).catch(() => null);
    if (r?.data) { setSelected(r.data); setSessions(prev => prev.map(s => s.id === r.data!.id ? r.data! : s)); }
  }

  // ── New session modal ─────────────────────────────────────────

  // ── List view ─────────────────────────────────────────────────
  if (!selected) {
    const filtered = filterStatus === "all" ? sessions : sessions.filter(s => s.status === filterStatus);
    // Assignments that don't have a matching session yet (activity_id not in sessions)
    const sessionActivityIds = new Set(sessions.map(s => (s as SessionDTO & {activity_id?:string}).activity_id).filter(Boolean));
    const pendingAssignments = assignments.filter(a => !sessionActivityIds.has(a.activity_id) && (a.activity_type === "live_session" || a.activity_type === "coaching"));
    const hasContent = filtered.length > 0 || pendingAssignments.length > 0;

    return (
      <div style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "var(--xa-text)", ...ff }}>My Sessions</div>
          <Btn variant="orange" onClick={() => setCreatingNew(true)}>+ Create Session</Btn>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {["all", "scheduled", "live", "completed", "cancelled"].map(st => (
            <button key={st} onClick={() => setFilterStatus(st)} style={{ ...ff, padding: "5px 14px", borderRadius: 20, border: `1.5px solid ${filterStatus===st?"var(--xa-primary)":"#E6DED0"}`, background: filterStatus===st?"rgba(200, 168, 96,0.08)":"#fff", color: filterStatus===st?"var(--xa-primary)":"#4A5573", fontSize: 11, fontWeight: filterStatus===st?700:500, cursor: "pointer", textTransform: "capitalize" }}>
              {st === "all" ? "All" : st}
            </button>
          ))}
        </div>
        {loadingList ? (
          <div style={{ textAlign: "center", padding: 48, color: "#4A5573", fontSize: 13, ...ff }}>Loading sessions…</div>
        ) : !hasContent ? (
          <EmptyState icon="📅" title="No sessions yet" sub="You haven't been assigned to any sessions. Your Program Manager will schedule sessions for you." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Scheduled class_sessions */}
            {filtered.map(s => {
              const col: Record<string,string> = { classroom: "var(--xa-text)", coaching_group: "#4A5573", coaching_individual: "var(--xa-primary)" };
              const c = col[s.session_type] ?? "#4A5573";
              const icon = s.session_type==="classroom"?"🏫":s.session_type==="coaching_group"?"👥":"🎯";
              const date = new Date(s.scheduled_at);
              return (
                <div key={s.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E6DED0", padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: c+"15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--xa-text)", ...ff }}>{s.title}</div>
                    <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: "#4A5573", ...ff }}>📅 {date.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})} at {date.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</span>
                      <span style={{ fontSize: 11, color: "#4A5573", ...ff }}>⏱ {s.duration_mins} min</span>
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                  <button onClick={() => openSession(s)} style={{ ...ff, fontSize: 12, fontWeight: 700, color: "var(--xa-text)", background: "#18284810", border: "none", borderRadius: 8, padding: "7px 16px", cursor: "pointer" }}>
                    Manage →
                  </button>
                </div>
              );
            })}
            {/* Activity assignments awaiting scheduling by PM */}
            {pendingAssignments.length > 0 && (
              <>
                {filtered.length > 0 && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#4A5573", letterSpacing: 0.5, marginTop: 8, ...ff }}>AWAITING SCHEDULE</div>
                )}
                {pendingAssignments.map(a => (
                  <div key={a.activity_id} style={{ background: "#fff", borderRadius: 12, border: "1px dashed #E6DED0", padding: "16px 20px", display: "flex", alignItems: "center", gap: 16, opacity: 0.85 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: "#4A557315", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>
                      {a.activity_type === "coaching" ? "🎯" : "🏫"}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "var(--xa-text)", ...ff }}>{a.activity_title}</div>
                      <div style={{ display: "flex", gap: 10, marginTop: 4, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, color: "#4A5573", ...ff }}>📚 {a.program_title}</span>
                        {a.cohort_name && <span style={{ fontSize: 11, color: "#4A5573", ...ff }}>· {a.cohort_name}</span>}
                        <span style={{ fontSize: 11, color: "#4A5573", fontWeight: 600, ...ff }}>{a.role}</span>
                      </div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,0.1)", borderRadius: 20, padding: "3px 10px", flexShrink: 0, ...ff }}>Awaiting Schedule</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

      {/* ── New Session Modal ──────────────────────────────────── */}
      {creatingNew && (
        <NewSessionPage
          enrollments={enrollments}
          onBack={() => setCreatingNew(false)}
          onCreated={async (s) => {
            setCreatingNew(false);
            await openSession(s);
          }}
        />
      )}
      </div>
    );
  }

  // ── Detail view loading ───────────────────────────────────────
  if (loadingDetail) return (
    <div style={{ padding: 40, textAlign: "center", color: "#4A5573", fontSize: 13, ...ff }}>Loading session…</div>
  );

  // ── Detail view ───────────────────────────────────────────────
  const cohortName = enrollments.find(e => e.cohort_id === selected.cohort_id)?.cohort_name ?? "Cohort";
  const totalAgendaMins = agenda.reduce((s, a) => s + a.duration_mins, 0);


  const tools: { id: "poll"|"breakout"|"timer"|"attendance"; icon: string; name: string; desc: string }[] = [
    { id: "poll",        icon: "▶", name: "Live Poll",       desc: "Launch a real-time poll" },
    { id: "breakout",    icon: "◎", name: "Breakout Groups", desc: `Randomize teams of ${groupCount}` },
    { id: "timer",       icon: "⏱", name: "Timer",           desc: "Session countdown" },
    { id: "attendance",  icon: "◉", name: "Attendance",      desc: "Mark participant attendance" },
  ];

  return (
    <div style={{ padding: 24, ...ff }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => setSelected(null)} style={{ ...ff, background: "transparent", border: "1.5px solid #E6DED0", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "#4A5573", cursor: "pointer" }}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--xa-text)" }}>Session: {selected.title}</div>
          <div style={{ fontSize: 11, color: "#4A5573", marginTop: 2 }}>
            {cohortName} · {new Date(selected.scheduled_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})} · {selected.duration_mins} min
          </div>
        </div>
        <StatusBadge status={selected.status} />
      </div>

      {/* Main two-column */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, marginBottom: 20 }}>

        {/* Agenda panel */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E6DED0", overflow: "hidden" }}>
          <div style={{ padding: "12px 20px", borderBottom: "1px solid #E6DED0" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#4A5573", letterSpacing: 1.5, textTransform: "uppercase" }}>Session Agenda</div>
          </div>
          {agenda.length === 0 && !showAddAgenda && (
            <div style={{ padding: "24px 20px", textAlign: "center", fontSize: 12, color: "#4A5573" }}>No agenda yet. Add time blocks below.</div>
          )}
          {agenda.map((item, idx) => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "1px solid #F7F5F0", background: idx % 2 === 0 ? "#fff" : "#FAFBFF" }}>
              <div style={{ width: 24, height: 24, borderRadius: "50%", background: agendaTypeColor[item.type]+"20", color: agendaTypeColor[item.type], display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, flexShrink: 0 }}>{idx + 1}</div>
              {editAgendaId === item.id ? (
                <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 80px 100px auto", gap: 6, alignItems: "center" }}>
                  <input style={{ ...inp, padding: "5px 8px", fontSize: 12 }} value={editAgendaForm.title} onChange={e => setEditAgendaForm(f => ({ ...f, title: e.target.value }))} />
                  <input type="number" style={{ ...inp, padding: "5px 8px", fontSize: 12 }} value={editAgendaForm.duration_mins} min={1} onChange={e => setEditAgendaForm(f => ({ ...f, duration_mins: Number(e.target.value) }))} />
                  <select style={{ ...sel, padding: "5px 8px", fontSize: 11 }} value={editAgendaForm.type} onChange={e => setEditAgendaForm(f => ({ ...f, type: e.target.value }))}>
                    {["presentation","discussion","activity","break","poll"].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <div style={{ display: "flex", gap: 4 }}>
                    <Btn small onClick={() => saveEditAgenda(item.id)} disabled={savingAgenda}>✓</Btn>
                    <Btn small variant="ghost" onClick={() => setEditAgendaId(null)}>✕</Btn>
                  </div>
                </div>
              ) : (
                <>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>{agendaTypeIcon[item.type] ?? "📌"}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "var(--xa-text)" }}>{item.title}</span>
                  <span style={{ fontSize: 11, color: "#4A5573", whiteSpace: "nowrap" }}>{item.duration_mins} min</span>
                  <button onClick={() => { setEditAgendaId(item.id); setEditAgendaForm({ title: item.title, duration_mins: item.duration_mins, type: item.type }); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#4A5573", padding: "0 4px" }}>✏</button>
                  <button onClick={() => removeAgendaItem(item.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#ef4444", padding: "0 4px" }}>✕</button>
                </>
              )}
            </div>
          ))}
          {showAddAgenda && (
            <div style={{ padding: "12px 20px", background: "#EFE9DC", borderBottom: "1px solid #E6DED0" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 110px", gap: 8, marginBottom: 8 }}>
                <input style={{ ...inp, padding: "7px 10px", fontSize: 12 }} value={newAgendaItem.title} onChange={e => setNewAgendaItem(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Welcome & Context Setting" autoFocus />
                <input type="number" style={{ ...inp, padding: "7px 10px", fontSize: 12 }} value={newAgendaItem.duration_mins} min={1} onChange={e => setNewAgendaItem(f => ({ ...f, duration_mins: Number(e.target.value) }))} />
                <select style={{ ...sel, padding: "7px 10px", fontSize: 11 }} value={newAgendaItem.type} onChange={e => setNewAgendaItem(f => ({ ...f, type: e.target.value }))}>
                  {["presentation","discussion","activity","break","poll"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
                <Btn small variant="ghost" onClick={() => setShowAddAgenda(false)}>Cancel</Btn>
                <Btn small onClick={addAgendaItem} disabled={savingAgenda || !newAgendaItem.title}>{savingAgenda ? "…" : "Add"}</Btn>
              </div>
            </div>
          )}
          <div style={{ padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={() => setShowAddAgenda(true)} style={{ ...ff, background: "transparent", border: "1.5px dashed #E6DED0", borderRadius: 8, padding: "6px 14px", fontSize: 11, fontWeight: 700, color: "#4A5573", cursor: "pointer" }}>+ Add Item</button>
            <span style={{ fontSize: 11, color: "#4A5573" }}>Total: <strong style={{ color: "var(--xa-text)" }}>{totalAgendaMins} min</strong></span>
          </div>
        </div>

        {/* Tools panel */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E6DED0", overflow: "hidden" }}>
          <div style={{ padding: "12px 20px", borderBottom: "1px solid #E6DED0" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#4A5573", letterSpacing: 1.5, textTransform: "uppercase" }}>Session Tools</div>
          </div>
          {tools.map(tool => (
            <div key={tool.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", borderBottom: "1px solid #F7F5F0" }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: activeTool===tool.id?"var(--xa-primary)":"#18284812", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: activeTool===tool.id?"#fff":"var(--xa-text)", flexShrink: 0 }}>
                {tool.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--xa-text)" }}>{tool.name}</div>
                <div style={{ fontSize: 10, color: "#4A5573", marginTop: 2 }}>{tool.desc}</div>
              </div>
              <button onClick={() => setActiveTool(activeTool === tool.id ? null : tool.id)}
                style={{ ...ff, fontSize: 11, fontWeight: 700, color: activeTool===tool.id?"var(--xa-primary)":"var(--xa-text)", background: activeTool===tool.id?"rgba(200, 168, 96,0.08)":"#F7F5F0", border: `1.5px solid ${activeTool===tool.id?"var(--xa-primary)":"#E6DED0"}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer" }}>
                {activeTool === tool.id ? "Close" : "Launch"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── POLL MODAL ──────────────────────────────────────────── */}
      {activeTool === "poll" && typeof document !== "undefined" && (() => {
        const canLaunch = !!newPoll.question && newPoll.options.filter(o => o.trim()).length >= 2;
        return ReactDOM.createPortal(
          <div onClick={() => setActiveTool(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.45)", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, ...ff }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 32px 80px rgba(24, 40, 72,0.28)" }}>

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "20px 24px", borderBottom: "1px solid #EFE9DC" }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: "#C8A86015", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--xa-primary)">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "var(--xa-text)" }}>Live Poll</div>
                  <div style={{ fontSize: 11, color: "#4A5573", marginTop: 2 }}>Launch a real-time poll to your cohort</div>
                </div>
                <button onClick={() => setActiveTool(null)} style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px solid #E6DED0", background: "#fff", cursor: "pointer", fontSize: 14, color: "#4A5573", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              </div>

              {/* Create form */}
              <div style={{ padding: "20px 24px 0" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#4A5573", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Poll Question</div>
                <input style={{ ...inp, marginBottom: 20, padding: "12px 14px" }} value={newPoll.question}
                  onChange={e => setNewPoll(f => ({ ...f, question: e.target.value }))}
                  placeholder="Type your question here..." />

                <div style={{ fontSize: 10, fontWeight: 700, color: "#4A5573", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Answer Options</div>
                {newPoll.options.map((opt, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#EFE9DC", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#4A5573", flexShrink: 0 }}>{i + 1}</div>
                    <input style={{ ...inp, flex: 1 }} value={opt}
                      onChange={e => { const o = [...newPoll.options]; o[i] = e.target.value; setNewPoll(f => ({ ...f, options: o })); }}
                      placeholder={`Option ${i + 1}`} />
                    {newPoll.options.length > 2 && (
                      <button onClick={() => setNewPoll(f => ({ ...f, options: f.options.filter((_, j) => j !== i) }))} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "#ef4444", padding: 0 }}>✕</button>
                    )}
                  </div>
                ))}
                {newPoll.options.length < 6 && (
                  <button onClick={() => setNewPoll(f => ({ ...f, options: [...f.options, ""] }))}
                    style={{ ...ff, background: "none", border: "none", padding: "0 0 16px", fontSize: 12, color: "#4A5573", cursor: "pointer", fontWeight: 600 }}>
                    + Add option
                  </button>
                )}

                {/* Response type */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "var(--xa-text)" }}>Response type:</span>
                  {(["single", "multiple"] as const).map(t => (
                    <button key={t} onClick={() => setPollResponseType(t)}
                      style={{ ...ff, border: `1.5px solid ${pollResponseType === t ? "var(--xa-primary)" : "#E6DED0"}`, background: pollResponseType === t ? "rgba(200, 168, 96,0.06)" : "#fff", color: pollResponseType === t ? "var(--xa-primary)" : "#4A5573", borderRadius: 20, padding: "6px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      {t === "single" ? "Single choice" : "Multiple choice"}
                    </button>
                  ))}
                </div>

                {/* Launch button */}
                <button onClick={createPoll} disabled={!canLaunch || creatingPoll}
                  style={{ ...ff, width: "100%", padding: "14px 0", background: canLaunch ? "var(--xa-primary)" : "#D1D5E4", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: canLaunch ? "pointer" : "not-allowed", marginBottom: 20 }}>
                  {creatingPoll ? "Launching…" : "Launch Poll →"}
                </button>
              </div>

              {/* Existing polls */}
              {polls.length > 0 && (
                <div style={{ borderTop: "1px solid #EFE9DC", padding: "16px 24px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--xa-text)", marginBottom: 12 }}>Previous Polls</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {polls.map(p => {
                      const isActive = p.is_active;
                      const results = pollResults?.poll_id === p.id ? pollResults : null;
                      return (
                        <div key={p.id} style={{ border: `1.5px solid ${isActive ? "var(--xa-primary)" : "#E6DED0"}`, borderRadius: 12, overflow: "hidden" }}>
                          <div style={{ padding: "10px 14px", background: isActive ? "rgba(200, 168, 96,0.04)" : "#EFE9DC", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--xa-text)" }}>{p.question}</div>
                              <div style={{ fontSize: 10, color: "#4A5573", marginTop: 2 }}>{p.options.length} options{isActive ? " · Live" : ""}</div>
                            </div>
                            {isActive
                              ? <Btn small variant="ghost" onClick={() => deactivatePoll(p.id)}>⏸ Pause</Btn>
                              : <Btn small variant="orange" onClick={() => activatePoll(p.id)}>▶ Activate</Btn>}
                          </div>
                          {results && (
                            <div style={{ padding: "10px 14px" }}>
                              <div style={{ fontSize: 10, color: "#4A5573", marginBottom: 8 }}>Live results · {results.total} votes</div>
                              {results.votes.map(v => {
                                const pct = results.total > 0 ? Math.round((v.count / results.total) * 100) : 0;
                                return (
                                  <div key={v.option_index} style={{ marginBottom: 6 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                      <span style={{ fontSize: 11, color: "var(--xa-text)" }}>{v.option}</span>
                                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--xa-primary)" }}>{pct}%</span>
                                    </div>
                                    <div style={{ height: 5, background: "#E6DED0", borderRadius: 3 }}>
                                      <div style={{ height: "100%", width: `${pct}%`, background: "var(--xa-primary)", borderRadius: 3, transition: "width 0.5s ease" }} />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>,
          document.body
        );
      })()}

      {/* ── BREAKOUT GROUPS MODAL ───────────────────────────────── */}
      {activeTool === "breakout" && typeof document !== "undefined" && ReactDOM.createPortal(
        <div onClick={() => setActiveTool(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.45)", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, ...ff }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 32px 80px rgba(24, 40, 72,0.28)" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "20px 24px", borderBottom: "1px solid #EFE9DC" }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "#EFE9DC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4A5573" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--xa-text)" }}>Breakout Groups</div>
                <div style={{ fontSize: 11, color: "#4A5573", marginTop: 2 }}>Split participants into randomized groups</div>
              </div>
              <button onClick={() => setActiveTool(null)} style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px solid #E6DED0", background: "#fff", cursor: "pointer", fontSize: 14, color: "#4A5573", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            {/* Config */}
            <div style={{ padding: "20px 24px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#4A5573", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>Number of Groups</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                {[2,3,4,5,6,8].map(n => (
                  <button key={n} onClick={() => setGroupCount(n)}
                    style={{ ...ff, width: 44, height: 44, borderRadius: 10, border: `1.5px solid ${groupCount===n?"var(--xa-primary)":"#E6DED0"}`, background: groupCount===n?"rgba(200, 168, 96,0.06)":"#fff", color: groupCount===n?"var(--xa-primary)":"var(--xa-text)", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    {n}
                  </button>
                ))}
              </div>
              {cohortParts.length > 0 && (
                <div style={{ fontSize: 11, color: "#4A5573", marginBottom: 20 }}>~{Math.ceil(cohortParts.length / groupCount)} participants per group</div>
              )}

              <div style={{ fontSize: 10, fontWeight: 700, color: "#4A5573", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>Duration</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
                {[5,10,15,20,30].map(m => (
                  <button key={m} onClick={() => setBreakoutDuration(m)}
                    style={{ ...ff, borderRadius: 10, border: `1.5px solid ${breakoutDuration===m?"var(--xa-primary)":"#E6DED0"}`, background: breakoutDuration===m?"rgba(200, 168, 96,0.06)":"#fff", color: breakoutDuration===m?"var(--xa-primary)":"var(--xa-text)", fontSize: 13, fontWeight: 600, padding: "8px 16px", cursor: "pointer" }}>
                    {m} min
                  </button>
                ))}
              </div>

              {cohortParts.length === 0 ? (
                <div style={{ textAlign: "center", padding: "12px 0", fontSize: 12, color: "#4A5573", marginBottom: 16 }}>No participants found for this cohort.</div>
              ) : (
                <button onClick={() => { randomizeGroups(); }}
                  style={{ ...ff, width: "100%", padding: "14px 0", background: "var(--xa-primary)", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer", marginBottom: breakoutGroups.length > 0 ? 20 : 0 }}>
                  Start Breakout →
                </button>
              )}

              {/* Generated groups */}
              {breakoutGroups.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                  {breakoutGroups.map(g => (
                    <div key={g.name} style={{ background: "#EFE9DC", borderRadius: 10, border: "1px solid #E6DED0", padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "var(--xa-primary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>{g.name}</div>
                      {g.members.map(m => (
                        <div key={m.id} style={{ fontSize: 12, color: "var(--xa-text)", marginBottom: 5, display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#18284815", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "var(--xa-text)", flexShrink: 0 }}>
                            {m.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0,2)}
                          </div>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── ATTENDANCE MODAL ─────────────────────────────────────── */}
      {activeTool === "attendance" && typeof document !== "undefined" && (() => {
        const sessionCode = selected.id.replace(/-/g, "").slice(0, 6).toUpperCase();
        const joinUrl = `xa-lms.app/join/${sessionCode}`;
        const qrData = encodeURIComponent(`https://${joinUrl}`);
        const presentCount = Object.values(attMap).filter(v => v === "present").length;
        const total = cohortParts.length;
        const pct = total > 0 ? Math.round((presentCount / total) * 100) : 0;
        return ReactDOM.createPortal(
          <div onClick={() => setActiveTool(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.45)", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, ...ff }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 720, maxHeight: "90vh", overflow: "hidden", boxShadow: "0 32px 80px rgba(24, 40, 72,0.28)", display: "flex", flexDirection: "column" }}>

              {/* Modal header */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 24px", borderBottom: "1px solid #EFE9DC" }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "#22c55e15", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
                    <rect x="14" y="14" width="2" height="2"/><rect x="19" y="14" width="2" height="2"/><rect x="14" y="19" width="2" height="2"/><rect x="19" y="19" width="2" height="2"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "var(--xa-text)" }}>Attendance</div>
                  <div style={{ fontSize: 11, color: "#4A5573", marginTop: 2 }}>QR-based real-time check-in</div>
                </div>
                <button onClick={() => setActiveTool(null)} style={{ marginLeft: "auto", width: 32, height: 32, borderRadius: "50%", border: "1.5px solid #E6DED0", background: "#fff", cursor: "pointer", fontSize: 14, color: "#4A5573", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              </div>

              {/* Body */}
              <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", flex: 1, overflow: "hidden" }}>

                {/* Left - QR */}
                <div style={{ padding: "24px 20px", borderRight: "1px solid #EFE9DC", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, background: "#FAFBFF" }}>
                  <div style={{ borderRadius: 14, overflow: "hidden", border: "1.5px solid #E6DED0", background: "#fff", padding: 10 }}>
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${qrData}&color=182848&bgcolor=ffffff&margin=0`}
                      alt="QR code"
                      width={160}
                      height={160}
                      style={{ display: "block" }}
                    />
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <span style={{ fontSize: 12, color: "#4A5573" }}>Session Code: </span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: "var(--xa-primary)", letterSpacing: 2 }}>{sessionCode}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
                    <div style={{ flex: 1, background: "#EFE9DC", borderRadius: 8, padding: "7px 10px", fontSize: 10, color: "#4A5573", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {joinUrl}
                    </div>
                    <button onClick={() => navigator.clipboard.writeText(`https://${joinUrl}`)}
                      style={{ ...ff, background: "var(--xa-primary)", color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                      Copy
                    </button>
                  </div>
                </div>

                {/* Right - Participant list */}
                <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <div style={{ padding: "18px 22px 12px", flexShrink: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "var(--xa-text)" }}>Attendance</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>
                        <span style={{ color: "#22c55e" }}>{presentCount}/{total}</span>
                        <span style={{ color: "#22c55e", fontSize: 11 }}> ({pct}%)</span>
                      </span>
                    </div>
                    <div style={{ height: 5, background: "#EFE9DC", borderRadius: 3 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: "#22c55e", borderRadius: 3, transition: "width 0.4s ease" }} />
                    </div>
                  </div>

                  {total === 0 ? (
                    <div style={{ padding: "24px", textAlign: "center", fontSize: 12, color: "#4A5573" }}>No participants found.</div>
                  ) : (
                    <div style={{ overflowY: "auto", flex: 1 }}>
                      {cohortParts.map(p => {
                        const status = attMap[p.user_id] ?? "waiting";
                        const isPresent = status === "present";
                        return (
                          <div key={p.user_id}
                            onClick={() => setAttMap(m => ({ ...m, [p.user_id]: isPresent ? "absent" : "present" }))}
                            style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 22px", borderBottom: "1px solid #F7F5F0", cursor: "pointer", background: isPresent ? "rgba(34,197,94,0.04)" : "#fff", transition: "background 0.15s" }}>
                            <div style={{ width: 10, height: 10, borderRadius: "50%", background: isPresent ? "#22c55e" : "#D1D5E4", flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "var(--xa-text)" }}>{p.name}</span>
                            <span style={{ fontSize: 12, fontWeight: isPresent ? 700 : 400, color: isPresent ? "#22c55e" : "#4A5573" }}>
                              {isPresent ? "✓ Present" : "Waiting"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: "14px 24px", borderTop: "1px solid #EFE9DC", flexShrink: 0 }}>
                <button onClick={async () => { await submitAttendance(); setActiveTool(null); }} disabled={savingAtt}
                  style={{ ...ff, width: "100%", padding: "14px 0", background: "var(--xa-primary)", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: savingAtt ? "not-allowed" : "pointer", opacity: savingAtt ? 0.7 : 1 }}>
                  {savingAtt ? "Saving…" : "Save Attendance Record"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* ── TIMER MODAL ──────────────────────────────────────────── */}
      {activeTool === "timer" && typeof document !== "undefined" && ReactDOM.createPortal(
        <div onClick={() => { if (!timerRunning) setActiveTool(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.45)", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, ...ff }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 480, boxShadow: "0 32px 80px rgba(24, 40, 72,0.28)" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "20px 24px", borderBottom: "1px solid #EFE9DC" }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "#EFE9DC", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#4A5573" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "var(--xa-text)" }}>Timer</div>
                <div style={{ fontSize: 11, color: "#4A5573", marginTop: 2 }}>Set a visible countdown for your participants</div>
              </div>
              <button onClick={() => { setTimerRunning(false); setTimerRemaining(0); setActiveTool(null); }}
                style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px solid #E6DED0", background: "#fff", cursor: "pointer", fontSize: 14, color: "#4A5573", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* Running countdown */}
              {timerRunning || timerRemaining > 0 ? (
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                  <div style={{ fontSize: 64, fontWeight: 800, color: timerRemaining <= 60 ? "var(--xa-primary)" : "var(--xa-text)", letterSpacing: -3, lineHeight: 1, marginBottom: 8 }}>
                    {String(Math.floor(timerRemaining / 60)).padStart(2, "0")}:{String(timerRemaining % 60).padStart(2, "0")}
                  </div>
                  {timerRemaining === 0 && <div style={{ fontSize: 13, fontWeight: 700, color: "#22c55e" }}>Time is up! ✓</div>}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#4A5573", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>Preset Duration</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                    {[1,5,10,15,20,30,45,60].map(m => (
                      <button key={m} onClick={() => { setTimerMins(m); setTimerRemaining(0); setTimerCustom(""); }}
                        style={{ ...ff, borderRadius: 10, border: `1.5px solid ${timerMins===m && !timerCustom?"var(--xa-primary)":"#E6DED0"}`, background: timerMins===m && !timerCustom?"rgba(200, 168, 96,0.06)":"#fff", color: timerMins===m && !timerCustom?"var(--xa-primary)":"var(--xa-text)", fontSize: 12, fontWeight: 600, padding: "8px 14px", cursor: "pointer" }}>
                        {m} min
                      </button>
                    ))}
                  </div>

                  <div style={{ fontSize: 10, fontWeight: 700, color: "#4A5573", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Custom (Minutes)</div>
                  <input
                    type="number" min={1} max={240}
                    style={{ ...inp, marginBottom: 20 }}
                    value={timerCustom}
                    onChange={e => { setTimerCustom(e.target.value); if (e.target.value) setTimerMins(Number(e.target.value)); }}
                    placeholder="e.g. 25"
                  />
                </>
              )}

              {/* Visible toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
                <button onClick={() => setTimerVisible(v => !v)}
                  style={{ width: 44, height: 24, borderRadius: 12, background: timerVisible ? "#3B82F6" : "#D1D5E4", border: "none", cursor: "pointer", position: "relative", flexShrink: 0, transition: "background 0.2s" }}>
                  <div style={{ position: "absolute", top: 2, left: timerVisible ? 22 : 2, width: 20, height: 20, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.15)" }} />
                </button>
                <span style={{ fontSize: 13, color: "var(--xa-text)", fontWeight: 500 }}>Visible to all participants</span>
              </div>

              {/* Action buttons */}
              {timerRunning ? (
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setTimerRunning(false)} style={{ ...ff, flex: 1, padding: "14px 0", background: "#EFE9DC", color: "var(--xa-text)", border: "none", borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>⏸ Pause</button>
                  <button onClick={() => { setTimerRunning(false); setTimerRemaining(0); }}
                    style={{ ...ff, padding: "14px 20px", background: "#fff", color: "#4A5573", border: "1.5px solid #E6DED0", borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Reset</button>
                </div>
              ) : timerRemaining > 0 ? (
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setTimerRunning(true)} style={{ ...ff, flex: 1, padding: "14px 0", background: "var(--xa-primary)", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>▶ Resume →</button>
                  <button onClick={() => { setTimerRunning(false); setTimerRemaining(0); }}
                    style={{ ...ff, padding: "14px 20px", background: "#fff", color: "#4A5573", border: "1.5px solid #E6DED0", borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Reset</button>
                </div>
              ) : (
                <button onClick={() => { const mins = timerCustom ? Number(timerCustom) : timerMins; if (mins < 1) return; setTimerMins(mins); setTimerRemaining(mins * 60); setTimerRunning(true); }}
                  style={{ ...ff, width: "100%", padding: "14px 0", background: "var(--xa-primary)", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                  Start Timer →
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}



      {/* ── SESSION LIFECYCLE BUTTON ─────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        {selected.status === "scheduled" && (
          <button onClick={startSession} style={{ ...ff, width: "100%", padding: "16px 0", background: "var(--xa-primary)", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer", letterSpacing: 0.5 }}>
            ▶ Start Live Session
          </button>
        )}
        {selected.status === "live" && (
          <button onClick={endSession} style={{ ...ff, width: "100%", padding: "16px 0", background: "var(--xa-sidebar)", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
            ◼ End Session
          </button>
        )}
        {selected.status === "completed" && (
          <div style={{ width: "100%", padding: "14px 0", background: "#22c55e15", border: "1.5px solid #22c55e30", borderRadius: 12, textAlign: "center", fontSize: 13, fontWeight: 700, color: "#22c55e" }}>
            Session Completed ✓
          </div>
        )}
        {selected.status === "cancelled" && (
          <div style={{ width: "100%", padding: "14px 0", background: "#ef444415", border: "1.5px solid #ef444430", borderRadius: 12, textAlign: "center", fontSize: 13, fontWeight: 700, color: "#ef4444" }}>
            Session Cancelled
          </div>
        )}
      </div>

      {/* ── PRE-SESSION REMINDER TOGGLE ─────────────────────────── */}
      {selected.status === "scheduled" && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E6DED0", padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--xa-text)" }}>Pre-session Reminder</div>
            <div style={{ fontSize: 11, color: "#4A5573", marginTop: 2 }}>Notify participants 24 h before this session</div>
          </div>
          <div onClick={async () => {
            const next = !selected.reminder_enabled;
            setSelected(prev => prev ? { ...prev, reminder_enabled: next } : prev);
            await sessionsApi.update(selected.id, { reminder_enabled: next }).catch(() => {
              setSelected(prev => prev ? { ...prev, reminder_enabled: !next } : prev);
            });
          }}
            style={{ width: 42, height: 22, borderRadius: 22, background: selected.reminder_enabled ? "#22c55e" : "#C9BFA8", position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0 }}>
            <div style={{ position: "absolute", top: 3, left: selected.reminder_enabled ? 22 : 3, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
          </div>
        </div>
      )}

      {/* ── POST-SESSION PANEL ───────────────────────────────────── */}
      {(selected.status === "live" || selected.status === "completed") && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 20 }}>

          {/* Notes */}
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E6DED0", padding: "18px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--xa-text)" }}>Session Notes</div>
              {savingNotes && <span style={{ fontSize: 10, color: "#22c55e" }}>Saving…</span>}
            </div>
            <textarea
              style={{ ...ta, minHeight: 140, background: "#FAFBFF", border: "1.5px solid #E6DED0" }}
              value={sessionNotes}
              onChange={e => handleNotesChange(e.target.value)}
              placeholder="Observations, key takeaways, follow-up topics…"
            />
          </div>

          {/* Participant Reflections - AI placeholder - wire to AI provider later */}
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E6DED0", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #E6DED0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--xa-text)" }}>Participant Reflections</div>
              <span style={{ fontSize: 10, fontWeight: 700, color: "#4A5573", background: "rgba(74, 85, 115,0.1)", borderRadius: 20, padding: "3px 9px" }}>Coming Soon</span>
            </div>
            <div style={{ padding: "32px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>✍️</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--xa-text)", marginBottom: 6 }}>No reflections yet</div>
              <div style={{ fontSize: 11, color: "#4A5573", lineHeight: 1.6 }}>
                Participant reflection submissions will appear here once the participant-side reflection feature is live.
              </div>
            </div>
          </div>

          {/* Action Items */}
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #E6DED0", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #E6DED0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--xa-text)" }}>Action Items</div>
              <Btn small variant="orange" onClick={() => setShowAddAction(true)}>+ Add</Btn>
            </div>
            {showAddAction && (
              <div style={{ padding: "12px 20px", background: "#EFE9DC", borderBottom: "1px solid #E6DED0" }}>
                <Field label="Description"><input style={inp} value={newAction.description} onChange={e => setNewAction(f => ({ ...f, description: e.target.value }))} placeholder="Follow up with participant on…" autoFocus /></Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Assign to (optional)">
                    <select style={sel} value={newAction.participant_id} onChange={e => setNewAction(f => ({ ...f, participant_id: e.target.value }))}>
                      <option value="">- Whole cohort -</option>
                      {cohortParts.map(p => <option key={p.user_id} value={p.user_id}>{p.name}</option>)}
                    </select>
                  </Field>
                  <Field label="Due Date (optional)"><input type="date" style={inp} value={newAction.due_date} onChange={e => setNewAction(f => ({ ...f, due_date: e.target.value }))} /></Field>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <Btn small variant="ghost" onClick={() => setShowAddAction(false)}>Cancel</Btn>
                  <Btn small onClick={addActionItem} disabled={savingAction || !newAction.description}>{savingAction ? "…" : "Save"}</Btn>
                </div>
              </div>
            )}
            <div style={{ maxHeight: 240, overflowY: "auto" }}>
              {actionItems.length === 0 && !showAddAction ? (
                <div style={{ padding: "20px", textAlign: "center", fontSize: 12, color: "#4A5573" }}>No action items yet.</div>
              ) : actionItems.map(item => {
                const completed = item.status === "completed";
                const assignee = cohortParts.find(p => p.user_id === item.participant_id);
                return (
                  <div key={item.id} style={{ display: "flex", gap: 10, padding: "11px 20px", borderBottom: "1px solid #F7F5F0", alignItems: "flex-start" }}>
                    <button onClick={() => toggleAction(item)} style={{ marginTop: 2, width: 16, height: 16, borderRadius: 4, border: `2px solid ${completed?"#22c55e":"#E6DED0"}`, background: completed?"#22c55e":"transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {completed && <span style={{ color: "#fff", fontSize: 9, fontWeight: 800 }}>✓</span>}
                    </button>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: completed?"#4A5573":"var(--xa-text)", textDecoration: completed?"line-through":"none" }}>{item.description}</div>
                      <div style={{ fontSize: 10, color: "#4A5573", marginTop: 2, display: "flex", gap: 8 }}>
                        {assignee && <span>👤 {assignee.name}</span>}
                        {item.due_date && <span>📅 {item.due_date}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Full-page session creation form - replaces the old popup modal.
// After creation, onCreated receives the newly created SessionDTO so
// the caller can navigate directly to the Session Management detail view.
function NewSessionPage({ enrollments, onBack, onCreated }: {
  enrollments: MyEnrollmentDTO[];
  onBack: () => void;
  onCreated: (s: SessionDTO) => void;
}) {
  const [form, setForm] = useState({
    title: "", description: "", session_type: "classroom",
    cohort_id: enrollments[0]?.cohort_id ?? "",
    program_id: enrollments[0]?.program_id ?? "",
    scheduled_at: "", duration_mins: 60, virtual_link: "",
    meeting_type: "external_link" as "in_person" | "external_link" | "zoom_embedded",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // Zoom-embedded flow only: the session must exist (have an id) before a
  // meeting can be created against it. Untouched for in_person/external_link.
  // Zoom credentials are org-level (Superadmin-configured S2S credentials -
  // see api/internal/zoom/org_credentials.go), not per-user, so there is no
  // "connect your account" step here: the join link is created automatically
  // against the org's Zoom account. If the org hasn't configured Zoom yet,
  // createZoomMeeting() surfaces that as a clear error below.
  const [createdSession, setCreatedSession] = useState<SessionDTO | null>(null);
  const [zoomMeeting, setZoomMeeting] = useState<ZoomMeetingDTO | null>(null);
  const [zoomCreating, setZoomCreating] = useState(false);
  const [zoomErr, setZoomErr] = useState("");

  function set(k: string, v: string | number) { setForm(f => ({ ...f, [k]: v })); }

  async function submit() {
    if (!form.title || !form.scheduled_at || !form.cohort_id) {
      setErr("Title, date/time, and cohort are required");
      return;
    }
    setSaving(true); setErr("");
    try {
      const r = await sessionsApi.create({
        program_id: form.program_id, cohort_id: form.cohort_id,
        title: form.title, description: form.description || undefined,
        session_type: form.session_type,
        virtual_link: form.meeting_type === "external_link" ? (form.virtual_link || undefined) : undefined,
        meeting_type: form.meeting_type,
        scheduled_at: new Date(form.scheduled_at).toISOString(),
        duration_mins: Number(form.duration_mins),
      });
      if (r.data) {
        if (form.meeting_type === "zoom_embedded") {
          // Stay on this screen so the user can create the Zoom meeting
          // against the now-saved session before continuing.
          setCreatedSession(r.data);
        } else {
          onCreated(r.data);
        }
      }
    } catch (e: unknown) { setErr((e as Error).message ?? "Failed to create session"); }
    finally { setSaving(false); }
  }

  async function createZoomMeeting() {
    if (!createdSession) return;
    setZoomCreating(true); setZoomErr("");
    try {
      const r = await zoomApi.createMeeting(createdSession.id, {
        topic: createdSession.title,
        start_time: new Date(createdSession.scheduled_at).toISOString(),
        duration_minutes: createdSession.duration_mins,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      if (r.data) setZoomMeeting(r.data);
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 422) {
        setZoomErr("Zoom isn't configured for your organization yet. Ask your Super Admin to set it up in Integrations, then try again.");
      } else {
        setErr((e as Error).message ?? "Failed to create Zoom meeting");
      }
    } finally { setZoomCreating(false); }
  }

  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)", ...ff }}>
        {/* Modal Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid #E6DED0" }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--xa-text)" }}>New Session</div>
            <div style={{ fontSize: 11, color: "#4A5573", marginTop: 2 }}>Configure your session and open the management studio</div>
          </div>
          <button onClick={onBack} style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px solid #E6DED0", background: "#F7F5F0", cursor: "pointer", fontSize: 16, color: "#4A5573", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
        </div>

        {/* Modal Body */}
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          {err && <div style={{ background: "rgba(200, 168, 96,0.08)", border: "1px solid rgba(200, 168, 96,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "var(--xa-primary)", fontWeight: 600 }}>{err}</div>}

          <Field label="Session Title">
            <input style={inp} value={form.title} autoFocus onChange={e => set("title", e.target.value)} placeholder="e.g. Strategic Leadership - Module 3" />
          </Field>
          <Field label="Session Type">
            <select style={sel} value={form.session_type} onChange={e => set("session_type", e.target.value)}>
              <option value="classroom">🏫 Classroom</option>
              <option value="coaching_group">👥 Coaching Group</option>
              <option value="coaching_individual">🎯 Coaching Individual</option>
            </select>
          </Field>
          {enrollments.length > 1 && (
            <Field label="Cohort">
              <select style={sel} value={form.cohort_id} onChange={e => {
                const en = enrollments.find(x => x.cohort_id === e.target.value);
                setForm(f => ({ ...f, cohort_id: e.target.value, program_id: en?.program_id ?? f.program_id }));
              }}>
                {enrollments.map(en => <option key={en.enrollment_id} value={en.cohort_id}>{en.cohort_name} - {en.program_title}</option>)}
              </select>
            </Field>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <Field label="Date & Time">
              <input type="datetime-local" style={inp} value={form.scheduled_at} onChange={e => set("scheduled_at", e.target.value)} />
            </Field>
            <Field label="Duration (mins)">
              <input type="number" style={inp} value={form.duration_mins} min={15} step={15} onChange={e => set("duration_mins", e.target.value)} />
            </Field>
          </div>
          <Field label="Description (optional)">
            <textarea style={{ ...inp, minHeight: 72 } as React.CSSProperties} value={form.description} onChange={e => set("description", e.target.value)} placeholder="What will participants learn or do in this session?" />
          </Field>
          <Field label="Meeting Type">
            <select style={sel} value={form.meeting_type} disabled={!!createdSession} onChange={e => set("meeting_type", e.target.value)}>
              <option value="in_person">🏢 In Person</option>
              <option value="external_link">🔗 External Link</option>
              <option value="zoom_embedded">🎥 Zoom (auto-generated link)</option>
            </select>
          </Field>
          {form.meeting_type === "external_link" && (
            <Field label="Video Conferencing Link (optional)">
              <input style={inp} value={form.virtual_link} onChange={e => set("virtual_link", e.target.value)} placeholder="https://zoom.us/j/…" />
            </Field>
          )}
          {form.meeting_type === "zoom_embedded" && (
            <Field label="Zoom Meeting">
              {!createdSession && (
                <div style={{ fontSize: 11, color: "#4A5573" }}>Save the session first, then create the Zoom meeting below.</div>
              )}
              {createdSession && !zoomMeeting && (
                <Btn variant="ghost" onClick={createZoomMeeting} disabled={zoomCreating}>
                  {zoomCreating ? "Creating meeting…" : "Create Zoom Meeting"}
                </Btn>
              )}
              {zoomErr && (
                <div style={{ marginTop: 8, fontSize: 11, color: "var(--xa-primary)", fontWeight: 600 }}>{zoomErr}</div>
              )}
              {zoomMeeting && (
                <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
                  <input style={{ ...inp, background: "#F7F5F0" }} value={zoomMeeting.join_url} readOnly />
                  <Btn variant="ghost" disabled>✓ Zoom Meeting Created</Btn>
                </div>
              )}
            </Field>
          )}
        </div>

        {/* Modal Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 24px", borderTop: "1px solid #E6DED0" }}>
          <Btn variant="ghost" onClick={onBack}>Cancel</Btn>
          {createdSession ? (
            <Btn variant="orange" onClick={() => onCreated(createdSession)}>
              Continue →
            </Btn>
          ) : (
            <Btn variant="orange" onClick={submit} disabled={saving}>
              {saving ? "Creating…" : "Create & Open Studio →"}
            </Btn>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ══════════════════════════════════════════════════════════════════
// GRADING QUEUE TAB
// ══════════════════════════════════════════════════════════════════

// FacultyGrading - a clean master-detail grading workspace. The left rail is
// the queue (auto-loaded, faculty-wide) filtered by Pending / Graded; the right
// pane is the selected attempt's rubric detail. Objective questions are
// auto-scored and locked; faculty only award points on open questions.
function FacultyGrading({ enrollments: _enrollments }: { enrollments: MyEnrollmentDTO[] }) {
  const [filter, setFilter] = useState<"pending_review" | "graded">("pending_review");
  const [queue, setQueue] = useState<GradingQueueItemDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    gradingApi.queue(filter)
      .then(r => {
        const items = r.data ?? [];
        setQueue(items);
        setSelectedId(prev => (prev && items.some(i => i.attempt_id === prev)) ? prev : (items[0]?.attempt_id ?? null));
      })
      .catch(() => { setQueue([]); setSelectedId(null); })
      .finally(() => setLoading(false));
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const selected = queue.find(i => i.attempt_id === selectedId) ?? null;

  return (
    <div style={{ padding: 24, ...ff }}>
      <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 16, alignItems: "start" }}>
        {/* ── Left rail: queue ── */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E6DED0", boxShadow: "0 1px 4px rgba(24, 40, 72,0.06)", overflow: "hidden" }}>
          <div style={{ padding: 12, borderBottom: "1px solid #E6DED0", display: "flex", gap: 6 }}>
            {([["pending_review", "Pending"], ["graded", "Graded"]] as const).map(([id, label]) => {
              const on = filter === id;
              return (
                <button key={id} onClick={() => setFilter(id)} style={{
                  ...ff, flex: 1, padding: "7px 0", borderRadius: 8, fontSize: 12, cursor: "pointer",
                  fontWeight: on ? 700 : 500, background: on ? "var(--xa-sidebar)" : "#F7F5F0",
                  color: on ? "#fff" : "#4A5573", border: "none",
                }}>{label}</button>
              );
            })}
          </div>
          {loading ? (
            <div style={{ padding: 32, textAlign: "center", color: "#4A5573", fontSize: 12 }}>Loading…</div>
          ) : queue.length === 0 ? (
            <div style={{ padding: "40px 20px", textAlign: "center" }}>
              <div style={{ fontSize: 26, marginBottom: 8, opacity: 0.4 }}>{filter === "pending_review" ? "✓" : "-"}</div>
              <div style={{ fontSize: 12, color: "#4A5573", lineHeight: 1.6 }}>
                {filter === "pending_review" ? "Nothing waiting to be graded." : "No graded work yet."}
              </div>
            </div>
          ) : (
            <div style={{ maxHeight: "calc(100vh - 220px)", overflowY: "auto" }}>
              {queue.map(item => {
                const on = item.attempt_id === selectedId;
                return (
                  <button key={item.attempt_id} onClick={() => setSelectedId(item.attempt_id)} style={{
                    ...ff, display: "block", width: "100%", textAlign: "left", cursor: "pointer",
                    padding: "12px 16px", borderBottom: "1px solid #EFE9DC", background: on ? "rgba(200, 168, 96,0.05)" : "#fff",
                    borderLeft: `3px solid ${on ? "var(--xa-primary)" : "transparent"}`, borderTop: "none", borderRight: "none",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--xa-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.participant}</span>
                      {item.status === "graded"
                        ? <span style={{ fontSize: 12, fontWeight: 800, color: "#22c55e", flexShrink: 0 }}>{Math.round(item.score_pct)}%</span>
                        : <span style={{ fontSize: 9, fontWeight: 700, color: "var(--xa-primary)", background: "rgba(200, 168, 96,0.1)", borderRadius: 20, padding: "2px 7px", flexShrink: 0 }}>NEW</span>}
                    </div>
                    <div style={{ fontSize: 11, color: "#4A5573", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.activity_title}</div>
                    <div style={{ fontSize: 10, color: "#4A5573", marginTop: 3 }}>{new Date(item.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Right pane: detail ── */}
        {selected ? (
          <GradingPanel key={selected.attempt_id} item={selected} readOnly={selected.status === "graded"} onGraded={load} />
        ) : (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E6DED0", boxShadow: "0 1px 4px rgba(24, 40, 72,0.06)", padding: "60px 24px", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.25 }}>📝</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--xa-text)", marginBottom: 6 }}>
              {loading ? "Loading grading queue…" : queue.length === 0 ? "You're all caught up" : "Select a submission to grade"}
            </div>
            <div style={{ fontSize: 12, color: "#4A5573", maxWidth: 360, margin: "0 auto", lineHeight: 1.6 }}>
              {queue.length === 0
                ? "When participants submit assessments with open-ended answers, they'll appear here for review."
                : "Pick a participant from the queue on the left to see their answers and award marks."}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// GradingPanel is the right-side detail: the participant header, each question
// with its answer (objective locked/pre-scored, open with a marks input + a
// comment), a live running total, and the submit action.
function GradingPanel({ item, readOnly, onGraded }: { item: GradingQueueItemDTO; readOnly: boolean; onGraded: () => void }) {
  const attemptId = item.attempt_id;
  const [detail, setDetail] = useState<GradingDetailDTO | null>(null);
  const [awards, setAwards] = useState<Record<string, { points: number; comment: string }>>({});
  const [overall, setOverall] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancel = false;
    setDetail(null); setErr("");
    gradingApi.detail(attemptId).then(r => {
      if (cancel || !r.data) return;
      setDetail(r.data);
      const seed: Record<string, { points: number; comment: string }> = {};
      r.data.questions.filter(q => !q.is_objective).forEach(q => { seed[q.id] = { points: q.points_earned || 0, comment: q.comment || "" }; });
      setAwards(seed);
      setOverall(r.data.faculty_comment || "");
    }).catch(() => setErr("Failed to load submission"));
    return () => { cancel = true; };
  }, [attemptId]);

  const card: React.CSSProperties = { background: "#fff", borderRadius: 12, border: "1px solid #E6DED0", boxShadow: "0 1px 4px rgba(24, 40, 72,0.06)" };

  if (err) return <div style={{ ...card, padding: 24, color: "#ef4444", fontSize: 13 }}>{err}</div>;
  if (!detail) return <div style={{ ...card, padding: 40, color: "#4A5573", fontSize: 13, textAlign: "center" }}>Loading submission…</div>;

  const objective = detail.questions.filter(q => q.is_objective).reduce((s, q) => s + (q.points_earned || 0), 0);
  const open = detail.questions.filter(q => !q.is_objective).reduce((s, q) => s + (awards[q.id]?.points || 0), 0);
  const earned = objective + open;
  const pct = detail.max_score > 0 ? Math.round((earned / detail.max_score) * 100) : 0;
  const openCount = detail.questions.filter(q => !q.is_objective).length;

  function setAward(qid: string, points: number, comment: string, max: number) {
    const clamped = Math.max(0, Math.min(points, max));
    setAwards(a => ({ ...a, [qid]: { points: clamped, comment } }));
  }

  async function submit() {
    setSaving(true); setErr("");
    try {
      const scores = detail!.questions.filter(q => !q.is_objective).map(q => ({
        question_id: q.id, points_earned: awards[q.id]?.points || 0, comment: awards[q.id]?.comment || "",
      }));
      await gradingApi.grade(attemptId, { scores, comment: overall });
      onGraded();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Failed to submit grade");
    } finally { setSaving(false); }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header */}
      <div style={{ ...card, padding: "16px 20px", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--xa-sidebar)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
          {item.participant.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: "var(--xa-text)" }}>{item.participant}</div>
          <div style={{ fontSize: 12, color: "#4A5573", marginTop: 2 }}>
            {item.activity_title} · {item.program} · Submitted {new Date(item.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        </div>
        {readOnly && <span style={{ fontSize: 20, fontWeight: 800, color: "#22c55e" }}>{pct}%</span>}
      </div>

      {/* Questions */}
      <div style={{ ...card, padding: "6px 20px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0 6px" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--xa-text)" }}>Answers &amp; Scoring</span>
          <span style={{ fontSize: 11, color: "#4A5573" }}>{openCount} open · {detail.questions.length - openCount} auto-scored</span>
        </div>
        {detail.questions.map((q, i) => (
          <GradingQuestionRow key={q.id} q={q} idx={i} readOnly={readOnly}
            award={awards[q.id]} onChange={(pts, cmt) => setAward(q.id, pts, cmt, q.points)} />
        ))}
      </div>

      {/* Total + submit */}
      <div style={{ ...card, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "#F7F5F0", borderRadius: 10 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--xa-text)" }}>Total Score</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: "var(--xa-text)" }}>{earned} / {detail.max_score}<span style={{ fontSize: 13, color: "#4A5573", fontWeight: 600 }}> · {pct}%</span></span>
        </div>
        {readOnly ? (
          detail.faculty_comment ? (
            <div style={{ fontSize: 12, color: "var(--xa-text)", background: "#F7F5F0", borderRadius: 8, padding: "10px 12px", lineHeight: 1.6 }}>
              <span style={{ fontWeight: 700 }}>Feedback: </span>{detail.faculty_comment}
            </div>
          ) : null
        ) : (
          <>
            <Field label="Overall feedback (optional)">
              <textarea style={{ ...ta, minHeight: 56 }} value={overall} onChange={e => setOverall(e.target.value)} placeholder="Summary comment sent to the participant…" />
            </Field>
            {err && <div style={{ color: "#ef4444", fontSize: 12, fontWeight: 600 }}>{err}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Btn onClick={submit} disabled={saving}>{saving ? "Submitting…" : "Submit Grade & Notify Participant"}</Btn>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function GradingQuestionRow({ q, idx, readOnly, award, onChange }: {
  q: GradingQuestionDTO; idx: number; readOnly: boolean;
  award?: { points: number; comment: string }; onChange: (pts: number, cmt: string) => void;
}) {
  const selectedOption = q.selected_index != null && q.options ? q.options[q.selected_index] : undefined;
  const correctOption = q.correct_index != null && q.options ? q.options[q.correct_index] : undefined;
  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid #E6DED0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--xa-text)", ...ff }}>Q{idx + 1}. {q.text}</span>
        <span style={{ fontSize: 10, fontWeight: 700, color: "#4A5573", whiteSpace: "nowrap", ...ff }}>
          {q.is_objective ? "AUTO" : "OPEN"} · {q.points} pt
        </span>
      </div>
      {q.is_objective ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, ...ff }}>
          <span style={{ fontSize: 12, color: q.is_correct ? "#22c55e" : "#ef4444", fontWeight: 700 }}>
            {q.is_correct ? "✓ Correct" : "✗ Incorrect"}
          </span>
          {selectedOption !== undefined && <span style={{ fontSize: 11, color: "#4A5573" }}>Chose: {selectedOption}</span>}
          {!q.is_correct && correctOption !== undefined && <span style={{ fontSize: 11, color: "#4A5573" }}>· Correct: {correctOption}</span>}
          <span style={{ marginLeft: "auto", fontSize: 12, fontWeight: 700, color: "var(--xa-text)" }}>{q.points_earned} / {q.points}</span>
        </div>
      ) : (
        <div>
          <div style={{ fontSize: 12, color: "var(--xa-text)", lineHeight: 1.7, background: "#fff", border: "1px solid #E6DED0", borderRadius: 8, padding: "10px 12px", marginBottom: 8, whiteSpace: "pre-wrap", ...ff }}>
            {q.selected_text || <span style={{ color: "#4A5573", fontStyle: "italic" }}>No answer provided</span>}
          </div>
          {readOnly ? (
            <div style={{ fontSize: 12, ...ff }}>
              <span style={{ fontWeight: 700, color: "var(--xa-text)" }}>Awarded: {q.points_earned} / {q.points}</span>
              {q.comment && <span style={{ color: "#4A5573" }}> · {q.comment}</span>}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: 10, alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="number" min={0} max={q.points} step={0.5} value={award?.points ?? 0}
                  onChange={e => onChange(Number(e.target.value), award?.comment ?? "")}
                  style={{ ...inp, width: 64, textAlign: "center", padding: "6px 8px" }} />
                <span style={{ fontSize: 11, color: "#4A5573", ...ff }}>/ {q.points}</span>
              </div>
              <input value={award?.comment ?? ""} onChange={e => onChange(award?.points ?? 0, e.target.value)}
                placeholder="Comment (optional)" style={{ ...inp, padding: "6px 10px" }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// COACHING TAB
// ══════════════════════════════════════════════════════════════════

// A program the faculty is assigned to coach in, with its resolved cohort
interface CoachingProgram {
  program_id: string;
  program_title: string;
  cohort_id: string;
  cohort_name: string;
}

// Maps a "fac-coach-*" sidebar id (nav-config.ts's FACULTY_COACHING_GROUP_CHILDREN)
// to the internal key used below to pick which coach panel to render. "fac-coaching"
// itself (My Coaching) has no entry here — it renders the personal tracker instead.
const COACH_SUBTAB_BY_SIDEBAR_ID: Record<string, "coach-engagements" | "coach-calendar" | "coach-notes" | "coach-outline" | "coach-docs"> = {
  "fac-coach-engagements": "coach-engagements",
  "fac-coach-calendar":    "coach-calendar",
  "fac-coach-notes":       "coach-notes",
  "fac-coach-outline":     "coach-outline",
  "fac-coach-docs":        "coach-docs",
};

function FacultyCoaching({ userId, activeSubPage, onNavigate }: { userId: string; activeSubPage: string; onNavigate: (id: string) => void }) {
  const { user } = useAuth();
  // A faculty account additionally granted the "coach" persona (via PM/
  // superadmin role assignment) gets the coach dashboard's tabs surfaced
  // here as nested sub-tabs of the sidebar's "Coaching" group (see
  // nav-config.ts) — reusing the SAME data and components the standalone
  // /dashboard/coach page uses, duplicated (not shared) so this never
  // touches that page's own code path.
  const isAlsoCoach = hasRole(user, "coach");
  // Which nested view to show — driven entirely by which sidebar sub-tab is
  // active, not an in-page tab bar. Faculty without the coach grant only
  // ever reach this component via "fac-coaching", so this is always null
  // (mainTab "my-coaching") for them.
  const coachSubTab = COACH_SUBTAB_BY_SIDEBAR_ID[activeSubPage] ?? null;
  const mainTab: "my-coaching" | "coach-workspace" = coachSubTab ? "coach-workspace" : "my-coaching";
  const [coachSummary, setCoachSummary] = useState<CoachSummaryDTO | null>(null);
  const [coachEngagements, setCoachEngagements] = useState<CoachingEngagementDTO[]>([]);
  const [coachSessions, setCoachSessions] = useState<CoachSessionDTO[]>([]);
  const [coachActions, setCoachActions] = useState<CoachActionDTO[]>([]);
  const [coachDataLoading, setCoachDataLoading] = useState(true);

  useEffect(() => {
    if (!isAlsoCoach) return;
    let active = true;
    (async () => {
      setCoachDataLoading(true);
      try {
        const [sum, eng, sess, act] = await Promise.all([
          coachApi.summary(),
          coachApi.engagements(),
          coachApi.upcomingSessions(),
          coachApi.pendingActions(),
        ]);
        if (!active) return;
        setCoachSummary(sum.data);
        setCoachEngagements(eng.data ?? []);
        setCoachSessions(sess.data ?? []);
        setCoachActions(act.data ?? []);
      } catch {
        // Leave defaults; screens render their empty states.
      } finally {
        if (active) setCoachDataLoading(false);
      }
    })();
    return () => { active = false; };
  }, [isAlsoCoach]);

  const [loadingPrograms, setLoadingPrograms]         = useState(true);
  const [coachingPrograms, setCoachingPrograms]       = useState<CoachingProgram[]>([]);
  const [selectedProgramId, setSelectedProgramId]     = useState<string>("");
  const [loading, setLoading]                         = useState(false);
  const [kpi, setKpi]                                 = useState<CoachingKPIDTO | null>(null);
  const [participants, setParticipants]               = useState<CoachingParticipantDTO[]>([]);
  const [trackers, setTrackers]                       = useState<Record<string, CoachingTrackerDTO>>({});
  const [selectedParticipant, setSelectedParticipant] = useState<CoachingParticipantDTO | null>(null);
  const [view, setView]                               = useState<"tracker" | "notes" | "goals" | "devnote">("tracker");

  // Per-participant detail state
  const [sessions, setSessions]     = useState<SessionDTO[]>([]);
  const [notes, setNotes]           = useState<CoachingNoteDTO[]>([]);
  const [goals, setGoals]           = useState<GoalDTO[]>([]);
  const [devNotes, setDevNotes]     = useState<DevNoteDTO[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);

  // Note form state
  const [selectedSession, setSelectedSession] = useState("");
  const [noteForm, setNoteForm]   = useState({ notes: "", is_private: false });
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteForm, setEditNoteForm]   = useState({ notes: "", is_private: false });

  // Goal form state
  const [showGoalForm, setShowGoalForm] = useState(false);
  const [goalForm, setGoalForm]         = useState({ title: "", description: "", pm_can_view: false });

  // Dev note form state
  const [devNoteForm, setDevNoteForm]       = useState({ content: "", pm_can_view: false });
  const [editingDevNoteId, setEditingDevNoteId] = useState<string | null>(null);
  const [editDevNoteForm, setEditDevNoteForm]   = useState({ content: "", pm_can_view: false });

  const [saving, setSaving] = useState(false);

  // Step 1 — load programs this faculty is assigned to coach in.
  // Only for plain faculty (no coach grant): a faculty account additionally
  // holding the coach persona gets its "My Coaching" participants from their
  // actual coaching_engagements below instead (same people as "My
  // Engagements"), not from every participant enrolled in a cohort they
  // happen to teach.
  useEffect(() => {
    if (isAlsoCoach) { setLoadingPrograms(false); return; }
    if (!userId) return;
    setLoadingPrograms(true);
    programsApi.getFacultyAssignments(userId)
      .then(async r => {
        const assignments = r.data ?? [];
        // Deduplicate by program_id, keeping unique programs
        const seen = new Set<string>();
        const unique: { program_id: string; program_title: string; cohort_id?: string; cohort_name?: string }[] = [];
        for (const a of assignments) {
          if (!seen.has(a.program_id)) {
            seen.add(a.program_id);
            unique.push({ program_id: a.program_id, program_title: a.program_title, cohort_id: a.cohort_id, cohort_name: a.cohort_name });
          }
        }
        // For any assignment without a cohort, resolve one
        const resolved: (CoachingProgram | null)[] = await Promise.all(
          unique.map(async u => {
            if (u.cohort_id) return { program_id: u.program_id, program_title: u.program_title, cohort_id: u.cohort_id, cohort_name: u.cohort_name ?? "" };
            // Try to find cohort via programs API
            const pRes = await programsApi.get(u.program_id).catch(() => null);
            if (pRes?.data?.org_id) {
              const cRes = await cohortsApi.list(pRes.data.org_id, u.program_id).catch(() => null);
              const c = cRes?.data?.[0];
              if (c) return { program_id: u.program_id, program_title: u.program_title, cohort_id: c.id, cohort_name: c.name };
            }
            return null;
          })
        );
        const valid = resolved.filter((x): x is CoachingProgram => x !== null && x !== undefined && !!x.cohort_id);
        setCoachingPrograms(valid);
        if (valid.length > 0) setSelectedProgramId(valid[0].program_id);
      })
      .catch(() => {})
      .finally(() => setLoadingPrograms(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Step 2 — load participants for the selected program's cohort. Skipped
  // for a coach-granted faculty account (see Step 1's comment above and the
  // coach-engagement-scoped effect below).
  useEffect(() => {
    if (isAlsoCoach) return;
    const prog = coachingPrograms.find(p => p.program_id === selectedProgramId);
    if (!prog) { setParticipants([]); setTrackers({}); setKpi(null); return; }
    setLoading(true);
    setSelectedParticipant(null);
    setParticipants([]);
    setTrackers({});
    Promise.all([
      coachingApi.listParticipants(prog.cohort_id).catch(() => ({ data: [] as CoachingParticipantDTO[] })),
      coachingApi.getKPI(prog.cohort_id).catch(() => ({ data: null })),
    ]).then(async ([pRes, kpiRes]) => {
      const ps: CoachingParticipantDTO[] = pRes?.data ?? [];
      setParticipants(ps);
      setKpi(kpiRes?.data ?? null);
      const entries = await Promise.all(
        ps.map(p => coachingApi.getTracker(p.user_id).then(r => [p.user_id, r.data] as const).catch(() => null))
      );
      const map: Record<string, CoachingTrackerDTO> = {};
      entries.forEach(e => { if (e && e[1]) map[e[0]] = e[1]; });
      setTrackers(map);
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProgramId, coachingPrograms]);

  // Coach-granted faculty: "My Coaching" tracks the SAME people as "My
  // Engagements" (their actual assigned coachees via coaching_engagements),
  // not every participant enrolled in a cohort they happen to teach as
  // faculty. coachEngagements is already fetched above (the isAlsoCoach
  // effect powering the Coach Workspace tabs); this just re-derives a
  // deduplicated participant list from it for the tracker UI.
  useEffect(() => {
    if (!isAlsoCoach) return;
    setLoading(true);
    const seen = new Map<string, CoachingParticipantDTO>();
    for (const eng of coachEngagements) {
      for (const p of eng.participants) {
        if (!seen.has(p.id)) seen.set(p.id, { user_id: p.id, name: p.name, email: p.email ?? "" });
      }
    }
    const list = Array.from(seen.values());
    setParticipants(list);
    if (list.length === 0) { setTrackers({}); setKpi(null); setLoading(false); return; }
    Promise.all(
      list.map(p => coachingApi.getTracker(p.user_id).then(r => [p.user_id, r.data] as const).catch(() => null))
    ).then(entries => {
      const map: Record<string, CoachingTrackerDTO> = {};
      entries.forEach(e => { if (e && e[1]) map[e[0]] = e[1]; });
      setTrackers(map);
      const vals = Object.values(map);
      setKpi({
        total_participants: list.length,
        sessions_done: vals.reduce((s, t) => s + t.sessions_done, 0),
        actions_pending: vals.reduce((s, t) => s + t.actions_pending, 0),
        avg_goal_progress_pct: vals.length ? vals.reduce((s, t) => s + t.follow_through_pct, 0) / vals.length : 0,
      });
    }).finally(() => setLoading(false));
  }, [isAlsoCoach, coachEngagements]);

  // Load sessions list (for note selector)
  useEffect(() => {
    sessionsApi.list().then(r => setSessions(r.data ?? [])).catch(() => {});
  }, []);

  // Load participant detail data when selected or view changes
  useEffect(() => {
    if (!selectedParticipant) return;
    setLoadingDetail(true);
    const pid = selectedParticipant.user_id;
    const loads: Promise<any>[] = [];
    if (view === "notes") loads.push(coachingApi.listByParticipant(pid).then(r => setNotes(r.data ?? [])).catch(() => {}));
    if (view === "goals") loads.push(coachingApi.listGoals(pid).then(r => setGoals(r.data ?? [])).catch(() => {}));
    if (view === "devnote") loads.push(coachingApi.listDevNotes(pid).then(r => setDevNotes(r.data ?? [])).catch(() => {}));
    Promise.all(loads).finally(() => setLoadingDetail(false));
  }, [selectedParticipant, view]);

  function selectParticipant(p: CoachingParticipantDTO) {
    setSelectedParticipant(p); setView("notes"); setNotes([]); setGoals([]); setDevNotes([]);
    setNoteForm({ notes: "", is_private: false }); setEditingNoteId(null);
  }

  // ── Session Notes ──────────────────────────────────────────────
  async function saveNote() {
    if (!selectedParticipant || !selectedSession || !noteForm.notes.trim()) return;
    setSaving(true);
    try {
      const r = await coachingApi.createNote({ session_id: selectedSession, participant_id: selectedParticipant.user_id, ...noteForm });
      if (r.data) setNotes(prev => [r.data!, ...prev]);
      setNoteForm({ notes: "", is_private: false }); setSelectedSession("");
    } catch {} finally { setSaving(false); }
  }

  async function updateNote(id: string) {
    setSaving(true);
    try {
      const r = await coachingApi.updateNote(id, editNoteForm);
      if (r.data) setNotes(prev => prev.map(n => n.id === id ? r.data! : n));
      setEditingNoteId(null);
    } catch {} finally { setSaving(false); }
  }

  // ── Goals ──────────────────────────────────────────────────────
  async function createGoal() {
    if (!selectedParticipant || !goalForm.title.trim()) return;
    setSaving(true);
    try {
      const r = await coachingApi.createGoal({ participant_id: selectedParticipant.user_id, title: goalForm.title, description: goalForm.description || undefined, pm_can_view: goalForm.pm_can_view });
      if (r.data) setGoals(prev => [r.data!, ...prev]);
      setGoalForm({ title: "", description: "", pm_can_view: false }); setShowGoalForm(false);
    } catch {} finally { setSaving(false); }
  }

  async function cycleGoalStatus(g: GoalDTO) {
    const next = g.status === "active" ? "completed" : g.status === "completed" ? "dropped" : "active";
    const r = await coachingApi.updateGoal(g.id, { status: next });
    if (r.data) setGoals(prev => prev.map(x => x.id === g.id ? r.data! : x));
  }

  // ── Dev Notes ──────────────────────────────────────────────────
  async function saveDevNote() {
    if (!selectedParticipant || !devNoteForm.content.trim()) return;
    setSaving(true);
    try {
      const r = await coachingApi.createDevNote({ participant_id: selectedParticipant.user_id, ...devNoteForm });
      if (r.data) setDevNotes(prev => [r.data!, ...prev]);
      setDevNoteForm({ content: "", pm_can_view: false });
    } catch {} finally { setSaving(false); }
  }

  async function updateDevNote(id: string) {
    setSaving(true);
    try {
      const r = await coachingApi.updateDevNote(id, editDevNoteForm);
      if (r.data) setDevNotes(prev => prev.map(d => d.id === id ? r.data! : d));
      setEditingDevNoteId(null);
    } catch {} finally { setSaving(false); }
  }

  const fmtDate = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const goalStatusColor: Record<string, string> = { active: "#4A5573", completed: "#22c55e", dropped: "#4A5573" };

  // ── KPI Cards ─────────────────────────────────────────────────
  const kpiCards = [
    { label: "Participants",       value: kpi ? String(kpi.total_participants) : "-", sub: "Active this cohort",      color: "var(--xa-text)" },
    { label: "Sessions Done",      value: kpi ? String(kpi.sessions_done)      : "-", sub: "of planned",              color: "var(--xa-primary)" },
    { label: "Actions Pending",    value: kpi ? String(kpi.actions_pending)    : "-", sub: "Across all participants",  color: "#f59e0b" },
    { label: "Avg Goal Progress",  value: kpi ? `${Math.round(kpi.avg_goal_progress_pct)}%` : "-", sub: "Across all goals", color: "#22c55e" },
  ];

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>

      {mainTab === "my-coaching" && (
      <>
      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        {kpiCards.map(k => (
          <div key={k.label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E6DED0", padding: "18px 20px", boxShadow: "0 1px 4px rgba(24, 40, 72,0.07)" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#4A5573", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8, ...ff }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: k.color, ...ff }}>{loading ? "-" : k.value}</div>
            <div style={{ fontSize: 11, color: "#4A5573", marginTop: 4, ...ff }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* AI COACHING PULSE - static placeholder, wire to AI provider later */}
      <div style={{ background: "linear-gradient(135deg,var(--xa-sidebar),#2d3a7c)", borderRadius: 12, padding: "14px 20px", display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ background: "rgba(200, 168, 96,0.2)", borderRadius: 8, padding: "4px 10px", fontSize: 10, fontWeight: 700, color: "var(--xa-primary)", letterSpacing: 0.5, whiteSpace: "nowrap", ...ff }}>AI COACHING PULSE</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", ...ff }}>
          {/* AI placeholder - wire to AI provider later */}
          AI insights will appear here once connected to the coaching AI engine. Select participants to track progress manually.
        </div>
      </div>

      {/* Main content: Tracker list + right panel */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16, alignItems: "start" }}>

        {/* Left: Individual Coaching Tracker */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E6DED0", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #E6DED0" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "var(--xa-text)", ...ff }}>Individual Coaching Tracker</div>
              {loadingPrograms && <span style={{ fontSize: 11, color: "#4A5573", ...ff }}>Loading programs…</span>}
            </div>
          </div>
          {(loadingPrograms || loading) ? (
            <div style={{ padding: 40, textAlign: "center", color: "#4A5573", fontSize: 13, ...ff }}>Loading…</div>
          ) : !isAlsoCoach && (!selectedProgramId || coachingPrograms.length === 0) ? (
            <EmptyState icon="📋" title="No programs assigned" sub="You will appear here once assigned to a coaching activity in a program" />
          ) : participants.length === 0 ? (
            <EmptyState icon="👥" title={isAlsoCoach ? "No coaching engagements yet" : "No participants yet"}
              sub={isAlsoCoach ? "Participants appear once a Program Manager assigns you a coaching engagement" : "Participants appear once enrolled in this program's cohort"} />
          ) : (
            <div>
              {participants.map(p => {
                const t = trackers[p.user_id];
                const isSelected = selectedParticipant?.user_id === p.user_id;
                return (
                  <div key={p.user_id} onClick={() => selectParticipant(p)}
                    style={{ padding: "14px 20px", borderBottom: "1px solid #E6DED0", cursor: "pointer", background: isSelected ? "#F7F5F0" : "#fff", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--xa-text)", marginBottom: 6, ...ff }}>{p.name}</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, background: "#4A557315", color: "#4A5573", borderRadius: 20, padding: "2px 9px", ...ff }}>{t ? t.goals_set : "-"} Goals Set</span>
                        {t && t.actions_pending > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 700, background: "#f59e0b15", color: "#f59e0b", borderRadius: 20, padding: "2px 9px", ...ff }}>{t.actions_pending} Actions Pending</span>
                        )}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, color: "#4A5573", ...ff }}>{t ? t.sessions_done : "-"} sessions completed</div>
                        {t && <div style={{ fontSize: 10, color: "#22c55e", fontWeight: 600, ...ff }}>{Math.round(t.follow_through_pct)}% follow-through</div>}
                      </div>
                      <span style={{ fontSize: 13, color: "#4A5573", fontWeight: 700, ...ff }}>View →</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: AI Coaching Insight Engine placeholder + ALS Workspace */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* AI placeholder - wire to AI provider later */}
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E6DED0", padding: "16px 20px" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "var(--xa-primary)", letterSpacing: 0.5, marginBottom: 12, ...ff }}>+ Coaching Insight Engine</div>
            {selectedParticipant ? (
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--xa-text)", marginBottom: 12, ...ff }}>Post-Session Insights - {selectedParticipant.name}</div>
                {/* AI placeholder - wire to AI provider later */}
                <div style={{ padding: "10px 14px", background: "#F7F5F0", borderRadius: 8, fontSize: 12, color: "#4A5573", ...ff }}>
                  AI-generated insights will appear here once the coaching AI engine is connected. Session notes and goals are being saved correctly.
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: "#4A5573", ...ff }}>Select a participant to view coaching insights.</div>
            )}
          </div>
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E6DED0", padding: "16px 20px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--xa-text)", marginBottom: 12, ...ff }}>ALS Workspace</div>
            <div style={{ fontSize: 12, color: "#4A5573", ...ff }}>Group workspace functionality coming soon.</div>
          </div>
        </div>
      </div>

      {/* Participant detail panel */}
      {selectedParticipant && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E6DED0", overflow: "hidden" }}>
          {/* Header */}
          <div style={{ padding: "14px 20px", borderBottom: "1px solid #E6DED0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--xa-text)", ...ff }}>
              {selectedParticipant.name}
              <span style={{ fontSize: 11, color: "#4A5573", fontWeight: 400, marginLeft: 8 }}>{selectedParticipant.email}</span>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {(["notes", "goals", "devnote"] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  style={{ ...ff, fontSize: 11, fontWeight: 700, padding: "5px 14px", borderRadius: 8, cursor: "pointer", border: "1px solid",
                    background: view === v ? "var(--xa-sidebar)" : "#fff",
                    color: view === v ? "#fff" : "#4A5573",
                    borderColor: view === v ? "var(--xa-text)" : "#E6DED0",
                  }}>
                  {v === "notes" ? "Session Notes" : v === "goals" ? "Goals" : "Dev Notes"}
                </button>
              ))}
              <button onClick={() => setSelectedParticipant(null)} style={{ ...ff, background: "transparent", border: "1px solid #E6DED0", borderRadius: 8, padding: "5px 10px", fontSize: 11, cursor: "pointer", color: "#4A5573" }}>✕</button>
            </div>
          </div>

          <div style={{ padding: "20px" }}>
            {loadingDetail ? <div style={{ textAlign: "center", padding: 32, color: "#4A5573", fontSize: 13, ...ff }}>Loading…</div> : (

              /* ── SESSION NOTES ── */
              view === "notes" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* Add note form */}
                  <div style={{ background: "#F7F5F0", borderRadius: 10, padding: "14px 16px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#4A5573", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10, ...ff }}>Add Session Note</div>
                    <Field label="Session">
                      <select style={sel} value={selectedSession} onChange={e => setSelectedSession(e.target.value)}>
                        <option value="">- Select session -</option>
                        {sessions.map(s => <option key={s.id} value={s.id}>{s.title} ({fmtDate(s.scheduled_at)})</option>)}
                      </select>
                    </Field>
                    <Field label="Notes">
                      <textarea style={ta} value={noteForm.notes} onChange={e => setNoteForm(f => ({ ...f, notes: e.target.value }))} placeholder={`Observations for ${selectedParticipant.name}…`} />
                    </Field>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--xa-text)", fontWeight: 600, cursor: "pointer", ...ff }}>
                        <input type="checkbox" checked={noteForm.is_private} onChange={e => setNoteForm(f => ({ ...f, is_private: e.target.checked }))} />
                        🔒 Mark Private
                      </label>
                      <Btn onClick={saveNote} disabled={saving || !selectedSession || !noteForm.notes.trim()}>{saving ? "Saving…" : "Save Notes"}</Btn>
                    </div>
                  </div>
                  {/* Notes list */}
                  {notes.length === 0 ? <EmptyState icon="📝" title="No notes yet" sub="Add your first session note above" /> : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {notes.map((note, idx) => (
                        <div key={note.id} style={{ borderRadius: 10, border: `1px solid ${note.is_private ? "#4A557330" : "#E6DED0"}`, padding: "14px 16px" }}>
                          {editingNoteId === note.id ? (
                            <>
                              <textarea style={ta} value={editNoteForm.notes} onChange={e => setEditNoteForm(f => ({ ...f, notes: e.target.value }))} />
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--xa-text)", cursor: "pointer", ...ff }}>
                                  <input type="checkbox" checked={editNoteForm.is_private} onChange={e => setEditNoteForm(f => ({ ...f, is_private: e.target.checked }))} /> 🔒 Private
                                </label>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <Btn variant="ghost" onClick={() => setEditingNoteId(null)}>Cancel</Btn>
                                  <Btn onClick={() => updateNote(note.id)} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                                <div>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: "#4A5573", ...ff }}>Session {idx + 1} · {fmtDate(note.created_at)}</span>
                                  {note.is_private && <span style={{ marginLeft: 8, fontSize: 10, color: "#4A5573", fontWeight: 700, background: "#4A557315", padding: "2px 8px", borderRadius: 20, ...ff }}>🔒 Private</span>}
                                </div>
                                <button onClick={() => { setEditingNoteId(note.id); setEditNoteForm({ notes: note.notes, is_private: note.is_private }); }}
                                  style={{ ...ff, background: "transparent", border: "1px solid #E6DED0", borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer", color: "#4A5573" }}>Edit</button>
                              </div>
                              <div style={{ fontSize: 13, color: "var(--xa-text)", lineHeight: 1.65, ...ff }}>{note.notes}</div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )

              /* ── GOALS ── */
              : view === "goals" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "flex", justifyContent: "flex-end" }}>
                    <Btn variant="orange" onClick={() => setShowGoalForm(v => !v)}>+ Add Goal</Btn>
                  </div>
                  {showGoalForm && (
                    <div style={{ background: "#F7F5F0", borderRadius: 10, padding: "14px 16px" }}>
                      <Field label="Goal Title"><input style={inp} value={goalForm.title} onChange={e => setGoalForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Improve stakeholder communication" /></Field>
                      <Field label="Description (optional)"><textarea style={{ ...ta, minHeight: 60 }} value={goalForm.description} onChange={e => setGoalForm(f => ({ ...f, description: e.target.value }))} /></Field>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--xa-text)", fontWeight: 600, cursor: "pointer", ...ff }}>
                          <input type="checkbox" checked={goalForm.pm_can_view} onChange={e => setGoalForm(f => ({ ...f, pm_can_view: e.target.checked }))} />
                          Visible to Program Manager
                        </label>
                        <div style={{ display: "flex", gap: 8 }}>
                          <Btn variant="ghost" onClick={() => setShowGoalForm(false)}>Cancel</Btn>
                          <Btn onClick={createGoal} disabled={saving || !goalForm.title.trim()}>{saving ? "Saving…" : "Save Goal"}</Btn>
                        </div>
                      </div>
                    </div>
                  )}
                  {goals.length === 0 && !showGoalForm ? <EmptyState icon="🎯" title="No goals yet" sub="Set a goal for this participant" /> : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {goals.map(g => (
                        <div key={g.id} style={{ borderRadius: 10, border: "1px solid #E6DED0", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--xa-text)", marginBottom: 4, ...ff }}>{g.title}</div>
                            {g.description && <div style={{ fontSize: 12, color: "#4A5573", marginBottom: 6, ...ff }}>{g.description}</div>}
                            <div style={{ display: "flex", gap: 8 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "2px 9px", background: `${goalStatusColor[g.status]}15`, color: goalStatusColor[g.status], ...ff, textTransform: "capitalize" }}>{g.status}</span>
                              {g.pm_can_view && <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "2px 9px", background: "#18284815", color: "var(--xa-text)", ...ff }}>PM visible</span>}
                            </div>
                          </div>
                          <button onClick={() => cycleGoalStatus(g)}
                            style={{ ...ff, fontSize: 11, background: "transparent", border: "1px solid #E6DED0", borderRadius: 6, padding: "3px 10px", cursor: "pointer", color: "#4A5573" }}>
                            {g.status === "active" ? "Mark Done" : g.status === "completed" ? "Drop" : "Reopen"}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )

              /* ── DEV NOTES (private) ── */
              : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ background: "#f59e0b10", border: "1px solid #f59e0b30", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#92400e", ...ff }}>
                    🔒 Development notes are private to you by default. Toggle "Visible to PM" to grant the Program Manager read-only access.
                  </div>
                  <div style={{ background: "#F7F5F0", borderRadius: 10, padding: "14px 16px" }}>
                    <Field label="Development Note">
                      <textarea style={ta} value={devNoteForm.content} onChange={e => setDevNoteForm(f => ({ ...f, content: e.target.value }))} placeholder={`Private notes about ${selectedParticipant.name}…`} />
                    </Field>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--xa-text)", fontWeight: 600, cursor: "pointer", ...ff }}>
                        <input type="checkbox" checked={devNoteForm.pm_can_view} onChange={e => setDevNoteForm(f => ({ ...f, pm_can_view: e.target.checked }))} />
                        Visible to Program Manager
                      </label>
                      <Btn onClick={saveDevNote} disabled={saving || !devNoteForm.content.trim()}>{saving ? "Saving…" : "Save Note"}</Btn>
                    </div>
                  </div>
                  {devNotes.length === 0 ? <EmptyState icon="🔐" title="No development notes" sub="Private notes saved here persist across sessions" /> : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {devNotes.map(d => (
                        <div key={d.id} style={{ borderRadius: 10, border: "1px solid #E6DED0", padding: "14px 16px" }}>
                          {editingDevNoteId === d.id ? (
                            <>
                              <textarea style={ta} value={editDevNoteForm.content} onChange={e => setEditDevNoteForm(f => ({ ...f, content: e.target.value }))} />
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--xa-text)", cursor: "pointer", ...ff }}>
                                  <input type="checkbox" checked={editDevNoteForm.pm_can_view} onChange={e => setEditDevNoteForm(f => ({ ...f, pm_can_view: e.target.checked }))} /> Visible to PM
                                </label>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <Btn variant="ghost" onClick={() => setEditingDevNoteId(null)}>Cancel</Btn>
                                  <Btn onClick={() => updateDevNote(d.id)} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                                <div style={{ display: "flex", gap: 8 }}>
                                  <span style={{ fontSize: 10, color: "#4A5573", ...ff }}>{fmtDate(d.created_at)}</span>
                                  {d.pm_can_view && <span style={{ fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "2px 8px", background: "#18284815", color: "var(--xa-text)", ...ff }}>PM visible</span>}
                                </div>
                                <button onClick={() => { setEditingDevNoteId(d.id); setEditDevNoteForm({ content: d.content, pm_can_view: d.pm_can_view }); }}
                                  style={{ ...ff, background: "transparent", border: "1px solid #E6DED0", borderRadius: 6, padding: "3px 10px", fontSize: 11, cursor: "pointer", color: "#4A5573" }}>Edit</button>
                              </div>
                              <div style={{ fontSize: 13, color: "var(--xa-text)", lineHeight: 1.65, ...ff }}>{d.content}</div>
                            </>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      )}
      </>
      )}

      {/* Coach Workspace sub-tabs — now genuine sidebar entries (see
          nav-config.ts's FACULTY_COACHING_GROUP_CHILDREN / Sidebar.tsx),
          only reachable by a faculty account also holding the "coach"
          persona. Duplicated content from /dashboard/coach's tabs (see
          components/coach/CoachEngagements.tsx and the already-standalone
          CoachCalendar/CoachSessionNotes/CoachProgramOutline/CoachDocuments)
          — the coach role's own page and components are untouched. */}
      {isAlsoCoach && mainTab === "coach-workspace" && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E6DED0", overflow: "hidden" }}>
          {coachSubTab === "coach-engagements" && (
            <CoachEngagementsPanel
              engagements={coachEngagements}
              sessions={coachSessions}
              loading={coachDataLoading}
              onNavigate={(id) => {
                const target = id === "coach-notes" ? "fac-coach-notes"
                  : id === "coach-calendar" ? "fac-coach-calendar"
                  : id;
                onNavigate(target);
              }}
            />
          )}
          {coachSubTab === "coach-calendar" && <CoachCalendar />}
          {coachSubTab === "coach-notes" && <CoachSessionNotes />}
          {coachSubTab === "coach-outline" && <CoachProgramOutline />}
          {coachSubTab === "coach-docs" && <CoachDocuments />}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// DISCUSSIONS TAB
// ══════════════════════════════════════════════════════════════════

const THREAD_CATEGORIES = ["all", "Case Discussion", "Reflection", "Debate", "Q&A", "Submission", "Resource"] as const;

const categoryMeta: Record<string, { bg: string; color: string }> = {
  "Case Discussion": { bg: "#C8A86015", color: "var(--xa-primary)" },
  "Reflection":      { bg: "#4A557315", color: "#4A5573" },
  "Debate":          { bg: "#f59e0b15", color: "#f59e0b" },
  "Q&A":             { bg: "#22c55e15", color: "#22c55e" },
  "Submission":      { bg: "#8b5cf615", color: "#8b5cf6" },
  "Resource":        { bg: "#18284815", color: "var(--xa-text)" },
};

function timeAgo(d: string) {
  const diff = (Date.now() - new Date(d).getTime()) / 1000;
  if (diff < 60) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function FacultyDiscussions({ enrollments, user }: { enrollments: MyEnrollmentDTO[]; user: { id: string; email: string; name?: string; role: string } | null }) {
  // A faculty can be assigned to multiple programs. Build a deduplicated program
  // list and let them pick which program's discussions to view - mirroring the PM
  // flow. Without this the forum was locked to enrollments[0], so a faculty whose
  // target program wasn't first (e.g. alphabetically) never saw its threads.
  const programOptions = useMemo(() => {
    const seen = new Set<string>();
    const opts: { programId: string; cohortId: string; title: string }[] = [];
    for (const e of enrollments) {
      if (!e.program_id || seen.has(e.program_id)) continue;
      seen.add(e.program_id);
      opts.push({ programId: e.program_id, cohortId: e.cohort_id ?? "", title: e.program_title ?? e.program_id });
    }
    return opts;
  }, [enrollments]);

  const [selectedProgramId, setSelectedProgramId] = useState<string>("");
  useEffect(() => {
    setSelectedProgramId((cur) => (cur && programOptions.some(o => o.programId === cur) ? cur : programOptions[0]?.programId ?? ""));
  }, [programOptions]);

  const activeProgram = programOptions.find(o => o.programId === selectedProgramId) ?? programOptions[0];
  const cohortId  = activeProgram?.cohortId  ?? "";
  const programId = activeProgram?.programId ?? "";

  // Switching programs closes any open thread so stale detail views don't linger.
  useEffect(() => {
    setExpandedId(null);
    setSubTab("forum");
  }, [programId]);

  // ── State ──
  const [subTab, setSubTab]                   = useState<"forum" | "announcements">("forum");
  const [threads, setThreads]                 = useState<ThreadDTO[]>([]);
  const [loadingThreads, setLoadingThreads]   = useState(false);
  const [catFilter, setCatFilter]             = useState("all");
  const [search, setSearch]                   = useState("");
  // Inline expand-in-row (not a separate full-page view) - matches the
  // reference's thread-reader pattern. Full detail (replies) is fetched
  // lazily on first expand and cached so re-collapsing doesn't refetch.
  const [expandedId, setExpandedId]           = useState<string | null>(null);
  const [expandedDetail, setExpandedDetail]   = useState<Record<string, ThreadDTO>>({});
  const [loadingExpand, setLoadingExpand]     = useState(false);
  const [replyText, setReplyText]             = useState("");
  const [postingReply, setPostingReply]       = useState(false);

  // New thread form
  const [showNewThread, setShowNewThread]     = useState(false);
  const [threadForm, setThreadForm]           = useState({ title: "", body: "", category: "Q&A", tags: "" });
  const [postingThread, setPostingThread]     = useState(false);

  // Announcements
  const [announcements, setAnnouncements]     = useState<AnnouncementDTO[]>([]);
  const [loadingAnn, setLoadingAnn]           = useState(false);
  const [annForm, setAnnForm]                 = useState({ title: "", body: "", send_email: false });
  const [postingAnn, setPostingAnn]           = useState(false);
  const [showAnnForm, setShowAnnForm]         = useState(false);

  // Stats (derived)
  const pinnedCount = threads.filter(t => t.is_pinned).length;

  // ── Data loading ──
  // List program-wide (all cohorts) so faculty see every participant's thread -
  // matching the PM view. Filtering by a single cohort_id hid threads posted in
  // cohorts other than the faculty's first enrollment.
  useEffect(() => {
    if (!programId) return;
    setLoadingThreads(true);
    discussionsApi.listThreads({ program_id: programId }).then(r => setThreads(r.data ?? [])).catch(() => {}).finally(() => setLoadingThreads(false));
  }, [programId]);

  useEffect(() => {
    if (subTab !== "announcements" || !cohortId) return;
    setLoadingAnn(true);
    discussionsApi.listAnnouncements(cohortId).then(r => setAnnouncements(r.data ?? [])).catch(() => {}).finally(() => setLoadingAnn(false));
  }, [subTab, cohortId]);

  // ── Thread actions ──
  async function toggleThreadExpand(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    setReplyText("");
    if (expandedDetail[id]) return;
    setLoadingExpand(true);
    const r = await discussionsApi.getThread(id).catch(() => null);
    if (r?.data) setExpandedDetail(prev => ({ ...prev, [id]: r.data! }));
    setLoadingExpand(false);
  }

  async function postReply(threadId: string) {
    if (!replyText.trim()) return;
    setPostingReply(true);
    const r = await discussionsApi.createReply(threadId, replyText.trim()).catch(() => null);
    if (r?.data) {
      setExpandedDetail(prev => {
        const t = prev[threadId];
        if (!t) return prev;
        return { ...prev, [threadId]: { ...t, replies: [...(t.replies ?? []), r.data!], reply_count: t.reply_count + 1 } };
      });
      setThreads(prev => prev.map(t => t.id === threadId ? { ...t, reply_count: t.reply_count + 1 } : t));
      setReplyText("");
    }
    setPostingReply(false);
  }

  async function postThread() {
    if (!threadForm.title || !threadForm.body || !cohortId) return;
    setPostingThread(true);
    const tags = threadForm.tags.split(",").map(t => t.trim()).filter(Boolean);
    const r = await discussionsApi.createThread({ cohort_id: cohortId, program_id: programId, title: threadForm.title, body: threadForm.body, category: threadForm.category, tags }).catch(() => null);
    if (r?.data) {
      setThreads(prev => [r.data!, ...prev]);
      setThreadForm({ title: "", body: "", category: "Q&A", tags: "" });
      setShowNewThread(false);
    }
    setPostingThread(false);
  }

  async function togglePin(t: ThreadDTO) {
    await discussionsApi.pinThread(t.id).catch(() => {});
    setThreads(prev => prev.map(x => x.id === t.id ? { ...x, is_pinned: !x.is_pinned } : x));
    setExpandedDetail(prev => prev[t.id] ? { ...prev, [t.id]: { ...prev[t.id], is_pinned: !prev[t.id].is_pinned } } : prev);
  }

  async function deleteThread(id: string) {
    if (!window.confirm("Delete this thread? This cannot be undone.")) return;
    await discussionsApi.deleteThread(id).catch(() => {});
    setThreads(prev => prev.filter(t => t.id !== id));
    if (expandedId === id) setExpandedId(null);
  }

  async function deleteReply(threadId: string, replyId: string) {
    if (!window.confirm("Delete this reply?")) return;
    await discussionsApi.deleteReply(threadId, replyId).catch(() => {});
    setExpandedDetail(prev => {
      const t = prev[threadId];
      if (!t) return prev;
      return { ...prev, [threadId]: { ...t, replies: (t.replies ?? []).filter(r => r.id !== replyId), reply_count: Math.max(0, t.reply_count - 1) } };
    });
    setThreads(prev => prev.map(t => t.id === threadId ? { ...t, reply_count: Math.max(0, t.reply_count - 1) } : t));
  }

  // ── Announcement actions ──
  async function postAnnouncement() {
    if (!annForm.title || !annForm.body || !cohortId) return;
    setPostingAnn(true);
    const r = await discussionsApi.createAnnouncement({ cohort_id: cohortId, title: annForm.title, body: annForm.body, send_email: annForm.send_email }).catch(() => null);
    if (r?.data) { setAnnouncements(prev => [r.data!, ...prev]); setAnnForm({ title: "", body: "", send_email: false }); setShowAnnForm(false); }
    setPostingAnn(false);
  }

  async function deleteAnnouncement(id: string) {
    await discussionsApi.deleteAnnouncement(id).catch(() => {});
    setAnnouncements(prev => prev.filter(a => a.id !== id));
  }

  // ── Filtered threads ──
  const filteredThreads = threads.filter(t => {
    if (catFilter !== "all" && t.category !== catFilter) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const isFaculty = user?.role === "faculty" || user?.role === "program_manager" || user?.role === "superadmin" || user?.role === "superadmin_secondary";

  if (!programId) return <EmptyState icon="💬" title="No Program Assigned" sub="Discussions become available once you are assigned to a program." />;

  return (
    <div style={{ padding: 24, ...ff }}>

      {/* ── Program selector (faculty may teach multiple programs) ── */}
      {programOptions.length > 1 && (
        <div style={{ marginBottom: 18 }}>
          <label style={{ fontSize: 10, fontWeight: 700, color: "#4A5573", letterSpacing: 0.5, textTransform: "uppercase" as const, display: "block", marginBottom: 6 }}>Program</label>
          <select value={selectedProgramId} onChange={e => setSelectedProgramId(e.target.value)}
            style={{ ...ff, border: "1px solid #E6DED0", borderRadius: 8, padding: "9px 12px", fontSize: 13, color: "var(--xa-text)", background: "#fff", outline: "none", minWidth: 280 }}>
            {programOptions.map(o => <option key={o.programId} value={o.programId}>{o.title}</option>)}
          </select>
        </div>
      )}

      {/* ── Stat cards ──────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14, marginBottom: 22 }}>
        {[
          { label: "Threads",   value: threads.length,  sub: "Active discussions",   color: "var(--xa-text)", icon: "○" },
          { label: "Unread",    value: 0,               sub: "Pending your attention", color: "var(--xa-primary)", icon: "+" },
          { label: "Pinned",    value: pinnedCount,     sub: "Threads pinned by you", color: "var(--xa-text)", icon: "◇" },
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E6DED0", padding: "18px 20px", boxShadow: "0 1px 4px rgba(24, 40, 72,0.07)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#4A5573", letterSpacing: 0.3 }}>{s.label}</span>
              <span style={{ fontSize: 16, color: s.color, opacity: 0.5 }}>{s.icon}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#4A5573", marginTop: 6 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Sub-tabs + action button ─────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, gap: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {(["forum", "announcements"] as const).map((t, i) => {
            const labels = ["Forum", "Announcements"];
            const badges = [threads.length > 0 ? threads.length : 0, 0];
            const active = subTab === t;
            return (
              <button key={t} onClick={() => setSubTab(t)}
                style={{ ...ff, padding: "7px 18px", borderRadius: 20, fontSize: 12, fontWeight: active ? 700 : 500, border: active ? "1.5px solid var(--xa-primary)" : "1.5px solid #E6DED0", background: "#fff", color: active ? "var(--xa-primary)" : "#4A5573", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                {labels[i]}
                {badges[i] > 0 && (
                  <span style={{ background: "var(--xa-primary)", color: "#fff", borderRadius: "50%", minWidth: 18, height: 18, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{badges[i]}</span>
                )}
              </button>
            );
          })}
        </div>
        {subTab === "forum" && (
          <button onClick={() => setShowNewThread(true)}
            style={{ ...ff, background: "var(--xa-primary)", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer", whiteSpace: "nowrap" as const }}>
            + New Thread
          </button>
        )}
        {subTab === "announcements" && isFaculty && (
          <button onClick={() => setShowAnnForm(true)}
            style={{ ...ff, background: "var(--xa-primary)", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer", whiteSpace: "nowrap" as const }}>
            + New Announcement
          </button>
        )}
      </div>

      {/* ── FORUM TAB ─────────────────────────────────── */}
      {subTab === "forum" && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E6DED0", overflow: "hidden" }}>
          {/* Search + filters */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid #E6DED0", flexWrap: "wrap" as const }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: "#F7F5F0", borderRadius: 8, padding: "8px 14px", minWidth: 180 }}>
              <span style={{ color: "#4A5573", fontSize: 14 }}>🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search threads…"
                style={{ ...ff, flex: 1, border: "none", background: "transparent", fontSize: 13, color: "var(--xa-text)", outline: "none" }} />
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
              {THREAD_CATEGORIES.map(cat => {
                const active = catFilter === cat;
                return (
                  <button key={cat} onClick={() => setCatFilter(cat)}
                    style={{ ...ff, padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: active ? 700 : 500, border: active ? "1.5px solid var(--xa-primary)" : "1.5px solid #E6DED0", background: active ? "var(--xa-primary)" : "#fff", color: active ? "#fff" : "#4A5573", cursor: "pointer" }}>
                    {cat === "all" ? "All" : cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Thread rows - click expands inline with replies + reply box */}
          {loadingThreads ? (
            <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#4A5573" }}>Loading…</div>
          ) : filteredThreads.length === 0 ? (
            <div style={{ padding: "40px 0" }}>
              <EmptyState icon="💬" title="No threads yet" sub='Start a discussion by clicking "+ New Thread".' />
            </div>
          ) : filteredThreads.map((t, idx) => {
            const cm = categoryMeta[t.category] ?? { bg: "#4A557320", color: "#4A5573" };
            const expanded = expandedId === t.id;
            const detail = expandedDetail[t.id];
            return (
              <div key={t.id}
                style={{ borderBottom: idx < filteredThreads.length - 1 ? "1px solid #E6DED0" : "none", background: expanded ? "#EFE9DC" : "transparent" }}>
                <div onClick={() => toggleThreadExpand(t.id)}
                  style={{ padding: "18px 22px", cursor: "pointer", transition: "background 0.1s" }}
                  onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = "#EFE9DC"; }}
                  onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = "transparent"; }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                    {t.is_pinned && <span style={{ fontSize: 14, marginTop: 2, flexShrink: 0 }}>📌</span>}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "var(--xa-text)" }}>{t.title}</span>
                      </div>
                      {!expanded && <p style={{ fontSize: 12, color: "#4A5573", margin: "0 0 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, maxWidth: "70vw" }}>{t.body}</p>}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                        <span style={{ fontSize: 10, fontWeight: 700, background: cm.bg, color: cm.color, padding: "3px 9px", borderRadius: 20 }}>{t.category}</span>
                        {(expanded ? t.tags : t.tags.slice(0, 2)).map(tag => (
                          <span key={tag} style={{ fontSize: 10, fontWeight: 500, background: "#F7F5F0", color: "#4A5573", padding: "3px 9px", borderRadius: 20 }}>{tag}</span>
                        ))}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: "right" as const }}>
                      <div style={{ fontSize: 11, color: "#4A5573" }}>💬 {t.reply_count} · {timeAgo(t.created_at)}</div>
                    </div>
                  </div>
                </div>

                {expanded && (
                  <div onClick={e => e.stopPropagation()} style={{ padding: "0 22px 20px" }}>
                    <p style={{ fontSize: 13, color: "var(--xa-text)", lineHeight: 1.6, margin: "0 0 10px" }}>{t.body}</p>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                      <div style={{ fontSize: 11, color: "#4A5573", flex: 1 }}>{t.author_name} · {timeAgo(t.created_at)} · {t.reply_count} replies</div>
                      {isFaculty && (
                        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                          <button onClick={() => togglePin(t)}
                            style={{ ...ff, fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 7, border: "1.5px solid #E6DED0", background: t.is_pinned ? "#C8A86010" : "#fff", color: t.is_pinned ? "var(--xa-primary)" : "#4A5573", cursor: "pointer" }}>
                            {t.is_pinned ? "Unpin" : "📌 Pin"}
                          </button>
                          <button onClick={() => deleteThread(t.id)}
                            style={{ ...ff, fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 7, border: "1.5px solid #ef444430", background: "#ef444410", color: "#ef4444", cursor: "pointer" }}>
                            Delete
                          </button>
                        </div>
                      )}
                    </div>

                    {loadingExpand ? (
                      <div style={{ textAlign: "center", fontSize: 13, color: "#4A5573", padding: "12px 0" }}>Loading replies…</div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                        {(detail?.replies ?? []).map(r => {
                          const isMyReply = r.author_id === user?.id;
                          return (
                            <div key={r.id} style={{ background: "#fff", borderRadius: 10, border: "1px solid #E6DED0", padding: "12px 14px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                <div style={{ width: 28, height: 28, borderRadius: "50%", background: isMyReply ? "#C8A86018" : "#18284818", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: isMyReply ? "var(--xa-primary)" : "var(--xa-text)", flexShrink: 0 }}>
                                  {(r.author_name ?? "?").charAt(0).toUpperCase()}
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--xa-text)" }}>{r.author_name}</span>
                                {isMyReply && (
                                  <span style={{ fontSize: 9, fontWeight: 700, background: "#C8A86015", color: "var(--xa-primary)", padding: "2px 7px", borderRadius: 20, letterSpacing: 0.5 }}>YOU</span>
                                )}
                                <span style={{ fontSize: 11, color: "#4A5573" }}>{timeAgo(r.created_at)}</span>
                                {(isFaculty || isMyReply) && (
                                  <button onClick={() => deleteReply(t.id, r.id)}
                                    style={{ ...ff, marginLeft: "auto", fontSize: 10, padding: "3px 9px", borderRadius: 6, border: "1px solid #ef444430", background: "#ef444408", color: "#ef4444", cursor: "pointer", fontWeight: 600 }}>
                                    Delete
                                  </button>
                                )}
                              </div>
                              <p style={{ fontSize: 13, color: "var(--xa-text)", lineHeight: 1.6, margin: 0 }}>{r.body}</p>
                            </div>
                          );
                        })}
                        {(detail?.replies ?? []).length === 0 && <div style={{ fontSize: 12, color: "#4A5573" }}>No replies yet. Be the first to respond.</div>}
                      </div>
                    )}

                    <div style={{ background: "#fff", borderRadius: 10, border: "1px solid #E6DED0", padding: "14px 16px" }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#4A5573", letterSpacing: 0.5, marginBottom: 8, textTransform: "uppercase" as const }}>Your Reply</div>
                      <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={3} placeholder="Share your thoughts…"
                        style={{ ...ff, width: "100%", border: "1.5px solid #E6DED0", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "var(--xa-text)", resize: "vertical" as const, outline: "none", boxSizing: "border-box" as const }} />
                      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
                        <button onClick={() => postReply(t.id)} disabled={postingReply || !replyText.trim()}
                          style={{ ...ff, background: "var(--xa-primary)", opacity: postingReply || !replyText.trim() ? 0.6 : 1, color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          {postingReply ? "Posting…" : "Post Reply"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── ANNOUNCEMENTS TAB ─────────────────────────── */}
      {subTab === "announcements" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {loadingAnn ? (
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #E6DED0", padding: "40px 0", textAlign: "center", fontSize: 13, color: "#4A5573" }}>Loading…</div>
          ) : announcements.length === 0 && !showAnnForm ? (
            <EmptyState icon="📣" title="No announcements" sub="Announcements you send here will be visible to all cohort participants." />
          ) : announcements.map(a => (
            <div key={a.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #E6DED0", padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 14 }}>📣</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "var(--xa-text)" }}>{a.title}</span>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--xa-text)", lineHeight: 1.6, margin: "0 0 10px" }}>{a.body}</p>
                  <div style={{ fontSize: 11, color: "#4A5573" }}>
                    {a.author_name} · {timeAgo(a.created_at)}
                    {a.send_email && <span style={{ marginLeft: 10, background: "#22c55e15", color: "#22c55e", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>Email sent</span>}
                  </div>
                </div>
                {isFaculty && (
                  <button onClick={() => deleteAnnouncement(a.id)}
                    style={{ ...ff, fontSize: 11, padding: "5px 12px", borderRadius: 7, border: "1.5px solid #ef444430", background: "#ef444410", color: "#ef4444", cursor: "pointer", fontWeight: 600 }}>
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── New Thread Modal ───────────────────────────── */}
      {showNewThread && typeof document !== "undefined" && ReactDOM.createPortal(
        <div onClick={() => setShowNewThread(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid #E6DED0" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--xa-text)" }}>Start a New Discussion</span>
              <button onClick={() => setShowNewThread(false)}
                style={{ width: 28, height: 28, borderRadius: "50%", border: "1.5px solid #E6DED0", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#4A5573" }}>×</button>
            </div>
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
              <Field label="Title">
                <input style={inp} value={threadForm.title} onChange={e => setThreadForm(f => ({ ...f, title: e.target.value }))} placeholder="What would you like to discuss?" autoFocus />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <Field label="Category">
                  <select style={sel} value={threadForm.category} onChange={e => setThreadForm(f => ({ ...f, category: e.target.value }))}>
                    {["Case Discussion", "Reflection", "Debate", "Q&A", "Submission", "Resource"].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
                <Field label="Tags (comma-separated)">
                  <input style={inp} value={threadForm.tags} onChange={e => setThreadForm(f => ({ ...f, tags: e.target.value }))} placeholder="Leadership, Strategy" />
                </Field>
              </div>
              <Field label="Body">
                <textarea value={threadForm.body} onChange={e => setThreadForm(f => ({ ...f, body: e.target.value }))} rows={5} placeholder="Share your thoughts, questions, or insights…"
                  style={{ ...ff, ...inp, resize: "vertical" as const, minHeight: 100 }} />
              </Field>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setShowNewThread(false)}
                  style={{ ...ff, padding: "9px 18px", borderRadius: 8, border: "1.5px solid #E6DED0", background: "#fff", fontSize: 12, fontWeight: 600, color: "var(--xa-text)", cursor: "pointer" }}>Cancel</button>
                <button onClick={postThread} disabled={postingThread || !threadForm.title || !threadForm.body}
                  style={{ ...ff, padding: "9px 20px", borderRadius: 8, border: "none", background: postingThread || !threadForm.title || !threadForm.body ? "#C9BFA8" : "var(--xa-primary)", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                  {postingThread ? "Posting…" : "Post Thread"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}


      {/* ── New Announcement Modal ─────────────────────── */}
      {showAnnForm && typeof document !== "undefined" && ReactDOM.createPortal(
        <div onClick={() => setShowAnnForm(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid #E6DED0" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "var(--xa-text)" }}>New Announcement</span>
              <button onClick={() => setShowAnnForm(false)}
                style={{ width: 28, height: 28, borderRadius: "50%", border: "1.5px solid #E6DED0", background: "#fff", cursor: "pointer", fontSize: 14, color: "#4A5573" }}>×</button>
            </div>
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
              <Field label="Title">
                <input style={inp} value={annForm.title} onChange={e => setAnnForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Session recording available" autoFocus />
              </Field>
              <Field label="Message">
                <textarea value={annForm.body} onChange={e => setAnnForm(f => ({ ...f, body: e.target.value }))} rows={5} placeholder="Share an update with all cohort participants…"
                  style={{ ...ff, ...inp, resize: "vertical" as const }} />
              </Field>
              <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                <div onClick={() => setAnnForm(f => ({ ...f, send_email: !f.send_email }))}
                  style={{ width: 38, height: 20, borderRadius: 20, background: annForm.send_email ? "#22c55e" : "#C9BFA8", position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0 }}>
                  <div style={{ position: "absolute", top: 2, left: annForm.send_email ? 20 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                </div>
                <span style={{ fontSize: 12, color: "var(--xa-text)", fontWeight: 500 }}>Send email notification to all participants</span>
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setShowAnnForm(false)}
                  style={{ ...ff, padding: "9px 18px", borderRadius: 8, border: "1.5px solid #E6DED0", background: "#fff", fontSize: 12, fontWeight: 600, color: "var(--xa-text)", cursor: "pointer" }}>Cancel</button>
                <button onClick={postAnnouncement} disabled={postingAnn || !annForm.title || !annForm.body}
                  style={{ ...ff, padding: "9px 20px", borderRadius: 8, border: "none", background: postingAnn || !annForm.title || !annForm.body ? "#C9BFA8" : "var(--xa-primary)", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                  {postingAnn ? "Posting…" : "Post Announcement"}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════

const PAGE_TITLES: Record<string, string> = {
  "fac-dashboard":      "Dashboard",
  "fac-program-design": "Program Design",
  "fac-management":     "Program Management",
  "fac-sessions":       "Program Session",
  "fac-cohort":         "Cohort Management",
  "fac-content":        "Content Library",
  "fac-grading":        "Grading Queue",
  "fac-capstone":       "Capstone Projects",
  "fac-coaching":            "My Coaching",
  "fac-coach-engagements":   "My Engagements",
  "fac-coach-calendar":      "Calendar & Sessions",
  "fac-coach-notes":         "Session Notes",
  "fac-coach-outline":       "Program Outline",
  "fac-coach-docs":          "Documents & Reports",
  "fac-discussions":    "Discussions",
  "profile":            "My Profile",
  "settings":           "Settings",
};

export default function FacultyPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activePage, setActivePageState] = useState(() => searchParams.get("tab") || "fac-dashboard");
  const [studioProgram, setStudioProgram] = useState<ProgramDetailDTO | null>(null);
  const [designListRefreshKey, setDesignListRefreshKey] = useState(0);

  const [enrollments, setEnrollments]             = useState<MyEnrollmentDTO[]>([]);
  const [allProgramEnrollments, setAllProgEnrolls] = useState<MyEnrollmentDTO[]>([]); // cohort + assignment-based
  const [activeEnrollment, setActive]             = useState<MyEnrollmentDTO | null>(null);
  const [program, setProgram]                     = useState<ProgramDetailDTO | null>(null);
  const [participants, setParticipants]           = useState<ParticipantDTO[]>([]);
  const [sessions, setSessions]                   = useState<SessionDTO[]>([]);
  const [pendingGrades, setPendingGrades]         = useState(0);
  const [loadingData, setLoadingData]             = useState(true);
  const [loadingCohort, setLoadingCohort]         = useState(false);

  // Push a history entry per tab switch so browser Back/Forward moves between
  // tabs instead of leaving the dashboard entirely.
  function setActivePage(page: string) {
    setActivePageState(page);
    router.push(`/dashboard/faculty?tab=${page}`);
  }

  useEffect(() => {
    // Coaches share the faculty workspace (that's where the coaching tools live).
    if (!loading && (!user || (user.role !== "faculty" && user.role !== "coach"))) router.replace("/");
  }, [user, loading, router]);

  useEffect(() => {
    setActivePageState(searchParams.get("tab") || "fac-dashboard");
  }, [searchParams]);

  useEffect(() => {
    if (!user) return;

    Promise.all([
      cohortsApi.myEnrollments().catch(() => ({ data: [] as MyEnrollmentDTO[] })),
      programsApi.getFacultyAssignments(user.id).catch(() => null),
    ]).then(async ([enrollRes, assignRes]) => {
      const rawList = enrollRes?.data ?? [];
      // Deduplicate by enrollment_id - API can return same enrollment multiple times
      const seen = new Set<string>();
      const list = rawList.filter(e => {
        if (seen.has(e.enrollment_id)) return false;
        seen.add(e.enrollment_id);
        return true;
      });
      setEnrollments(list);
      if (list.length > 0) setActive(list[0]);

      // Build assignment-based synthetic enrollments for programs not already in cohort list
      const enrolledIds = new Set(list.map(e => e.program_id));
      const assignments = assignRes?.data ?? [];
      const extraProgramIds = [...new Set(assignments.map((a: any) => a.program_id as string))]
        .filter(id => !enrolledIds.has(id));

      const extraEnrollments: MyEnrollmentDTO[] = await Promise.all(
        extraProgramIds.map(async (programId: string): Promise<MyEnrollmentDTO> => {
          const pRes = await programsApi.get(programId).catch(() => null);
          const prog = pRes?.data ?? null;
          // Try to find a cohort for this program so discussions/sessions can work
          let cohortId = "";
          let cohortName = "Assigned (no cohort)";
          let cohortStart: string | undefined;
          let cohortEnd: string | undefined;
          if (prog?.org_id) {
            const cRes = await cohortsApi.list(prog.org_id, programId).catch(() => null);
            const firstCohort = cRes?.data?.[0] ?? null;
            if (firstCohort) {
              cohortId = firstCohort.id;
              cohortName = firstCohort.name;
              cohortStart = firstCohort.start_date;
              cohortEnd = firstCohort.end_date;
            }
          }
          return {
            enrollment_id: `assigned-${programId}`,
            cohort_id: cohortId,
            cohort_name: cohortName,
            program_id: programId,
            program_title: prog?.title ?? programId,
            program_status: prog?.status ?? "active",
            program_color: prog?.color ?? "#4A5573",
            program_duration_weeks: prog?.duration_weeks ?? 0,
            cohort_start_date: cohortStart,
            cohort_end_date: cohortEnd,
            role: "faculty",
            status: "active",
            completion_percent: 0,
            risk_level: "low",
            enrolled_at: "",
          };
        })
      );

      // Merge and deduplicate by enrollment_id
      const merged = [...list, ...extraEnrollments];
      const seenAll = new Set<string>();
      setAllProgEnrolls(merged.filter(e => {
        if (seenAll.has(e.enrollment_id)) return false;
        seenAll.add(e.enrollment_id);
        return true;
      }));
    }).finally(() => setLoadingData(false));

    submissionsStatsApi.myStats()
      .then(r => setPendingGrades(r.data?.pending_grades ?? 0))
      .catch(() => {});
  }, [user]);

  const loadCohortData = useCallback(async (en: MyEnrollmentDTO) => {
    setProgram(null); setParticipants([]); setSessions([]);
    setLoadingCohort(true);
    try {
      const [progRes, partRes, sessRes] = await Promise.all([
        programsApi.get(en.program_id),
        cohortsApi.listParticipants(en.cohort_id),
        sessionsApi.list({ cohort_id: en.cohort_id }),
      ]);
      setProgram(progRes.data);
      setParticipants(partRes.data ?? []);
      setSessions(sessRes.data ?? []);
    } catch {}
    setLoadingCohort(false);
  }, []);

  useEffect(() => {
    if (activeEnrollment) loadCohortData(activeEnrollment);
  }, [activeEnrollment, loadCohortData]);

  if (loading || !user) return null;

  // Program switcher pill rendered into the header subtitle slot.
  // A faculty member can be enrolled/assigned across several cohorts of the
  // SAME program, and `allProgramEnrollments` has one row per cohort - group
  // those down to one row per program_id here so the dropdown reads as
  // "my programs" instead of listing every cohort as a separate entry.
  function ProgramSwitcher() {
    const [open, setOpen] = useState(false);
    if (allProgramEnrollments.length === 0) return null;

    const active = activeEnrollment ?? allProgramEnrollments[0];
    const dotColor = active.program_color || "#4A5573";

    const programGroups: MyEnrollmentDTO[] = [];
    const groupIndexByProgram = new Map<string, number>();
    allProgramEnrollments.forEach(en => {
      const idx = groupIndexByProgram.get(en.program_id);
      if (idx === undefined) {
        groupIndexByProgram.set(en.program_id, programGroups.length);
        programGroups.push(en);
      } else if (en.enrollment_id === active.enrollment_id) {
        // Keep the actively-selected cohort as the representative row so the
        // pill/list stay in sync with whichever cohort is actually loaded.
        programGroups[idx] = en;
      }
    });
    const cohortCountByProgram = new Map<string, number>();
    allProgramEnrollments.forEach(en => cohortCountByProgram.set(en.program_id, (cohortCountByProgram.get(en.program_id) ?? 0) + 1));

    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        {/* Pill trigger */}
        <button
          onClick={() => setOpen(o => !o)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", cursor: "pointer", padding: "2px 0", fontFamily: "Poppins, sans-serif" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0, display: "inline-block" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "#4A5573", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
            {active.program_title}
          </span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
            <path d="M2 3.5L5 6.5L8 3.5" stroke="#4A5573" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Backdrop */}
        {open && (
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 149 }} />
        )}

        {/* Dropdown */}
        {open && (
          <div style={{ position: "absolute", top: "calc(100% + 10px)", left: 0, background: "#fff", borderRadius: 14, boxShadow: "0 8px 32px rgba(24, 40, 72,0.16)", border: "1px solid #E6DED0", width: 340, zIndex: 150, overflow: "hidden" }}>
            <div style={{ padding: "10px 16px 8px", fontSize: 10, fontWeight: 700, color: "#4A5573", letterSpacing: 1, fontFamily: "Poppins, sans-serif" }}>
              MY ENROLLED PROGRAMS
            </div>
            <div style={{ maxHeight: 360, overflowY: "auto" as const }}>
              {programGroups.map(en => {
                const isSelected = en.program_id === active.program_id;
                const color = en.program_color || "#4A5573";
                const pct = Math.round((en as any).completion_pct ?? 0);
                const cohortCount = cohortCountByProgram.get(en.program_id) ?? 1;
                const statusMeta: Record<string, { bg: string; color: string }> = {
                  active:    { bg: "#22c55e15", color: "#22c55e" },
                  upcoming:  { bg: "#C8A86015", color: "var(--xa-primary)" },
                  delivered: { bg: "#4A557320", color: "#4A5573" },
                  draft:     { bg: "#4A557320", color: "#4A5573" },
                  archived:  { bg: "#4A557320", color: "#4A5573" },
                };
                const sm = statusMeta[en.program_status] ?? statusMeta.active;

                return (
                  <div key={en.program_id}
                    onClick={() => { setActive(en); setOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", background: isSelected ? "#EFE9DC" : "#fff", borderBottom: "1px solid #EFE9DC", transition: "background 0.1s" }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#EFE9DC"; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "#fff"; }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 800, flexShrink: 0, fontFamily: "Poppins, sans-serif" }}>
                      {en.program_title.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--xa-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, fontFamily: "Poppins, sans-serif" }}>
                        {en.program_title}
                      </div>
                      {cohortCount > 1 && (
                        <div style={{ fontSize: 11, color: "#4A5573", marginBottom: 5, fontFamily: "Poppins, sans-serif" }}>{cohortCount} cohorts</div>
                      )}
                      {cohortCount === 1 && en.cohort_name && en.cohort_name !== "Assigned (no cohort)" && (
                        <div style={{ fontSize: 11, color: "#4A5573", marginBottom: 5, fontFamily: "Poppins, sans-serif" }}>{en.cohort_name}</div>
                      )}
                      {cohortCount === 1 && (!en.cohort_name || en.cohort_name === "Assigned (no cohort)") && (
                        <div style={{ fontSize: 10, color: "#4A5573", fontWeight: 600, marginBottom: 5, fontFamily: "Poppins, sans-serif" }}>Facilitator</div>
                      )}
                      {/* Progress bar */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ flex: 1, height: 4, background: "#EFE9DC", borderRadius: 99 }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 99 }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 600, color: "#4A5573", fontFamily: "Poppins, sans-serif" }}>{pct}%</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, flexShrink: 0 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, background: sm.bg, color: sm.color, padding: "2px 8px", borderRadius: 10, fontFamily: "Poppins, sans-serif", textTransform: "capitalize" as const }}>
                        {en.program_status.charAt(0).toUpperCase() + en.program_status.slice(1)}
                      </span>
                      {isSelected && (
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <path d="M2.5 7L5.5 10L11.5 4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderContent() {
    // Gate: require at least one program (cohort OR activity-based assignment)
    if (!loadingData && allProgramEnrollments.length === 0 && activePage !== "fac-program-design") {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "70vh", padding: 24, fontFamily: "Poppins, sans-serif" }}>
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #E6DED0", padding: "56px 48px", textAlign: "center", maxWidth: 460, boxShadow: "0 4px 24px rgba(24, 40, 72,0.06)" }}>
            <div style={{ width: 80, height: 80, borderRadius: 20, background: "linear-gradient(135deg,var(--xa-sidebar),#2d3a7c)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 36 }}>
              🎓
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "var(--xa-text)", marginBottom: 10 }}>
              No Program Assigned Yet
            </div>
            <div style={{ fontSize: 13, color: "#4A5573", lineHeight: 1.7, marginBottom: 28 }}>
              You are not enrolled in any cohort or program. All features - sessions, grading, coaching, and content - become available once your Program Manager adds you to a program.
            </div>
            <div style={{ background: "#EFE9DC", borderRadius: 12, padding: "14px 20px", display: "inline-flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>📧</span>
              <span style={{ fontSize: 12, color: "var(--xa-text)", fontWeight: 600 }}>Contact your Program Manager to get enrolled</span>
            </div>
          </div>
        </div>
      );
    }

    switch (activePage) {
      case "fac-dashboard":
        return (
          <FacultyDashboard
            enrollments={enrollments} activeEnrollment={activeEnrollment}
            program={program} participants={participants} sessions={sessions}
            loadingData={loadingData} loadingCohort={loadingCohort}
            pendingGrades={pendingGrades}
            onSelectEnrollment={setActive} onNavigate={setActivePage}
          />
        );
      case "fac-program-design":
        if (studioProgram) {
          return (
            <PMDesignStudio
              program={studioProgram}
              orgId={user?.org_id ?? ""}
              onBack={() => { setStudioProgram(null); setDesignListRefreshKey(k => k + 1); }}
              onProgramUpdated={(updated) => setStudioProgram(updated)}
              onNavigateToCapstone={() => { setStudioProgram(null); setActivePage("fac-capstone"); }}
            />
          );
        }
        return (
          <ProgramDesignList
            orgId={user?.org_id ?? ""}
            refreshKey={designListRefreshKey}
            onOpenStudio={(p) => setStudioProgram(p)}
            canDuplicate={false}
          />
        );
      case "fac-management":
        return <ProgramParticipants orgId={user?.org_id ?? ""} onNavigate={setActivePage} designNavId="fac-program-design" />;
      case "fac-sessions":
        // No cohortId/programId scoping here on purpose: listSessionsByFaculty
        // already returns every session this faculty owns or is assigned to
        // via activity_faculty, across ALL of their programs - narrowing to a
        // single activeEnrollment's cohort/program hid sessions under any
        // other program the faculty teaches (the exact bug reported: a newly
        // scheduled session not appearing here). SessionsPage's own "Program"
        // dropdown (defaults to "all") is what should do this filtering.
        return <SessionsPage />;
      case "fac-grading":
        return <FacultyGrading enrollments={allProgramEnrollments.filter(e => !!e.cohort_id)} />;
      case "fac-capstone":
        return <CapstoneManage orgId={user?.org_id ?? ""} />;
      case "fac-coaching":
      case "fac-coach-engagements":
      case "fac-coach-calendar":
      case "fac-coach-notes":
      case "fac-coach-outline":
      case "fac-coach-docs":
        // All six sidebar entries (My Coaching + the coach workspace
        // sub-tabs — see nav-config.ts's FACULTY_COACHING_GROUP_CHILDREN)
        // render the same component; activeSubPage tells it which nested
        // view to show, and onNavigate lets a nested panel's own internal
        // links (e.g. CoachEngagements' "view session notes" button) jump
        // to a sibling sub-tab via the real sidebar navigation.
        return <FacultyCoaching userId={user?.id ?? ""} activeSubPage={activePage} onNavigate={setActivePage} />;
      case "fac-cohort":
        return <CohortManagement orgId={user?.org_id ?? ""} />;
      case "fac-content":
        return <ContentLibrary orgId={user?.org_id ?? ""} />;
      case "fac-discussions":
        return <FacultyDiscussions enrollments={allProgramEnrollments.filter(e => !!e.cohort_id)} user={user} />;
      case "profile":
        return <div style={{ padding: 24 }}><ProfilePage /></div>;
      case "settings":
        return <div style={{ padding: 24 }}><SettingsPage /></div>;
      default:
        return (
          <div style={{ padding: 24 }}>
            <EmptyState icon="🚧" title={PAGE_TITLES[activePage] ?? activePage} sub="Coming soon" />
          </div>
        );
    }
  }

  return (
    <DashboardShell
      activePage={activePage}
      title={studioProgram && activePage === "fac-program-design" ? studioProgram.title : (PAGE_TITLES[activePage] ?? "Dashboard")}
      subtitleNode={allProgramEnrollments.length > 0 ? <ProgramSwitcher /> : undefined}
      onNavigate={(page) => { setStudioProgram(null); setActivePage(page); }}
    >
      {renderContent()}
    </DashboardShell>
  );
}
