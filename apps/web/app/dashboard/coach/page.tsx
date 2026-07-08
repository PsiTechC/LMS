"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import DashboardShell from "@/components/layout/DashboardShell";
import {
  coachApi,
  type CoachSummaryDTO,
  type CoachSessionDTO,
  type CoachActionDTO,
  type CoachingEngagementDTO,
} from "@/lib/coach-api";
import CoachCalendar from "@/components/coach/CoachCalendar";
import CoachSessionNotes from "@/components/coach/CoachSessionNotes";
import CoachProgramOutline from "@/components/coach/CoachProgramOutline";
import CoachDocuments from "@/components/coach/CoachDocuments";
import ProfilePage from "@/components/shared/ProfilePage";
import SettingsPage from "@/components/shared/SettingsPage";

// ── Design tokens (apps/CLAUDE.md) ────────────────────────────────
const ff = { fontFamily: "Poppins, sans-serif" } as const;
const NAVY = "#1C2551";
const ORANGE = "#EF4E24";
const COACH = "#0891B2"; // coach persona accent (nav-config ROLE_COLOR.coach)
const GREEN = "#22c55e";
const CARD = "#fff";
const BORDER = "#EAECF4";
const MUTED = "#8b90a7";
const TRACK = "#F0F1F7";
const SHADOW = "0 1px 4px rgba(28,37,81,0.07)";

const PAGE_TITLES: Record<string, string> = {
  "coach-dashboard": "Dashboard",
  "coach-engagements": "My Engagements",
  "coach-calendar": "Calendar & Sessions",
  "coach-notes": "Session Notes",
  "coach-outline": "Program Outline",
  "coach-docs": "Documents & Reports",
  profile: "My Profile",
  settings: "Settings",
};

// ── Formatting helpers ────────────────────────────────────────────
function monthDay(iso: string): { mon: string; day: string } {
  const d = new Date(iso);
  return {
    mon: d.toLocaleDateString(undefined, { month: "short" }).toUpperCase(),
    day: String(d.getDate()),
  };
}
function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
function dueLabel(iso?: string): string {
  if (!iso) return "No due date";
  const d = new Date(iso + "T00:00:00");
  return "Due " + d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function platformOf(link?: string): string {
  if (!link) return "Virtual";
  const l = link.toLowerCase();
  if (l.includes("zoom")) return "Zoom";
  if (l.includes("teams")) return "Teams";
  if (l.includes("meet")) return "Meet";
  return "Virtual";
}
// A coaching session is labelled by who it's with: a 1:1 by its coachee, a
// group by its engagement/cohort. The session title becomes the topic line.
function sessionParty(s: CoachSessionDTO): { primary: string; topic: string; tag: { label: string; color: string } } {
  const isGroup = s.engagement_type === "group" || s.session_type === "coaching_group";
  if (isGroup) {
    return {
      primary: s.engagement_name || s.cohort_name || "Group Session",
      topic: s.title,
      tag: { label: "GROUP", color: COACH },
    };
  }
  if (s.coachee_name) {
    return { primary: s.coachee_name, topic: s.title, tag: { label: "1:1", color: NAVY } };
  }
  // No engagement link — fall back to the session title itself.
  return { primary: s.title, topic: s.program_title, tag: { label: "SESSION", color: MUTED } };
}
function pct(done: number, total: number): number {
  if (!total) return 0;
  return Math.round((done / total) * 100);
}
function progressColor(p: number): string {
  if (p >= 67) return GREEN;
  if (p >= 34) return ORANGE;
  return COACH;
}
function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
// The primary label a coach thinks of an engagement by: the individual coachee,
// or the engagement name for a group.
function engagementLabel(e: CoachingEngagementDTO): string {
  if (e.assignment_type === "individual" && e.participants[0]) {
    return e.participants[0].name;
  }
  return e.name;
}

// ── Small UI atoms ────────────────────────────────────────────────
function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: CARD,
        borderRadius: 12,
        border: `1px solid ${BORDER}`,
        boxShadow: SHADOW,
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function Pill({ text, color }: { text: string; color: string }) {
  return (
    <span
      style={{
        ...ff,
        background: `${color}14`,
        color,
        fontSize: 10,
        fontWeight: 700,
        borderRadius: 20,
        padding: "3px 9px",
        letterSpacing: 0.3,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

function StatTile({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number | string;
  sub: string;
  color: string;
}) {
  return (
    <Card>
      <div style={{ ...ff, fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ ...ff, fontSize: 26, fontWeight: 800, color, marginTop: 6 }}>{value}</div>
      <div style={{ ...ff, fontSize: 11, fontWeight: 500, color: MUTED, marginTop: 2 }}>{sub}</div>
    </Card>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ ...ff, fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 14 }}>{children}</div>;
}

function EmptyRow({ text }: { text: string }) {
  return <div style={{ ...ff, fontSize: 13, color: MUTED, padding: "16px 0" }}>{text}</div>;
}

// ── Dashboard screen ──────────────────────────────────────────────
function CoachDashboard({
  summary,
  engagements,
  sessions,
  actions,
  loading,
}: {
  summary: CoachSummaryDTO | null;
  engagements: CoachingEngagementDTO[];
  sessions: CoachSessionDTO[];
  actions: CoachActionDTO[];
  loading: boolean;
}) {
  // A real, data-derived insight line (not a hardcoded mock).
  const topEngagement = [...engagements].sort(
    (a, b) => pct(b.completed_sessions, b.total_sessions) - pct(a.completed_sessions, a.total_sessions),
  )[0];
  const pulse =
    engagements.length === 0
      ? "No active engagements yet. New coaching assignments from your program managers will appear here."
      : `${topEngagement ? engagementLabel(topEngagement) : "A coachee"} has the highest momentum at ${topEngagement ? pct(topEngagement.completed_sessions, topEngagement.total_sessions) : 0}% completion.` +
        (summary && summary.pending_actions > 0
          ? ` You have ${summary.pending_actions} pending coachee action${summary.pending_actions === 1 ? "" : "s"} to follow up on.`
          : " All coachee actions are up to date.");

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* AI Coaching Pulse */}
      <div
        style={{
          background: `linear-gradient(135deg, ${COACH}, #2d3a7c)`,
          borderRadius: 12,
          padding: "18px 22px",
          color: "#fff",
          boxShadow: SHADOW,
        }}
      >
        <div style={{ ...ff, fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
          <span>✦</span> Coaching Pulse
        </div>
        <div style={{ ...ff, fontSize: 13, fontWeight: 400, marginTop: 6, opacity: 0.95, lineHeight: 1.5 }}>{pulse}</div>
      </div>

      {/* Stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14 }}>
        <StatTile
          label="Active Engagements"
          value={summary?.active_engagements ?? 0}
          sub={`${summary?.scheduled_engagements ?? 0} scheduled`}
          color={COACH}
        />
        <StatTile label="Upcoming Sessions" value={summary?.upcoming_sessions ?? 0} sub="Next 7 days" color={NAVY} />
        <StatTile
          label="Pending Actions"
          value={summary?.pending_actions ?? 0}
          sub="Across all coachees"
          color={ORANGE}
        />
        <StatTile
          label="Sessions Done"
          value={summary?.sessions_done ?? 0}
          sub={`of ${summary?.sessions_total ?? 0} total`}
          color={GREEN}
        />
      </div>

      {/* Two-column: Upcoming Sessions + Engagement Overview */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <SectionTitle>Upcoming Sessions</SectionTitle>
          {loading ? (
            <EmptyRow text="Loading…" />
          ) : sessions.length === 0 ? (
            <EmptyRow text="No upcoming sessions scheduled." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {sessions.map((s) => {
                const md = monthDay(s.scheduled_at);
                const party = sessionParty(s);
                return (
                  <div
                    key={s.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      border: `1px solid ${BORDER}`,
                      borderRadius: 10,
                      padding: 12,
                    }}
                  >
                    <div
                      style={{
                        background: "#EEF5F7",
                        borderRadius: 8,
                        width: 46,
                        minWidth: 46,
                        textAlign: "center",
                        padding: "6px 0",
                      }}
                    >
                      <div style={{ ...ff, fontSize: 9, fontWeight: 700, color: COACH, letterSpacing: 0.5 }}>{md.mon}</div>
                      <div style={{ ...ff, fontSize: 18, fontWeight: 800, color: NAVY }}>{md.day}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ ...ff, fontSize: 13, fontWeight: 700, color: NAVY }}>{party.primary}</div>
                      <div style={{ ...ff, fontSize: 12, color: MUTED, marginTop: 1 }}>{party.topic}</div>
                      <div style={{ ...ff, fontSize: 11, color: MUTED, marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                        <Pill text={party.tag.label} color={party.tag.color} />
                        <span>
                          {clockTime(s.scheduled_at)} · {s.duration_mins}min · {platformOf(s.virtual_link)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card>
          <SectionTitle>Engagement Overview</SectionTitle>
          {loading ? (
            <EmptyRow text="Loading…" />
          ) : engagements.length === 0 ? (
            <EmptyRow text="No engagements assigned yet." />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {engagements.map((e) => {
                const p = pct(e.completed_sessions, e.total_sessions);
                const label = engagementLabel(e);
                return (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div
                      style={{
                        width: 34,
                        height: 34,
                        minWidth: 34,
                        borderRadius: 99,
                        background: `${COACH}1a`,
                        color: COACH,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        ...ff,
                        fontSize: 12,
                        fontWeight: 700,
                      }}
                    >
                      {initials(label)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ ...ff, fontSize: 13, fontWeight: 700, color: NAVY }}>{label}</div>
                      <div style={{ ...ff, fontSize: 11, color: MUTED, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {e.program_title}
                      </div>
                    </div>
                    <div style={{ width: 90 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ ...ff, fontSize: 12, fontWeight: 800, color: progressColor(p) }}>{p}%</span>
                      </div>
                      <div style={{ height: 6, background: TRACK, borderRadius: 99 }}>
                        <div style={{ height: 6, width: `${p}%`, background: progressColor(p), borderRadius: 99 }} />
                      </div>
                    </div>
                    <Pill text={e.status.toUpperCase()} color={e.status === "active" ? GREEN : e.status === "scheduled" ? ORANGE : MUTED} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* Pending Coachee Actions */}
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ ...ff, fontSize: 15, fontWeight: 700, color: NAVY }}>Pending Coachee Actions</div>
          {actions.length > 0 && (
            <span style={{ ...ff, fontSize: 10, fontWeight: 700, color: ORANGE, background: `${ORANGE}14`, borderRadius: 20, padding: "3px 10px" }}>
              {actions.length} OPEN
            </span>
          )}
        </div>
        {loading ? (
          <EmptyRow text="Loading…" />
        ) : actions.length === 0 ? (
          <EmptyRow text="No pending actions — everyone is on track." />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {actions.map((a) => (
              <div
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "12px 14px",
                  background: "#F5F7FB",
                  borderRadius: 8,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span style={{ color: ORANGE, fontSize: 8 }}>●</span>
                  <span style={{ ...ff, fontSize: 13, color: NAVY, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.description}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 20, whiteSpace: "nowrap", flexShrink: 0 }}>
                  {a.participant_name && (
                    <span style={{ ...ff, fontSize: 11, color: MUTED }}>— {a.participant_name}</span>
                  )}
                  <span style={{ ...ff, fontSize: 11, fontWeight: 600, color: MUTED }}>{dueLabel(a.due_date)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ── My Engagements screen (reuses engagement data) ────────────────
const ENG_FILTERS = ["All", "Individual (1:1)", "Group", "Active", "Scheduled", "Completed"] as const;

// The soonest upcoming session for an engagement, formatted like "May 8, 3:00 PM".
function nextSessionLabel(engagementId: string, sessions: CoachSessionDTO[]): string | null {
  const up = sessions
    .filter((s) => s.engagement_id === engagementId)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  if (!up.length) return null;
  const d = new Date(up[0].scheduled_at);
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#F5F7FB", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ ...ff, fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: 0.3, textTransform: "uppercase" }}>{label}</div>
      <div style={{ ...ff, fontSize: 14, fontWeight: 700, color: NAVY, marginTop: 2 }}>{value}</div>
    </div>
  );
}

function CoachEngagements({ engagements, sessions, loading, onNavigate }: {
  engagements: CoachingEngagementDTO[];
  sessions: CoachSessionDTO[];
  loading: boolean;
  onNavigate: (id: string) => void;
}) {
  const [filter, setFilter] = useState<string>("All");
  const filtered = engagements.filter((e) => {
    switch (filter) {
      case "Individual (1:1)": return e.assignment_type === "individual";
      case "Group":            return e.assignment_type === "group";
      case "Active":           return e.status === "active";
      case "Scheduled":        return e.status === "scheduled";
      case "Completed":        return e.status === "completed";
      default:                 return true;
    }
  });

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Filter tabs */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {ENG_FILTERS.map((f) => {
            const active = filter === f;
            return (
              <button key={f} onClick={() => setFilter(f)}
                style={{ ...ff, padding: "7px 16px", borderRadius: 8, fontSize: 12, fontWeight: active ? 700 : 500,
                  border: `1px solid ${active ? COACH : BORDER}`, background: active ? COACH : "#fff",
                  color: active ? "#fff" : MUTED, cursor: "pointer" }}>
                {f}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <EmptyRow text="Loading…" />
      ) : filtered.length === 0 ? (
        <Card><EmptyRow text="No engagements match this filter." /></Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
          {filtered.map((e) => {
            const p = pct(e.completed_sessions, e.total_sessions);
            const label = engagementLabel(e);
            const isGroup = e.assignment_type === "group";
            const next = nextSessionLabel(e.id, sessions);
            const statusColor = e.status === "active" ? GREEN : e.status === "scheduled" ? ORANGE : e.status === "completed" ? COACH : MUTED;
            return (
              <Card key={e.id} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Header: avatar + name + status/type */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ width: 40, height: 40, minWidth: 40, borderRadius: 99, background: `${COACH}1a`, color: COACH, display: "flex", alignItems: "center", justifyContent: "center", ...ff, fontSize: 12, fontWeight: 700 }}>
                    {initials(label)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...ff, fontSize: 14, fontWeight: 700, color: NAVY, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</div>
                    <div style={{ ...ff, fontSize: 11, color: MUTED, marginTop: 1 }}>{isGroup ? `${e.participants.length} participants` : (e.cohort_name || "1:1 Coaching")}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
                    <Pill text={e.status.toUpperCase()} color={statusColor} />
                    <Pill text={isGroup ? "GROUP" : "1:1"} color={isGroup ? COACH : NAVY} />
                  </div>
                </div>

                {/* Program */}
                <div style={{ ...ff, fontSize: 12, color: MUTED }}>{e.program_title}</div>

                {/* Progress */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                    <span style={{ ...ff, fontSize: 11, fontWeight: 600, color: MUTED }}>Progress</span>
                    <span style={{ ...ff, fontSize: 12, fontWeight: 800, color: progressColor(p) }}>{p}%</span>
                  </div>
                  <div style={{ height: 6, background: TRACK, borderRadius: 99 }}>
                    <div style={{ height: 6, width: `${p}%`, background: progressColor(p), borderRadius: 99 }} />
                  </div>
                </div>

                {/* Stat row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <StatMini label="Sessions" value={`${e.completed_sessions}/${e.total_sessions}`} />
                  <StatMini label={isGroup ? "Participants" : "Goals"} value={String(isGroup ? e.participants.length : e.goals.length)} />
                  <StatMini label="Assigned by" value={initials(e.assigned_by_name || "—")} />
                </div>

                {/* Next session */}
                <div style={{ ...ff, fontSize: 12, color: MUTED }}>
                  Next: <span style={{ color: NAVY, fontWeight: 600 }}>{next || "—"}</span>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => onNavigate("coach-notes")}
                    style={{ ...ff, flex: 1, background: "#fff", border: `1px solid ${BORDER}`, color: NAVY, borderRadius: 8, padding: "9px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    Notes
                  </button>
                  <button onClick={() => onNavigate("coach-calendar")}
                    style={{ ...ff, flex: 1, background: COACH, border: "none", color: "#fff", borderRadius: 8, padding: "9px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                    Schedule
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Placeholder for screens not yet built ─────────────────────────
function ComingSoon({ title }: { title: string }) {
  return (
    <div style={{ padding: 24 }}>
      <Card style={{ textAlign: "center", padding: 48 }}>
        <div style={{ ...ff, fontSize: 15, fontWeight: 700, color: NAVY }}>{title}</div>
        <div style={{ ...ff, fontSize: 13, color: MUTED, marginTop: 8 }}>
          This coach screen is coming soon.
        </div>
      </Card>
    </div>
  );
}

// ── Page orchestrator ─────────────────────────────────────────────
export default function CoachPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activePage, setActivePageState] = useState(() => searchParams.get("tab") || "coach-dashboard");

  const [summary, setSummary] = useState<CoachSummaryDTO | null>(null);
  const [engagements, setEngagements] = useState<CoachingEngagementDTO[]>([]);
  const [sessions, setSessions] = useState<CoachSessionDTO[]>([]);
  const [actions, setActions] = useState<CoachActionDTO[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Push a history entry per tab switch so browser Back/Forward moves between
  // tabs instead of leaving the dashboard entirely.
  function setActivePage(page: string) {
    setActivePageState(page);
    router.push(`/dashboard/coach?tab=${page}`);
  }

  useEffect(() => {
    if (!loading && (!user || user.role !== "coach")) {
      router.replace("/");
    }
  }, [user, loading, router]);

  useEffect(() => {
    setActivePageState(searchParams.get("tab") || "coach-dashboard");
  }, [searchParams]);

  useEffect(() => {
    if (!user || user.role !== "coach") return;
    let active = true;
    (async () => {
      setDataLoading(true);
      try {
        const [sum, eng, sess, act] = await Promise.all([
          coachApi.summary(),
          coachApi.engagements(),
          coachApi.upcomingSessions(),
          coachApi.pendingActions(),
        ]);
        if (!active) return;
        setSummary(sum.data);
        setEngagements(eng.data ?? []);
        setSessions(sess.data ?? []);
        setActions(act.data ?? []);
      } catch {
        // Leave defaults; screens render their empty states.
      } finally {
        if (active) setDataLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user]);

  if (loading || !user) return null;

  const dashSubtitle = summary
    ? `${summary.active_engagements} active engagement${summary.active_engagements === 1 ? "" : "s"} · ${summary.upcoming_sessions} upcoming session${summary.upcoming_sessions === 1 ? "" : "s"}`
    : undefined;
  const PAGE_SUBTITLES: Record<string, string> = {
    "coach-dashboard": dashSubtitle ?? "",
    "coach-engagements": "Individual & Group Coaching",
    "coach-notes": "Session notes & action tracker",
    "coach-outline": "Coachee program details, psychometric reports & documents",
    "coach-docs": "All uploaded reports and documents",
  };
  const subtitle = PAGE_SUBTITLES[activePage] || undefined;

  function renderContent() {
    switch (activePage) {
      case "coach-dashboard":
        return (
          <CoachDashboard
            summary={summary}
            engagements={engagements}
            sessions={sessions}
            actions={actions}
            loading={dataLoading}
          />
        );
      case "coach-engagements":
        return <CoachEngagements engagements={engagements} sessions={sessions} loading={dataLoading} onNavigate={setActivePage} />;
      case "coach-calendar":
        return <CoachCalendar />;
      case "coach-notes":
        return <CoachSessionNotes />;
      case "coach-outline":
        return <CoachProgramOutline />;
      case "coach-docs":
        return <CoachDocuments />;
      // Shared account screens (same as every other persona), reached from the
      // header gear/user pill.
      case "profile":
        return <div style={{ padding: 24 }}><ProfilePage /></div>;
      case "settings":
        return <div style={{ padding: 24 }}><SettingsPage /></div>;
      default:
        return <ComingSoon title={PAGE_TITLES[activePage] ?? "Dashboard"} />;
    }
  }

  return (
    <DashboardShell
      activePage={activePage}
      title={PAGE_TITLES[activePage] ?? "Dashboard"}
      subtitle={subtitle}
      onNavigate={setActivePage}
    >
      {renderContent()}
    </DashboardShell>
  );
}
