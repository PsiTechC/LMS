"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import ReactDOM from "react-dom";
import { assessmentsApi, AssessmentDetailDTO, AssessmentResultDTO, AnswerInput, QuestionDTO } from "@/lib/assessments-api";

const NAVY = "#1C2551";
const ORANGE = "#EF4E24";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const RED = "#ef4444";
const BORDER = "#EAECF4";
const MUTED = "#8b90a7";

// Quiz-taking modal — same visual chrome as SurveysExperience's SurveyModal
// (navy gradient header, orange progress bar, 2-per-page, Prev/Next), but
// for quiz semantics: MCQ/true-false selection instead of Likert scales, and
// a real scored results screen (server-computed — this component never
// grades anything itself, it only renders what the backend returns).
export default function AssessmentTakeModal({ activityId, onClose, onCompleted }: {
  activityId: string;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [detail, setDetail] = useState<AssessmentDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [answers, setAnswers] = useState<Record<string, AnswerInput>>({});
  const [page, setPage] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AssessmentResultDTO | null>(null);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    assessmentsApi.detail(activityId)
      .then((res) => setDetail(res.data))
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Couldn't load this assessment."))
      .finally(() => setLoading(false));
  }, [activityId]);

  const perPage = 2;
  const questions = detail?.questions ?? [];
  const pages = Math.max(1, Math.ceil(questions.length / perPage));
  const current = questions.slice(page * perPage, (page + 1) * perPage);
  const totalAnswered = questions.filter((q) => isAnswered(answers[q.id])).length;
  const pageAnswered = current.every((q) => isAnswered(answers[q.id]));

  function setAnswer(q: QuestionDTO, a: AnswerInput) {
    setAnswers((prev) => ({ ...prev, [q.id]: a }));
  }

  async function submit() {
    if (!detail) return;
    setSubmitting(true); setSubmitError("");
    try {
      const payload = questions.map((q) => answers[q.id] ?? { question_id: q.id });
      const res = await assessmentsApi.submit(detail.activity_id, payload);
      setResult(res.data ?? null);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't submit your answers. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget && !submitting && !result) onClose(); }} style={overlay}>
      <div style={modalCard}>
        {/* Header */}
        <div style={{ background: "linear-gradient(135deg,#1C2551,#2d3a7c)", padding: "20px 24px", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <span style={{ fontSize: 10, fontWeight: 700, background: "rgba(255,255,255,0.12)", color: "#fff", borderRadius: 10, padding: "2px 9px" }}>Assessment</span>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, lineHeight: 1.3, marginTop: 6 }}>{detail?.title ?? "Loading…"}</div>
              {detail && (
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, marginTop: 4 }}>
                  {detail.time_limit_mins > 0 ? `⏱ ${detail.time_limit_mins} min · ` : ""}{questions.length} questions
                  {detail.attempts_allowed > 1 ? ` · Attempt ${detail.attempts_used + 1} of ${detail.attempts_allowed}` : ""}
                </div>
              )}
            </div>
            {!submitting && !result && <button onClick={onClose} style={closeBtn}>✕</button>}
          </div>
          {!result && questions.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Progress</span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{totalAnswered}/{questions.length}</span>
              </div>
              <div style={{ height: 4, background: "rgba(255,255,255,0.1)", borderRadius: 99 }}>
                <div style={{ height: "100%", width: `${(totalAnswered / questions.length) * 100}%`, background: ORANGE, borderRadius: 99, transition: "width 0.3s" }} />
              </div>
            </div>
          )}
        </div>

        {loading && (
          <div style={{ padding: 48, textAlign: "center", color: MUTED, fontSize: 13 }}>Loading assessment…</div>
        )}

        {!loading && loadError && (
          <div style={{ padding: 32, textAlign: "center" }}>
            <div style={{ fontSize: 13, color: RED, marginBottom: 16 }}>{loadError}</div>
            <button onClick={onClose} style={secondaryButton}>Close</button>
          </div>
        )}

        {!loading && !loadError && result && (
          <ResultsScreen result={result} onClose={() => { onCompleted(); }} />
        )}

        {!loading && !loadError && !result && detail && (
          <>
            <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
              {current.map((q, qi) => (
                <div key={q.id} style={{ marginBottom: qi < current.length - 1 ? 24 : 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 12, lineHeight: 1.5, display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span><span style={{ color: ORANGE, fontWeight: 800, marginRight: 6 }}>Q{page * perPage + qi + 1}.</span>{q.text}</span>
                    <span style={{ fontSize: 10, color: MUTED, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>{q.points} pt{q.points === 1 ? "" : "s"}</span>
                  </div>
                  <QuestionInput q={q} value={answers[q.id]} onChange={(a) => setAnswer(q, a)} />
                </div>
              ))}
            </div>
            {submitError && <div style={{ padding: "0 24px", fontSize: 12, color: RED, fontWeight: 600 }}>{submitError}</div>}
            <div style={{ padding: "14px 24px", borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <button onClick={() => setPage((p) => p - 1)} disabled={page === 0} style={{ ...secondaryButton, opacity: page === 0 ? 0.5 : 1 }}>← Previous</button>
              <span style={{ fontSize: 11, color: MUTED }}>{page + 1} of {pages}</span>
              {page < pages - 1
                ? <button onClick={() => setPage((p) => p + 1)} disabled={!pageAnswered} style={{ ...primaryButton, opacity: pageAnswered ? 1 : 0.5 }}>Next →</button>
                : <button onClick={submit} disabled={submitting || totalAnswered < questions.length} style={{ ...primaryButton, background: GREEN, opacity: submitting || totalAnswered < questions.length ? 0.6 : 1 }}>{submitting ? "Submitting..." : "Submit Assessment ✓"}</button>}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

function isAnswered(a: AnswerInput | undefined): boolean {
  if (!a) return false;
  return a.index !== undefined || (a.text !== undefined && a.text.trim().length > 0);
}

function QuestionInput({ q, value, onChange }: { q: QuestionDTO; value: AnswerInput | undefined; onChange: (a: AnswerInput) => void }) {
  if (q.type === "mcq") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(q.options ?? []).map((opt, oi) => (
          <button key={oi} onClick={() => onChange({ question_id: q.id, index: oi })}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: `1.5px solid ${value?.index === oi ? ORANGE : BORDER}`, borderRadius: 10, background: value?.index === oi ? "rgba(239,78,36,0.06)" : "#fff", cursor: "pointer", fontFamily: "Poppins, sans-serif", textAlign: "left" }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${value?.index === oi ? ORANGE : "#D0D3E0"}`, background: value?.index === oi ? ORANGE : "#fff", flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: NAVY }}>{opt}</span>
          </button>
        ))}
      </div>
    );
  }
  if (q.type === "true_false") {
    return (
      <div style={{ display: "flex", gap: 10 }}>
        {["True", "False"].map((label, oi) => (
          <button key={label} onClick={() => onChange({ question_id: q.id, index: oi })}
            style={{ flex: 1, padding: "12px 16px", border: `1.5px solid ${value?.index === oi ? ORANGE : BORDER}`, borderRadius: 10, background: value?.index === oi ? "rgba(239,78,36,0.06)" : "#fff", cursor: "pointer", fontFamily: "Poppins, sans-serif", fontSize: 13, fontWeight: 600, color: value?.index === oi ? ORANGE : NAVY }}>
            {label}
          </button>
        ))}
      </div>
    );
  }
  // open (ungraded) and matching (rendered as free text in v1 — structured
  // matching-pair UI is a future enhancement, not auto-gradable yet either way)
  return (
    <textarea
      value={value?.text ?? ""}
      onChange={(e) => onChange({ question_id: q.id, text: e.target.value })}
      placeholder="Type your response here..."
      style={{ width: "100%", border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif", color: NAVY, outline: "none", resize: "vertical", height: 88, boxSizing: "border-box", lineHeight: 1.6 }}
    />
  );
}

function ResultsScreen({ result, onClose }: { result: AssessmentResultDTO; onClose: () => void }) {
  const color = result.passed ? GREEN : result.score_pct >= 50 ? AMBER : RED;
  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "32px 24px", textAlign: "center", borderBottom: `1px solid ${BORDER}` }}>
        <div style={{ width: 88, height: 88, borderRadius: "50%", border: `6px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", margin: "0 auto 14px" }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: NAVY }}>{Math.round(result.score_pct)}%</div>
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 4 }}>
          {result.passed ? "✓ Passed" : "Not Passed"}
        </div>
        <div style={{ fontSize: 12, color: MUTED }}>
          {result.score} of {result.max_score} points
          {result.attempts_left > 0 ? ` · ${result.attempts_left} attempt${result.attempts_left === 1 ? "" : "s"} remaining` : ""}
        </div>
      </div>

      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 10 }}>
        {result.questions.map((q, i) => (
          <div key={q.id} style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${BORDER}`, background: q.is_correct === true ? "rgba(34,197,94,0.04)" : q.is_correct === false ? "rgba(239,68,68,0.04)" : "#F9FAFB" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>Q{i + 1}. {q.text}</span>
              {q.is_correct === true && <span style={{ fontSize: 11, color: GREEN, fontWeight: 700, flexShrink: 0 }}>✓ Correct</span>}
              {q.is_correct === false && <span style={{ fontSize: 11, color: RED, fontWeight: 700, flexShrink: 0 }}>✕ Incorrect</span>}
              {q.is_correct === undefined && <span style={{ fontSize: 11, color: MUTED, fontWeight: 700, flexShrink: 0 }}>Not auto-graded</span>}
            </div>
            {q.options && q.correct_index !== undefined && (
              <div style={{ fontSize: 11, color: MUTED }}>
                Correct answer: <span style={{ color: NAVY, fontWeight: 600 }}>{q.options[q.correct_index]}</span>
                {q.selected_index !== undefined && q.selected_index !== q.correct_index && (
                  <> · Your answer: <span style={{ color: RED }}>{q.options[q.selected_index]}</span></>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ padding: "14px 24px", borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onClose} style={primaryButton}>Done</button>
      </div>
    </div>
  );
}

const primaryButton: CSSProperties = { padding: "9px 20px", background: ORANGE, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins, sans-serif", whiteSpace: "nowrap" };
const secondaryButton: CSSProperties = { padding: "8px 16px", border: `1px solid ${BORDER}`, borderRadius: 8, background: "#fff", color: MUTED, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Poppins, sans-serif" };
const overlay: CSSProperties = { position: "fixed", inset: 0, background: "rgba(28,37,81,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px", fontFamily: "Poppins, sans-serif" };
const modalCard: CSSProperties = { background: "#fff", borderRadius: 20, width: "100%", maxWidth: 580, overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.25)", display: "flex", flexDirection: "column", maxHeight: "90vh" };
const closeBtn: CSSProperties = { width: 28, height: 28, border: "1px solid rgba(255,255,255,0.2)", borderRadius: "50%", background: "transparent", cursor: "pointer", color: "rgba(255,255,255,0.7)", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Poppins, sans-serif", flexShrink: 0 };
