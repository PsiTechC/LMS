"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ActivityDTO, ProgramDetailDTO } from "@/lib/programs-api";
import { SubmissionDTO } from "@/lib/submissions-api";
import { assessmentsApi, AssessmentCardDTO } from "@/lib/assessments-api";
import AssessmentTakeModal from "@/components/participant/AssessmentTakeModal";

const NAVY = "var(--xa-navy)";
const ORANGE = "var(--xa-primary)";
const INDIGO = "var(--xa-muted)";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const PAGE = "var(--xa-bg)";
const BORDER = "#E6DED0";
const MUTED = "var(--xa-muted)";
const SHADOW = "0 1px 4px rgba(24, 40, 72,0.07)";

type SubmitKind = "assessment";
type Tab = "results" | "upcoming" | "history";

interface Props {
  program: ProgramDetailDTO | null;
  submissions: Record<string, SubmissionDTO | null>;
  onSubmit: (target: { activity: ActivityDTO; kind: SubmitKind }) => void;
}

// Participant Assessments - 3-tab layout (Results / Upcoming / History) driven
// by real assessment activities. Two independent completion sources feed the
// same tabs: (1) free-text/file assessments via the generic `submissions`
// table (existing flow, untouched), and (2) quiz-backed assessments (linked
// to a Content Library quiz asset) via the `assessments` module's own
// auto-scored attempts - fetched here, not derived from `submissions`, since
// quiz attempts are a structurally different table. No mock numbers:
// sections that need infrastructure we don't have yet (per-competency
// scoring, psychometric ingestion) render an honest "awaiting" state.
export default function AssessmentsExperience({ program, submissions, onSubmit }: Props) {
  const [tab, setTab] = useState<Tab>("results");
  const [quizCards, setQuizCards] = useState<Record<string, AssessmentCardDTO>>({});
  const [takeActivityId, setTakeActivityId] = useState<string | null>(null);
  // Quiz-backed activities shown here: standalone assessment-type activities
  // AND any other activity (case_study/video/pdf/content) that has an
  // attached Knowledge Check - both are taken/scored/graded through the same
  // assessments engine keyed by the activity's own id (see assessments-api's
  // knowledge_check config), so both belong in this tab's results.
  const assessments = useMemo(() => activitiesWithAssessment(program), [program]);

  const loadQuiz = useCallback(() => {
    assessmentsApi.my(program?.id)
      .then((res) => {
        const byId: Record<string, AssessmentCardDTO> = {};
        (res.data?.assessments ?? []).forEach((c) => { byId[c.activity_id] = c; });
        setQuizCards(byId);
      })
      .catch(() => setQuizCards({}));
  }, [program?.id]);

  useEffect(() => { loadQuiz(); }, [loadQuiz]);

  const isQuizDone = (id: string) => (quizCards[id]?.attempts_used ?? 0) > 0;
  const done = (a: ActivityDTO) => !!submissions[a.id] || isQuizDone(a.id);

  const graded = assessments.filter((a) => submissions[a.id]?.grade != null || quizCards[a.id]?.best_score_pct != null);
  const submitted = assessments.filter(done);
  // Required assessments surface first - both in the Upcoming tab and the
  // Results-tab pending preview (which only shows the first few).
  const upcoming = assessments.filter((a) => !done(a)).sort((a, b) => (b.is_mandatory ? 1 : 0) - (a.is_mandatory ? 1 : 0));
  const scores = graded.map((a) => submissions[a.id]?.grade ?? quizCards[a.id]?.best_score_pct ?? 0);
  const avgScore = scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null;

  function handleStart(a: ActivityDTO) {
    // An attached Knowledge Check's quiz asset lives under config.knowledge_check
    // (config.asset_id on a content-style activity points at the CONTENT being
    // tested, not the quiz) - mirrors the backend's parseConfig fallback.
    if (a.config?.knowledge_check?.asset_id || a.config?.asset_id) {
      setTakeActivityId(a.id);
    } else {
      onSubmit({ activity: a, kind: "assessment" });
    }
  }

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Poppins, sans-serif", background: PAGE }}>
      {/* Summary row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        <Metric label="Assessments" value={String(assessments.length)} sub="In this program" color={NAVY} />
        <Metric label="Completed" value={String(submitted.length)} sub={`${assessments.length - submitted.length} remaining`} color={GREEN} />
        <Metric label="Graded" value={String(graded.length)} sub="Results available" color={INDIGO} />
        <Metric label="Average Score" value={avgScore != null ? `${avgScore}` : "-"} sub={avgScore != null ? "Across graded" : "No grades yet"} color={ORANGE} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8 }}>
        {(["results", "upcoming", "history"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ ...tabStyle, ...(tab === t ? tabActiveStyle : {}) }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "results" && (
        <ResultsTab
          assessments={assessments}
          submissions={submissions}
          avgScore={avgScore}
          gradedCount={graded.length}
          upcoming={upcoming}
          quizCards={quizCards}
          onGoToUpcoming={() => setTab("upcoming")}
          onStart={handleStart}
        />
      )}
      {tab === "upcoming" && <UpcomingTab assessments={upcoming} submissions={submissions} quizCards={quizCards} onStart={handleStart} />}
      {tab === "history" && <HistoryTab assessments={submitted} submissions={submissions} quizCards={quizCards} />}

      {takeActivityId && (
        <AssessmentTakeModal
          activityId={takeActivityId}
          onClose={() => setTakeActivityId(null)}
          onCompleted={() => { setTakeActivityId(null); loadQuiz(); }}
        />
      )}
    </div>
  );
}

// ── Results ───────────────────────────────────────────────────────────────────
function ResultsTab({ assessments, submissions, avgScore, gradedCount, upcoming, quizCards, onGoToUpcoming, onStart }: {
  assessments: ActivityDTO[]; submissions: Props["submissions"]; avgScore: number | null; gradedCount: number;
  upcoming: ActivityDTO[]; quizCards: Record<string, AssessmentCardDTO>;
  onGoToUpcoming: () => void; onStart: (a: ActivityDTO) => void;
}) {
  const latestFeedback = assessments
    .map((a) => submissions[a.id])
    .filter((s): s is SubmissionDTO => !!s && !!s.feedback)
    .slice(-1)[0]?.feedback;

  if (assessments.length === 0) {
    return <EmptyCard title="No assessments yet" body="Once your Program Manager publishes assessments, your results appear here." />;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {upcoming.length > 0 && <PendingBanner assessments={upcoming} quizCards={quizCards} onGoToUpcoming={onGoToUpcoming} onStart={onStart} />}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16 }}>
      {/* Left: competency breakdown (awaiting per-competency scoring engine) */}
      <Card>
        <SectionTitle title="Competency Progress (Pre vs Post)" />
        <AwaitingBlock
          label="Competency-level scoring"
          body="Pre-vs-post competency breakdown appears once assessments are mapped to competencies and scored. Your Program Manager configures this per assessment."
        />
      </Card>

      {/* Right column */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <Card>
          <SectionTitle title="Overall Score" />
          {avgScore != null ? (
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <ScoreDial value={avgScore} />
              <div>
                <Badge label={quartileLabel(avgScore)} color={quartileColor(avgScore)} />
                <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>Average of {gradedCount} graded assessment{gradedCount === 1 ? "" : "s"}</div>
              </div>
            </div>
          ) : (
            <AwaitingBlock label="No graded results yet" body="Your overall score appears after your submitted assessments are graded by faculty." />
          )}
        </Card>

        <Card style={{ background: "rgba(200, 168, 96,0.03)", border: "1px solid rgba(200, 168, 96,0.15)" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: ORANGE, marginBottom: 8 }}>✦ AI Developmental Commentary</div>
          <div style={{ fontSize: 12, color: NAVY, lineHeight: 1.6 }}>
            {latestFeedback
              ? latestFeedback
              : "Personalised developmental commentary appears here once your assessments are graded - highlighting strengths and focus areas from your results."}
          </div>
        </Card>

        <Card>
          <SectionTitle title="Psychometric Results" />
          <AwaitingBlock
            label="DISC · MBTI · Hogan · EQ-i"
            body="Psychometric results appear here once your instrument report is ingested (via API or manual upload by your Program Manager)."
          />
        </Card>
      </div>
      </div>
    </div>
  );
}

// ── Pending banner (shown at the top of Results when there's incomplete work
// for this program) ─────────────────────────────────────────────────────────
function PendingBanner({ assessments, quizCards, onGoToUpcoming, onStart }: {
  assessments: ActivityDTO[]; quizCards: Record<string, AssessmentCardDTO>;
  onGoToUpcoming: () => void; onStart: (a: ActivityDTO) => void;
}) {
  const required = assessments.filter((a) => a.is_mandatory);
  const preview = assessments.slice(0, 3);
  return (
    <Card style={{ background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.25)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: AMBER, display: "flex", alignItems: "center", gap: 6 }}>
            ⚠ {assessments.length} pending assessment{assessments.length === 1 ? "" : "s"}
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>
            {required.length > 0
              ? `${required.length} required for this program. Your results will stay incomplete until these are done.`
              : "Not yet started for this program - complete them to see your full results here."}
          </div>
        </div>
        <button onClick={onGoToUpcoming} style={{ ...primaryButton, background: "#fff", color: AMBER, border: `1px solid ${AMBER}` }}>
          View All →
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {preview.map((a) => {
          const cfg = a.config ?? {};
          const quiz = quizCards[a.id];
          const isQuiz = !!quiz || !!cfg.knowledge_check?.asset_id || !!cfg.asset_id;
          const attempts = quiz?.attempts_allowed ?? cfg.attempts_allowed ?? 1;
          const used = isQuiz ? (quiz?.attempts_used ?? 0) : 0;
          const canStart = used < attempts;
          return (
            <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 12px", background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8 }}>
              <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: NAVY, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</span>
                {a.is_mandatory && <Badge label="Required" color={ORANGE} />}
              </div>
              <button
                onClick={() => canStart && onStart(a)}
                disabled={!canStart}
                style={{ padding: "5px 12px", background: canStart ? NAVY : "#C9BFA8", border: "none", borderRadius: 6, color: "#fff", fontSize: 11, fontWeight: 700, fontFamily: "Poppins, sans-serif", cursor: canStart ? "pointer" : "default", flexShrink: 0 }}
              >
                Start
              </button>
            </div>
          );
        })}
        {assessments.length > preview.length && (
          <div style={{ fontSize: 11, color: MUTED, textAlign: "center", marginTop: 2 }}>
            +{assessments.length - preview.length} more - <span onClick={onGoToUpcoming} style={{ color: AMBER, fontWeight: 700, cursor: "pointer" }}>view all</span>
          </div>
        )}
      </div>
    </Card>
  );
}

// ── Upcoming ──────────────────────────────────────────────────────────────────
function UpcomingTab({ assessments, submissions, quizCards, onStart }: {
  assessments: ActivityDTO[]; submissions: Props["submissions"];
  quizCards: Record<string, import("@/lib/assessments-api").AssessmentCardDTO>;
  onStart: (a: ActivityDTO) => void;
}) {
  if (assessments.length === 0) {
    return <EmptyCard title="You're all caught up" body="No pending assessments right now. New ones will show here when published." />;
  }
  return (
    <Stack>
      {assessments.map((a) => {
        const cfg = a.config ?? {};
        const quiz = quizCards[a.id];
        const isQuiz = !!quiz || !!cfg.knowledge_check?.asset_id || !!cfg.asset_id;
        const attempts = quiz?.attempts_allowed ?? cfg.attempts_allowed ?? 1;
        const used = isQuiz ? (quiz?.attempts_used ?? 0) : (submissions[a.id] ? 1 : 0);
        const canStart = used < attempts;
        return (
          <Card key={a.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: NAVY, marginBottom: 6 }}>{a.title}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <Badge label={isQuiz ? "Quiz" : "Assessment"} color={isQuiz ? INDIGO : NAVY} />
                  <span style={{ fontSize: 11, color: MUTED }}>⏱ {cfg.time_limit_mins ? `${cfg.time_limit_mins} min limit` : `${a.duration_mins || 30} min`}</span>
                  <span style={{ fontSize: 11, color: MUTED }}>· {attempts} attempt{attempts === 1 ? "" : "s"}{used > 0 ? ` (${used} used)` : ""}</span>
                  {cfg.cooling_off_hours ? <span style={{ fontSize: 11, color: MUTED }}>· {cfg.cooling_off_hours}h cool-off</span> : null}
                  {a.is_mandatory && <Badge label="Required" color={ORANGE} />}
                </div>
              </div>
              <button
                onClick={() => canStart && onStart(a)}
                disabled={!canStart}
                style={{ ...primaryButton, opacity: canStart ? 1 : 0.5, cursor: canStart ? "pointer" : "default" }}
              >
                {canStart ? "Start Now" : "Attempts used"}
              </button>
            </div>
          </Card>
        );
      })}
    </Stack>
  );
}

// ── History ───────────────────────────────────────────────────────────────────
function HistoryTab({ assessments, submissions, quizCards }: {
  assessments: ActivityDTO[]; submissions: Props["submissions"];
  quizCards: Record<string, import("@/lib/assessments-api").AssessmentCardDTO>;
}) {
  if (assessments.length === 0) {
    return <EmptyCard title="No submissions yet" body="Your completed assessments and scores will be listed here." />;
  }
  return (
    <Card>
      <SectionTitle title="Assessment History" />
      {assessments.map((a) => {
        const s = submissions[a.id];
        const quiz = quizCards[a.id];
        const isQuiz = !!quiz || !!a.config?.knowledge_check?.asset_id || !!a.config?.asset_id;
        return (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{a.title}</div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>
                {isQuiz
                  ? `${quiz?.attempts_used ?? 0} attempt${(quiz?.attempts_used ?? 0) === 1 ? "" : "s"} used`
                  : s ? `Submitted ${formatDate(s.submitted_at)}${s.feedback ? ` · ${s.feedback}` : ""}` : ""}
              </div>
            </div>
            <div style={{ flexShrink: 0 }}>
              {isQuiz ? (
                quiz?.pending_review
                  ? <Badge label="Awaiting faculty review" color={INDIGO} />
                  : quiz?.best_score_pct != null
                    ? <Badge label={`${Math.round(quiz.best_score_pct)}% ${quiz.passed ? "· Passed" : "· Not passed"}`} color={quiz.passed ? GREEN : AMBER} />
                    : <Badge label="Score pending" color={AMBER} />
              ) : s?.grade != null
                ? <Badge label={`Score ${s.grade}`} color={quartileColor(s.grade)} />
                : <Badge label="Awaiting grade" color={AMBER} />}
            </div>
          </div>
        );
      })}
    </Card>
  );
}

// ── primitives ────────────────────────────────────────────────────────────────
function ScoreDial({ value }: { value: number }) {
  const color = quartileColor(value);
  return (
    <div style={{ width: 80, height: 80, borderRadius: "50%", border: `6px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", flexShrink: 0 }}>
      <div style={{ fontSize: 22, fontWeight: 800, color: NAVY }}>{value}</div>
      <div style={{ fontSize: 9, color: MUTED }}>/ 100</div>
    </div>
  );
}

function AwaitingBlock({ label, body }: { label: string; body: string }) {
  return (
    <div style={{ padding: "18px 16px", background: "#F9FAFB", border: `1px dashed ${BORDER}`, borderRadius: 10 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: MUTED, lineHeight: 1.6 }}>{body}</div>
    </div>
  );
}

function Metric({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <Card style={{ padding: "14px 16px" }}>
      <div style={{ fontSize: 11, color: MUTED, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: MUTED, marginTop: 5 }}>{sub}</div>
    </Card>
  );
}

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, boxShadow: SHADOW, padding: 20, ...style }}>{children}</div>;
}
function SectionTitle({ title }: { title: string }) {
  return <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 14 }}>{title}</div>;
}
function Stack({ children }: { children: ReactNode }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>{children}</div>;
}
function Badge({ label, color = ORANGE }: { label: string; color?: string }) {
  return <span style={{ background: `${color}14`, color, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px", whiteSpace: "nowrap" }}>{label}</span>;
}
function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <Card style={{ padding: 40, textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.6, maxWidth: 460, margin: "0 auto" }}>{body}</div>
    </Card>
  );
}

function allProgramActivities(program: ProgramDetailDTO | null): ActivityDTO[] {
  if (!program) return [];
  const seen = new Set<string>();
  const all = (program.phases ?? []).flatMap((phase) => {
    const direct = phase.activities ?? [];
    const moduled = (phase.modules ?? []).flatMap((m) => [...(m.pre ?? []), ...(m.post ?? [])]);
    return [...direct, ...moduled];
  });
  return all.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}

function activitiesByType(program: ProgramDetailDTO | null, type: string): ActivityDTO[] {
  return allProgramActivities(program).filter((a) => a.type === type);
}

// Standalone assessment-type activities AND any other activity type with an
// attached Knowledge Check (config.knowledge_check.asset_id) - both are
// quiz-backed and taken/scored through the same assessments engine, so both
// belong in the participant's Assessments tab.
function activitiesWithAssessment(program: ProgramDetailDTO | null): ActivityDTO[] {
  return allProgramActivities(program).filter((a) => a.type === "assessment" || !!a.config?.knowledge_check?.asset_id);
}
function quartileLabel(score: number): string {
  if (score >= 75) return "Top Quartile";
  if (score >= 50) return "Above Average";
  if (score >= 25) return "Developing";
  return "Needs Focus";
}
function quartileColor(score: number): string {
  if (score >= 75) return GREEN;
  if (score >= 50) return INDIGO;
  if (score >= 25) return AMBER;
  return ORANGE;
}
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const tabStyle: CSSProperties = {
  padding: "8px 18px", border: `1px solid ${BORDER}`, borderRadius: 8, background: "#fff",
  color: MUTED, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Poppins, sans-serif",
};
const tabActiveStyle: CSSProperties = { background: NAVY, color: "#fff", border: `1px solid ${NAVY}`, fontWeight: 700 };
const primaryButton: CSSProperties = {
  padding: "9px 20px", background: ORANGE, border: "none", borderRadius: 8, color: "#fff",
  fontSize: 12, fontWeight: 700, fontFamily: "Poppins, sans-serif", whiteSpace: "nowrap", flexShrink: 0,
};
