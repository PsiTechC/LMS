"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import DashboardShell from "@/components/layout/DashboardShell";
import { useAuth } from "@/lib/auth-context";
import { cohortsApi, MyEnrollmentDTO, ParticipantDTO, CohortStatsDTO } from "@/lib/cohorts-api";
import { programsApi, ProgramDetailDTO, PhaseDTO, ActivityDTO } from "@/lib/programs-api";
import {
  sessionsApi, submissionsApi, coachingApi,
  SessionDTO, MaterialDTO, SubmissionDTO, CoachingNoteDTO,
  AgendaItemDTO, PollDTO, PollResultsDTO, ActionItemDTO, AttendanceDTO,
} from "@/lib/faculty-api";
import { competenciesApi, submissionsStatsApi, CompetencyDTO, TemplateDTO } from "@/lib/competencies-api";
import { analyticsApi, EngagementPoint, CompetencyScore } from "@/lib/analytics-api";
import { discussionsApi, ThreadDTO, ReplyDTO, DirectMessageDTO, AnnouncementDTO } from "@/lib/discussions-api";

const ff = { fontFamily: "Poppins, sans-serif" } as const;

// ── Shared primitives ─────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    scheduled: { bg: "#6B73BF20", color: "#6B73BF" },
    live:       { bg: "#22c55e20", color: "#22c55e" },
    completed:  { bg: "#8b90a720", color: "#8b90a7" },
    cancelled:  { bg: "#ef444420", color: "#ef4444" },
    submitted:  { bg: "#f59e0b20", color: "#f59e0b" },
    graded:     { bg: "#22c55e20", color: "#22c55e" },
  };
  const c = map[status] ?? { bg: "#8b90a720", color: "#8b90a7" };
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
  if (variant === "orange") return <button onClick={onClick} disabled={disabled} style={{ ...base, background: "#EF4E24", color: "#fff" }}>{children}</button>;
  if (variant === "primary") return <button onClick={onClick} disabled={disabled} style={{ ...base, background: "#1C2551", color: "#fff" }}>{children}</button>;
  return <button onClick={onClick} disabled={disabled} style={{ ...base, background: "#fff", color: "#1C2551", border: "1.5px solid #EAECF4" }}>{children}</button>;
}

function Modal({ onClose, title, children, wide }: { onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: wide ? 680 : 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(28,37,81,0.22)", ...ff }}>
        <div style={{ background: "linear-gradient(135deg,#1C2551,#2d3a7c)", padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 1 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{title}</div>
          <button onClick={onClose} style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "50%", width: 26, height: 26, color: "rgba(255,255,255,0.7)", cursor: "pointer", fontSize: 12 }}>✕</button>
        </div>
        <div style={{ padding: "20px 24px 24px" }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 10, fontWeight: 700, color: "#1C2551", display: "block", marginBottom: 5, letterSpacing: 0.5, textTransform: "uppercase", ...ff }}>{label}</label>
      {children}
    </div>
  );
}
const inp: React.CSSProperties = { width: "100%", border: "1.5px solid #EAECF4", borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins,sans-serif", color: "#1C2551", outline: "none", boxSizing: "border-box" };
const sel: React.CSSProperties = { ...inp, background: "#fff", cursor: "pointer" };
const ta: React.CSSProperties = { ...inp, minHeight: 80, resize: "vertical" as const };

function EmptyState({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div style={{ textAlign: "center", padding: 56, background: "#fff", borderRadius: 16, border: "1px solid #EAECF4", ...ff }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#1C2551", marginBottom: 6 }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: "#8b90a7" }}>{sub}</div>}
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
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #EAECF4", padding: 24, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 220, ...ff }}>
      <span style={{ fontSize: 12, color: "#8b90a7" }}>Loading engagement data…</span>
    </div>
  );

  if (data.length === 0) return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #EAECF4", padding: 24, ...ff }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#1C2551", marginBottom: 6 }}>Weekly Participant Engagement</div>
      <div style={{ textAlign: "center", padding: "32px 0", color: "#8b90a7", fontSize: 12 }}>
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
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #EAECF4", padding: "20px 24px", ...ff }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1C2551" }}>Weekly Participant Engagement</div>
        <span style={{ fontSize: 10, color: "#8b90a7", fontWeight: 500 }}>{data.length}-week view · Avg: {avg}%</span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 8, height: 120 }}>
        {data.map(d => {
          const isCurrentWeek = d.week_number === currentWeekNum;
          const barH = Math.max(Math.round((d.engagement_pct / maxPct) * 100), 4);
          return (
            <div key={d.week_number} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: isCurrentWeek ? "#EF4E24" : "#8b90a7" }}>
                {d.engagement_pct}%
              </div>
              <div style={{ width: "100%", display: "flex", alignItems: "flex-end", height: 88 }}>
                <div style={{
                  width: "100%", height: `${barH}%`,
                  background: isCurrentWeek ? "#EF4E24" : "#6B73BF25",
                  borderRadius: "4px 4px 0 0",
                  transition: "height 0.3s ease",
                  minHeight: 4,
                }} />
              </div>
              <div style={{ fontSize: 9, color: isCurrentWeek ? "#EF4E24" : "#8b90a7", fontWeight: isCurrentWeek ? 700 : 500 }}>
                {d.week_label}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ borderTop: "1px solid #EAECF4", marginTop: 16, paddingTop: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 11, color: "#8b90a7" }}>This week: <strong style={{ color: lastWeek?.engagement_pct >= 70 ? "#22c55e" : "#EF4E24" }}>{lastWeek?.engagement_pct ?? 0}%</strong></span>
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
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #EAECF4", padding: 24, display: "flex", alignItems: "center", justifyContent: "center", minHeight: 220, ...ff }}>
      <span style={{ fontSize: 12, color: "#8b90a7" }}>Loading competency data…</span>
    </div>
  );

  return (
    <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #EAECF4", padding: "20px 24px", ...ff }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#1C2551" }}>Cohort Competency Snapshot</div>
        <button
          onClick={() => { setShowRecord(!showRecord); }}
          style={{ ...ff, fontSize: 11, fontWeight: 700, color: "#EF4E24", background: "#EF4E2410", border: "none", borderRadius: 6, padding: "5px 12px", cursor: "pointer" }}>
          + Record Scores
        </button>
      </div>

      {showRecord && (
        <div style={{ background: "#F8F9FC", borderRadius: 10, padding: 14, marginBottom: 16, display: "flex", flexDirection: "column", gap: 10 }}>
          <Field label="Competency">
            <select style={sel} value={recForm.competency_id}
              onChange={e => setRecForm(f => ({ ...f, competency_id: e.target.value }))}>
              <option value="">— Select —</option>
              {competencies.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </Field>
          {competencies.length === 0 && (
            <div style={{ fontSize: 11, color: "#8b90a7" }}>No competencies defined. Use Program Design → Competencies to add them.</div>
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
        <div style={{ textAlign: "center", padding: "24px 0", color: "#8b90a7", fontSize: 12 }}>
          No scores recorded yet. Use "Record Scores" after running competency assessments.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {scores.map(s => {
            const gain = s.current_pct - s.pre_program_pct;
            return (
              <div key={s.id}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#1C2551" }}>{s.title}</span>
                  <span style={{ fontSize: 11, color: gain >= 0 ? "#22c55e" : "#ef4444", fontWeight: 700 }}>
                    {s.pre_program_pct}% → {s.current_pct}%
                    {gain !== 0 && <span style={{ marginLeft: 4 }}>{gain > 0 ? "↑" : "↓"}{Math.abs(gain)}%</span>}
                  </span>
                </div>
                <div style={{ position: "relative", height: 8, background: "#EAECF4", borderRadius: 4, overflow: "hidden" }}>
                  {/* Pre-program bar (behind) */}
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${s.pre_program_pct}%`, background: "#1C255140", borderRadius: 4 }} />
                  {/* Current bar (on top) */}
                  <div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${s.current_pct}%`, background: "#EF4E24", borderRadius: 4, opacity: 0.85 }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {scores.length > 0 && (
        <div style={{ display: "flex", gap: 16, marginTop: 16, borderTop: "1px solid #EAECF4", paddingTop: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 12, height: 8, background: "#1C255140", borderRadius: 2 }} />
            <span style={{ fontSize: 10, color: "#8b90a7" }}>Pre-program</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 12, height: 8, background: "#EF4E24", borderRadius: 2, opacity: 0.85 }} />
            <span style={{ fontSize: 10, color: "#8b90a7" }}>Current</span>
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
  if (loadingData) return <div style={{ padding: 40, textAlign: "center", color: "#8b90a7", fontSize: 13, ...ff }}>Loading dashboard…</div>;

  if (!activeEnrollment) return (
    <div style={{ padding: 40, display: "flex", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #EAECF4", padding: "48px 40px", textAlign: "center", maxWidth: 420, ...ff }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>👩‍🏫</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>No cohorts assigned yet</div>
        <div style={{ fontSize: 13, color: "#8b90a7", lineHeight: 1.6 }}>Your Program Manager will invite you to a cohort.</div>
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
  const typeBg: Record<string, string> = { classroom: "#1C255120", coaching_group: "#6B73BF20", coaching_individual: "#EF4E2420" };
  const typeColor: Record<string, string> = { classroom: "#1C2551", coaching_group: "#6B73BF", coaching_individual: "#EF4E24" };
  const typeIcon: Record<string, string> = { classroom: "🏫", coaching_group: "👥", coaching_individual: "🎯" };

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, ...ff }}>

      {/* Cohort switcher */}
      {enrollments.length > 1 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {enrollments.map(en => (
            <button key={en.enrollment_id} onClick={() => onSelectEnrollment(en)}
              style={{ padding: "5px 14px", borderRadius: 20, cursor: "pointer", border: `1.5px solid ${en.enrollment_id === e.enrollment_id ? e.program_color : "#EAECF4"}`, background: en.enrollment_id === e.enrollment_id ? e.program_color : "#fff", color: en.enrollment_id === e.enrollment_id ? "#fff" : "#8b90a7", fontSize: 11, fontWeight: 600, ...ff }}>
              {en.cohort_name}
            </button>
          ))}
        </div>
      )}

      {/* AI Cohort Briefing */}
      <div style={{ background: "linear-gradient(135deg,#1C2551 0%,#2d3a7c 100%)", borderRadius: 16, padding: "20px 28px", color: "#fff" }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, color: "rgba(255,255,255,0.5)", marginBottom: 6 }}>✦ AI COHORT BRIEFING — {todaySession ? "Today's Session" : "Program Overview"}</div>
        <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>
          {todaySession ? `${todaySession.title} · ${realParticipants.length} Participants` : `${e.program_title} · ${realParticipants.length} Participants`}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
          {[
            { label: "Program Status", value: e.program_status.charAt(0).toUpperCase() + e.program_status.slice(1) },
            { label: "Engagement Level", value: `${avgCompletion >= 80 ? "High" : avgCompletion >= 50 ? "Medium" : "Low"} – ${avgCompletion}% active` },
            { label: "Recommended Focus", value: atRisk.length > 0 ? `Follow up with ${atRisk.length} at-risk` : "All participants on track ✓" },
          ].map(item => (
            <div key={item.label} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "12px 16px" }}>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginBottom: 4, letterSpacing: 0.5 }}>{item.label.toUpperCase()}</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16 }}>
        {[
          { label: "Participants", value: realParticipants.length, sub: "Active this cohort", icon: "◎", color: e.program_color },
          { label: "Sessions", value: sessions.length, sub: "Scheduled this program", icon: "⬡", color: "#6B73BF" },
          { label: "Pending Grades", value: pendingGrades, sub: "Awaiting review", icon: "✦", color: pendingGrades > 0 ? "#EF4E24" : "#22c55e" },
          { label: "Avg Engagement", value: `${avgCompletion}%`, sub: "Participant activity this week", icon: "◆", color: avgCompletion >= 70 ? "#22c55e" : "#f59e0b" },
        ].map(card => (
          <div key={card.label} style={{ background: "#fff", borderRadius: 14, border: "1px solid #EAECF4", padding: "20px 22px", boxShadow: "0 1px 4px rgba(28,37,81,0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: "#8b90a7", fontWeight: 500 }}>{card.label}</div>
              <span style={{ fontSize: 14, color: card.color, opacity: 0.6 }}>{card.icon}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: card.color, lineHeight: 1 }}>{card.value}</div>
            <div style={{ fontSize: 10, color: "#8b90a7", marginTop: 6 }}>{card.sub}</div>
          </div>
        ))}
      </div>

      {/* Analytics panels */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <WeeklyEngagementChart cohortId={e.cohort_id} />
        <CompetencySnapshotPanel cohortId={e.cohort_id} orgId={program?.org_id} />
      </div>

      {/* Two-column */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, alignItems: "start" }}>

        {/* Upcoming Sessions */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #EAECF4", overflow: "hidden" }}>
          <div style={{ padding: "16px 22px", borderBottom: "1px solid #EAECF4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1C2551" }}>Upcoming Sessions</div>
            <button onClick={() => onNavigate("fac-sessions")} style={{ ...ff, fontSize: 11, fontWeight: 600, color: "#6B73BF", background: "transparent", border: "none", cursor: "pointer" }}>View all →</button>
          </div>
          {loadingCohort ? (
            <div style={{ padding: 32, textAlign: "center", fontSize: 12, color: "#8b90a7" }}>Loading…</div>
          ) : upcomingSessions.length === 0 ? (
            <div style={{ padding: "28px 22px", textAlign: "center" }}>
              <div style={{ fontSize: 11, color: "#8b90a7" }}>No upcoming sessions. <button onClick={() => onNavigate("fac-sessions")} style={{ ...ff, color: "#6B73BF", background: "none", border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Create one →</button></div>
            </div>
          ) : upcomingSessions.map(s => {
            const isToday = new Date(s.scheduled_at).toDateString() === today;
            const isLive = s.status === "live";
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 22px", borderBottom: "1px solid #F5F7FB" }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: typeBg[s.session_type] ?? "#6B73BF20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                  {typeIcon[s.session_type] ?? "📅"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1C2551", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <span style={{ fontSize: 10, background: typeBg[s.session_type] ?? "#6B73BF20", color: typeColor[s.session_type] ?? "#6B73BF", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>{typeLabel[s.session_type] ?? "Session"}</span>
                    <span style={{ fontSize: 10, color: "#8b90a7" }}>
                      {isToday ? "Today" : new Date(s.scheduled_at).toLocaleDateString("en-IN", { month: "short", day: "numeric" })}, {new Date(s.scheduled_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
                {(isLive || isToday) ? (
                  <Btn variant="orange" small onClick={() => s.virtual_link && window.open(s.virtual_link, "_blank")}>
                    {isLive ? "Join Live" : "Start Session"}
                  </Btn>
                ) : (
                  <Btn variant="ghost" small>Prepare</Btn>
                )}
              </div>
            );
          })}
        </div>

        {/* Right panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Grading Queue */}
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #EAECF4", padding: "18px 20px" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>Grading Queue</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: pendingGrades > 0 ? "#EF4E24" : "#22c55e", lineHeight: 1, marginBottom: 4 }}>{pendingGrades}</div>
            <div style={{ fontSize: 11, color: "#8b90a7", marginBottom: 14 }}>Submissions awaiting review</div>
            <button onClick={() => onNavigate("fac-grading")}
              style={{ ...ff, width: "100%", padding: "10px 0", background: "#EF4E24", color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              Open Grading Queue →
            </button>
          </div>

          {/* At-Risk Participants */}
          <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #EAECF4", overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #EAECF4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1C2551" }}>At-Risk Participants</div>
              <span style={{ fontSize: 10, background: atRisk.length > 0 ? "#ef444420" : "#22c55e20", color: atRisk.length > 0 ? "#ef4444" : "#22c55e", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>{atRisk.length}</span>
            </div>
            {atRisk.length === 0 ? (
              <div style={{ padding: "20px 18px", textAlign: "center", fontSize: 12, color: "#22c55e", fontWeight: 600 }}>All participants on track ✓</div>
            ) : atRisk.slice(0, 5).map(p => (
              <div key={p.enrollment_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 18px", borderBottom: "1px solid #F5F7FB" }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: p.risk_level === "high" ? "#ef444420" : "#f59e0b20", color: p.risk_level === "high" ? "#ef4444" : "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                  {p.name.split(" ").map((n: string) => n[0]).join("").toUpperCase().slice(0, 2)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#1C2551", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                  <div style={{ fontSize: 10, color: "#8b90a7" }}>{p.completion_percent}% · {p.risk_level} risk</div>
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

// ══════════════════════════════════════════════════════════════════
// PROGRAM DESIGN — card grid + studio
// ══════════════════════════════════════════════════════════════════

function FacultyProgramDesign({ enrollments, facultyUserId }: { enrollments: MyEnrollmentDTO[]; facultyUserId: string }) {
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
          program_color: prog?.color ?? "#6B73BF",
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
  const [editPhaseForm, setEditPhaseForm] = useState({ title: "", week_label: "", color: "#6B73BF" });
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
    return pct >= 80 ? "#22c55e" : pct >= 50 ? "#EF4E24" : "#ef4444";
  }

  const statusMeta: Record<string, { bg: string; color: string; label: string }> = {
    active:    { bg: "#22c55e15", color: "#22c55e", label: "Active" },
    upcoming:  { bg: "#EF4E2415", color: "#EF4E24", label: "Upcoming" },
    delivered: { bg: "#8b90a720", color: "#8b90a7", label: "Delivered" },
    draft:     { bg: "#8b90a720", color: "#8b90a7", label: "Draft" },
    archived:  { bg: "#8b90a720", color: "#8b90a7", label: "Archived" },
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
              style={{ ...ff, padding: "7px 18px", borderRadius: 20, border: `1.5px solid ${cardFilter === f ? "#EF4E24" : "#EAECF4"}`, background: cardFilter === f ? "rgba(239,78,36,0.08)" : "#fff", color: cardFilter === f ? "#EF4E24" : "#8b90a7", fontSize: 12, fontWeight: cardFilter === f ? 700 : 500, cursor: "pointer" }}>
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {loadingCards ? (
          <div style={{ textAlign: "center", padding: 56, color: "#8b90a7", fontSize: 13 }}>Loading programs…</div>
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
                <div key={en.program_id}
                  style={{ background: "#fff", borderRadius: 16, border: `1px solid ${assignedOnly ? "#6B73BF40" : "#EAECF4"}`, padding: "22px 24px", display: "flex", flexDirection: "column", boxShadow: "0 1px 6px rgba(28,37,81,0.04)" }}>

                  {/* Avatar + title + badge */}
                  <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
                    <div style={{ width: 46, height: 46, borderRadius: 12, background: en.program_color || "#1C2551", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 20, fontWeight: 800, flexShrink: 0 }}>
                      {en.program_title.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "#1C2551", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{en.program_title}</div>
                        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                          {assignedOnly && (
                            <span style={{ ...ff, fontSize: 10, fontWeight: 700, background: "#6B73BF14", color: "#6B73BF", borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap" }}>Facilitator</span>
                          )}
                          <span style={{ ...ff, fontSize: 11, fontWeight: 700, background: sm.bg, color: sm.color, borderRadius: 20, padding: "3px 11px", whiteSpace: "nowrap" }}>{sm.label}</span>
                        </div>
                      </div>
                      <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 3 }}>
                        {en.program_duration_weeks > 0 ? `${en.program_duration_weeks}-week · ` : ""}{fmtMonth(en.cohort_start_date)} – {fmtMonth(en.cohort_end_date)}
                      </div>
                    </div>
                  </div>

                  {/* Current phase */}
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#6B73BF", marginBottom: 12 }}>{currentPhase}</div>

                  {/* Enrolled + completion */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}>
                    <span style={{ fontSize: 12, color: "#8b90a7" }}>{enrolled} enrolled</span>
                    {!isDraft && (
                      <span style={{ fontSize: 13, fontWeight: 700, color: bc }}>{completion}%</span>
                    )}
                  </div>

                  {/* Progress bar */}
                  <div style={{ height: 6, background: "#F0F2FA", borderRadius: 3, marginBottom: 18 }}>
                    {!isDraft && (
                      <div style={{ height: "100%", width: `${Math.min(completion, 100)}%`, background: bc, borderRadius: 3, transition: "width 0.4s ease" }} />
                    )}
                  </div>

                  {/* View Studio button */}
                  <button onClick={() => setStudioId(en.program_id)}
                    style={{ ...ff, background: "transparent", border: "1.5px solid #EAECF4", borderRadius: 8, padding: "10px 16px", fontSize: 12, fontWeight: 700, color: "#1C2551", cursor: "pointer", textAlign: "left" as const }}>
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
    <div style={{ padding: 40, textAlign: "center", color: "#8b90a7", fontSize: 13, ...ff }}>Loading studio…</div>
  );

  return (
    <div style={{ ...ff }}>

      {/* ── Studio header ──────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "4px 24px 16px", borderBottom: "1px solid #EAECF4", marginBottom: 20, flexWrap: "wrap", rowGap: 10 }}>
        {/* Back breadcrumb */}
        <button
          onClick={() => { setStudioId(null); setSelectedProgramId(""); setProgram(null); setPhases([]); setEditPhaseId(null); }}
          style={{ ...ff, background: "transparent", border: "none", fontSize: 13, fontWeight: 600, color: "#8b90a7", cursor: "pointer", padding: "0 16px 0 0", display: "flex", alignItems: "center", gap: 4 }}>
          ← Programs
        </button>
        <div style={{ width: 1, height: 22, background: "#EAECF4", marginRight: 16, flexShrink: 0 }} />
        {/* Avatar + title */}
        <div style={{ width: 34, height: 34, borderRadius: 9, background: studioEnrollment?.program_color || "#1C2551", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 16, fontWeight: 800, flexShrink: 0, marginRight: 10 }}>
          {(studioEnrollment?.program_title ?? "P").charAt(0).toUpperCase()}
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#1C2551", marginRight: "auto" }}>{studioEnrollment?.program_title}</span>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
          <button
            onClick={() => setShowTemplates(true)}
            style={{ ...ff, background: "#fff", border: "1.5px solid #EAECF4", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "#1C2551", cursor: "pointer" }}>
            📋 Templates
          </button>
          <button
            onClick={() => setShowCompMgr(true)}
            style={{ ...ff, background: "#fff", border: "1.5px solid #EAECF4", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "#1C2551", cursor: "pointer" }}>
            ✦ Competencies
          </button>
          <button
            style={{ ...ff, background: "#fff", border: "1.5px solid #EAECF4", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "#1C2551", cursor: "default", opacity: 0.6 }}>
            👁 Preview as Participant
          </button>
          <button
            style={{ ...ff, background: "#fff", border: "1.5px solid #EAECF4", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "#1C2551", cursor: "pointer" }}>
            Save Draft
          </button>
          <button
            onClick={handlePublish}
            style={{ ...ff, background: "#EF4E24", border: "none", borderRadius: 8, padding: "7px 18px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
            Publish Program
          </button>
        </div>
      </div>

      {/* ── Phase list ─────────────────────────────────────────── */}
      <div style={{ padding: "0 24px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
        {sortedPhases.length === 0 ? (
          <EmptyState icon="📐" title="No phases yet" sub='Click "+ Add Phase" to start building the curriculum.' />
        ) : sortedPhases.map(phase => {
          const phColor = phase.color || "#6B73BF";
          const isDefault = phColor === "#6B73BF";
          const chipBg  = isDefault ? "#fff"          : phColor + "15";
          const chipBdr = isDefault ? "#EAECF4"       : phColor + "50";
          const chipClr = isDefault ? "#1C2551"       : phColor;
          const isEditingThis = editPhaseId === phase.id;
          const isMenuOpen    = menuPhaseId === phase.id;
          const sortedActs = [...(phase.activities ?? [])].sort((a, b) => a.sort_order - b.sort_order);

          return (
            <div key={phase.id}
              style={{ background: "#fff", borderRadius: 14, border: `1.5px solid ${dragOver === phase.id ? "#6B73BF" : "#EAECF4"}`, padding: isEditingThis ? "16px 20px" : "18px 22px", transition: "border-color 0.15s" }}
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
                    <span style={{ fontSize: 11, color: "#8b90a7" }}>Color</span>
                    <input type="color" value={editPhaseForm.color}
                      onChange={e => setEditPhaseForm(f => ({ ...f, color: e.target.value }))}
                      style={{ width: 32, height: 32, borderRadius: 6, border: "1.5px solid #EAECF4", cursor: "pointer", padding: 2 }} />
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <Btn small onClick={() => savePhaseEdit(phase.id)} disabled={savingPhase || !editPhaseForm.title}>{savingPhase ? "…" : "Save"}</Btn>
                    <Btn small variant="ghost" onClick={() => setEditPhaseId(null)}>Cancel</Btn>
                  </div>
                </div>
              ) : (
                /* ── Normal phase row ── */
                <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>

                  {/* Phase label — left col, fixed width */}
                  <div style={{ minWidth: 152, flexShrink: 0, paddingRight: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: phColor, letterSpacing: 0.3, marginBottom: 3 }}>
                      Phase {phase.phase_number}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1C2551", lineHeight: 1.25 }}>{phase.title}</div>
                    {phase.week_label && (
                      <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 4 }}>{phase.week_label}</div>
                    )}
                  </div>

                  {/* Vertical divider */}
                  <div style={{ width: 1, background: "#EAECF4", alignSelf: "stretch", flexShrink: 0, marginRight: 20 }} />

                  {/* Activity chips — fills remaining space */}
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
                      style={{ ...ff, padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 500, border: "1.5px dashed #D1D5E4", background: "transparent", color: "#8b90a7", cursor: "pointer", whiteSpace: "nowrap" as const }}>
                      + Add Activity
                    </button>
                  </div>

                  {/* Edit + menu icons — right */}
                  <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 12, alignItems: "center" }}>
                    <button
                      onClick={() => { setEditPhaseId(phase.id); setMenuPhaseId(null); setEditPhaseForm({ title: phase.title, week_label: phase.week_label ?? "", color: phase.color || "#6B73BF" }); }}
                      style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "#F0F2FA", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: "#8b90a7" }}>
                      ✏
                    </button>
                    <div style={{ position: "relative" }}>
                      <button
                        onClick={() => setMenuPhaseId(isMenuOpen ? null : phase.id)}
                        style={{ width: 30, height: 30, borderRadius: 8, border: "none", background: "#F0F2FA", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#8b90a7", fontWeight: 700 }}>
                        ⋮
                      </button>
                      {isMenuOpen && (
                        <div onClick={() => setMenuPhaseId(null)}
                          style={{ position: "fixed", inset: 0, zIndex: 200 }}>
                          <div onClick={e => e.stopPropagation()}
                            style={{ position: "absolute", right: 0, top: 34, background: "#fff", border: "1px solid #EAECF4", borderRadius: 10, boxShadow: "0 8px 24px rgba(28,37,81,0.12)", minWidth: 160, overflow: "hidden", zIndex: 201 }}>
                            <button
                              onClick={() => { setShowAddActivity(phase.id); setMenuPhaseId(null); }}
                              style={{ ...ff, width: "100%", padding: "11px 16px", background: "transparent", border: "none", textAlign: "left" as const, fontSize: 13, color: "#1C2551", cursor: "pointer", fontWeight: 500 }}>
                              + Add Activity
                            </button>
                            <div style={{ height: 1, background: "#F0F2FA" }} />
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
          style={{ ...ff, width: "100%", padding: "14px 0", background: "transparent", border: "2px dashed #EAECF4", borderRadius: 14, fontSize: 13, fontWeight: 700, color: "#8b90a7", cursor: "pointer", textAlign: "center" as const, marginTop: 4 }}>
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
  const [form, setForm] = useState({ title: "", week_label: "", color: "#6B73BF" });
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
      <Field label="Week Label"><input style={inp} value={form.week_label} onChange={e => setForm(f => ({ ...f, week_label: e.target.value }))} placeholder="e.g. Week 1–4" /></Field>
      <Field label="Color"><input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={{ width: "100%", height: 40, borderRadius: 8, border: "1.5px solid #EAECF4", cursor: "pointer" }} /></Field>
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
            style={{ border: `2px solid ${selected?.id === t.id ? "#6B73BF" : "#EAECF4"}`, borderRadius: 12, padding: 16, cursor: "pointer", background: selected?.id === t.id ? "#6B73BF08" : "#fff" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#1C2551", marginBottom: 4 }}>{t.title}</div>
            <div style={{ fontSize: 10, color: "#8b90a7", marginBottom: 8 }}>{t.description}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <span style={{ fontSize: 9, background: "#6B73BF15", color: "#6B73BF", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>{t.duration_weeks}w</span>
              <span style={{ fontSize: 9, background: "#EF4E2415", color: "#EF4E24", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>{t.structure.phases?.length ?? 0} phases</span>
              {t.is_system && <span style={{ fontSize: 9, background: "#22c55e15", color: "#22c55e", padding: "2px 8px", borderRadius: 10, fontWeight: 700 }}>System</span>}
            </div>
          </div>
        ))}
        {templates.length === 0 && <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "32px 0", fontSize: 12, color: "#8b90a7" }}>No templates available yet.</div>}
      </div>
      {selected && (
        <div style={{ background: "#F8F9FC", borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1C2551", marginBottom: 10 }}>Preview: {selected.title}</div>
          {(selected.structure.phases ?? []).map((ph, i) => (
            <div key={i} style={{ display: "flex", gap: 10, marginBottom: 8, alignItems: "flex-start" }}>
              <div style={{ width: 20, height: 20, borderRadius: 5, background: "#6B73BF", color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{i + 1}</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#1C2551" }}>{ph.title}</div>
                <div style={{ fontSize: 10, color: "#8b90a7" }}>{(ph.activities ?? []).map(a => a.title).join(" · ")}</div>
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
        <div style={{ textAlign: "center", padding: "20px 0", fontSize: 12, color: "#8b90a7" }}>No competencies yet.</div>
      ) : cats.map(cat => (
        <div key={cat} style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>{cat}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {list.filter(c => c.category === cat).map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, background: "#F8F9FC", border: "1px solid #EAECF4", borderRadius: 20, padding: "5px 12px" }}>
                <span style={{ fontSize: 12, color: "#1C2551" }}>{c.title}</span>
                <button onClick={() => remove(c.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#8b90a7", padding: 0 }}>✕</button>
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
    <Modal onClose={onClose} title={`Competencies — ${actTitle}`}>
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>Mapped</div>
        {mapped.length === 0 ? <div style={{ fontSize: 12, color: "#8b90a7" }}>None yet.</div> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {mapped.map(m => (
              <div key={m.competency_id} style={{ display: "flex", alignItems: "center", gap: 8, background: "#F8F9FC", borderRadius: 8, padding: "8px 12px" }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#1C2551", flex: 1 }}>{m.title}</span>
                <span style={{ fontSize: 9, background: "#6B73BF15", color: "#6B73BF", padding: "2px 8px", borderRadius: 10, fontWeight: 700, textTransform: "capitalize" }}>{m.level}</span>
                <button onClick={async () => { await competenciesApi.unmapFromActivity(actId, m.competency_id).catch(() => {}); onChanged(); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "#8b90a7" }}>✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
      {available.length > 0 && (
        <div style={{ borderTop: "1px solid #EAECF4", paddingTop: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>Add Competency</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 120px auto", gap: 8 }}>
            <select style={sel} value={selectedId} onChange={e => setSelectedId(e.target.value)}>
              <option value="">— Select —</option>
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
      {allCompetencies.length === 0 && <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 10 }}>No competencies defined yet. Use "✦ Competencies" to add them.</div>}
      <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
        <Btn onClick={onClose}>Close</Btn>
      </div>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════
// MY SESSIONS TAB — Session Management
// ══════════════════════════════════════════════════════════════════

const agendaTypeIcon: Record<string, string> = {
  presentation: "🎯", discussion: "💬", activity: "⚡", break: "☕", poll: "📊",
};
const agendaTypeColor: Record<string, string> = {
  presentation: "#6B73BF", discussion: "#22c55e", activity: "#EF4E24", break: "#8b90a7", poll: "#f59e0b",
};

function genId() { return Math.random().toString(36).slice(2, 11); }

function FacultySessions({ enrollments }: { enrollments: MyEnrollmentDTO[] }) {
  // ── List state ──────────────────────────────────────────────
  const [sessions, setSessions] = useState<SessionDTO[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [filterStatus, setFilterStatus] = useState("all");
  const [showCreate, setShowCreate] = useState(false);

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
    sessionsApi.list().then(r => setSessions(r.data ?? [])).catch(() => {}).finally(() => setLoadingList(false));
  }, []);
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

  // ── List view ─────────────────────────────────────────────────
  if (!selected) {
    const filtered = filterStatus === "all" ? sessions : sessions.filter(s => s.status === filterStatus);
    return (
      <div style={{ padding: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 17, fontWeight: 700, color: "#1C2551", ...ff }}>My Sessions</div>
          <Btn variant="orange" onClick={() => setShowCreate(true)}>+ Create Session</Btn>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {["all", "scheduled", "live", "completed", "cancelled"].map(st => (
            <button key={st} onClick={() => setFilterStatus(st)} style={{ ...ff, padding: "5px 14px", borderRadius: 20, border: `1.5px solid ${filterStatus===st?"#EF4E24":"#EAECF4"}`, background: filterStatus===st?"rgba(239,78,36,0.08)":"#fff", color: filterStatus===st?"#EF4E24":"#8b90a7", fontSize: 11, fontWeight: filterStatus===st?700:500, cursor: "pointer", textTransform: "capitalize" }}>
              {st === "all" ? "All" : st}
            </button>
          ))}
        </div>
        {loadingList ? (
          <div style={{ textAlign: "center", padding: 48, color: "#8b90a7", fontSize: 13, ...ff }}>Loading sessions…</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon="📅" title="No sessions yet" sub="Create your first session to get started" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {filtered.map(s => {
              const col: Record<string,string> = { classroom: "#1C2551", coaching_group: "#6B73BF", coaching_individual: "#EF4E24" };
              const c = col[s.session_type] ?? "#8b90a7";
              const icon = s.session_type==="classroom"?"🏫":s.session_type==="coaching_group"?"👥":"🎯";
              const date = new Date(s.scheduled_at);
              return (
                <div key={s.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF4", padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: c+"15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>{icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1C2551", ...ff }}>{s.title}</div>
                    <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: "#8b90a7", ...ff }}>📅 {date.toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})} at {date.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"})}</span>
                      <span style={{ fontSize: 11, color: "#8b90a7", ...ff }}>⏱ {s.duration_mins} min</span>
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                  <button onClick={() => openSession(s)} style={{ ...ff, fontSize: 12, fontWeight: 700, color: "#1C2551", background: "#1C255110", border: "none", borderRadius: 8, padding: "7px 16px", cursor: "pointer" }}>
                    Manage →
                  </button>
                </div>
              );
            })}
          </div>
        )}
        {showCreate && <CreateSessionModal enrollments={enrollments} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); loadSessions(); }} />}
      </div>
    );
  }

  // ── Detail view loading ───────────────────────────────────────
  if (loadingDetail) return (
    <div style={{ padding: 40, textAlign: "center", color: "#8b90a7", fontSize: 13, ...ff }}>Loading session…</div>
  );

  // ── Detail view ───────────────────────────────────────────────
  const cohortName = enrollments.find(e => e.cohort_id === selected.cohort_id)?.cohort_name ?? "Cohort";
  const totalAgendaMins = agenda.reduce((s, a) => s + a.duration_mins, 0);

  const tools: { id: "poll"|"breakout"|"timer"|"attendance"; icon: string; name: string; desc: string }[] = [
    { id: "poll",       icon: "▶", name: "Live Poll",       desc: "Launch a real-time poll" },
    { id: "breakout",   icon: "◎", name: "Breakout Groups", desc: `Randomize teams of ${groupCount}` },
    { id: "timer",      icon: "⏱", name: "Timer",           desc: "Session countdown" },
    { id: "attendance", icon: "◉", name: "Attendance",      desc: "Mark participant attendance" },
  ];

  return (
    <div style={{ padding: 24, ...ff }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <button onClick={() => setSelected(null)} style={{ ...ff, background: "transparent", border: "1.5px solid #EAECF4", borderRadius: 8, padding: "7px 14px", fontSize: 12, fontWeight: 600, color: "#8b90a7", cursor: "pointer" }}>← Back</button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#1C2551" }}>Session: {selected.title}</div>
          <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 2 }}>
            {cohortName} · {new Date(selected.scheduled_at).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})} · {selected.duration_mins} min
          </div>
        </div>
        <StatusBadge status={selected.status} />
      </div>

      {/* Main two-column */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: 20, marginBottom: 20 }}>

        {/* Agenda panel */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #EAECF4", overflow: "hidden" }}>
          <div style={{ padding: "12px 20px", borderBottom: "1px solid #EAECF4" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#8b90a7", letterSpacing: 1.5, textTransform: "uppercase" }}>Session Agenda</div>
          </div>
          {agenda.length === 0 && !showAddAgenda && (
            <div style={{ padding: "24px 20px", textAlign: "center", fontSize: 12, color: "#8b90a7" }}>No agenda yet. Add time blocks below.</div>
          )}
          {agenda.map((item, idx) => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "1px solid #F5F7FB", background: idx % 2 === 0 ? "#fff" : "#FAFBFF" }}>
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
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#1C2551" }}>{item.title}</span>
                  <span style={{ fontSize: 11, color: "#8b90a7", whiteSpace: "nowrap" }}>{item.duration_mins} min</span>
                  <button onClick={() => { setEditAgendaId(item.id); setEditAgendaForm({ title: item.title, duration_mins: item.duration_mins, type: item.type }); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#8b90a7", padding: "0 4px" }}>✏</button>
                  <button onClick={() => removeAgendaItem(item.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "#ef4444", padding: "0 4px" }}>✕</button>
                </>
              )}
            </div>
          ))}
          {showAddAgenda && (
            <div style={{ padding: "12px 20px", background: "#F8F9FC", borderBottom: "1px solid #EAECF4" }}>
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
            <button onClick={() => setShowAddAgenda(true)} style={{ ...ff, background: "transparent", border: "1.5px dashed #EAECF4", borderRadius: 8, padding: "6px 14px", fontSize: 11, fontWeight: 700, color: "#8b90a7", cursor: "pointer" }}>+ Add Item</button>
            <span style={{ fontSize: 11, color: "#8b90a7" }}>Total: <strong style={{ color: "#1C2551" }}>{totalAgendaMins} min</strong></span>
          </div>
        </div>

        {/* Tools panel */}
        <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #EAECF4", overflow: "hidden" }}>
          <div style={{ padding: "12px 20px", borderBottom: "1px solid #EAECF4" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "#8b90a7", letterSpacing: 1.5, textTransform: "uppercase" }}>Session Tools</div>
          </div>
          {tools.map(tool => (
            <div key={tool.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", borderBottom: "1px solid #F5F7FB" }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: activeTool===tool.id?"#EF4E24":"#1C255112", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: activeTool===tool.id?"#fff":"#1C2551", flexShrink: 0 }}>
                {tool.icon}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1C2551" }}>{tool.name}</div>
                <div style={{ fontSize: 10, color: "#8b90a7", marginTop: 2 }}>{tool.desc}</div>
              </div>
              <button onClick={() => setActiveTool(activeTool === tool.id ? null : tool.id)}
                style={{ ...ff, fontSize: 11, fontWeight: 700, color: activeTool===tool.id?"#EF4E24":"#1C2551", background: activeTool===tool.id?"rgba(239,78,36,0.08)":"#F5F7FB", border: `1.5px solid ${activeTool===tool.id?"#EF4E24":"#EAECF4"}`, borderRadius: 8, padding: "6px 14px", cursor: "pointer" }}>
                {activeTool === tool.id ? "Close" : "Launch"}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── POLL MODAL ──────────────────────────────────────────── */}
      {activeTool === "poll" && (() => {
        const canLaunch = !!newPoll.question && newPoll.options.filter(o => o.trim()).length >= 2;
        return (
          <div onClick={() => setActiveTool(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.45)", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, ...ff }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 500, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 32px 80px rgba(28,37,81,0.28)" }}>

              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "20px 24px", borderBottom: "1px solid #F0F2FA" }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: "#EF4E2415", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="#EF4E24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#1C2551" }}>Live Poll</div>
                  <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 2 }}>Launch a real-time poll to your cohort</div>
                </div>
                <button onClick={() => setActiveTool(null)} style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px solid #EAECF4", background: "#fff", cursor: "pointer", fontSize: 14, color: "#8b90a7", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              </div>

              {/* Create form */}
              <div style={{ padding: "20px 24px 0" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Poll Question</div>
                <input style={{ ...inp, marginBottom: 20, padding: "12px 14px" }} value={newPoll.question}
                  onChange={e => setNewPoll(f => ({ ...f, question: e.target.value }))}
                  placeholder="Type your question here..." />

                <div style={{ fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Answer Options</div>
                {newPoll.options.map((opt, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#F0F2FA", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#8b90a7", flexShrink: 0 }}>{i + 1}</div>
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
                    style={{ ...ff, background: "none", border: "none", padding: "0 0 16px", fontSize: 12, color: "#6B73BF", cursor: "pointer", fontWeight: 600 }}>
                    + Add option
                  </button>
                )}

                {/* Response type */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "#1C2551" }}>Response type:</span>
                  {(["single", "multiple"] as const).map(t => (
                    <button key={t} onClick={() => setPollResponseType(t)}
                      style={{ ...ff, border: `1.5px solid ${pollResponseType === t ? "#EF4E24" : "#EAECF4"}`, background: pollResponseType === t ? "rgba(239,78,36,0.06)" : "#fff", color: pollResponseType === t ? "#EF4E24" : "#8b90a7", borderRadius: 20, padding: "6px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      {t === "single" ? "Single choice" : "Multiple choice"}
                    </button>
                  ))}
                </div>

                {/* Launch button */}
                <button onClick={createPoll} disabled={!canLaunch || creatingPoll}
                  style={{ ...ff, width: "100%", padding: "14px 0", background: canLaunch ? "#EF4E24" : "#D1D5E4", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: canLaunch ? "pointer" : "not-allowed", marginBottom: 20 }}>
                  {creatingPoll ? "Launching…" : "Launch Poll →"}
                </button>
              </div>

              {/* Existing polls */}
              {polls.length > 0 && (
                <div style={{ borderTop: "1px solid #F0F2FA", padding: "16px 24px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#1C2551", marginBottom: 12 }}>Previous Polls</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {polls.map(p => {
                      const isActive = p.is_active;
                      const results = pollResults?.poll_id === p.id ? pollResults : null;
                      return (
                        <div key={p.id} style={{ border: `1.5px solid ${isActive ? "#EF4E24" : "#EAECF4"}`, borderRadius: 12, overflow: "hidden" }}>
                          <div style={{ padding: "10px 14px", background: isActive ? "rgba(239,78,36,0.04)" : "#F8F9FC", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: "#1C2551" }}>{p.question}</div>
                              <div style={{ fontSize: 10, color: "#8b90a7", marginTop: 2 }}>{p.options.length} options{isActive ? " · Live" : ""}</div>
                            </div>
                            {isActive
                              ? <Btn small variant="ghost" onClick={() => deactivatePoll(p.id)}>⏸ Pause</Btn>
                              : <Btn small variant="orange" onClick={() => activatePoll(p.id)}>▶ Activate</Btn>}
                          </div>
                          {results && (
                            <div style={{ padding: "10px 14px" }}>
                              <div style={{ fontSize: 10, color: "#8b90a7", marginBottom: 8 }}>Live results · {results.total} votes</div>
                              {results.votes.map(v => {
                                const pct = results.total > 0 ? Math.round((v.count / results.total) * 100) : 0;
                                return (
                                  <div key={v.option_index} style={{ marginBottom: 6 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                                      <span style={{ fontSize: 11, color: "#1C2551" }}>{v.option}</span>
                                      <span style={{ fontSize: 11, fontWeight: 700, color: "#EF4E24" }}>{pct}%</span>
                                    </div>
                                    <div style={{ height: 5, background: "#EAECF4", borderRadius: 3 }}>
                                      <div style={{ height: "100%", width: `${pct}%`, background: "#EF4E24", borderRadius: 3, transition: "width 0.5s ease" }} />
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
          </div>
        );
      })()}

      {/* ── BREAKOUT GROUPS MODAL ───────────────────────────────── */}
      {activeTool === "breakout" && (
        <div onClick={() => setActiveTool(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.45)", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, ...ff }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 32px 80px rgba(28,37,81,0.28)" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "20px 24px", borderBottom: "1px solid #F0F2FA" }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "#F0F2FA", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8b90a7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#1C2551" }}>Breakout Groups</div>
                <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 2 }}>Split participants into randomized groups</div>
              </div>
              <button onClick={() => setActiveTool(null)} style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px solid #EAECF4", background: "#fff", cursor: "pointer", fontSize: 14, color: "#8b90a7", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            {/* Config */}
            <div style={{ padding: "20px 24px" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>Number of Groups</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
                {[2,3,4,5,6,8].map(n => (
                  <button key={n} onClick={() => setGroupCount(n)}
                    style={{ ...ff, width: 44, height: 44, borderRadius: 10, border: `1.5px solid ${groupCount===n?"#EF4E24":"#EAECF4"}`, background: groupCount===n?"rgba(239,78,36,0.06)":"#fff", color: groupCount===n?"#EF4E24":"#1C2551", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                    {n}
                  </button>
                ))}
              </div>
              {cohortParts.length > 0 && (
                <div style={{ fontSize: 11, color: "#8b90a7", marginBottom: 20 }}>~{Math.ceil(cohortParts.length / groupCount)} participants per group</div>
              )}

              <div style={{ fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>Duration</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 24 }}>
                {[5,10,15,20,30].map(m => (
                  <button key={m} onClick={() => setBreakoutDuration(m)}
                    style={{ ...ff, borderRadius: 10, border: `1.5px solid ${breakoutDuration===m?"#EF4E24":"#EAECF4"}`, background: breakoutDuration===m?"rgba(239,78,36,0.06)":"#fff", color: breakoutDuration===m?"#EF4E24":"#1C2551", fontSize: 13, fontWeight: 600, padding: "8px 16px", cursor: "pointer" }}>
                    {m} min
                  </button>
                ))}
              </div>

              {cohortParts.length === 0 ? (
                <div style={{ textAlign: "center", padding: "12px 0", fontSize: 12, color: "#8b90a7", marginBottom: 16 }}>No participants found for this cohort.</div>
              ) : (
                <button onClick={() => { randomizeGroups(); }}
                  style={{ ...ff, width: "100%", padding: "14px 0", background: "#EF4E24", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer", marginBottom: breakoutGroups.length > 0 ? 20 : 0 }}>
                  Start Breakout →
                </button>
              )}

              {/* Generated groups */}
              {breakoutGroups.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12 }}>
                  {breakoutGroups.map(g => (
                    <div key={g.name} style={{ background: "#F8F9FC", borderRadius: 10, border: "1px solid #EAECF4", padding: "12px 14px" }}>
                      <div style={{ fontSize: 10, fontWeight: 800, color: "#EF4E24", marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 }}>{g.name}</div>
                      {g.members.map(m => (
                        <div key={m.id} style={{ fontSize: 12, color: "#1C2551", marginBottom: 5, display: "flex", alignItems: "center", gap: 6 }}>
                          <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#1C255115", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#1C2551", flexShrink: 0 }}>
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
        </div>
      )}

      {/* ── ATTENDANCE MODAL ─────────────────────────────────────── */}
      {activeTool === "attendance" && (() => {
        const sessionCode = selected.id.replace(/-/g, "").slice(0, 6).toUpperCase();
        const joinUrl = `xa-lms.app/join/${sessionCode}`;
        const qrData = encodeURIComponent(`https://${joinUrl}`);
        const presentCount = Object.values(attMap).filter(v => v === "present").length;
        const total = cohortParts.length;
        const pct = total > 0 ? Math.round((presentCount / total) * 100) : 0;
        return (
          <div onClick={() => setActiveTool(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.45)", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, ...ff }}>
            <div onClick={e => e.stopPropagation()}
              style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 720, maxHeight: "90vh", overflow: "hidden", boxShadow: "0 32px 80px rgba(28,37,81,0.28)", display: "flex", flexDirection: "column" }}>

              {/* Modal header */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "18px 24px", borderBottom: "1px solid #F0F2FA" }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "#22c55e15", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/>
                    <rect x="14" y="14" width="2" height="2"/><rect x="19" y="14" width="2" height="2"/><rect x="14" y="19" width="2" height="2"/><rect x="19" y="19" width="2" height="2"/>
                  </svg>
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#1C2551" }}>Attendance</div>
                  <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 2 }}>QR-based real-time check-in</div>
                </div>
                <button onClick={() => setActiveTool(null)} style={{ marginLeft: "auto", width: 32, height: 32, borderRadius: "50%", border: "1.5px solid #EAECF4", background: "#fff", cursor: "pointer", fontSize: 14, color: "#8b90a7", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
              </div>

              {/* Body */}
              <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", flex: 1, overflow: "hidden" }}>

                {/* Left — QR */}
                <div style={{ padding: "24px 20px", borderRight: "1px solid #F0F2FA", display: "flex", flexDirection: "column", alignItems: "center", gap: 14, background: "#FAFBFF" }}>
                  <div style={{ borderRadius: 14, overflow: "hidden", border: "1.5px solid #EAECF4", background: "#fff", padding: 10 }}>
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${qrData}&color=1C2551&bgcolor=ffffff&margin=0`}
                      alt="QR code"
                      width={160}
                      height={160}
                      style={{ display: "block" }}
                    />
                  </div>
                  <div style={{ textAlign: "center" }}>
                    <span style={{ fontSize: 12, color: "#8b90a7" }}>Session Code: </span>
                    <span style={{ fontSize: 14, fontWeight: 800, color: "#EF4E24", letterSpacing: 2 }}>{sessionCode}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
                    <div style={{ flex: 1, background: "#F0F2FA", borderRadius: 8, padding: "7px 10px", fontSize: 10, color: "#8b90a7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {joinUrl}
                    </div>
                    <button onClick={() => navigator.clipboard.writeText(`https://${joinUrl}`)}
                      style={{ ...ff, background: "#EF4E24", color: "#fff", border: "none", borderRadius: 8, padding: "7px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                      Copy
                    </button>
                  </div>
                </div>

                {/* Right — Participant list */}
                <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <div style={{ padding: "18px 22px 12px", flexShrink: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#1C2551" }}>Attendance</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>
                        <span style={{ color: "#22c55e" }}>{presentCount}/{total}</span>
                        <span style={{ color: "#22c55e", fontSize: 11 }}> ({pct}%)</span>
                      </span>
                    </div>
                    <div style={{ height: 5, background: "#F0F2FA", borderRadius: 3 }}>
                      <div style={{ height: "100%", width: `${pct}%`, background: "#22c55e", borderRadius: 3, transition: "width 0.4s ease" }} />
                    </div>
                  </div>

                  {total === 0 ? (
                    <div style={{ padding: "24px", textAlign: "center", fontSize: 12, color: "#8b90a7" }}>No participants found.</div>
                  ) : (
                    <div style={{ overflowY: "auto", flex: 1 }}>
                      {cohortParts.map(p => {
                        const status = attMap[p.user_id] ?? "waiting";
                        const isPresent = status === "present";
                        return (
                          <div key={p.user_id}
                            onClick={() => setAttMap(m => ({ ...m, [p.user_id]: isPresent ? "absent" : "present" }))}
                            style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 22px", borderBottom: "1px solid #F5F7FB", cursor: "pointer", background: isPresent ? "rgba(34,197,94,0.04)" : "#fff", transition: "background 0.15s" }}>
                            <div style={{ width: 10, height: 10, borderRadius: "50%", background: isPresent ? "#22c55e" : "#D1D5E4", flexShrink: 0 }} />
                            <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: "#1C2551" }}>{p.name}</span>
                            <span style={{ fontSize: 12, fontWeight: isPresent ? 700 : 400, color: isPresent ? "#22c55e" : "#8b90a7" }}>
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
              <div style={{ padding: "14px 24px", borderTop: "1px solid #F0F2FA", flexShrink: 0 }}>
                <button onClick={async () => { await submitAttendance(); setActiveTool(null); }} disabled={savingAtt}
                  style={{ ...ff, width: "100%", padding: "14px 0", background: "#EF4E24", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: savingAtt ? "not-allowed" : "pointer", opacity: savingAtt ? 0.7 : 1 }}>
                  {savingAtt ? "Saving…" : "Save Attendance Record"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── TIMER MODAL ──────────────────────────────────────────── */}
      {activeTool === "timer" && (
        <div onClick={() => { if (!timerRunning) setActiveTool(null); }}
          style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.45)", zIndex: 900, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, ...ff }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 20, width: "100%", maxWidth: 480, boxShadow: "0 32px 80px rgba(28,37,81,0.28)" }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "20px 24px", borderBottom: "1px solid #F0F2FA" }}>
              <div style={{ width: 48, height: 48, borderRadius: 14, background: "#F0F2FA", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#8b90a7" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#1C2551" }}>Timer</div>
                <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 2 }}>Set a visible countdown for your participants</div>
              </div>
              <button onClick={() => { setTimerRunning(false); setTimerRemaining(0); setActiveTool(null); }}
                style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px solid #EAECF4", background: "#fff", cursor: "pointer", fontSize: 14, color: "#8b90a7", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* Running countdown */}
              {timerRunning || timerRemaining > 0 ? (
                <div style={{ textAlign: "center", marginBottom: 24 }}>
                  <div style={{ fontSize: 64, fontWeight: 800, color: timerRemaining <= 60 ? "#EF4E24" : "#1C2551", letterSpacing: -3, lineHeight: 1, marginBottom: 8 }}>
                    {String(Math.floor(timerRemaining / 60)).padStart(2, "0")}:{String(timerRemaining % 60).padStart(2, "0")}
                  </div>
                  {timerRemaining === 0 && <div style={{ fontSize: 13, fontWeight: 700, color: "#22c55e" }}>Time is up! ✓</div>}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 12 }}>Preset Duration</div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
                    {[1,5,10,15,20,30,45,60].map(m => (
                      <button key={m} onClick={() => { setTimerMins(m); setTimerRemaining(0); setTimerCustom(""); }}
                        style={{ ...ff, borderRadius: 10, border: `1.5px solid ${timerMins===m && !timerCustom?"#EF4E24":"#EAECF4"}`, background: timerMins===m && !timerCustom?"rgba(239,78,36,0.06)":"#fff", color: timerMins===m && !timerCustom?"#EF4E24":"#1C2551", fontSize: 12, fontWeight: 600, padding: "8px 14px", cursor: "pointer" }}>
                        {m} min
                      </button>
                    ))}
                  </div>

                  <div style={{ fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 10 }}>Custom (Minutes)</div>
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
                <span style={{ fontSize: 13, color: "#1C2551", fontWeight: 500 }}>Visible to all participants</span>
              </div>

              {/* Action buttons */}
              {timerRunning ? (
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setTimerRunning(false)} style={{ ...ff, flex: 1, padding: "14px 0", background: "#F0F2FA", color: "#1C2551", border: "none", borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>⏸ Pause</button>
                  <button onClick={() => { setTimerRunning(false); setTimerRemaining(0); }}
                    style={{ ...ff, padding: "14px 20px", background: "#fff", color: "#8b90a7", border: "1.5px solid #EAECF4", borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Reset</button>
                </div>
              ) : timerRemaining > 0 ? (
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setTimerRunning(true)} style={{ ...ff, flex: 1, padding: "14px 0", background: "#EF4E24", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>▶ Resume →</button>
                  <button onClick={() => { setTimerRunning(false); setTimerRemaining(0); }}
                    style={{ ...ff, padding: "14px 20px", background: "#fff", color: "#8b90a7", border: "1.5px solid #EAECF4", borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Reset</button>
                </div>
              ) : (
                <button onClick={() => { const mins = timerCustom ? Number(timerCustom) : timerMins; if (mins < 1) return; setTimerMins(mins); setTimerRemaining(mins * 60); setTimerRunning(true); }}
                  style={{ ...ff, width: "100%", padding: "14px 0", background: "#EF4E24", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
                  Start Timer →
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── SESSION LIFECYCLE BUTTON ─────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        {selected.status === "scheduled" && (
          <button onClick={startSession} style={{ ...ff, width: "100%", padding: "16px 0", background: "#EF4E24", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer", letterSpacing: 0.5 }}>
            ▶ Start Live Session
          </button>
        )}
        {selected.status === "live" && (
          <button onClick={endSession} style={{ ...ff, width: "100%", padding: "16px 0", background: "#1C2551", color: "#fff", border: "none", borderRadius: 12, fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
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

      {/* ── POST-SESSION PANEL ───────────────────────────────────── */}
      {(selected.status === "live" || selected.status === "completed") && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>

          {/* Notes */}
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #EAECF4", padding: "18px 20px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1C2551" }}>Session Notes</div>
              {savingNotes && <span style={{ fontSize: 10, color: "#22c55e" }}>Saving…</span>}
            </div>
            <textarea
              style={{ ...ta, minHeight: 140, background: "#FAFBFF", border: "1.5px solid #EAECF4" }}
              value={sessionNotes}
              onChange={e => handleNotesChange(e.target.value)}
              placeholder="Observations, key takeaways, follow-up topics…"
            />
          </div>

          {/* Action Items */}
          <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #EAECF4", overflow: "hidden" }}>
            <div style={{ padding: "14px 20px", borderBottom: "1px solid #EAECF4", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1C2551" }}>Action Items</div>
              <Btn small variant="orange" onClick={() => setShowAddAction(true)}>+ Add</Btn>
            </div>
            {showAddAction && (
              <div style={{ padding: "12px 20px", background: "#F8F9FC", borderBottom: "1px solid #EAECF4" }}>
                <Field label="Description"><input style={inp} value={newAction.description} onChange={e => setNewAction(f => ({ ...f, description: e.target.value }))} placeholder="Follow up with participant on…" autoFocus /></Field>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <Field label="Assign to (optional)">
                    <select style={sel} value={newAction.participant_id} onChange={e => setNewAction(f => ({ ...f, participant_id: e.target.value }))}>
                      <option value="">— Whole cohort —</option>
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
                <div style={{ padding: "20px", textAlign: "center", fontSize: 12, color: "#8b90a7" }}>No action items yet.</div>
              ) : actionItems.map(item => {
                const completed = item.status === "completed";
                const assignee = cohortParts.find(p => p.user_id === item.participant_id);
                return (
                  <div key={item.id} style={{ display: "flex", gap: 10, padding: "11px 20px", borderBottom: "1px solid #F5F7FB", alignItems: "flex-start" }}>
                    <button onClick={() => toggleAction(item)} style={{ marginTop: 2, width: 16, height: 16, borderRadius: 4, border: `2px solid ${completed?"#22c55e":"#EAECF4"}`, background: completed?"#22c55e":"transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {completed && <span style={{ color: "#fff", fontSize: 9, fontWeight: 800 }}>✓</span>}
                    </button>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: completed?"#8b90a7":"#1C2551", textDecoration: completed?"line-through":"none" }}>{item.description}</div>
                      <div style={{ fontSize: 10, color: "#8b90a7", marginTop: 2, display: "flex", gap: 8 }}>
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

function CreateSessionModal({ enrollments, onClose, onCreated }: { enrollments: MyEnrollmentDTO[]; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ title: "", description: "", session_type: "classroom", cohort_id: enrollments[0]?.cohort_id ?? "", program_id: enrollments[0]?.program_id ?? "", scheduled_at: "", duration_mins: 60, virtual_link: "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  function set(k: string, v: string|number) { setForm(f => ({ ...f, [k]: v })); }
  async function submit() {
    if (!form.title || !form.scheduled_at || !form.cohort_id) { setErr("Title, date/time, and cohort are required"); return; }
    setSaving(true); setErr("");
    try {
      await sessionsApi.create({ program_id: form.program_id, cohort_id: form.cohort_id, title: form.title, description: form.description || undefined, session_type: form.session_type, virtual_link: form.virtual_link || undefined, scheduled_at: new Date(form.scheduled_at).toISOString(), duration_mins: Number(form.duration_mins) });
      onCreated();
    } catch (e: any) { setErr(e.message ?? "Failed to create session"); }
    finally { setSaving(false); }
  }
  return (
    <Modal onClose={onClose} title="Create Session">
      {err && <div style={{ background: "rgba(239,78,36,0.08)", border: "1px solid rgba(239,78,36,0.2)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "#EF4E24", fontWeight: 600, ...ff }}>{err}</div>}
      <Field label="Title"><input style={inp} value={form.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Strategic Leadership – Module 3" /></Field>
      <Field label="Session Type">
        <select style={sel} value={form.session_type} onChange={e => set("session_type", e.target.value)}>
          <option value="classroom">Classroom</option>
          <option value="coaching_group">Coaching Group</option>
          <option value="coaching_individual">Coaching Individual</option>
        </select>
      </Field>
      {enrollments.length > 1 && (
        <Field label="Cohort">
          <select style={sel} value={form.cohort_id} onChange={e => { const en = enrollments.find(x => x.cohort_id === e.target.value); setForm(f => ({ ...f, cohort_id: e.target.value, program_id: en?.program_id ?? f.program_id })); }}>
            {enrollments.map(en => <option key={en.cohort_id} value={en.cohort_id}>{en.cohort_name} — {en.program_title}</option>)}
          </select>
        </Field>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <Field label="Date & Time"><input type="datetime-local" style={inp} value={form.scheduled_at} onChange={e => set("scheduled_at", e.target.value)} /></Field>
        <Field label="Duration (mins)"><input type="number" style={inp} value={form.duration_mins} min={15} step={15} onChange={e => set("duration_mins", e.target.value)} /></Field>
      </div>
      <Field label="Virtual Link (optional)"><input style={inp} value={form.virtual_link} onChange={e => set("virtual_link", e.target.value)} placeholder="https://zoom.us/j/…" /></Field>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
        <Btn variant="orange" onClick={submit} disabled={saving}>{saving ? "Creating…" : "Create Session"}</Btn>
      </div>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════
// GRADING QUEUE TAB
// ══════════════════════════════════════════════════════════════════

function FacultyGrading({ enrollments }: { enrollments: MyEnrollmentDTO[] }) {
  const [activities, setActivities] = useState<(ActivityDTO & { programTitle: string })[]>([]);
  const [selectedActivity, setSelectedActivity] = useState("");
  const [submissions, setSubmissions] = useState<SubmissionDTO[]>([]);
  const [loadingActs, setLoadingActs] = useState(true);
  const [loadingSubs, setLoadingSubs] = useState(false);
  const [gradingId, setGradingId] = useState<string | null>(null);
  const [gradeForm, setGradeForm] = useState({ grade: "", feedback: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const pids = [...new Set(enrollments.map(e => e.program_id))];
    Promise.all(pids.map(id => programsApi.get(id)))
      .then(results => {
        const acts: (ActivityDTO & { programTitle: string })[] = [];
        results.forEach(r => { const p = r.data; (p?.phases ?? []).forEach(ph => (ph.activities ?? []).forEach(a => acts.push({ ...a, programTitle: p.title }))); });
        setActivities(acts);
      }).catch(() => {}).finally(() => setLoadingActs(false));
  }, [enrollments]);

  function loadSubs(actId: string) {
    setSelectedActivity(actId); setLoadingSubs(true); setSubmissions([]);
    submissionsApi.list(actId).then(r => setSubmissions(r.data ?? [])).catch(() => {}).finally(() => setLoadingSubs(false));
  }

  async function submitGrade(subId: string) {
    if (!gradeForm.grade) return;
    setSaving(true);
    try {
      const updated = await submissionsApi.grade(subId, { grade: Number(gradeForm.grade), feedback: gradeForm.feedback });
      setSubmissions(prev => prev.map(s => s.id === subId ? (updated.data ?? s) : s));
      setGradingId(null); setGradeForm({ grade: "", feedback: "" });
    } catch {} finally { setSaving(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ fontSize: 17, fontWeight: 700, color: "#1C2551", marginBottom: 20, ...ff }}>Grading Queue</div>
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF4", padding: "16px 20px", marginBottom: 20 }}>
        <Field label="Select Activity">
          {loadingActs ? <div style={{ fontSize: 13, color: "#8b90a7", ...ff }}>Loading activities…</div>
            : activities.length === 0 ? <div style={{ fontSize: 13, color: "#8b90a7", ...ff }}>No activities found in your programs.</div>
            : (
              <select style={sel} value={selectedActivity} onChange={e => loadSubs(e.target.value)}>
                <option value="">— Select an activity —</option>
                {activities.map(a => <option key={a.id} value={a.id}>{a.programTitle} › {a.title}</option>)}
              </select>
            )}
        </Field>
      </div>
      {selectedActivity && (
        loadingSubs ? <div style={{ textAlign: "center", padding: 40, color: "#8b90a7", fontSize: 13, ...ff }}>Loading…</div>
        : submissions.length === 0 ? <EmptyState icon="📭" title="No submissions yet" sub="Participants haven't submitted for this activity" />
        : (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF4", overflow: "hidden" }}>
            <div style={{ padding: "12px 20px", borderBottom: "1px solid #EAECF4", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: "#1C2551", ...ff }}>{submissions.length} submission{submissions.length !== 1 ? "s" : ""}</span>
              <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 600, ...ff }}>{submissions.filter(s => s.status === "graded").length} graded</span>
            </div>
            {submissions.map(sub => (
              <div key={sub.id}>
                <div style={{ padding: "14px 20px", borderBottom: "1px solid #F5F7FB", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 36, height: 36, borderRadius: "50%", background: "#1C255115", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#1C2551", flexShrink: 0 }}>P</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#1C2551", ...ff }}>Participant</div>
                    <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 2, ...ff }}>
                      {new Date(sub.submitted_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      {sub.grade != null && <span style={{ marginLeft: 10, color: "#22c55e", fontWeight: 700 }}>Grade: {sub.grade}</span>}
                    </div>
                  </div>
                  <StatusBadge status={sub.status} />
                  {sub.status !== "graded" && <Btn small onClick={() => { setGradingId(sub.id); setGradeForm({ grade: "", feedback: "" }); }}>Grade</Btn>}
                </div>
                {gradingId === sub.id && (
                  <div style={{ padding: "14px 20px 16px", background: "#F8F9FC", borderBottom: "1px solid #EAECF4" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 12 }}>
                      <Field label="Grade (0–100)"><input type="number" style={inp} min={0} max={100} value={gradeForm.grade} onChange={e => setGradeForm(f => ({ ...f, grade: e.target.value }))} placeholder="85" /></Field>
                      <Field label="Feedback"><textarea style={{ ...ta, minHeight: 60 }} value={gradeForm.feedback} onChange={e => setGradeForm(f => ({ ...f, feedback: e.target.value }))} /></Field>
                    </div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <Btn variant="ghost" onClick={() => setGradingId(null)}>Cancel</Btn>
                      <Btn onClick={() => submitGrade(sub.id)} disabled={saving || !gradeForm.grade}>{saving ? "Saving…" : "Submit Grade"}</Btn>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// COACHING TAB
// ══════════════════════════════════════════════════════════════════

function FacultyCoaching({ enrollments }: { enrollments: MyEnrollmentDTO[] }) {
  const [sessions, setSessions] = useState<SessionDTO[]>([]);
  const [selectedSession, setSelectedSession] = useState("");
  const [notes, setNotes] = useState<CoachingNoteDTO[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [noteForm, setNoteForm] = useState({ participant_id: "", notes: "", is_private: false });
  const [editForm, setEditForm] = useState({ notes: "", is_private: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    sessionsApi.list().then(r => setSessions(r.data ?? [])).catch(() => {}).finally(() => setLoadingSessions(false));
  }, []);

  function loadNotes(sid: string) {
    setSelectedSession(sid); setLoadingNotes(true); setNotes([]);
    coachingApi.listBySession(sid).then(r => setNotes(r.data ?? [])).catch(() => {}).finally(() => setLoadingNotes(false));
  }

  async function addNote() {
    if (!noteForm.participant_id || !noteForm.notes) return;
    setSaving(true);
    try {
      const r = await coachingApi.create({ session_id: selectedSession, ...noteForm });
      if (r.data) setNotes(prev => [r.data!, ...prev]);
      setNoteForm({ participant_id: "", notes: "", is_private: false }); setShowAddForm(false);
    } catch {} finally { setSaving(false); }
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      const r = await coachingApi.update(id, editForm);
      if (r.data) setNotes(prev => prev.map(n => n.id === id ? r.data! : n));
      setEditingId(null);
    } catch {} finally { setSaving(false); }
  }

  return (
    <div style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#1C2551", ...ff }}>Coaching Notes</div>
        {selectedSession && <Btn variant="orange" onClick={() => setShowAddForm(true)}>+ Add Note</Btn>}
      </div>
      <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF4", padding: "16px 20px", marginBottom: 20 }}>
        <Field label="Select Session">
          {loadingSessions ? <div style={{ fontSize: 13, color: "#8b90a7", ...ff }}>Loading…</div>
            : sessions.length === 0 ? <div style={{ fontSize: 13, color: "#8b90a7", ...ff }}>No sessions found.</div>
            : (
              <select style={sel} value={selectedSession} onChange={e => loadNotes(e.target.value)}>
                <option value="">— Select a session —</option>
                {sessions.map(s => <option key={s.id} value={s.id}>{s.title} ({new Date(s.scheduled_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })})</option>)}
              </select>
            )}
        </Field>
      </div>
      {showAddForm && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1.5px solid #6B73BF30", padding: "16px 20px", marginBottom: 20 }}>
          <Field label="Participant ID"><input style={inp} value={noteForm.participant_id} onChange={e => setNoteForm(f => ({ ...f, participant_id: e.target.value }))} placeholder="Paste participant UUID" /></Field>
          <Field label="Notes"><textarea style={ta} value={noteForm.notes} onChange={e => setNoteForm(f => ({ ...f, notes: e.target.value }))} placeholder="Observation, feedback, or action item…" /></Field>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#1C2551", fontWeight: 600, cursor: "pointer", ...ff }}>
              <input type="checkbox" checked={noteForm.is_private} onChange={e => setNoteForm(f => ({ ...f, is_private: e.target.checked }))} />
              🔒 Private
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <Btn variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Btn>
              <Btn onClick={addNote} disabled={saving || !noteForm.participant_id || !noteForm.notes}>{saving ? "Saving…" : "Save"}</Btn>
            </div>
          </div>
        </div>
      )}
      {selectedSession && (
        loadingNotes ? <div style={{ textAlign: "center", padding: 40, color: "#8b90a7", fontSize: 13, ...ff }}>Loading…</div>
        : notes.length === 0 ? <EmptyState icon="📝" title="No notes yet" sub="Add your first coaching note for this session" />
        : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {notes.map(note => (
              <div key={note.id} style={{ background: "#fff", borderRadius: 12, border: `1px solid ${note.is_private ? "#6B73BF30" : "#EAECF4"}`, padding: "16px 20px" }}>
                {editingId === note.id ? (
                  <>
                    <textarea style={ta} value={editForm.notes} onChange={e => setEditForm(f => ({ ...f, notes: e.target.value }))} />
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "#1C2551", cursor: "pointer", ...ff }}>
                        <input type="checkbox" checked={editForm.is_private} onChange={e => setEditForm(f => ({ ...f, is_private: e.target.checked }))} />
                        🔒 Private
                      </label>
                      <div style={{ display: "flex", gap: 8 }}>
                        <Btn variant="ghost" onClick={() => setEditingId(null)}>Cancel</Btn>
                        <Btn onClick={() => saveEdit(note.id)} disabled={saving}>{saving ? "Saving…" : "Save"}</Btn>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <span style={{ fontSize: 11, color: "#8b90a7", ...ff }}>Participant: {note.participant_id.slice(0, 8)}…</span>
                        {note.is_private && <span style={{ marginLeft: 8, fontSize: 10, color: "#6B73BF", fontWeight: 700, background: "#6B73BF15", padding: "2px 8px", borderRadius: 20, ...ff }}>🔒 Private</span>}
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 10, color: "#8b90a7", ...ff }}>{new Date(note.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</span>
                        <button onClick={() => { setEditingId(note.id); setEditForm({ notes: note.notes, is_private: note.is_private }); }} style={{ ...ff, background: "transparent", border: "1px solid #EAECF4", borderRadius: 6, padding: "4px 10px", fontSize: 11, cursor: "pointer", color: "#8b90a7" }}>Edit</button>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: "#1C2551", lineHeight: 1.6, ...ff }}>{note.notes}</div>
                  </>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════
// CONTENT LIBRARY TAB
// ══════════════════════════════════════════════════════════════════

type RichMaterial = MaterialDTO & { sessionTitle: string };

function FacultyContent() {
  const [sessions, setSessions]         = useState<SessionDTO[]>([]);
  const [allMats, setAllMats]           = useState<RichMaterial[]>([]);
  const [loading, setLoading]           = useState(true);
  const [subTab, setSubTab]             = useState<"library" | "questions" | "ai">("library");
  const [typeFilter, setTypeFilter]     = useState("all");
  const [search, setSearch]             = useState("");
  const [showUpload, setShowUpload]     = useState(false);
  const [uploadForm, setUploadForm]     = useState({ title: "", type: "pdf", url: "", session_id: "" });
  const [saving, setSaving]             = useState(false);
  const [dragOver, setDragOver]         = useState(false);
  const [pickedFile, setPickedFile]     = useState<File | null>(null);
  const fileInputRef                    = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setLoading(true);
    sessionsApi.list()
      .then(async r => {
        const sess = r.data ?? [];
        setSessions(sess);
        const groups = await Promise.all(
          sess.map(async s => {
            const mr = await sessionsApi.getMaterials(s.id).catch(() => null);
            return (mr?.data ?? []).map(m => ({ ...m, sessionTitle: s.title }));
          })
        );
        setAllMats(groups.flat());
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const typeOptions = ["all", "video", "pdf", "ppt", "scorm", "article", "link"] as const;

  type TM = { label: string; bg: string; color: string; icon: string };
  const typeMeta: Record<string, TM> = {
    video:   { label: "Video",   bg: "#EF4E2415", color: "#EF4E24", icon: "▶" },
    pdf:     { label: "PDF",     bg: "#1C255115", color: "#1C2551", icon: "📄" },
    ppt:     { label: "PPT",     bg: "#EF4E2415", color: "#EF4E24", icon: "📊" },
    scorm:   { label: "SCORM",   bg: "#6B73BF15", color: "#6B73BF", icon: "⊙" },
    article: { label: "Article", bg: "#8b90a720", color: "#8b90a7", icon: "📝" },
    link:    { label: "Link",    bg: "#8b90a720", color: "#8b90a7", icon: "🔗" },
  };

  const filtered = allMats.filter(m => {
    if (typeFilter !== "all" && m.type !== typeFilter) return false;
    if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const stats = [
    { label: "Total Items",  value: allMats.length.toString(),        sub: "Content pieces",       color: "#1C2551",  icon: "◇" },
    { label: "Published",    value: allMats.length.toString(),        sub: "Active & assigned",    color: "#22c55e",  icon: "◆" },
    { label: "Total Views",  value: "—",                              sub: "Across all content",   color: "#EF4E24",  icon: "●" },
    { label: "Storage Used", value: "—",                              sub: "of 5 GB quota",        color: "#1C2551",  icon: "◇" },
  ];

  function handleFileSelect(file: File) {
    setPickedFile(file);
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const extToType: Record<string, string> = {
      pdf: "pdf", ppt: "ppt", pptx: "ppt", mp4: "video", mov: "video", avi: "video",
      zip: "scorm", md: "article", html: "article",
    };
    const detectedType = extToType[ext] ?? "link";
    const titleFromFile = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
    setUploadForm(f => ({
      ...f,
      type: detectedType,
      title: f.title || titleFromFile,
    }));
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  }

  function resetUpload() {
    setUploadForm({ title: "", type: "pdf", url: "", session_id: "" });
    setPickedFile(null);
    setShowUpload(false);
  }

  async function uploadContent() {
    if (!uploadForm.title || !uploadForm.url) return;
    setSaving(true);
    try {
      const targetSession = uploadForm.session_id || sessions[0]?.id;
      if (!targetSession) {
        setSaving(false);
        return;
      }
      const r = await sessionsApi.addMaterial(targetSession, {
        title: uploadForm.title, type: uploadForm.type, url: uploadForm.url,
      });
      if (r.data) {
        const sess = sessions.find(s => s.id === targetSession);
        setAllMats(prev => [...prev, { ...r.data!, sessionTitle: sess?.title ?? "" }]);
      }
      resetUpload();
    } catch {} finally { setSaving(false); }
  }

  return (
    <div style={{ padding: 24, ...ff }}>

      {/* ── Stat cards ─────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 22 }}>
        {stats.map(s => (
          <div key={s.label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF4", padding: "18px 20px", boxShadow: "0 1px 4px rgba(28,37,81,0.07)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.3 }}>{s.label}</span>
              <span style={{ fontSize: 16, color: s.color, opacity: 0.5 }}>{s.icon}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 6 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Sub-tabs + Upload button ────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, gap: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {(["library", "questions", "ai"] as const).map((t, i) => {
            const labels = ["My Library", "Question Bank", "AI Studio"];
            const active = subTab === t;
            return (
              <button key={t} onClick={() => setSubTab(t)}
                style={{ ...ff, padding: "7px 18px", borderRadius: 20, fontSize: 12, fontWeight: active ? 700 : 500, border: active ? "1.5px solid #EF4E24" : "1.5px solid #EAECF4", background: "#fff", color: active ? "#EF4E24" : "#8b90a7", cursor: "pointer" }}>
                {labels[i]}
              </button>
            );
          })}
        </div>
        <button onClick={() => setShowUpload(true)}
          style={{ ...ff, background: "#EF4E24", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer", whiteSpace: "nowrap" as const }}>
          + Upload Content
        </button>
      </div>

      {/* ── My Library ─────────────────────────────────── */}
      {subTab === "library" && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF4", overflow: "hidden" }}>
          {/* Search + filter row */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid #EAECF4", flexWrap: "wrap" as const }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: "#F5F7FB", borderRadius: 8, padding: "8px 14px", minWidth: 200 }}>
              <span style={{ color: "#8b90a7", fontSize: 14 }}>🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search content…"
                style={{ ...ff, flex: 1, border: "none", background: "transparent", fontSize: 13, color: "#1C2551", outline: "none" }} />
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
              {typeOptions.map(t => {
                const active = typeFilter === t;
                return (
                  <button key={t} onClick={() => setTypeFilter(t)}
                    style={{ ...ff, padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: active ? 700 : 500, border: active ? "1.5px solid #EF4E24" : "1.5px solid #EAECF4", background: active ? "#EF4E24" : "#fff", color: active ? "#fff" : "#8b90a7", cursor: "pointer", textTransform: "capitalize" as const }}>
                    {t === "all" ? "All" : t.toUpperCase()}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Table header */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 180px 90px 70px 100px 140px", gap: 0, padding: "10px 20px", background: "#F5F7FB", borderBottom: "1px solid #EAECF4" }}>
            {["Title", "Program", "Type", "Views", "Status", "Actions"].map(h => (
              <div key={h} style={{ fontSize: 11, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5 }}>{h}</div>
            ))}
          </div>

          {/* Table body */}
          {loading ? (
            <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#8b90a7" }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: "40px 0" }}>
              <EmptyState icon="📁" title="No content yet" sub='Click "+ Upload Content" to add videos, PDFs, presentations or links.' />
            </div>
          ) : filtered.map((m, idx) => {
            const tm = typeMeta[m.type] ?? typeMeta.link;
            return (
              <div key={m.id}
                style={{ display: "grid", gridTemplateColumns: "1fr 180px 90px 70px 100px 140px", gap: 0, padding: "14px 20px", borderBottom: idx < filtered.length - 1 ? "1px solid #EAECF4" : "none", alignItems: "center" }}>
                {/* Title + meta */}
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: tm.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0, color: tm.color }}>
                    {tm.icon}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1C2551", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{m.title}</div>
                    <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 2 }}>
                      Updated {new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </div>
                  </div>
                </div>
                {/* Program */}
                <div style={{ fontSize: 12, color: "#8b90a7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, paddingRight: 8 }}>{m.sessionTitle || "—"}</div>
                {/* Type badge */}
                <div>
                  <span style={{ fontSize: 10, fontWeight: 700, background: tm.bg, color: tm.color, padding: "3px 9px", borderRadius: 20 }}>{tm.label}</span>
                </div>
                {/* Views */}
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1C2551" }}>—</div>
                {/* Status */}
                <div>
                  <span style={{ fontSize: 10, fontWeight: 700, background: "#22c55e15", color: "#22c55e", padding: "3px 9px", borderRadius: 20 }}>Published</span>
                </div>
                {/* Actions */}
                <div style={{ display: "flex", gap: 6 }}>
                  <a href={m.url} target="_blank" rel="noreferrer"
                    style={{ ...ff, fontSize: 11, fontWeight: 600, color: "#1C2551", background: "#F5F7FB", border: "1px solid #EAECF4", padding: "5px 12px", borderRadius: 6, textDecoration: "none", cursor: "pointer" }}>
                    Preview
                  </a>
                  <button
                    style={{ ...ff, fontSize: 11, fontWeight: 700, color: "#EF4E24", background: "#EF4E2410", border: "1px solid #EF4E2430", padding: "5px 10px", borderRadius: 6, cursor: "pointer" }}>
                    + AI
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Question Bank placeholder ───────────────────── */}
      {subTab === "questions" && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF4" }}>
          <EmptyState icon="📝" title="Question Bank" sub="Build and manage your question bank for assessments. Coming soon." />
        </div>
      )}

      {/* ── AI Studio placeholder ───────────────────────── */}
      {subTab === "ai" && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF4" }}>
          <EmptyState icon="✦" title="AI Studio" sub="AI-assisted content enhancement, gap identification, difficulty calibration and tagging. Coming soon." />
        </div>
      )}

      {/* ── Upload modal ────────────────────────────────── */}
      {/* Hidden file input — triggered by clicking the drop zone */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,.pdf,.ppt,.pptx,.zip,.md,.html"
        style={{ display: "none" }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); e.target.value = ""; }}
      />

      {showUpload && (
        <div onClick={() => { if (!saving) resetUpload(); }}
          style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, boxShadow: "0 24px 64px rgba(28,37,81,0.22)", overflow: "hidden", maxHeight: "90vh", overflowY: "auto" as const }}>

            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid #EAECF4" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#1C2551", ...ff }}>Upload Content</span>
              <button onClick={resetUpload}
                style={{ width: 28, height: 28, borderRadius: "50%", border: "1.5px solid #EAECF4", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "#8b90a7", lineHeight: 1 }}>
                ×
              </button>
            </div>

            <div style={{ padding: "20px 24px" }}>
              {/* Drop zone — fully clickable */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleFileDrop}
                style={{ border: `2px dashed ${dragOver ? "#EF4E24" : pickedFile ? "#22c55e" : "#D1D5E4"}`, borderRadius: 12, padding: "28px 24px", textAlign: "center" as const, background: dragOver ? "#EF4E2408" : pickedFile ? "#22c55e08" : "#FAFBFF", transition: "all 0.15s", marginBottom: 18, cursor: "pointer", userSelect: "none" as const }}>
                {pickedFile ? (
                  <>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#22c55e", marginBottom: 4 }}>{pickedFile.name}</div>
                    <div style={{ fontSize: 11, color: "#8b90a7" }}>{(pickedFile.size / 1024 / 1024).toFixed(1)} MB · Click to change file</div>
                  </>
                ) : (
                  <>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#8b90a7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 10px" }}>
                      <path d="M12 16V8m0 0-3 3m3-3 3 3" /><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
                    </svg>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "#1C2551", marginBottom: 4, ...ff }}>Drag &amp; drop or click to upload</div>
                    <div style={{ fontSize: 12, color: "#8b90a7", marginBottom: 14, ...ff }}>Supports MP4, PDF, PPT, PPTX, SCORM (.zip), Markdown</div>
                    <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" as const }}>
                      {["Video", "PDF", "PPT", "SCORM", "Article"].map(t => (
                        <span key={t} style={{ padding: "4px 14px", borderRadius: 20, border: "1.5px solid #EAECF4", fontSize: 11, fontWeight: 600, color: "#8b90a7", background: "#fff", ...ff }}>{t}</span>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Form fields */}
              <div style={{ display: "grid", gap: 14 }}>
                <Field label="Title">
                  <input style={inp} value={uploadForm.title}
                    onChange={e => setUploadForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Leadership Frameworks – Executive Overview" />
                </Field>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <Field label="Type">
                    <select style={sel} value={uploadForm.type} onChange={e => setUploadForm(f => ({ ...f, type: e.target.value }))}>
                      <option value="video">Video</option>
                      <option value="pdf">PDF</option>
                      <option value="ppt">PPT</option>
                      <option value="scorm">SCORM</option>
                      <option value="article">Article</option>
                      <option value="link">Link</option>
                    </select>
                  </Field>
                  <Field label={`Session ${sessions.length === 0 ? "(no sessions yet)" : "(optional)"}`}>
                    <select style={sel} value={uploadForm.session_id} onChange={e => setUploadForm(f => ({ ...f, session_id: e.target.value }))} disabled={sessions.length === 0}>
                      <option value="">— Select session —</option>
                      {sessions.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                    </select>
                  </Field>
                </div>

                <Field label="URL / Cloud Link">
                  <input style={inp} value={uploadForm.url}
                    onChange={e => setUploadForm(f => ({ ...f, url: e.target.value }))}
                    placeholder="https://drive.google.com/… or https://vimeo.com/…" />
                  <div style={{ fontSize: 10, color: "#8b90a7", marginTop: 4, ...ff }}>
                    Paste the shareable link to your file hosted on Google Drive, Vimeo, Dropbox, S3, etc.
                  </div>
                </Field>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 20 }}>
                <button onClick={resetUpload}
                  style={{ ...ff, padding: "9px 18px", borderRadius: 8, border: "1.5px solid #EAECF4", background: "#fff", fontSize: 12, fontWeight: 600, color: "#1C2551", cursor: "pointer" }}>
                  Cancel
                </button>
                <button onClick={uploadContent}
                  disabled={saving || !uploadForm.title.trim() || !uploadForm.url.trim()}
                  style={{ ...ff, padding: "9px 22px", borderRadius: 8, border: "none", fontSize: 12, fontWeight: 700, color: "#fff", cursor: saving || !uploadForm.title.trim() || !uploadForm.url.trim() ? "not-allowed" : "pointer", background: saving || !uploadForm.title.trim() || !uploadForm.url.trim() ? "#D0D3E0" : "#1C2551", transition: "background 0.15s" }}>
                  {saving ? "Saving…" : "Upload Content"}
                </button>
              </div>
            </div>
          </div>
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
  "Case Discussion": { bg: "#EF4E2415", color: "#EF4E24" },
  "Reflection":      { bg: "#6B73BF15", color: "#6B73BF" },
  "Debate":          { bg: "#f59e0b15", color: "#f59e0b" },
  "Q&A":             { bg: "#22c55e15", color: "#22c55e" },
  "Submission":      { bg: "#8b5cf615", color: "#8b5cf6" },
  "Resource":        { bg: "#1C255115", color: "#1C2551" },
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
  const cohortId  = enrollments[0]?.cohort_id  ?? "";
  const programId = enrollments[0]?.program_id ?? "";

  // ── State ──
  const [subTab, setSubTab]                   = useState<"forum" | "dm" | "announcements">("forum");
  const [threads, setThreads]                 = useState<ThreadDTO[]>([]);
  const [loadingThreads, setLoadingThreads]   = useState(false);
  const [catFilter, setCatFilter]             = useState("all");
  const [search, setSearch]                   = useState("");
  const [openThread, setOpenThread]           = useState<ThreadDTO | null>(null);
  const [loadingThread, setLoadingThread]     = useState(false);
  const [replyText, setReplyText]             = useState("");
  const [postingReply, setPostingReply]       = useState(false);

  // New thread form
  const [showNewThread, setShowNewThread]     = useState(false);
  const [threadForm, setThreadForm]           = useState({ title: "", body: "", category: "Q&A", tags: "" });
  const [postingThread, setPostingThread]     = useState(false);

  // DMs
  const [convos, setConvos]                   = useState<DirectMessageDTO[]>([]);
  const [loadingConvos, setLoadingConvos]     = useState(false);
  const [openDM, setOpenDM]                   = useState<string | null>(null);  // recipient user id
  const [openDMName, setOpenDMName]           = useState("");
  const [dms, setDMs]                         = useState<DirectMessageDTO[]>([]);
  const [loadingDMs, setLoadingDMs]           = useState(false);
  const [dmText, setDmText]                   = useState("");
  const [sendingDM, setSendingDM]             = useState(false);
  const [showNewDM, setShowNewDM]             = useState(false);
  const [newDMRecipient, setNewDMRecipient]   = useState("");
  const [newDMBody, setNewDMBody]             = useState("");

  // Announcements
  const [announcements, setAnnouncements]     = useState<AnnouncementDTO[]>([]);
  const [loadingAnn, setLoadingAnn]           = useState(false);
  const [annForm, setAnnForm]                 = useState({ title: "", body: "", send_email: false });
  const [postingAnn, setPostingAnn]           = useState(false);
  const [showAnnForm, setShowAnnForm]         = useState(false);

  // Stats (derived)
  const pinnedCount = threads.filter(t => t.is_pinned).length;
  const dmUnread    = convos.filter(m => !m.is_read && m.recipient_id === user?.id).length;

  // ── Data loading ──
  useEffect(() => {
    if (!cohortId) return;
    setLoadingThreads(true);
    discussionsApi.listThreads({ cohort_id: cohortId }).then(r => setThreads(r.data ?? [])).catch(() => {}).finally(() => setLoadingThreads(false));
  }, [cohortId]);

  useEffect(() => {
    if (subTab !== "dm" || !cohortId) return;
    setLoadingConvos(true);
    discussionsApi.listDMConversations(cohortId).then(r => setConvos(r.data ?? [])).catch(() => {}).finally(() => setLoadingConvos(false));
  }, [subTab, cohortId]);

  useEffect(() => {
    if (subTab !== "announcements" || !cohortId) return;
    setLoadingAnn(true);
    discussionsApi.listAnnouncements(cohortId).then(r => setAnnouncements(r.data ?? [])).catch(() => {}).finally(() => setLoadingAnn(false));
  }, [subTab, cohortId]);

  // ── Thread actions ──
  async function openThreadDetail(id: string) {
    setLoadingThread(true);
    const r = await discussionsApi.getThread(id).catch(() => null);
    if (r?.data) setOpenThread(r.data);
    setLoadingThread(false);
  }

  async function postReply() {
    if (!openThread || !replyText.trim()) return;
    setPostingReply(true);
    const r = await discussionsApi.createReply(openThread.id, replyText.trim()).catch(() => null);
    if (r?.data) {
      setOpenThread(prev => prev ? { ...prev, replies: [...(prev.replies ?? []), r.data!], reply_count: prev.reply_count + 1 } : prev);
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
  }

  async function deleteThread(id: string) {
    await discussionsApi.deleteThread(id).catch(() => {});
    setThreads(prev => prev.filter(t => t.id !== id));
    if (openThread?.id === id) setOpenThread(null);
  }

  // ── DM actions ──
  async function openDMThread(userId: string, name: string) {
    setOpenDM(userId); setOpenDMName(name); setLoadingDMs(true);
    const r = await discussionsApi.listDMs(userId).catch(() => null);
    setDMs(r?.data ?? []);
    setLoadingDMs(false);
    await discussionsApi.markDMsRead(userId).catch(() => {});
  }

  async function sendDM() {
    if (!openDM || !dmText.trim()) return;
    setSendingDM(true);
    const r = await discussionsApi.sendDM({ recipient_id: openDM, cohort_id: cohortId || undefined, body: dmText.trim() }).catch(() => null);
    if (r?.data) { setDMs(prev => [...prev, r.data!]); setDmText(""); }
    setSendingDM(false);
  }

  async function sendNewDM() {
    if (!newDMRecipient.trim() || !newDMBody.trim()) return;
    setSendingDM(true);
    const r = await discussionsApi.sendDM({ recipient_id: newDMRecipient.trim(), cohort_id: cohortId || undefined, body: newDMBody.trim() }).catch(() => null);
    if (r?.data) { setConvos(prev => [r.data!, ...prev]); setNewDMRecipient(""); setNewDMBody(""); setShowNewDM(false); }
    setSendingDM(false);
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

  const isFaculty = user?.role === "faculty" || user?.role === "program_manager" || user?.role === "superadmin";

  if (!cohortId) return <EmptyState icon="💬" title="No Cohort Assigned" sub="Discussions become available once you are enrolled in a cohort." />;

  // ── Thread detail view ──
  if (openThread) {
    const cm = categoryMeta[openThread.category] ?? { bg: "#8b90a720", color: "#8b90a7" };
    return (
      <div style={{ padding: 24, ...ff }}>
        <button onClick={() => setOpenThread(null)}
          style={{ ...ff, background: "transparent", border: "none", color: "#8b90a7", fontSize: 13, fontWeight: 600, cursor: "pointer", marginBottom: 16, padding: 0 }}>
          ← Back to Forum
        </button>
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #EAECF4", padding: "24px 28px", marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 14 }}>
            {openThread.is_pinned && <span style={{ fontSize: 16, marginTop: 2 }}>📌</span>}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#1C2551", marginBottom: 8 }}>{openThread.title}</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, marginBottom: 10 }}>
                <span style={{ fontSize: 10, fontWeight: 700, background: cm.bg, color: cm.color, padding: "3px 9px", borderRadius: 20 }}>{openThread.category}</span>
                {openThread.tags.map(tag => (
                  <span key={tag} style={{ fontSize: 10, fontWeight: 500, background: "#F5F7FB", color: "#8b90a7", padding: "3px 9px", borderRadius: 20 }}>{tag}</span>
                ))}
              </div>
              <p style={{ fontSize: 13, color: "#1C2551", lineHeight: 1.6, margin: 0 }}>{openThread.body}</p>
              <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 12 }}>
                {openThread.author_name} · {timeAgo(openThread.created_at)} · {openThread.reply_count} replies
              </div>
            </div>
            {isFaculty && (
              <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                <button onClick={() => togglePin(openThread)}
                  style={{ ...ff, fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 7, border: "1.5px solid #EAECF4", background: openThread.is_pinned ? "#EF4E2410" : "#fff", color: openThread.is_pinned ? "#EF4E24" : "#8b90a7", cursor: "pointer" }}>
                  {openThread.is_pinned ? "Unpin" : "📌 Pin"}
                </button>
                <button onClick={() => deleteThread(openThread.id)}
                  style={{ ...ff, fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 7, border: "1.5px solid #ef444430", background: "#ef444410", color: "#ef4444", cursor: "pointer" }}>
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Replies */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {(openThread.replies ?? []).map(r => (
            <div key={r.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF4", padding: "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#6B73BF20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#6B73BF", flexShrink: 0 }}>
                  {(r.author_name ?? "?").charAt(0).toUpperCase()}
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: "#1C2551" }}>{r.author_name}</span>
                <span style={{ fontSize: 11, color: "#8b90a7" }}>{timeAgo(r.created_at)}</span>
              </div>
              <p style={{ fontSize: 13, color: "#1C2551", lineHeight: 1.6, margin: 0 }}>{r.body}</p>
            </div>
          ))}
        </div>

        {/* Reply box */}
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF4", padding: "16px 20px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.5, marginBottom: 8 }}>YOUR REPLY</div>
          <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={3} placeholder="Share your thoughts…"
            style={{ ...ff, width: "100%", border: "1.5px solid #EAECF4", borderRadius: 8, padding: "10px 12px", fontSize: 13, color: "#1C2551", resize: "vertical" as const, outline: "none", boxSizing: "border-box" as const }} />
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 10 }}>
            <button onClick={postReply} disabled={postingReply || !replyText.trim()}
              style={{ ...ff, background: postingReply || !replyText.trim() ? "#D0D3E0" : "#1C2551", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {postingReply ? "Posting…" : "Post Reply"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ padding: 24, ...ff }}>

      {/* ── Stat cards ──────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 22 }}>
        {[
          { label: "Threads",   value: threads.length,  sub: "Active discussions",   color: "#1C2551", icon: "○" },
          { label: "Unread",    value: 0,               sub: "Pending your attention", color: "#EF4E24", icon: "+" },
          { label: "Pinned",    value: pinnedCount,     sub: "Threads pinned by you", color: "#1C2551", icon: "◇" },
          { label: "DM Unread", value: dmUnread,        sub: "Direct messages",       color: "#22c55e", icon: "◇" },
        ].map(s => (
          <div key={s.label} style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF4", padding: "18px 20px", boxShadow: "0 1px 4px rgba(28,37,81,0.07)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#8b90a7", letterSpacing: 0.3 }}>{s.label}</span>
              <span style={{ fontSize: 16, color: s.color, opacity: 0.5 }}>{s.icon}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 11, color: "#8b90a7", marginTop: 6 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* ── Sub-tabs + action button ─────────────────── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18, gap: 12 }}>
        <div style={{ display: "flex", gap: 8 }}>
          {(["forum", "dm", "announcements"] as const).map((t, i) => {
            const labels = ["Forum", "Direct Messages", "Announcements"];
            const badges = [threads.length > 0 ? threads.length : 0, convos.filter(m => !m.is_read && m.recipient_id === user?.id).length, 0];
            const active = subTab === t;
            return (
              <button key={t} onClick={() => setSubTab(t)}
                style={{ ...ff, padding: "7px 18px", borderRadius: 20, fontSize: 12, fontWeight: active ? 700 : 500, border: active ? "1.5px solid #EF4E24" : "1.5px solid #EAECF4", background: "#fff", color: active ? "#EF4E24" : "#8b90a7", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                {labels[i]}
                {badges[i] > 0 && (
                  <span style={{ background: "#EF4E24", color: "#fff", borderRadius: "50%", minWidth: 18, height: 18, fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{badges[i]}</span>
                )}
              </button>
            );
          })}
        </div>
        {subTab === "forum" && (
          <button onClick={() => setShowNewThread(true)}
            style={{ ...ff, background: "#EF4E24", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer", whiteSpace: "nowrap" as const }}>
            + New Thread
          </button>
        )}
        {subTab === "dm" && (
          <button onClick={() => setShowNewDM(true)}
            style={{ ...ff, background: "#EF4E24", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer", whiteSpace: "nowrap" as const }}>
            + New Message
          </button>
        )}
        {subTab === "announcements" && isFaculty && (
          <button onClick={() => setShowAnnForm(true)}
            style={{ ...ff, background: "#EF4E24", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer", whiteSpace: "nowrap" as const }}>
            + New Announcement
          </button>
        )}
      </div>

      {/* ── FORUM TAB ─────────────────────────────────── */}
      {subTab === "forum" && (
        <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF4", overflow: "hidden" }}>
          {/* Search + filters */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid #EAECF4", flexWrap: "wrap" as const }}>
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, background: "#F5F7FB", borderRadius: 8, padding: "8px 14px", minWidth: 180 }}>
              <span style={{ color: "#8b90a7", fontSize: 14 }}>🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search threads…"
                style={{ ...ff, flex: 1, border: "none", background: "transparent", fontSize: 13, color: "#1C2551", outline: "none" }} />
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
              {THREAD_CATEGORIES.map(cat => {
                const active = catFilter === cat;
                return (
                  <button key={cat} onClick={() => setCatFilter(cat)}
                    style={{ ...ff, padding: "6px 14px", borderRadius: 20, fontSize: 11, fontWeight: active ? 700 : 500, border: active ? "1.5px solid #EF4E24" : "1.5px solid #EAECF4", background: active ? "#EF4E24" : "#fff", color: active ? "#fff" : "#8b90a7", cursor: "pointer" }}>
                    {cat === "all" ? "All" : cat}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Thread rows */}
          {loadingThreads ? (
            <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#8b90a7" }}>Loading…</div>
          ) : filteredThreads.length === 0 ? (
            <div style={{ padding: "40px 0" }}>
              <EmptyState icon="💬" title="No threads yet" sub='Start a discussion by clicking "+ New Thread".' />
            </div>
          ) : filteredThreads.map((t, idx) => {
            const cm = categoryMeta[t.category] ?? { bg: "#8b90a720", color: "#8b90a7" };
            return (
              <div key={t.id} onClick={() => openThreadDetail(t.id)}
                style={{ padding: "18px 22px", borderBottom: idx < filteredThreads.length - 1 ? "1px solid #EAECF4" : "none", cursor: "pointer", transition: "background 0.1s" }}
                onMouseEnter={e => (e.currentTarget.style.background = "#F8F9FC")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  {t.is_pinned && <span style={{ fontSize: 14, marginTop: 2, flexShrink: 0 }}>📌</span>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: "#1C2551" }}>{t.title}</span>
                    </div>
                    <p style={{ fontSize: 12, color: "#8b90a7", margin: "0 0 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, maxWidth: "70vw" }}>{t.body}</p>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                      <span style={{ fontSize: 10, fontWeight: 700, background: cm.bg, color: cm.color, padding: "3px 9px", borderRadius: 20 }}>{t.category}</span>
                      {t.tags.slice(0, 2).map(tag => (
                        <span key={tag} style={{ fontSize: 10, fontWeight: 500, background: "#F5F7FB", color: "#8b90a7", padding: "3px 9px", borderRadius: 20 }}>{tag}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: "right" as const }}>
                    <div style={{ fontSize: 11, color: "#8b90a7" }}>💬 {t.reply_count} · {timeAgo(t.created_at)}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── DIRECT MESSAGES TAB ───────────────────────── */}
      {subTab === "dm" && (
        openDM ? (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF4", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid #EAECF4" }}>
              <button onClick={() => { setOpenDM(null); setDMs([]); }}
                style={{ ...ff, background: "transparent", border: "none", color: "#8b90a7", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 }}>← Back</button>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#1C255120", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#1C2551", fontSize: 13 }}>
                {openDMName.charAt(0).toUpperCase()}
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: "#1C2551" }}>{openDMName}</span>
            </div>
            <div style={{ minHeight: 240, maxHeight: 380, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              {loadingDMs ? (
                <div style={{ textAlign: "center", color: "#8b90a7", fontSize: 13 }}>Loading…</div>
              ) : dms.length === 0 ? (
                <div style={{ textAlign: "center", color: "#8b90a7", fontSize: 13 }}>No messages yet. Say hello!</div>
              ) : dms.map(m => {
                const mine = m.sender_id === user?.id;
                return (
                  <div key={m.id} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start" }}>
                    <div style={{ maxWidth: "70%", background: mine ? "#1C2551" : "#F5F7FB", color: mine ? "#fff" : "#1C2551", borderRadius: mine ? "14px 14px 4px 14px" : "14px 14px 14px 4px", padding: "10px 14px", fontSize: 13 }}>
                      {m.body}
                      <div style={{ fontSize: 10, color: mine ? "rgba(255,255,255,0.5)" : "#8b90a7", marginTop: 4, textAlign: "right" as const }}>{timeAgo(m.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: "12px 20px", borderTop: "1px solid #EAECF4", display: "flex", gap: 10 }}>
              <input value={dmText} onChange={e => setDmText(e.target.value)} placeholder="Type a message…" onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendDM(); } }}
                style={{ ...ff, flex: 1, border: "1.5px solid #EAECF4", borderRadius: 8, padding: "9px 14px", fontSize: 13, color: "#1C2551", outline: "none" }} />
              <button onClick={sendDM} disabled={sendingDM || !dmText.trim()}
                style={{ ...ff, background: sendingDM || !dmText.trim() ? "#D0D3E0" : "#EF4E24", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Send
              </button>
            </div>
          </div>
        ) : (
          <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF4", overflow: "hidden" }}>
            {loadingConvos ? (
              <div style={{ padding: "40px 0", textAlign: "center", fontSize: 13, color: "#8b90a7" }}>Loading…</div>
            ) : convos.length === 0 ? (
              <div style={{ padding: "40px 0" }}>
                <EmptyState icon="✉" title="No conversations" sub='Click "+ New Message" to start a direct message.' />
              </div>
            ) : convos.map((m, idx) => {
              const isIncoming = m.recipient_id === user?.id;
              const peer = isIncoming ? m.sender_name : m.recipient_id;
              const peerId = isIncoming ? m.sender_id : m.recipient_id;
              const unread = !m.is_read && isIncoming;
              return (
                <div key={m.id} onClick={() => openDMThread(peerId, peer)}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", borderBottom: idx < convos.length - 1 ? "1px solid #EAECF4" : "none", cursor: "pointer" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "#F8F9FC")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#1C255120", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#1C2551", fontSize: 15, flexShrink: 0 }}>
                    {peer.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: unread ? 700 : 500, color: "#1C2551" }}>{peer}</div>
                    <div style={{ fontSize: 12, color: "#8b90a7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{m.body}</div>
                  </div>
                  <div style={{ flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <span style={{ fontSize: 11, color: "#8b90a7" }}>{timeAgo(m.created_at)}</span>
                    {unread && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#EF4E24", display: "block" }} />}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── ANNOUNCEMENTS TAB ─────────────────────────── */}
      {subTab === "announcements" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {loadingAnn ? (
            <div style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF4", padding: "40px 0", textAlign: "center", fontSize: 13, color: "#8b90a7" }}>Loading…</div>
          ) : announcements.length === 0 && !showAnnForm ? (
            <EmptyState icon="📣" title="No announcements" sub="Announcements you send here will be visible to all cohort participants." />
          ) : announcements.map(a => (
            <div key={a.id} style={{ background: "#fff", borderRadius: 12, border: "1px solid #EAECF4", padding: "20px 22px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 14 }}>📣</span>
                    <span style={{ fontSize: 14, fontWeight: 700, color: "#1C2551" }}>{a.title}</span>
                  </div>
                  <p style={{ fontSize: 13, color: "#1C2551", lineHeight: 1.6, margin: "0 0 10px" }}>{a.body}</p>
                  <div style={{ fontSize: 11, color: "#8b90a7" }}>
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
      {showNewThread && (
        <div onClick={() => setShowNewThread(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, boxShadow: "0 24px 64px rgba(28,37,81,0.22)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid #EAECF4" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#1C2551" }}>Start a New Discussion</span>
              <button onClick={() => setShowNewThread(false)}
                style={{ width: 28, height: 28, borderRadius: "50%", border: "1.5px solid #EAECF4", background: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#8b90a7" }}>×</button>
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
                  style={{ ...ff, padding: "9px 18px", borderRadius: 8, border: "1.5px solid #EAECF4", background: "#fff", fontSize: 12, fontWeight: 600, color: "#1C2551", cursor: "pointer" }}>Cancel</button>
                <button onClick={postThread} disabled={postingThread || !threadForm.title || !threadForm.body}
                  style={{ ...ff, padding: "9px 20px", borderRadius: 8, border: "none", background: postingThread || !threadForm.title || !threadForm.body ? "#D0D3E0" : "#EF4E24", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                  {postingThread ? "Posting…" : "Post Thread"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── New DM Modal ──────────────────────────────── */}
      {showNewDM && (
        <div onClick={() => setShowNewDM(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, boxShadow: "0 24px 64px rgba(28,37,81,0.22)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid #EAECF4" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#1C2551" }}>New Direct Message</span>
              <button onClick={() => setShowNewDM(false)}
                style={{ width: 28, height: 28, borderRadius: "50%", border: "1.5px solid #EAECF4", background: "#fff", cursor: "pointer", fontSize: 14, color: "#8b90a7" }}>×</button>
            </div>
            <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
              <Field label="Recipient User ID">
                <input style={inp} value={newDMRecipient} onChange={e => setNewDMRecipient(e.target.value)} placeholder="Paste user UUID or email" autoFocus />
              </Field>
              <Field label="Message">
                <textarea value={newDMBody} onChange={e => setNewDMBody(e.target.value)} rows={4} placeholder="Type your message…"
                  style={{ ...ff, ...inp, resize: "vertical" as const }} />
              </Field>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setShowNewDM(false)}
                  style={{ ...ff, padding: "9px 18px", borderRadius: 8, border: "1.5px solid #EAECF4", background: "#fff", fontSize: 12, fontWeight: 600, color: "#1C2551", cursor: "pointer" }}>Cancel</button>
                <button onClick={sendNewDM} disabled={sendingDM || !newDMRecipient.trim() || !newDMBody.trim()}
                  style={{ ...ff, padding: "9px 20px", borderRadius: 8, border: "none", background: sendingDM || !newDMRecipient.trim() || !newDMBody.trim() ? "#D0D3E0" : "#EF4E24", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                  {sendingDM ? "Sending…" : "Send Message"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── New Announcement Modal ─────────────────────── */}
      {showAnnForm && (
        <div onClick={() => setShowAnnForm(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, boxShadow: "0 24px 64px rgba(28,37,81,0.22)", overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", borderBottom: "1px solid #EAECF4" }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#1C2551" }}>New Announcement</span>
              <button onClick={() => setShowAnnForm(false)}
                style={{ width: 28, height: 28, borderRadius: "50%", border: "1.5px solid #EAECF4", background: "#fff", cursor: "pointer", fontSize: 14, color: "#8b90a7" }}>×</button>
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
                  style={{ width: 38, height: 20, borderRadius: 20, background: annForm.send_email ? "#22c55e" : "#D0D3E0", position: "relative", cursor: "pointer", transition: "background 0.2s", flexShrink: 0 }}>
                  <div style={{ position: "absolute", top: 2, left: annForm.send_email ? 20 : 2, width: 16, height: 16, borderRadius: "50%", background: "#fff", transition: "left 0.2s" }} />
                </div>
                <span style={{ fontSize: 12, color: "#1C2551", fontWeight: 500 }}>Send email notification to all participants</span>
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={() => setShowAnnForm(false)}
                  style={{ ...ff, padding: "9px 18px", borderRadius: 8, border: "1.5px solid #EAECF4", background: "#fff", fontSize: 12, fontWeight: 600, color: "#1C2551", cursor: "pointer" }}>Cancel</button>
                <button onClick={postAnnouncement} disabled={postingAnn || !annForm.title || !annForm.body}
                  style={{ ...ff, padding: "9px 20px", borderRadius: 8, border: "none", background: postingAnn || !annForm.title || !annForm.body ? "#D0D3E0" : "#EF4E24", fontSize: 12, fontWeight: 700, color: "#fff", cursor: "pointer" }}>
                  {postingAnn ? "Posting…" : "Post Announcement"}
                </button>
              </div>
            </div>
          </div>
        </div>
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
  "fac-sessions":       "My Sessions",
  "fac-content":        "Content Library",
  "fac-grading":        "Grading Queue",
  "fac-coaching":       "Coaching",
  "fac-discussions":    "Discussions",
};

export default function FacultyPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [activePage, setActivePage] = useState("fac-dashboard");

  const [enrollments, setEnrollments]     = useState<MyEnrollmentDTO[]>([]);
  const [activeEnrollment, setActive]     = useState<MyEnrollmentDTO | null>(null);
  const [program, setProgram]             = useState<ProgramDetailDTO | null>(null);
  const [participants, setParticipants]   = useState<ParticipantDTO[]>([]);
  const [sessions, setSessions]           = useState<SessionDTO[]>([]);
  const [pendingGrades, setPendingGrades] = useState(0);
  const [loadingData, setLoadingData]     = useState(true);
  const [loadingCohort, setLoadingCohort] = useState(false);

  useEffect(() => {
    if (!loading && (!user || user.role !== "faculty")) router.replace("/login");
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    cohortsApi.myEnrollments()
      .then(res => {
        const list = res.data ?? [];
        setEnrollments(list);
        if (list.length > 0) setActive(list[0]);
      })
      .catch(() => {})
      .finally(() => setLoadingData(false));

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

  // Program switcher pill rendered into the header subtitle slot
  function ProgramSwitcher() {
    const [open, setOpen] = useState(false);
    if (enrollments.length === 0) return null;

    const active = activeEnrollment ?? enrollments[0];
    const dotColor = active.program_color || "#6B73BF";

    return (
      <div style={{ position: "relative", display: "inline-block" }}>
        {/* Pill trigger */}
        <button
          onClick={() => setOpen(o => !o)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: "none", cursor: "pointer", padding: "2px 0", fontFamily: "Poppins, sans-serif" }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: dotColor, flexShrink: 0, display: "inline-block" }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: "#8b90a7", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>
            {active.program_title} — {active.cohort_name}
          </span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, transition: "transform 0.15s", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
            <path d="M2 3.5L5 6.5L8 3.5" stroke="#8b90a7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Backdrop */}
        {open && (
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 149 }} />
        )}

        {/* Dropdown */}
        {open && (
          <div style={{ position: "absolute", top: "calc(100% + 10px)", left: 0, background: "#fff", borderRadius: 14, boxShadow: "0 8px 32px rgba(28,37,81,0.16)", border: "1px solid #EAECF4", width: 340, zIndex: 150, overflow: "hidden" }}>
            <div style={{ padding: "10px 16px 8px", fontSize: 10, fontWeight: 700, color: "#8b90a7", letterSpacing: 1, fontFamily: "Poppins, sans-serif" }}>
              MY ENROLLED PROGRAMS
            </div>
            <div style={{ maxHeight: 360, overflowY: "auto" as const }}>
              {enrollments.map(en => {
                const isSelected = en.enrollment_id === active.enrollment_id;
                const color = en.program_color || "#6B73BF";
                const pct = Math.round((en as any).completion_pct ?? 0);
                const statusMeta: Record<string, { bg: string; color: string }> = {
                  active:    { bg: "#22c55e15", color: "#22c55e" },
                  upcoming:  { bg: "#EF4E2415", color: "#EF4E24" },
                  delivered: { bg: "#8b90a720", color: "#8b90a7" },
                  draft:     { bg: "#8b90a720", color: "#8b90a7" },
                  archived:  { bg: "#8b90a720", color: "#8b90a7" },
                };
                const sm = statusMeta[en.program_status] ?? statusMeta.active;

                return (
                  <div key={en.enrollment_id}
                    onClick={() => { setActive(en); setOpen(false); }}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", cursor: "pointer", background: isSelected ? "#F8F9FC" : "#fff", borderBottom: "1px solid #F0F2FA", transition: "background 0.1s" }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#F8F9FC"; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "#fff"; }}>
                    <div style={{ width: 34, height: 34, borderRadius: 9, background: color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 14, fontWeight: 800, flexShrink: 0, fontFamily: "Poppins, sans-serif" }}>
                      {en.program_title.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "#1C2551", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const, fontFamily: "Poppins, sans-serif" }}>
                        {en.program_title}
                      </div>
                      <div style={{ fontSize: 11, color: "#8b90a7", marginBottom: 5, fontFamily: "Poppins, sans-serif" }}>{en.cohort_name}</div>
                      {/* Progress bar */}
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ flex: 1, height: 4, background: "#F0F2FA", borderRadius: 99 }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 99 }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 600, color: "#8b90a7", fontFamily: "Poppins, sans-serif" }}>{pct}%</span>
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
    // Gate: for non-program-design tabs, require cohort enrollment
    if (!loadingData && enrollments.length === 0 && activePage !== "fac-program-design") {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "70vh", padding: 24, fontFamily: "Poppins, sans-serif" }}>
          <div style={{ background: "#fff", borderRadius: 20, border: "1px solid #EAECF4", padding: "56px 48px", textAlign: "center", maxWidth: 460, boxShadow: "0 4px 24px rgba(28,37,81,0.06)" }}>
            <div style={{ width: 80, height: 80, borderRadius: 20, background: "linear-gradient(135deg,#1C2551,#2d3a7c)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px", fontSize: 36 }}>
              🎓
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#1C2551", marginBottom: 10 }}>
              No Program Assigned Yet
            </div>
            <div style={{ fontSize: 13, color: "#8b90a7", lineHeight: 1.7, marginBottom: 28 }}>
              You are not enrolled in any cohort or program. All features — sessions, grading, coaching, and content — become available once your Program Manager adds you to a program.
            </div>
            <div style={{ background: "#F8F9FC", borderRadius: 12, padding: "14px 20px", display: "inline-flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>📧</span>
              <span style={{ fontSize: 12, color: "#1C2551", fontWeight: 600 }}>Contact your Program Manager to get enrolled</span>
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
        // Program Design must work even when faculty has no cohort enrollments (assigned via activity_faculty only)
        return <FacultyProgramDesign enrollments={enrollments} facultyUserId={user?.id ?? ""} />;
      case "fac-sessions":
        return <FacultySessions enrollments={enrollments} />;
      case "fac-grading":
        return <FacultyGrading enrollments={enrollments} />;
      case "fac-coaching":
        return <FacultyCoaching enrollments={enrollments} />;
      case "fac-content":
        return <FacultyContent />;
      case "fac-discussions":
        return <FacultyDiscussions enrollments={enrollments} user={user} />;
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
      title={PAGE_TITLES[activePage] ?? "Dashboard"}
      subtitleNode={enrollments.length > 0 ? <ProgramSwitcher /> : undefined}
      onNavigate={setActivePage}
    >
      {renderContent()}
    </DashboardShell>
  );
}
