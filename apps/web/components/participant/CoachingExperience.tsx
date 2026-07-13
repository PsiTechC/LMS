"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { coachingApi, MyCoachingDTO, MyCoachingSessionDTO } from "@/lib/coaching-api";
import { resolveJoinLink } from "@/lib/session-link";

const NAVY = "#1C2551";
const ORANGE = "#EF4E24";
const INDIGO = "#6B73BF";
const GREEN = "#22c55e";
const PAGE = "#F5F7FB";
const BORDER = "#EAECF4";
const MUTED = "#8b90a7";
const SHADOW = "0 1px 4px rgba(28,37,81,0.07)";

// Deterministic self-reflection prompts (the "AI Coaching Prompt" — swappable
// for an LLM later). Rotates on "New Prompt".
const PROMPTS = [
  "Think about a recent moment where you held back from speaking up in a meeting. What was the cost of that silence — to you, to your team, and to the outcome?",
  "Recall a decision you made this week under pressure. What would you do differently with more time, and what does that tell you about your defaults?",
  "When did you last give someone difficult feedback? What made it hard, and how did you show up in that conversation?",
  "Consider a stakeholder you find challenging. What might their perspective be, and how could understanding it change your approach?",
];

interface Props {
  programId?: string;
}

export default function CoachingExperience({ programId }: Props) {
  const [data, setData] = useState<MyCoachingDTO | null>(null);
  const [coachingSessions, setCoachingSessions] = useState<MyCoachingSessionDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [promptIdx, setPromptIdx] = useState(0);

  const load = useCallback(async () => {
    const [coachingRes, sessionsRes] = await Promise.allSettled([
      coachingApi.my(programId),
      coachingApi.mySessions(),
    ]);
    setData(coachingRes.status === "fulfilled" ? coachingRes.value.data : null);
    setCoachingSessions(sessionsRes.status === "fulfilled" ? sessionsRes.value.data ?? [] : []);
  }, [programId]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setLoading(true);
      load().finally(() => { if (!cancelled) setLoading(false); });
    });
    return () => { cancelled = true; };
  }, [load]);

  if (loading) return <Page><SoftEmpty label="Loading your coaching..." /></Page>;

  const activeGoals = (data?.goals ?? []).filter((g) => g.status !== "completed").length;
  const completedGoals = (data?.goals ?? []).filter((g) => g.status === "completed").length;
  const totalGoals = data?.goals.length ?? 0;
  const done = data?.completed_sessions ?? 0;
  const total = data?.total_sessions ?? 0;
  const nextSession = upcomingSession(coachingSessions);

  return (
    <Page>
      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        <Stat label="Sessions Done" value={`${done} / ${total || "—"}`} sub={total ? `of ${total} total` : "No engagement yet"} color={NAVY} />
        <Stat label="Active Goals" value={String(activeGoals)} sub="Set in learning contract" color={ORANGE} />
        <Stat label="Goals Done" value={`${completedGoals} / ${totalGoals}`} sub="Completed this cycle" color={GREEN} />
        <Stat label="Coaching Score" value={data?.coaching_score != null ? String(data.coaching_score) : "—"} sub={data?.coaching_score != null ? "vs baseline" : "Awaiting scoring"} color={INDIGO} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* My Coach */}
        <Card>
          <SectionTitle title="My Coach" />
          {data?.has_engagement ? (
            <>
              <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
                <div style={{ width: 54, height: 54, borderRadius: "50%", background: NAVY, color: "#fff", fontWeight: 800, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initials(data.coach_name || "")}</div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: NAVY }}>{data.coach_name}</div>
                  <div style={{ fontSize: 12, color: MUTED }}>{data.coach_credential}{data.assignment_type ? ` · ${titleCase(data.assignment_type)}` : ""}</div>
                  {nextSession && <div style={{ marginTop: 4 }}><Badge label={`Next: ${formatDateTime(nextSession.scheduled_at)}`} color={ORANGE} /></div>}
                </div>
              </div>
              {nextSession ? (
                <>
                  <div style={{ fontWeight: 600, fontSize: 12, color: NAVY, marginBottom: 8 }}>Upcoming Session</div>
                  <div style={{ padding: "9px 0", borderBottom: `1px solid ${BORDER}`, fontSize: 12, color: MUTED, display: "flex", gap: 8 }}>
                    <span>→</span>{nextSession.title}
                  </div>
                  {nextSession.session_type === "in_person" && nextSession.location && (
                    <div style={{ padding: "9px 0", fontSize: 12, color: MUTED, display: "flex", gap: 8 }}>
                      <span>📍</span>{nextSession.location}
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 12, color: MUTED }}>No upcoming coaching session scheduled.</div>
              )}
              {nextSession && resolveJoinLink(nextSession.meeting_type, nextSession.join_url, nextSession.virtual_link) ? (
                <a href={resolveJoinLink(nextSession.meeting_type, nextSession.join_url, nextSession.virtual_link)} target="_blank" rel="noreferrer"
                  style={{ ...primaryButton, marginTop: 14, width: "100%", justifyContent: "center", textDecoration: "none", boxSizing: "border-box" }}>Join Session</a>
              ) : (
                <button disabled title={nextSession ? "This is an in-person session — see the location above" : "No upcoming session to join"}
                  style={{ ...primaryButton, marginTop: 14, width: "100%", justifyContent: "center", opacity: 0.5, cursor: "not-allowed" }}>Join Session</button>
              )}
            </>
          ) : (
            <AwaitingBlock label="No coach assigned yet" body="Once your Program Manager assigns you a coach, their profile, session schedule, and agenda will appear here." />
          )}
        </Card>

        {/* Action Tracker (goals) */}
        <Card>
          <SectionTitle title="Action Tracker" />
          {(data?.goals ?? []).length === 0 && <SoftEmpty label="No development goals set yet. Your coach adds these in your learning contract." />}
          {(data?.goals ?? []).map((g) => {
            const doneGoal = g.status === "completed";
            return (
              <div key={g.id} style={{ display: "flex", gap: 10, padding: "10px 0", borderBottom: `1px solid ${BORDER}`, alignItems: "flex-start" }}>
                <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${doneGoal ? GREEN : "#D0D3E0"}`, background: doneGoal ? GREEN : "#fff", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11 }}>{doneGoal ? "✓" : ""}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: doneGoal ? MUTED : NAVY, textDecoration: doneGoal ? "line-through" : "none" }}>{g.title}</div>
                  {g.target_date && <div style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>Due {formatDate(g.target_date)}</div>}
                </div>
              </div>
            );
          })}
        </Card>

        {/* AI Coaching Prompt */}
        <Card style={{ background: "rgba(239,78,36,0.03)", border: "1px solid rgba(239,78,36,0.15)" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: ORANGE, marginBottom: 10 }}>✦ AI Coaching Prompt</div>
          <div style={{ fontSize: 13, color: NAVY, lineHeight: 1.7, fontStyle: "italic" }}>&ldquo;{PROMPTS[promptIdx]}&rdquo;</div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button style={actionButton}>Reflect →</button>
            <button style={{ ...actionButton, background: "transparent", color: MUTED, border: `1px solid ${BORDER}` }} onClick={() => setPromptIdx((i) => (i + 1) % PROMPTS.length)}>New Prompt</button>
          </div>
        </Card>

        {/* Session History (from session notes authored by coach) */}
        <Card>
          <SectionTitle title="Session History" />
          {(data?.session_notes ?? []).length === 0 && <SoftEmpty label="No session notes yet. Your coach's post-session notes will appear here." />}
          {(data?.session_notes ?? []).map((n) => (
            <div key={n.id} style={{ padding: "10px 0", borderBottom: `1px solid ${BORDER}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ fontSize: 12, color: NAVY, lineHeight: 1.5 }}>{n.notes}</span>
                <span style={{ fontSize: 11, color: MUTED, flexShrink: 0 }}>{formatDate(n.created_at)}</span>
              </div>
            </div>
          ))}
        </Card>
      </div>

      {/* Coaching Journey Timeline */}
      <Card>
        <SectionTitle title="Coaching Journey Timeline" />
        {coachingSessions.length === 0 ? (
          <SoftEmpty label="No coaching sessions scheduled yet." />
        ) : (
          <div style={{ position: "relative" }}>
            <div style={{ position: "absolute", left: 18, top: 0, bottom: 0, width: 2, background: BORDER }} />
            {timelineSessions(coachingSessions).map((s, i) => (
              <div key={s.id} style={{ display: "flex", gap: 16, marginBottom: 16, position: "relative" }}>
                <div style={{ width: 38, height: 38, borderRadius: "50%", border: "2px solid", flexShrink: 0, zIndex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, borderColor: s.state === "done" ? NAVY : s.state === "upcoming" ? ORANGE : "#D0D3E0", background: s.state === "done" ? NAVY : s.state === "upcoming" ? ORANGE : PAGE, color: s.state === "locked" ? "#aaa" : "#fff" }}>
                  {s.state === "done" ? "✓" : s.state === "upcoming" ? "●" : i + 1}
                </div>
                <div style={{ flex: 1, paddingTop: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: s.state === "locked" ? "#aaa" : NAVY }}>{s.title}</div>
                    <span style={{ fontSize: 11, color: MUTED, flexShrink: 0, marginLeft: 8 }}>{formatDate(s.scheduled_at)}</span>
                  </div>
                  {s.state === "upcoming" && <span style={{ display: "inline-block", fontSize: 10, fontWeight: 700, color: ORANGE, background: "rgba(239,78,36,0.08)", borderRadius: 10, padding: "2px 8px" }}>Upcoming · {formatDateTime(s.scheduled_at)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </Page>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────────
function upcomingSession(sessions: MyCoachingSessionDTO[]): MyCoachingSessionDTO | null {
  const now = Date.now();
  const future = sessions.filter((s) => new Date(s.scheduled_at).getTime() >= now)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  return future[0] ?? null;
}

type TimelineSession = MyCoachingSessionDTO & { state: "done" | "upcoming" | "locked" };
function timelineSessions(sessions: MyCoachingSessionDTO[]): TimelineSession[] {
  const now = Date.now();
  const sorted = [...sessions].sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  const nextIdx = sorted.findIndex((s) => new Date(s.scheduled_at).getTime() >= now);
  return sorted.map((s, i) => {
    let state: TimelineSession["state"] = "done";
    if (new Date(s.scheduled_at).getTime() >= now) state = i === nextIdx ? "upcoming" : "locked";
    return { ...s, state };
  });
}

function Page({ children }: { children: ReactNode }) {
  return <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Poppins, sans-serif", background: PAGE }}>{children}</div>;
}
function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, boxShadow: SHADOW, padding: 20, ...style }}>{children}</div>;
}
function SectionTitle({ title }: { title: string }) {
  return <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 14 }}>{title}</div>;
}
function Stat({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <Card style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: MUTED, marginTop: 3 }}>{sub}</div>
    </Card>
  );
}
function Badge({ label, color = ORANGE }: { label: string; color?: string }) {
  return <span style={{ background: `${color}14`, color, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap" }}>{label}</span>;
}
function AwaitingBlock({ label, body }: { label: string; body: string }) {
  return (
    <div style={{ padding: "18px 16px", background: "#F9FAFB", border: `1px dashed ${BORDER}`, borderRadius: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}
function SoftEmpty({ label }: { label: string }) {
  return <div style={{ padding: "20px 0", textAlign: "center", color: MUTED, fontSize: 12 }}>{label}</div>;
}

function initials(name: string) { return name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase(); }
function titleCase(v: string) { return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()); }
function formatDate(iso: string) { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
function formatDateTime(iso: string) { return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }

const primaryButton: CSSProperties = { padding: "10px 20px", background: ORANGE, border: "none", borderRadius: 10, color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins, sans-serif", display: "flex", alignItems: "center" };
const actionButton: CSSProperties = { padding: "8px 14px", background: ORANGE, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins, sans-serif" };
