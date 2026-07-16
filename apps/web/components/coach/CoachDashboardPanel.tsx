// Extracted from app/dashboard/coach/page.tsx so it can be reused inside the
// faculty-side "Coach Workspace" section (FacultyCoaching) for a dual-role
// faculty+coach user, without duplicating this screen's logic.
"use client";

import type { CoachSummaryDTO, CoachSessionDTO, CoachActionDTO, CoachingEngagementDTO } from "@/lib/coach-api";
import { StatCard, useStatDetail } from "@/components/shared/StatCard";
import {
  ff, NAVY, ORANGE, COACH, GREEN, BORDER, MUTED, TRACK, SHADOW,
  monthDay, clockTime, dueLabel, platformOf, sessionParty, pct, progressColor, initials, engagementLabel,
  Card, Pill, SectionTitle, EmptyRow,
} from "./coachShared";

export default function CoachDashboardPanel({
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
  const statDetail = useStatDetail();
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
        <StatCard
          label="Active Engagements"
          value={summary?.active_engagements ?? 0}
          sub={`${summary?.scheduled_engagements ?? 0} scheduled`}
          color={COACH}
          detail={[{ title: "BY COACHEE", rows: engagements.map(e => ({ label: engagementLabel(e), value: `${pct(e.completed_sessions, e.total_sessions)}%`, bar: pct(e.completed_sessions, e.total_sessions), color: COACH })) }]}
          onOpen={() => statDetail.open({ label: "Active Engagements", value: String(summary?.active_engagements ?? 0), sub: `${summary?.scheduled_engagements ?? 0} scheduled`, color: COACH, sections: [{ title: "BY COACHEE", rows: engagements.map(e => ({ label: engagementLabel(e), value: `${pct(e.completed_sessions, e.total_sessions)}%`, bar: pct(e.completed_sessions, e.total_sessions), color: COACH })) }] })}
        />
        <StatCard label="Upcoming Sessions" value={summary?.upcoming_sessions ?? 0} sub="Next 7 days" color={NAVY}
          detail={[{ title: "UPCOMING", rows: sessions.slice(0, 8).map(s => ({ label: s.title, value: new Date(s.scheduled_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) })) }]}
          onOpen={() => statDetail.open({ label: "Upcoming Sessions", value: String(summary?.upcoming_sessions ?? 0), sub: "Next 7 days", color: NAVY, sections: [{ title: "UPCOMING", rows: sessions.slice(0, 8).map(s => ({ label: s.title, value: new Date(s.scheduled_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) })) }] })}
        />
        <StatCard
          label="Pending Actions"
          value={summary?.pending_actions ?? 0}
          sub="Across all coachees"
          color={ORANGE}
          detail={[{ title: "PENDING", rows: actions.filter(a => a.status !== "done").slice(0, 8).map(a => ({ label: a.description, value: a.participant_name ?? "" })) }]}
          onOpen={() => statDetail.open({ label: "Pending Actions", value: String(summary?.pending_actions ?? 0), sub: "Across all coachees", color: ORANGE, sections: [{ title: "PENDING", rows: actions.filter(a => a.status !== "done").slice(0, 8).map(a => ({ label: a.description, value: a.participant_name ?? "" })) }] })}
        />
        <StatCard
          label="Sessions Done"
          value={summary?.sessions_done ?? 0}
          sub={`of ${summary?.sessions_total ?? 0} total`}
          color={GREEN}
          detail={[{ title: "BY COACHEE", rows: engagements.map(e => ({ label: engagementLabel(e), value: `${e.completed_sessions}/${e.total_sessions}` })) }]}
          onOpen={() => statDetail.open({ label: "Sessions Done", value: String(summary?.sessions_done ?? 0), sub: `of ${summary?.sessions_total ?? 0} total`, color: GREEN, sections: [{ title: "BY COACHEE", rows: engagements.map(e => ({ label: engagementLabel(e), value: `${e.completed_sessions}/${e.total_sessions}` })) }] })}
        />
      </div>
      {statDetail.overlay}

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
