"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import ReactDOM from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import DashboardShell from "@/components/layout/DashboardShell";
import { NAV_CONFIG } from "@/components/layout/nav-config";
import { useAuth } from "@/lib/auth-context";
import { cohortsApi, MyEnrollmentDTO } from "@/lib/cohorts-api";
import { ActivityDTO, ProgramDetailDTO, ProgramMaterialDTO, programsApi } from "@/lib/programs-api";
import { sessionsApi, SessionDTO } from "@/lib/sessions-api";
import { submissionsApi, SubmissionDTO } from "@/lib/submissions-api";
import { discussionsApi, AnnouncementDTO, ThreadDTO } from "@/lib/discussions-api";
import { communicationsApi, InAppNotification } from "@/lib/communications-api";
import { resolveJoinLink } from "@/lib/session-link";
import ProfilePage from "@/components/shared/ProfilePage";
import SettingsPage from "@/components/shared/SettingsPage";
import { StatCard, useStatDetail } from "@/components/shared/StatCard";
import PreworkExperience from "@/components/participant/PreworkExperience";
import ProgramSwitcher from "@/components/participant/ProgramSwitcher";
import AssessmentsExperience from "@/components/participant/AssessmentsExperience";
import Feedback360Experience from "@/components/participant/Feedback360Experience";
import CoachingExperience from "@/components/participant/CoachingExperience";
import CapstoneExperience from "@/components/participant/CapstoneExperience";
import LeaderboardExperience from "@/components/participant/LeaderboardExperience";
import SurveysExperience from "@/components/participant/SurveysExperience";
import DiscussionsExperience from "@/components/participant/DiscussionsExperience";
import MyCohortsExperience from "@/components/participant/MyCohortsExperience";
import AICoachWidget from "@/components/ai/AICoachWidget";
import { leaderboardApi, MyLeaderboardDTO } from "@/lib/leaderboard-api";

const NAVY = "#1C2551";
const ORANGE = "#EF4E24";
const INDIGO = "#6B73BF";
const GREEN = "#22c55e";
const DANGER = "#ef4444";
const PAGE = "#F5F7FB";
const BORDER = "#EAECF4";
const MUTED = "#8b90a7";
const SHADOW = "0 1px 4px rgba(28,37,81,0.07)";

const PAGE_TITLES: Record<string, string> = {
  dashboard: "My Journey",
  profile: "My Profile",
  settings: "Settings",
  prework: "Pre-Work & Learning",
  sessions: "Live Sessions",
  assessments: "Assessments",
  feedback360: "360 Feedback",
  coaching: "Coaching",
  "my-cohorts": "My Cohorts",
  capstone: "Capstone",
  leaderboard: "Leaderboard",
  surveys: "Surveys",
  discussions: "Discussions",
};

type SubmissionMap = Record<string, SubmissionDTO | null>;
type SubmitKind = "assessment" | "survey" | "capstone" | "activity";

interface ViewProps {
  enrollments: MyEnrollmentDTO[];
  activeEnrollment: MyEnrollmentDTO | null;
  program: ProgramDetailDTO | null;
  sessions: SessionDTO[];
  materials: ProgramMaterialDTO[];
  submissions: SubmissionMap;
  announcements: AnnouncementDTO[];
  threads: ThreadDTO[];
  notifications: InAppNotification[];
  loadingData: boolean;
  onSelectEnrollment: (e: MyEnrollmentDTO) => void;
  onSubmit: (target: { activity: ActivityDTO; kind: SubmitKind }) => void;
}

export default function ParticipantPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activePage, setActivePageState] = useState(() => searchParams.get("tab") || "dashboard");
  const [enrollments, setEnrollments] = useState<MyEnrollmentDTO[]>([]);
  const [activeEnrollment, setActiveEnrollment] = useState<MyEnrollmentDTO | null>(null);
  const [program, setProgram] = useState<ProgramDetailDTO | null>(null);
  const [sessions, setSessions] = useState<SessionDTO[]>([]);
  const [materials, setMaterials] = useState<ProgramMaterialDTO[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionMap>({});
  const [announcements, setAnnouncements] = useState<AnnouncementDTO[]>([]);
  const [threads, setThreads] = useState<ThreadDTO[]>([]);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [submitTarget, setSubmitTarget] = useState<{ activity: ActivityDTO; kind: SubmitKind } | null>(null);

  // Push a history entry per tab switch so browser Back/Forward moves between
  // tabs instead of leaving the dashboard entirely.
  function setActivePage(page: string) {
    setActivePageState(page);
    router.push(`/dashboard/participant?tab=${page}`);
  }

  useEffect(() => {
    if (!loading && (!user || (user.role !== "participant" && user.role !== "participant_retailer"))) router.replace("/");
  }, [user, loading, router]);

  useEffect(() => {
    setActivePageState(searchParams.get("tab") || "dashboard");
  }, [searchParams]);

  // Participant Retailer: keep them off locked tabs. Default them to the first
  // unlocked tab (Assessments) and bounce any locked page back there.
  useEffect(() => {
    if (user?.role !== "participant_retailer") return;
    const cfg = NAV_CONFIG.participant_retailer;
    const locked = new Set(cfg.items.filter(i => i.locked).map(i => i.id));
    const firstOpen = cfg.items.find(i => !i.locked)?.id ?? "assessments";
    if (activePage !== "profile" && activePage !== "settings" && locked.has(activePage)) {
      setActivePage(firstOpen);
    }
  }, [user?.role, activePage]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setLoadingData(true);
      cohortsApi.myEnrollments()
        .then((res) => {
          if (cancelled) return;
          const list = res.data ?? [];
          setEnrollments(list);
          setActiveEnrollment((current) => current ?? list[0] ?? null);
        })
        .catch(() => {
          if (!cancelled) setEnrollments([]);
        })
        .finally(() => {
          if (!cancelled) setLoadingData(false);
        });
    });
    return () => { cancelled = true; };
  }, [user]);

  const loadParticipantData = useCallback(async (enrollment: MyEnrollmentDTO) => {
    setProgram(null);
    setSessions([]);
    setMaterials([]);
    setSubmissions({});
    setAnnouncements([]);
    setThreads([]);

    const [programRes, sessionsRes, announcementsRes, threadsRes, notificationsRes] = await Promise.allSettled([
      programsApi.get(enrollment.program_id),
      sessionsApi.list({ cohort_id: enrollment.cohort_id, limit: 100 }),
      discussionsApi.listAnnouncements(enrollment.cohort_id),
      discussionsApi.listThreads({ cohort_id: enrollment.cohort_id, page: 1, per_page: 6 }),
      communicationsApi.listNotifications(),
    ]);

    const nextProgram = programRes.status === "fulfilled" ? programRes.value.data : null;
    setProgram(nextProgram);
    setSessions(sessionsRes.status === "fulfilled" ? sessionsRes.value.data ?? [] : []);
    setAnnouncements(announcementsRes.status === "fulfilled" ? announcementsRes.value.data ?? [] : []);
    setThreads(threadsRes.status === "fulfilled" ? threadsRes.value.data ?? [] : []);
    setNotifications(notificationsRes.status === "fulfilled" ? notificationsRes.value.data ?? [] : []);

    if (!nextProgram) return;

    programsApi.listMaterials(nextProgram.id).then((res) => setMaterials(res.data ?? [])).catch(() => setMaterials([]));
    const trackable = flattenActivities(nextProgram).filter((a) => isSubmittable(a.type));
    const settled = await Promise.allSettled(trackable.map((a) => submissionsApi.my(a.id).then((res) => [a.id, res.data] as const)));
    const nextSubmissions: SubmissionMap = {};
    settled.forEach((result, index) => {
      nextSubmissions[trackable[index].id] = result.status === "fulfilled" ? result.value[1] : null;
    });
    setSubmissions(nextSubmissions);
  }, []);

  useEffect(() => {
    if (!activeEnrollment) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) loadParticipantData(activeEnrollment);
    });
    return () => { cancelled = true; };
  }, [activeEnrollment, loadParticipantData]);

  // Poll the sessions list every 60 seconds (same interval/pattern as
  // Header.tsx's notification-bell poll) so a session a faculty/coach starts
  // while this page is already open flips to "live" here without a reload.
  // Only the sessions list is re-fetched — not the full loadParticipantData
  // payload — to keep this poll cheap.
  const fetchSessions = useCallback(async (enrollment: MyEnrollmentDTO) => {
    try {
      const res = await sessionsApi.list({ cohort_id: enrollment.cohort_id, limit: 100 });
      setSessions(res.data ?? []);
    } catch { /* silently ignore — matches Header.tsx's notif poll */ }
  }, []);

  useEffect(() => {
    if (!activeEnrollment) return;
    const id = setInterval(() => { void fetchSessions(activeEnrollment); }, 60_000);
    return () => clearInterval(id);
  }, [activeEnrollment, fetchSessions]);

  const refreshSubmission = useCallback(async (activityId: string) => {
    try {
      const res = await submissionsApi.my(activityId);
      setSubmissions((prev) => ({ ...prev, [activityId]: res.data }));
    } catch {
      setSubmissions((prev) => ({ ...prev, [activityId]: null }));
    }
  }, []);

  if (loading || !user) return null;

  const props: ViewProps = {
    enrollments,
    activeEnrollment,
    program,
    sessions,
    materials,
    submissions,
    announcements,
    threads,
    notifications,
    loadingData,
    onSelectEnrollment: setActiveEnrollment,
    onSubmit: setSubmitTarget,
  };

  // Program switcher lives in the header for all participant working pages
  // (not on the profile/settings utility pages).
  const showSwitcher = activeEnrollment && !["profile", "settings"].includes(activePage);

  return (
    <DashboardShell
      activePage={activePage}
      title={PAGE_TITLES[activePage] ?? activePage}
      onNavigate={setActivePage}
      subtitleNode={showSwitcher ? (
        <ProgramSwitcher enrollments={enrollments} active={activeEnrollment} onSelect={setActiveEnrollment} />
      ) : undefined}
    >
      {activePage === "profile" ? (
        <div style={{ padding: 24 }}><ProfilePage /></div>
      ) : activePage === "settings" ? (
        <div style={{ padding: 24 }}><SettingsPage /></div>
      ) : activePage === "dashboard" ? (
        <JourneyDashboard {...props} />
      ) : activePage === "prework" ? (
        <PreworkExperience program={program} orgId={user.org_id} />
      ) : activePage === "sessions" ? (
        <SessionsPage {...props} />
      ) : activePage === "assessments" ? (
        <AssessmentsExperience program={program} submissions={submissions} onSubmit={setSubmitTarget} />
      ) : activePage === "surveys" ? (
        <SurveysExperience programId={activeEnrollment?.program_id} />
      ) : activePage === "coaching" ? (
        <CoachingExperience programId={activeEnrollment?.program_id} />
      ) : activePage === "my-cohorts" ? (
        <MyCohortsExperience enrollments={enrollments} />
      ) : activePage === "feedback360" ? (
        <Feedback360Experience programId={activeEnrollment?.program_id} />
      ) : activePage === "capstone" ? (
        <CapstoneExperience programId={activeEnrollment?.program_id} />
      ) : activePage === "leaderboard" ? (
        <LeaderboardExperience programId={activeEnrollment?.program_id} />
      ) : activePage === "discussions" ? (
        <DiscussionsExperience programId={activeEnrollment?.program_id} cohortId={activeEnrollment?.cohort_id} />
      ) : null}

      {submitTarget && (
        <SubmissionModal
          target={submitTarget}
          onClose={() => setSubmitTarget(null)}
          onSaved={(activityId) => {
            setSubmitTarget(null);
            refreshSubmission(activityId);
          }}
        />
      )}

      {/* AI Learning Coach — floating chat widget (participant-only) */}
      <AICoachWidget />
    </DashboardShell>
  );
}

function JourneyDashboard(props: ViewProps) {
  const { activeEnrollment, program, sessions, announcements, loadingData, submissions, onSubmit } = props;
  const activities = useMemo(() => (program ? flattenActivities(program) : []), [program]);
  const completed = Object.values(submissions).filter(Boolean).length;
  const nextActivities = activities.filter((a) => !submissions[a.id]).slice(0, 5);
  const pendingMandatory = activities.filter((a) => a.is_mandatory && !submissions[a.id]);
  const statDetail = useStatDetail();

  // Leaderboard rank + streak — same data source and endpoint as the
  // Leaderboard tab (leaderboardApi.my), scoped to this program.
  const [board, setBoard] = useState<MyLeaderboardDTO | null>(null);
  useEffect(() => {
    if (!activeEnrollment) return;
    let cancelled = false;
    leaderboardApi.my(activeEnrollment.program_id)
      .then((r) => { if (!cancelled) setBoard(r.data ?? null); })
      .catch(() => { if (!cancelled) setBoard(null); });
    return () => { cancelled = true; };
  }, [activeEnrollment?.program_id]);

  // AI Daily Focus — real LLM-generated nudge, fetched whenever the active
  // enrollment changes. Falls back to a locally-derived line if the AI call
  // fails.
  const [aiFocus, setAiFocus] = useState<string | null>(null);
  useEffect(() => {
    if (!activeEnrollment) return;
    let cancelled = false;
    cohortsApi.aiDailyFocus()
      .then((r) => { if (!cancelled) setAiFocus(r.data?.insight ?? null); })
      .catch(() => { if (!cancelled) setAiFocus(null); });
    return () => { cancelled = true; };
  }, [activeEnrollment?.enrollment_id]);

  if (loadingData) return <LoadingState label="Loading your journey..." />;
  if (!activeEnrollment) return <Page><EmptyCard title="Not enrolled yet" body="Your Program Manager will send an invite link. Once accepted, your participant journey appears here." accent={ORANGE} /></Page>;

  const phases = program?.phases ?? [];
  const phaseIdx = phases.findIndex((p) => (p.activities ?? []).some((a) => !submissions[a.id]));
  const currentPhaseNum = phaseIdx === -1 ? phases.length : phaseIdx + 1;
  const phaseRows = phases.map((phase, i) => {
    const phaseActs = phase.activities ?? [];
    const phaseDone = phaseActs.filter((a) => submissions[a.id]).length;
    const status = phaseActs.length === 0 ? "—" : phaseDone === phaseActs.length ? "Done" : i === phaseIdx ? "In Progress" : i < phaseIdx || phaseIdx === -1 ? "Done" : "Locked";
    const dot = status === "Done" ? GREEN : status === "In Progress" ? ORANGE : status === "Locked" ? "#D0D3E0" : undefined;
    return { label: phase.title, value: status, dot };
  });
  const typeCounts = new Map<string, { done: number; total: number }>();
  activities.forEach((a) => {
    const entry = typeCounts.get(a.type) ?? { done: 0, total: 0 };
    entry.total += 1;
    if (submissions[a.id]) entry.done += 1;
    typeCounts.set(a.type, entry);
  });
  const activityTypeRows = Array.from(typeCounts, ([type, c]) => ({ label: titleCase(type), value: `${c.done}/${c.total}`, bar: c.total ? Math.round((c.done / c.total) * 100) : 0, color: GREEN }));
  const myStreak = board?.leaders.find((l) => l.is_you)?.streak ?? 0;
  const streakRows = board?.leaders.filter((l) => l.is_you || l.streak > 0).slice(0, 8).map((l) => ({ label: l.name, value: `${l.streak} day${l.streak === 1 ? "" : "s"}` })) ?? [];
  const topLeaderRows = (board?.leaders ?? []).slice(0, 5).map((l, i) => ({
    label: `${i + 1}. ${l.name}`, value: `${l.points.toLocaleString()} pts`,
    bar: board!.leaders[0].points ? Math.round((l.points / board!.leaders[0].points) * 100) : 0,
    color: l.is_you ? ORANGE : NAVY,
  }));
  const myPositionRows = board?.my_rank ? [
    { label: "Your Rank", value: `#${board.my_rank} of ${board.leaders.length}` },
    { label: "Your Points", value: `${board.my_points.toLocaleString()} pts` },
  ] : [];
  const pendingRows = pendingMandatory.slice(0, 8).map((a) => ({ label: a.title, value: titleCase(a.type) }));

  return (
    <Page>
      <AIBanner title="AI Daily Focus" body={aiFocus ?? `Continue ${activeEnrollment.program_title}. You are at ${activeEnrollment.completion_percent}% completion; pick one activity and keep the streak alive.`} />
      <MetricGrid>
        <StatCard label="Program Progress" value={`${activeEnrollment.completion_percent}%`} sub={phases.length ? `Phase ${currentPhaseNum} of ${phases.length} active` : activeEnrollment.status} icon="◈" color={activeEnrollment.program_color || ORANGE}
          detail={[{ title: "PHASE BREAKDOWN", rows: phaseRows }, { title: "COMPLETION STATS", rows: activityTypeRows }]}
          onOpen={() => statDetail.open({ label: "Program Progress", value: `${activeEnrollment.completion_percent}%`, sub: activeEnrollment.program_title, color: activeEnrollment.program_color || ORANGE, sections: [{ title: "PHASE BREAKDOWN", rows: phaseRows }, { title: "COMPLETION STATS", rows: activityTypeRows }] })} />
        <StatCard label="Activities Completed" value={`${completed}/${activities.length}`} sub="Submitted items" icon="✦" color={GREEN}
          detail={[{ title: "BY TYPE", rows: activityTypeRows }]}
          onOpen={() => statDetail.open({ label: "Activities Completed", value: `${completed}/${activities.length}`, sub: "Submitted items", color: GREEN, sections: [{ title: "BY TYPE", rows: activityTypeRows }] })} />
        <StatCard label="Engagement Streak" value={`${myStreak} day${myStreak === 1 ? "" : "s"}`} sub="Keep it up!" icon="🔥" color={ORANGE}
          detail={[{ title: "STREAK LEADERS", rows: streakRows }]}
          onOpen={() => statDetail.open({ label: "Engagement Streak", value: `${myStreak} day${myStreak === 1 ? "" : "s"}`, sub: "Keep it up!", color: ORANGE, sections: [{ title: "STREAK LEADERS", rows: streakRows }] })} />
        <StatCard label="Leaderboard Rank" value={board?.my_rank ? `#${board.my_rank}` : "—"} sub={board ? `of ${board.leaders.length} participants` : "Not ranked yet"} icon="◆" color={NAVY}
          detail={[{ title: "TOP 5 PARTICIPANTS", rows: topLeaderRows }, { title: "YOUR POSITION", rows: myPositionRows }]}
          onOpen={() => statDetail.open({ label: "Leaderboard Rank", value: board?.my_rank ? `#${board.my_rank}` : "—", sub: board ? `of ${board.leaders.length} participants` : "Not ranked yet", color: NAVY, sections: [{ title: "TOP 5 PARTICIPANTS", rows: topLeaderRows }, { title: "YOUR POSITION", rows: myPositionRows }] })} />
        <StatCard label="Pending Assignments" value={String(pendingMandatory.length)} sub="Not yet submitted" icon="⏰" color={pendingMandatory.length ? "#f59e0b" : GREEN}
          detail={[{ title: "PENDING", rows: pendingRows }]}
          onOpen={() => statDetail.open({ label: "Pending Assignments", value: String(pendingMandatory.length), sub: "Not yet submitted", color: "#f59e0b", sections: [{ title: "PENDING", rows: pendingRows }] })} />
      </MetricGrid>
      {statDetail.overlay}
      <HeroCard enrollment={activeEnrollment} />
      <Timeline program={program} submissions={submissions} onSubmit={onSubmit} />
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 340px", gap: 16 }}>
        <Card>
          <SectionTitle title="Upcoming Activities" meta={`${nextActivities.length} open`} />
          <Stack>
            {nextActivities.map((activity) => <ActivityRow key={activity.id} activity={activity} submission={submissions[activity.id]} onSubmit={onSubmit} />)}
            {nextActivities.length === 0 && <SoftEmpty label="No open activities right now." />}
          </Stack>
        </Card>
        <Card>
          <SectionTitle title="Cohort Signals" />
          <InfoList rows={[["Cohort", activeEnrollment.cohort_name], ["Risk", titleCase(activeEnrollment.risk_level)], ["Sessions", `${sessions.filter((s) => new Date(s.scheduled_at) >= new Date()).length} upcoming`], ["Announcements", String(announcements.length)]]} />
        </Card>
      </div>
    </Page>
  );
}

function SessionsPage({ sessions }: ViewProps) {
  const upcoming = sessions.filter((s) => new Date(s.scheduled_at) >= new Date());
  const past = sessions.filter((s) => new Date(s.scheduled_at) < new Date());
  const [selected, setSelected] = useState<string | null>(null);
  const statDetail = useStatDetail();

  // Everything upcoming or currently live, soonest first — this is the
  // persistent list shown alongside the calendar (not gated behind clicking a day).
  const upcomingOrLive = sessions
    .filter((s) => s.status === "live" || new Date(s.scheduled_at) >= new Date())
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

  const listedSessions = selected
    ? sessions.filter((s) => new Date(s.scheduled_at).toDateString() === selected)
        .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    : upcomingOrLive;

  return (
    <Page>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
        <StatCard label="Upcoming" value={String(upcoming.length)} sub="Scheduled sessions" color={ORANGE}
          detail={[{ title: "UPCOMING", rows: upcoming.slice(0, 8).map((s) => ({ label: s.title, value: new Date(s.scheduled_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) })) }]}
          onOpen={() => statDetail.open({ label: "Upcoming", value: String(upcoming.length), sub: "Scheduled sessions", color: ORANGE, sections: [{ title: "UPCOMING", rows: upcoming.slice(0, 8).map((s) => ({ label: s.title, value: new Date(s.scheduled_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) })) }] })} />
        <StatCard label="Completed" value={String(past.length)} sub="Past sessions" color={GREEN}
          detail={[{ title: "COMPLETED", rows: past.slice(0, 8).map((s) => ({ label: s.title, value: new Date(s.scheduled_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) })) }]}
          onOpen={() => statDetail.open({ label: "Completed", value: String(past.length), sub: "Past sessions", color: GREEN, sections: [{ title: "COMPLETED", rows: past.slice(0, 8).map((s) => ({ label: s.title, value: new Date(s.scheduled_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) })) }] })} />
        <StatCard label="Total Hours" value={String(Math.round(sessions.reduce((sum, s) => sum + s.duration_mins, 0) / 60))} sub="Planned learning" color={INDIGO} />
      </div>
      {statDetail.overlay}
      <div style={{ display: "grid", gridTemplateColumns: "340px minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        <Card style={{ padding: 16 }}>
          <SessionCalendar sessions={sessions} selected={selected} onSelect={setSelected} />
        </Card>
        <Card>
          <SectionTitle
            title={selected ? new Date(selected).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) : "Upcoming & Live Sessions"}
            meta={selected ? `${listedSessions.length} session${listedSessions.length === 1 ? "" : "s"}` : `${upcomingOrLive.length} session${upcomingOrLive.length === 1 ? "" : "s"}`}
          />
          {selected && (
            <button onClick={() => setSelected(null)} style={{ ...secondaryButton, marginBottom: 12 }}>‹ Back to all upcoming</button>
          )}
          <Stack>
            {listedSessions.length > 0
              ? listedSessions.map((s) => <SessionRow key={s.id} session={s} />)
              : <SoftEmpty label={selected ? "No sessions on this day." : "No upcoming or live sessions."} />}
          </Stack>
        </Card>
      </div>
    </Page>
  );
}

// SessionCalendar renders a compact month grid; days with scheduled sessions
// show a dot (green = live, orange = upcoming/scheduled). Clicking a day
// filters the session list alongside it; clicking the same day again (or the
// "back" link) returns to the persistent upcoming/live list.
function SessionCalendar({ sessions, selected, onSelect }: { sessions: SessionDTO[]; selected: string | null; onSelect: (day: string | null) => void }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  const byDay = useMemo(() => {
    const map: Record<string, SessionDTO[]> = {};
    for (const s of sessions) {
      const key = new Date(s.scheduled_at).toDateString();
      (map[key] ||= []).push(s);
    }
    return map;
  }, [sessions]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toDateString();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button onClick={() => setCursor(new Date(year, month - 1, 1))} style={calNavBtn}>‹</button>
        <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{monthLabel}</div>
        <button onClick={() => setCursor(new Date(year, month + 1, 1))} style={calNavBtn}>›</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 3 }}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <div key={i} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: 0.5, padding: "3px 0" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {cells.map((date, i) => {
          if (!date) return <div key={`e${i}`} />;
          const key = date.toDateString();
          const daySessions = byDay[key] ?? [];
          const isToday = key === todayStr;
          const isSelected = key === selected;
          return (
            <button key={key} onClick={() => onSelect(isSelected ? null : key)}
              style={{ aspectRatio: "1", minHeight: 30, borderRadius: 6, cursor: "pointer", fontFamily: "Poppins, sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, padding: 0,
                border: `1px solid ${isSelected ? ORANGE : isToday ? "rgba(239,78,36,0.4)" : BORDER}`,
                background: isSelected ? "rgba(239,78,36,0.08)" : "#fff" }}>
              <span style={{ fontSize: 11, fontWeight: isToday || isSelected ? 700 : 500, color: isSelected ? ORANGE : NAVY }}>{date.getDate()}</span>
              {daySessions.length > 0 && (
                <span style={{ display: "flex", gap: 2 }}>
                  {daySessions.slice(0, 3).map((s, j) => (
                    <span key={j} style={{ width: 4, height: 4, borderRadius: "50%", background: s.status === "live" ? GREEN : ORANGE }} />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const calNavBtn: CSSProperties = { width: 30, height: 30, borderRadius: 8, border: `1px solid ${BORDER}`, background: "#fff", color: NAVY, fontSize: 16, cursor: "pointer", fontFamily: "Poppins, sans-serif", display: "flex", alignItems: "center", justifyContent: "center" };

function SubmissionModal({ target, onClose, onSaved }: { target: { activity: ActivityDTO; kind: SubmitKind }; onClose: () => void; onSaved: (activityId: string) => void }) {
  const [content, setContent] = useState("");
  const [fileUrl, setFileUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!content.trim() && !fileUrl.trim()) {
      setError("Add a response or file URL before submitting.");
      return;
    }
    setSaving(true);
    try {
      await submissionsApi.submit({ activity_id: target.activity.id, content: content.trim(), file_url: fileUrl.trim() });
      onSaved(target.activity.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSaving(false);
    }
  }

  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div style={modalOverlay} onClick={(event) => event.target === event.currentTarget && onClose()}>
      <div className="xa-modal-content" style={modalCard}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", gap: 16 }}>
          <div><Badge label={target.kind} color={ORANGE} /><div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginTop: 8 }}>{target.activity.title}</div></div>
          <button onClick={onClose} style={iconButton}>x</button>
        </div>
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
          <label style={labelStyle}>Response</label>
          <textarea value={content} onChange={(e) => setContent(e.target.value)} style={textareaStyle} placeholder="Write your response, reflection, or survey answer..." />
          <label style={labelStyle}>File URL</label>
          <input value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} style={inputStyle} placeholder="https://..." />
          {error && <div style={{ color: DANGER, fontSize: 12, fontWeight: 600 }}>{error}</div>}
        </div>
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button onClick={onClose} style={secondaryButton}>Cancel</button>
          <button onClick={submit} disabled={saving} style={{ ...primaryButton, opacity: saving ? 0.7 : 1 }}>{saving ? "Submitting..." : "Submit"}</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function ActivityRow({ activity, submission, onSubmit, forceKind }: { activity: ActivityDTO; submission?: SubmissionDTO | null; onSubmit: ViewProps["onSubmit"]; forceKind?: SubmitKind }) {
  const done = Boolean(submission);
  const kind = forceKind ?? kindForActivity(activity.type);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", borderRadius: 9, background: done ? "rgba(34,197,94,0.04)" : "#F9FAFB", border: `1px solid ${done ? "rgba(34,197,94,0.18)" : BORDER}` }}>
      <ActivityIcon type={activity.type} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{activity.title}</span>
          {activity.is_mandatory && <Badge label="Required" color={ORANGE} />}
          {done && <Badge label={submission?.grade != null ? `Grade ${submission.grade}` : "Submitted"} color={GREEN} />}
        </div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>{titleCase(activity.type.replaceAll("_", " "))} - {activity.duration_mins || 30} min</div>
        {submission?.feedback && <div style={{ fontSize: 11, color: NAVY, marginTop: 6 }}>Feedback: {submission.feedback}</div>}
      </div>
      {isSubmittable(activity.type) ? <button onClick={() => onSubmit({ activity, kind })} disabled={done} style={{ ...actionButton, opacity: done ? 0.55 : 1 }}>{done ? "Done" : "Open"}</button> : <Badge label="View" color={MUTED} />}
    </div>
  );
}

function SessionRow({ session }: { session: SessionDTO }) {
  const when = new Date(session.scheduled_at);
  const live = session.status === "live";
  const joinLink = resolveJoinLink(session.meeting_type, session.join_url, session.virtual_link);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: `1px solid ${BORDER}` }}>
      <div style={{ width: 48, height: 48, borderRadius: 10, background: "rgba(239,78,36,0.08)", color: ORANGE, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, flexShrink: 0 }}>{when.getDate()}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{session.title}</div>
        <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>{formatDateTime(session.scheduled_at)} - {session.duration_mins} min - {session.faculty_name || "Faculty"}</div>
      </div>
      <Badge label={session.status} color={live ? GREEN : session.status === "scheduled" ? ORANGE : MUTED} />
      {joinLink && <a href={joinLink} target="_blank" rel="noreferrer" style={actionButton}>Join</a>}
    </div>
  );
}

// Matches the reference's phase-tab-strip + content-panel pattern: click a
// phase tab to see that phase's own activity list below, instead of a
// purely decorative progress strip.
function Timeline({ program, submissions, onSubmit }: { program: ProgramDetailDTO | null; submissions: SubmissionMap; onSubmit: ViewProps["onSubmit"] }) {
  const phases = program?.phases ?? [];
  const phaseStatus = (index: number): "done" | "active" | "locked" => {
    const acts = phases[index]?.activities ?? [];
    if (acts.length > 0 && acts.every((a) => submissions[a.id])) return "done";
    const firstOpenIdx = phases.findIndex((p) => (p.activities ?? []).some((a) => !submissions[a.id]));
    if (firstOpenIdx === -1) return "done";
    if (index === firstOpenIdx) return "active";
    return index < firstOpenIdx ? "done" : "locked";
  };
  const firstOpenIdx = phases.findIndex((p) => (p.activities ?? []).some((a) => !submissions[a.id]));
  const [selPhase, setSelPhase] = useState(firstOpenIdx === -1 ? Math.max(0, phases.length - 1) : firstOpenIdx);
  const selected = phases[selPhase];
  const selectedStatus = phases.length ? phaseStatus(selPhase) : "locked";
  const selectedActs = selected?.activities ?? [];
  const selectedDone = selectedActs.filter((a) => submissions[a.id]).length;

  return (
    <Card style={{ padding: 0, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px 0" }}><SectionTitle title="Learning Journey Timeline" meta={`${phases.length} phases`} /></div>
      {/* Phase tabs */}
      <div style={{ display: "flex", overflowX: "auto", borderBottom: `1px solid ${BORDER}`, background: "#F9FAFB" }}>
        {phases.map((phase, index) => {
          const status = phaseStatus(index);
          const isSel = selPhase === index;
          const dotColor = status === "done" ? NAVY : status === "active" ? ORANGE : "#D0D3E0";
          return (
            <button key={phase.id} onClick={() => setSelPhase(index)}
              style={{
                flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, padding: "12px 18px",
                border: "none", borderBottom: isSel ? `2.5px solid ${status === "active" ? ORANGE : NAVY}` : "2.5px solid transparent",
                background: isSel ? "#fff" : "transparent", cursor: "pointer", fontFamily: "Poppins, sans-serif", minWidth: 96,
              }}>
              <div style={{ width: 26, height: 26, borderRadius: "50%", background: dotColor, color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {status === "done" ? "✓" : status === "active" ? "●" : index + 1}
              </div>
              <span style={{ fontSize: 10, fontWeight: isSel ? 700 : 500, color: isSel ? (status === "active" ? ORANGE : NAVY) : MUTED, whiteSpace: "nowrap" }}>{phase.title}</span>
            </button>
          );
        })}
        {phases.length === 0 && <div style={{ padding: 20 }}><SoftEmpty label="No phases published yet." /></div>}
      </div>
      {/* Selected phase panel */}
      {selected && (
        <div style={{ padding: "18px 20px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: NAVY }}>{selected.title}</div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                {selectedStatus === "locked" ? "Locked" : `${selectedDone}/${selectedActs.length} complete`}
              </div>
            </div>
            <Badge label={selectedStatus === "done" ? "Completed" : selectedStatus === "active" ? "Active" : "Locked"} color={selectedStatus === "done" ? GREEN : selectedStatus === "active" ? ORANGE : MUTED} />
          </div>
          <Stack>
            {selectedActs.map((activity) => <ActivityRow key={activity.id} activity={activity} submission={submissions[activity.id]} onSubmit={onSubmit} />)}
            {selectedActs.length === 0 && <SoftEmpty label="No activities in this phase yet." />}
          </Stack>
        </div>
      )}
    </Card>
  );
}

function HeroCard({ enrollment }: { enrollment: MyEnrollmentDTO }) {
  const color = enrollment.program_color || ORANGE;
  return (
    <div style={{ background: color, borderRadius: 16, padding: "26px 30px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 20, color: "#fff", boxShadow: SHADOW }}>
      <div>
        <div style={{ fontSize: 11, opacity: 0.7, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>{enrollment.cohort_name}</div>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>{enrollment.program_title}</div>
        <div style={{ fontSize: 13, opacity: 0.82, maxWidth: 620, lineHeight: 1.55 }}>{enrollment.program_description || "Your active leadership development journey."}</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 16 }}><LightPill label={`${enrollment.program_duration_weeks} weeks`} /><LightPill label={`${enrollment.completion_percent}% complete`} /><LightPill label={titleCase(enrollment.program_status)} /></div>
      </div>
      <ProgressRing pct={enrollment.completion_percent} />
    </div>
  );
}

function Page({ children }: { children: ReactNode }) { return <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Poppins, sans-serif", background: PAGE }}>{children}</div>; }
function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) { return <div className="xa-card" style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, boxShadow: SHADOW, padding: 20, ...style }}>{children}</div>; }
function MetricGrid({ children }: { children: ReactNode }) { return <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 14 }}>{children}</div>; }
function Stack({ children }: { children: ReactNode }) { return <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div>; }

function Badge({ label, color = ORANGE }: { label: string; color?: string }) { return <span style={{ background: `${color}14`, color, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px", textTransform: "capitalize", whiteSpace: "nowrap" }}>{label}</span>; }
function SectionTitle({ title, meta }: { title: string; meta?: string }) { return <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 14 }}><div style={{ fontSize: 14, fontWeight: 800, color: NAVY }}>{title}</div>{meta && <div style={{ fontSize: 11, color: MUTED, fontWeight: 600 }}>{meta}</div>}</div>; }
function LightPill({ label }: { label: string }) { return <span style={{ background: "rgba(255,255,255,0.2)", borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 700 }}>{label}</span>; }
function SoftEmpty({ label }: { label: string }) { return <div style={{ padding: "18px 0", textAlign: "center", color: MUTED, fontSize: 12 }}>{label}</div>; }
function LoadingState({ label }: { label: string }) { return <div style={{ padding: 40, textAlign: "center", color: MUTED, fontSize: 13, fontFamily: "Poppins, sans-serif" }}>{label}</div>; }

function ProgressRing({ pct }: { pct: number }) {
  const r = 28, c = 2 * Math.PI * r, dash = (clamp(pct) / 100) * c;
  return <svg width={74} height={74} viewBox="0 0 74 74" style={{ flexShrink: 0 }}><circle cx={37} cy={37} r={r} fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={6} /><circle cx={37} cy={37} r={r} fill="none" stroke="#fff" strokeWidth={6} strokeDasharray={`${dash} ${c - dash}`} strokeLinecap="round" transform="rotate(-90 37 37)" /><text x={37} y={42} textAnchor="middle" fontSize={13} fontWeight={800} fill="#fff" fontFamily="Poppins,sans-serif">{pct}%</text></svg>;
}

function AIBanner({ title, body }: { title: string; body: string }) { return <div style={{ display: "flex", alignItems: "flex-start", gap: 12, background: "linear-gradient(135deg, #1C2551 0%, #2d3a7c 100%)", color: "#fff", borderRadius: 12, padding: "14px 20px" }}><span style={{ color: ORANGE, fontWeight: 800 }}>AI</span><div><div style={{ fontWeight: 800, fontSize: 13, marginBottom: 2 }}>{title}</div><div style={{ fontSize: 12, opacity: 0.86, lineHeight: 1.55 }}>{body}</div></div></div>; }
function EmptyCard({ title, body, accent = ORANGE }: { title: string; body: string; accent?: string }) { return <Card style={{ padding: 48, textAlign: "center" }}><div style={{ width: 48, height: 48, borderRadius: 14, background: `${accent}14`, color: accent, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontWeight: 800 }}>XA</div><div style={{ fontSize: 18, fontWeight: 800, color: NAVY, marginBottom: 8 }}>{title}</div><div style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, maxWidth: 480, margin: "0 auto" }}>{body}</div></Card>; }
function InfoList({ rows }: { rows: [string, string][] }) { return <div>{rows.map(([k, v]) => <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "9px 0", borderBottom: `1px solid ${BORDER}`, fontSize: 12 }}><span style={{ color: MUTED }}>{k}</span><strong style={{ color: NAVY, textAlign: "right" }}>{v}</strong></div>)}</div>; }
function ActivityIcon({ type }: { type: string }) { const color = type === "assessment" || type === "survey" ? ORANGE : type === "coaching" || type === "capstone" ? INDIGO : NAVY; return <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}14`, color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 800, flexShrink: 0 }}>{type.slice(0, 2).toUpperCase()}</div>; }

function flattenActivities(program: ProgramDetailDTO): ActivityDTO[] { return (program.phases ?? []).flatMap((phase) => phase.activities ?? []); }
function isSubmittable(type: string) { return ["assessment", "survey", "journal", "assignment", "peer_review", "capstone", "feedback_360", "discussion"].includes(type); }
function kindForActivity(type: string): SubmitKind { if (type === "assessment") return "assessment"; if (type === "survey") return "survey"; if (type === "capstone") return "capstone"; return "activity"; }
function titleCase(value: string) { return value.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()); }
function clamp(value: number) { return Math.max(0, Math.min(100, value)); }
function formatDateTime(value: string) { return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }

const actionButton: CSSProperties = { padding: "8px 14px", background: ORANGE, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "Poppins, sans-serif", textDecoration: "none", whiteSpace: "nowrap" };
const primaryButton: CSSProperties = { ...actionButton, padding: "9px 20px" };
const secondaryButton: CSSProperties = { padding: "8px 16px", border: `1px solid ${BORDER}`, borderRadius: 8, background: "#fff", color: NAVY, fontSize: 12, fontWeight: 700, fontFamily: "Poppins, sans-serif" };
const iconButton: CSSProperties = { width: 30, height: 30, border: `1px solid ${BORDER}`, borderRadius: "50%", background: "#fff", color: MUTED, cursor: "pointer", fontFamily: "Poppins, sans-serif" };
const modalOverlay: CSSProperties = { position: "fixed", inset: 0, background: "rgba(28,37,81,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins, sans-serif" };
const modalCard: CSSProperties = { background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "88vh", overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.22)" };
const labelStyle: CSSProperties = { fontSize: 10, fontWeight: 800, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase" };
const inputStyle: CSSProperties = { border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: NAVY, fontFamily: "Poppins, sans-serif" };
const textareaStyle: CSSProperties = { ...inputStyle, height: 120, resize: "vertical", lineHeight: 1.6 };
