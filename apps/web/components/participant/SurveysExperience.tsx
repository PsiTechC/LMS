"use client";

import { useCallback, useEffect, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import ReactDOM from "react-dom";
import { surveysApi, MySurveysDTO, SurveyCardDTO, SurveyDetailDTO, QuestionDTO, AnswerInput } from "@/lib/surveys-api";

const NAVY = "var(--xa-navy)";
const ORANGE = "var(--xa-primary)";
const INDIGO = "var(--xa-muted)";
const GREEN = "#22c55e";
const PAGE = "var(--xa-bg)";
const BORDER = "#E6DED0";
const MUTED = "var(--xa-muted)";
const SHADOW = "0 1px 4px rgba(24, 40, 72,0.07)";

const TYPE_META: Record<string, { label: string; color: string; icon: string }> = {
  pre: { label: "Pre-Program", color: INDIGO, icon: "📋" },
  mid: { label: "Mid-Program", color: ORANGE, icon: "📊" },
  post: { label: "Post-Program", color: NAVY, icon: "🏆" },
  pulse: { label: "Pulse Check", color: ORANGE, icon: "📈" },
  session: { label: "Session", color: GREEN, icon: "⭐" },
};
const STATUS_META: Record<string, { label: string; color: string }> = {
  completed: { label: "Completed", color: GREEN },
  active: { label: "Due Soon", color: ORANGE },
  upcoming: { label: "Upcoming", color: MUTED },
};

export default function SurveysExperience({ programId }: { programId?: string }) {
  const [data, setData] = useState<MySurveysDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState<SurveyDetailDTO | null>(null);
  const [aiInsight, setAiInsight] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await surveysApi.my(programId);
      setData(normalize(res.data));
    } catch {
      setData(null);
    }
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

  // AI Survey Insights — real LLM-generated nudge, fetched once surveys have
  // loaded. Falls back to the locally-derived line if the AI call fails.
  useEffect(() => {
    if (!data?.has_program) return;
    let cancelled = false;
    surveysApi.aiInsight()
      .then((r) => { if (!cancelled) setAiInsight(r.data?.insight ?? null); })
      .catch(() => { if (!cancelled) setAiInsight(null); });
    return () => { cancelled = true; };
  }, [data?.has_program]);

  async function openSurvey(card: SurveyCardDTO) {
    try {
      const res = await surveysApi.detail(card.activity_id);
      setActive(res.data);
    } catch { /* ignore */ }
  }

  if (loading) return <Page><SoftEmpty label="Loading your surveys..." /></Page>;
  if (!data?.has_program) return <Page><EmptyCard title="No surveys yet" body="Once you're enrolled in a program, its surveys appear here." /></Page>;

  return (
    <Page>
      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
        <Stat label="Total Surveys" value={String(data.total)} sub="This program" color={NAVY} />
        <Stat label="Completed" value={String(data.completed)} sub="Submitted responses" color={GREEN} />
        <Stat label="Action Required" value={String(data.action_required)} sub="Due soon" color={ORANGE} />
        <Stat label="Completion Rate" value={`${data.completion_rate}%`} sub="Program average" color={INDIGO} />
      </div>

      {/* Survey cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {data.surveys.map((s) => <SurveyRow key={s.activity_id} card={s} onStart={() => openSurvey(s)} />)}
        {data.surveys.length === 0 && <SoftEmpty label="No surveys are open yet." />}
      </div>

      {/* AI insights banner */}
      <Card style={{ background: "linear-gradient(135deg,var(--xa-navy),#2d3a7c)", border: "none" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.5)", letterSpacing: 0.5, marginBottom: 6 }}>✦ SURVEY INSIGHTS</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 6 }}>Your feedback shapes this program</div>
        <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.7 }}>
          {aiInsight ?? (data.action_required > 0
            ? `You have ${data.action_required} survey${data.action_required === 1 ? "" : "s"} awaiting your response. Your input helps the program team tailor content and pacing to your cohort.`
            : "You're all caught up on surveys. Thank you — your responses directly inform how this program is delivered.")}
        </div>
      </Card>

      {active && (
        <SurveyModal
          survey={active}
          onClose={() => setActive(null)}
          onCompleted={(updated) => { setActive(null); setData(normalize(updated)); }}
        />
      )}
    </Page>
  );
}

function SurveyRow({ card, onStart }: { card: SurveyCardDTO; onStart: () => void }) {
  const tm = TYPE_META[card.survey_type] ?? TYPE_META.pulse;
  const sm = STATUS_META[card.status];
  const isDone = card.status === "completed";
  return (
    <Card style={{ padding: 0, overflow: "hidden", opacity: card.status === "upcoming" ? 0.7 : 1 }}>
      <div style={{ height: 4, background: tm.color }} />
      <div style={{ padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: `${tm.color}14`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{tm.icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", gap: 6, marginBottom: 5, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: tm.color, background: `${tm.color}14`, borderRadius: 20, padding: "2px 9px" }}>{tm.label}</span>
            {card.is_anonymous && <span style={{ fontSize: 10, color: GREEN, background: "rgba(34,197,94,0.1)", borderRadius: 20, padding: "2px 9px", fontWeight: 600 }}>Anonymous</span>}
            <span style={{ fontSize: 10, fontWeight: 700, color: sm.color, background: `${sm.color}14`, borderRadius: 20, padding: "2px 9px" }}>{sm.label}</span>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: NAVY, marginBottom: 4 }}>{card.title}</div>
          <div style={{ display: "flex", gap: 14, fontSize: 11, color: MUTED, flexWrap: "wrap" }}>
            {card.time_estimate_mins > 0 && <span>⏱ {card.time_estimate_mins} min</span>}
            <span>❓ {card.question_count} questions</span>
            {isDone
              ? <span style={{ color: GREEN, fontWeight: 600 }}>✓ Completed {card.completed_date ? formatDate(card.completed_date) : ""}</span>
              : card.due_date && <span>Due: {formatDate(card.due_date)}</span>}
          </div>
        </div>
        <div style={{ flexShrink: 0 }}>
          {isDone ? (
            <button disabled style={{ ...secondaryButton, opacity: 0.7, cursor: "default" }}>View Response</button>
          ) : card.status === "upcoming" ? (
            <span style={{ fontSize: 12, color: MUTED, fontStyle: "italic" }}>Opens {card.open_date ? formatDate(card.open_date) : "soon"}</span>
          ) : card.question_count === 0 ? (
            <span style={{ fontSize: 12, color: MUTED, fontStyle: "italic" }}>Not ready yet</span>
          ) : (
            <button onClick={onStart} style={primaryButton}>Start Survey →</button>
          )}
        </div>
      </div>
    </Card>
  );
}

// ── Survey take modal (typed question engine) ─────────────────────────────────
function SurveyModal({ survey, onClose, onCompleted }: { survey: SurveyDetailDTO; onClose: () => void; onCompleted: (d: MySurveysDTO) => void }) {
  const [answers, setAnswers] = useState<Record<string, number | string | null>>(() => {
    const a: Record<string, number | string | null> = {};
    survey.questions.forEach((q) => { a[q.id] = q.type === "open" ? (q.answer_text ?? "") : (q.answer_num ?? null); });
    return a;
  });
  const [page, setPage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const perPage = 2;
  const pages = Math.max(1, Math.ceil(survey.questions.length / perPage));
  const current = survey.questions.slice(page * perPage, (page + 1) * perPage);
  const totalAnswered = survey.questions.filter((q) => answers[q.id] !== null && answers[q.id] !== "").length;
  const pageAnswered = current.every((q) => answers[q.id] !== null && answers[q.id] !== "");

  async function submit() {
    setSubmitting(true);
    setError("");
    try {
      const payload: AnswerInput[] = survey.questions.map((q) => {
        const v = answers[q.id];
        return q.type === "open"
          ? { question_id: q.id, text: typeof v === "string" ? v : "" }
          : { question_id: q.id, num: typeof v === "number" ? v : undefined };
      });
      const res = await surveysApi.submit(survey.activity_id, payload);
      setDone(true);
      setTimeout(() => onCompleted(res.data), 1400);
    } catch (e: unknown) {
      setError((e as Error).message ?? "Failed to submit. Please try again.");
    } finally { setSubmitting(false); }
  }

  return ReactDOM.createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget && !submitting && !done) onClose(); }} style={overlay}>
      <div style={modalCard}>
        {/* Header */}
        <div style={{ background: "linear-gradient(135deg,var(--xa-navy),#2d3a7c)", padding: "20px 24px", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(255,255,255,0.12)", color: "#fff", borderRadius: 10, padding: "2px 9px" }}>{(TYPE_META[survey.survey_type] ?? TYPE_META.pulse).label}</span>
                {survey.is_anonymous && <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(34,197,94,0.2)", color: "#4ade80", borderRadius: 10, padding: "2px 9px" }}>Anonymous</span>}
              </div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>{survey.title}</div>
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 4 }}>{survey.time_estimate_mins > 0 ? `⏱ ${survey.time_estimate_mins} min · ` : ""}{survey.questions.length} questions</div>
            </div>
            {!submitting && !done && <button onClick={onClose} style={closeBtn}>✕</button>}
          </div>
          {/* Progress */}
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Progress</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{totalAnswered}/{survey.questions.length}</span>
            </div>
            <div style={{ height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 99 }}>
              <div style={{ height: "100%", width: `${survey.questions.length ? (totalAnswered / survey.questions.length) * 100 : 0}%`, background: ORANGE, borderRadius: 99, transition: "width 0.3s" }} />
            </div>
          </div>
        </div>

        {done ? (
          <div style={{ padding: "48px 32px", textAlign: "center", flex: 1 }}>
            <div style={{ fontSize: 40, marginBottom: 14 }}>✅</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 6 }}>Survey Submitted!</div>
            <div style={{ fontSize: 12, color: MUTED }}>Thank you for your feedback. Your response has been recorded{survey.is_anonymous ? " anonymously" : ""}.</div>
          </div>
        ) : (
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
              {current.map((q, qi) => (
                <div key={q.id} style={{ marginBottom: qi < current.length - 1 ? 24 : 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 12, lineHeight: 1.5 }}>
                    <span style={{ color: ORANGE, fontWeight: 800, marginRight: 6 }}>Q{page * perPage + qi + 1}.</span>{q.text}
                  </div>
                  <QuestionInput q={q} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
                </div>
              ))}
            </div>
            {error && (
              <div style={{ margin: "0 24px", padding: "8px 12px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: 8, fontSize: 11, color: "#ef4444" }}>{error}</div>
            )}
            <div style={{ padding: "14px 24px", borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <button onClick={() => setPage((p) => p - 1)} disabled={page === 0} style={{ ...secondaryButton, opacity: page === 0 ? 0.5 : 1 }}>← Previous</button>
              <span style={{ fontSize: 11, color: MUTED }}>{page + 1} of {pages}</span>
              {page < pages - 1
                ? <button onClick={() => setPage((p) => p + 1)} disabled={!pageAnswered} style={{ ...primaryButton, opacity: pageAnswered ? 1 : 0.5 }}>Next →</button>
                : <button onClick={submit} disabled={submitting || totalAnswered < survey.questions.length} style={{ ...primaryButton, background: GREEN, opacity: submitting || totalAnswered < survey.questions.length ? 0.6 : 1 }}>{submitting ? "Submitting..." : "Submit Survey ✓"}</button>}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function QuestionInput({ q, value, onChange }: { q: QuestionDTO; value: number | string | null; onChange: (v: number | string) => void }) {
  if (q.type === "likert") {
    const labels = ["Strongly Disagree", "Disagree", "Neutral", "Agree", "Strongly Agree"];
    return (
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => onChange(n)} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 12px", border: `1.5px solid ${value === n ? ORANGE : BORDER}`, borderRadius: 10, background: value === n ? "rgba(200, 168, 96,0.08)" : "#fff", cursor: "pointer", fontFamily: "Poppins, sans-serif", minWidth: 60 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: value === n ? ORANGE : MUTED }}>{n}</span>
            <span style={{ fontSize: 9, color: value === n ? ORANGE : MUTED, textAlign: "center" }}>{labels[n - 1].split(" ")[0]}</span>
          </button>
        ))}
      </div>
    );
  }
  if (q.type === "nps") {
    return (
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {Array.from({ length: 11 }).map((_, n) => (
          <button key={n} onClick={() => onChange(n)} style={{ width: 38, height: 38, border: `1.5px solid ${value === n ? ORANGE : BORDER}`, borderRadius: 8, background: value === n ? "rgba(200, 168, 96,0.08)" : "#fff", fontSize: 12, fontWeight: value === n ? 800 : 400, color: value === n ? ORANGE : MUTED, cursor: "pointer", fontFamily: "Poppins, sans-serif" }}>{n}</button>
        ))}
      </div>
    );
  }
  if (q.type === "mcq") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(q.options ?? []).map((opt, oi) => (
          <button key={oi} onClick={() => onChange(oi)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: `1.5px solid ${value === oi ? ORANGE : BORDER}`, borderRadius: 10, background: value === oi ? "rgba(200, 168, 96,0.06)" : "#fff", cursor: "pointer", fontFamily: "Poppins, sans-serif", textAlign: "left" }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${value === oi ? ORANGE : "#C9BFA8"}`, background: value === oi ? ORANGE : "#fff", flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: NAVY }}>{opt}</span>
          </button>
        ))}
      </div>
    );
  }
  if (q.type === "rating") {
    return (
      <div style={{ display: "flex", gap: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => onChange(n)} style={{ width: 40, height: 40, border: `1.5px solid ${typeof value === "number" && value >= n ? "#f59e0b" : BORDER}`, borderRadius: 8, background: "#fff", fontSize: 20, cursor: "pointer", color: typeof value === "number" && value >= n ? "#f59e0b" : "#E0E3EF" }}>★</button>
        ))}
      </div>
    );
  }
  // open
  return (
    <textarea value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} placeholder="Type your response here..." style={{ width: "100%", border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif", color: NAVY, outline: "none", resize: "vertical", height: 88, boxSizing: "border-box", lineHeight: 1.6 }} />
  );
}

// ── primitives ────────────────────────────────────────────────────────────────
function normalize(d: MySurveysDTO): MySurveysDTO { return { ...d, surveys: d.surveys ?? [] }; }
function Page({ children }: { children: ReactNode }) {
  return <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Poppins, sans-serif", background: PAGE }}>{children}</div>;
}
function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, boxShadow: SHADOW, padding: 20, ...style }}>{children}</div>;
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
function SoftEmpty({ label }: { label: string }) {
  return <div style={{ padding: "20px 0", textAlign: "center", color: MUTED, fontSize: 12 }}>{label}</div>;
}
function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <Card style={{ padding: 48, textAlign: "center" }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: NAVY, marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.65, maxWidth: 460, margin: "0 auto" }}>{body}</div>
    </Card>
  );
}
function formatDate(iso: string) { return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }

const primaryButton: CSSProperties = { padding: "9px 20px", background: ORANGE, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins, sans-serif", whiteSpace: "nowrap" };
const secondaryButton: CSSProperties = { padding: "8px 16px", border: `1px solid ${BORDER}`, borderRadius: 8, background: "#fff", color: MUTED, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Poppins, sans-serif" };
const overlay: CSSProperties = { position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px", fontFamily: "Poppins, sans-serif" };
const modalCard: CSSProperties = { background: "#fff", borderRadius: 20, width: "100%", maxWidth: 580, overflow: "hidden", boxShadow: "0 24px 64px rgba(24, 40, 72,0.25)", display: "flex", flexDirection: "column", maxHeight: "90vh" };
const closeBtn: CSSProperties = { width: 28, height: 28, border: "1px solid rgba(255,255,255,0.2)", borderRadius: "50%", background: "transparent", cursor: "pointer", color: "rgba(255,255,255,0.7)", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Poppins, sans-serif", flexShrink: 0 };
