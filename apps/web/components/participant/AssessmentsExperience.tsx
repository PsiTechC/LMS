"use client";

import { useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { ActivityDTO, ProgramDetailDTO } from "@/lib/programs-api";
import { SubmissionDTO } from "@/lib/submissions-api";

const NAVY = "#1C2551";
const ORANGE = "#EF4E24";
const INDIGO = "#6B73BF";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const PAGE = "#F5F7FB";
const BORDER = "#EAECF4";
const MUTED = "#8b90a7";
const SHADOW = "0 1px 4px rgba(28,37,81,0.07)";

type SubmitKind = "assessment";
type Tab = "results" | "upcoming" | "history";

interface Props {
  program: ProgramDetailDTO | null;
  submissions: Record<string, SubmissionDTO | null>;
  onSubmit: (target: { activity: ActivityDTO; kind: SubmitKind }) => void;
}

// Participant Assessments — 3-tab layout (Results / Upcoming / History) driven
// by real assessment activities, their config (attempts, time limit, cooling-off)
// and the participant's own submissions + faculty grades. No mock numbers:
// sections that need infrastructure we don't have yet (per-competency scoring,
// psychometric ingestion) render an honest "awaiting" state.
export default function AssessmentsExperience({ program, submissions, onSubmit }: Props) {
  const [tab, setTab] = useState<Tab>("results");
  const assessments = useMemo(() => activitiesByType(program, "assessment"), [program]);

  const graded = assessments.filter((a) => submissions[a.id]?.grade != null);
  const submitted = assessments.filter((a) => submissions[a.id]);
  const upcoming = assessments.filter((a) => !submissions[a.id]);
  const scores = graded.map((a) => submissions[a.id]!.grade as number);
  const avgScore = scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : null;

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Poppins, sans-serif", background: PAGE }}>
      {/* Summary row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        <Metric label="Assessments" value={String(assessments.length)} sub="In this program" color={NAVY} />
        <Metric label="Completed" value={String(submitted.length)} sub={`${assessments.length - submitted.length} remaining`} color={GREEN} />
        <Metric label="Graded" value={String(graded.length)} sub="Results available" color={INDIGO} />
        <Metric label="Average Score" value={avgScore != null ? `${avgScore}` : "—"} sub={avgScore != null ? "Across graded" : "No grades yet"} color={ORANGE} />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8 }}>
        {(["results", "upcoming", "history"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ ...tabStyle, ...(tab === t ? tabActiveStyle : {}) }}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      {tab === "results" && <ResultsTab assessments={assessments} submissions={submissions} avgScore={avgScore} gradedCount={graded.length} />}
      {tab === "upcoming" && <UpcomingTab assessments={upcoming} submissions={submissions} onSubmit={onSubmit} />}
      {tab === "history" && <HistoryTab assessments={submitted} submissions={submissions} />}
    </div>
  );
}

// ── Results ───────────────────────────────────────────────────────────────────
function ResultsTab({ assessments, submissions, avgScore, gradedCount }: {
  assessments: ActivityDTO[]; submissions: Props["submissions"]; avgScore: number | null; gradedCount: number;
}) {
  const latestFeedback = assessments
    .map((a) => submissions[a.id])
    .filter((s): s is SubmissionDTO => !!s && !!s.feedback)
    .slice(-1)[0]?.feedback;

  if (assessments.length === 0) {
    return <EmptyCard title="No assessments yet" body="Once your Program Manager publishes assessments, your results appear here." />;
  }

  return (
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

        <Card style={{ background: "rgba(239,78,36,0.03)", border: "1px solid rgba(239,78,36,0.15)" }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: ORANGE, marginBottom: 8 }}>✦ AI Developmental Commentary</div>
          <div style={{ fontSize: 12, color: NAVY, lineHeight: 1.6 }}>
            {latestFeedback
              ? latestFeedback
              : "Personalised developmental commentary appears here once your assessments are graded — highlighting strengths and focus areas from your results."}
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
  );
}

// ── Upcoming ──────────────────────────────────────────────────────────────────
function UpcomingTab({ assessments, submissions, onSubmit }: {
  assessments: ActivityDTO[]; submissions: Props["submissions"]; onSubmit: Props["onSubmit"];
}) {
  if (assessments.length === 0) {
    return <EmptyCard title="You're all caught up" body="No pending assessments right now. New ones will show here when published." />;
  }
  return (
    <Stack>
      {assessments.map((a) => {
        const cfg = a.config ?? {};
        const attempts = cfg.attempts_allowed ?? 1;
        const usedAttempt = !!submissions[a.id];
        const canStart = !usedAttempt; // single-attempt supported today; retake logic is backend-future
        return (
          <Card key={a.id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: NAVY, marginBottom: 6 }}>{a.title}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <Badge label="Assessment" color={NAVY} />
                  <span style={{ fontSize: 11, color: MUTED }}>⏱ {cfg.time_limit_mins ? `${cfg.time_limit_mins} min limit` : `${a.duration_mins || 30} min`}</span>
                  <span style={{ fontSize: 11, color: MUTED }}>· {attempts} attempt{attempts === 1 ? "" : "s"}</span>
                  {cfg.cooling_off_hours ? <span style={{ fontSize: 11, color: MUTED }}>· {cfg.cooling_off_hours}h cool-off</span> : null}
                  {a.is_mandatory && <Badge label="Required" color={ORANGE} />}
                </div>
              </div>
              <button
                onClick={() => canStart && onSubmit({ activity: a, kind: "assessment" })}
                disabled={!canStart}
                style={{ ...primaryButton, opacity: canStart ? 1 : 0.5, cursor: canStart ? "pointer" : "default" }}
              >
                {canStart ? "Start Now" : "Attempt used"}
              </button>
            </div>
          </Card>
        );
      })}
    </Stack>
  );
}

// ── History ───────────────────────────────────────────────────────────────────
function HistoryTab({ assessments, submissions }: { assessments: ActivityDTO[]; submissions: Props["submissions"] }) {
  if (assessments.length === 0) {
    return <EmptyCard title="No submissions yet" body="Your completed assessments and scores will be listed here." />;
  }
  return (
    <Card>
      <SectionTitle title="Assessment History" />
      {assessments.map((a) => {
        const s = submissions[a.id]!;
        return (
          <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: NAVY }}>{a.title}</div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>
                Submitted {formatDate(s.submitted_at)}
                {s.feedback ? ` · ${s.feedback}` : ""}
              </div>
            </div>
            <div style={{ flexShrink: 0 }}>
              {s.grade != null
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

function activitiesByType(program: ProgramDetailDTO | null, type: string): ActivityDTO[] {
  if (!program) return [];
  const seen = new Set<string>();
  const all = (program.phases ?? []).flatMap((phase) => {
    const direct = phase.activities ?? [];
    const moduled = (phase.modules ?? []).flatMap((m) => [...(m.pre ?? []), ...(m.post ?? [])]);
    return [...direct, ...moduled];
  });
  return all.filter((a) => {
    if (a.type !== type || seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
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
