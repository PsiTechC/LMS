"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import ReactDOM from "react-dom";
import { assessmentsApi, AssessmentDetailDTO, AssessmentResultDTO, AnswerInput, QuestionDTO } from "@/lib/assessments-api";

const NAVY = "var(--xa-navy)";
const ORANGE = "var(--xa-primary)";
const GREEN = "#22c55e";
const AMBER = "#f59e0b";
const RED = "#ef4444";
const INDIGO = "var(--xa-muted)";
const BORDER = "#E6DED0";
const MUTED = "var(--xa-muted)";

// Quiz-taking modal - same visual chrome as SurveysExperience's SurveyModal
// (navy gradient header, orange progress bar, 2-per-page, Prev/Next), but
// for quiz semantics: MCQ/true-false selection instead of Likert scales, and
// a real scored results screen (server-computed - this component never
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
  // Timed assessment: remaining ms, or null when untimed. `deadline` holds
  // the absolute local-clock deadline computed once, corrected for client↔server
  // skew via server_now, so refreshing resumes the SAME countdown (started_at is
  // server-anchored). `timedOut` locks inputs and triggers a one-shot auto-submit.
  // This is real state (not a ref) specifically so the countdown-tick effect
  // below can depend on it and start once it's populated - a ref write here
  // doesn't trigger a re-render, so an effect keyed off a ref's value would
  // never re-run after the deadline arrives asynchronously post-mount, and
  // the countdown interval would silently never start (the timer would then
  // look frozen client-side, only for the server to flag the eventual
  // submission as timed_out once the real deadline had long since passed).
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [deadline, setDeadline] = useState<number | null>(null);
  const autoSubmittedRef = useRef(false);

  useEffect(() => {
    assessmentsApi.detail(activityId)
      .then((res) => {
        const d = res.data;
        setDetail(d);
        if (d && d.time_limit_mins > 0 && d.started_at) {
          // Deadline in server time, then shifted into local time by the skew
          // between the server's "now" and ours at load.
          const startedMs = new Date(d.started_at).getTime();
          const serverNowMs = d.server_now ? new Date(d.server_now).getTime() : startedMs;
          const skew = Date.now() - serverNowMs; // local - server
          const dl = startedMs + d.time_limit_mins * 60_000 + skew;
          setDeadline(dl);
          setRemainingMs(Math.max(0, dl - Date.now()));
        }
      })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Couldn't load this assessment."))
      .finally(() => setLoading(false));
  }, [activityId]);

  const perPage = 2;
  const questions = detail?.questions ?? [];
  const pages = Math.max(1, Math.ceil(questions.length / perPage));
  const current = questions.slice(page * perPage, (page + 1) * perPage);
  const totalAnswered = questions.filter((q) => isAnswered(q, answers[q.id])).length;
  const pageAnswered = current.every((q) => isAnswered(q, answers[q.id]));
  const locked = timedOut || submitting || !!result;

  const submit = useCallback(async () => {
    if (!detail) return;
    setSubmitting(true); setSubmitError("");
    try {
      const payload = detail.questions.map((q) => answers[q.id] ?? { question_id: q.id });
      const res = await assessmentsApi.submit(detail.activity_id, payload);
      setResult(res.data ?? null);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't submit your answers. Try again.");
    } finally {
      setSubmitting(false);
    }
  }, [detail, answers]);

  function setAnswer(q: QuestionDTO, a: AnswerInput) {
    if (locked) return;
    setAnswers((prev) => ({ ...prev, [q.id]: a }));
  }

  // Countdown tick (timed assessments only). Runs every second; when the
  // deadline passes it locks the form and fires exactly one auto-submit.
  useEffect(() => {
    if (deadline == null || result) return;
    const id = setInterval(() => {
      const left = Math.max(0, deadline - Date.now());
      setRemainingMs(left);
      if (left <= 0) setTimedOut(true);
    }, 1000);
    return () => clearInterval(id);
  }, [deadline, result]);

  // One-shot auto-submit when time runs out (whatever's answered so far).
  useEffect(() => {
    if (timedOut && !autoSubmittedRef.current && !result && detail) {
      autoSubmittedRef.current = true;
      void submit();
    }
  }, [timedOut, result, detail, submit]);

  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget && !submitting && !result) onClose(); }} style={overlay}>
      <div style={modalCard}>
        {/* Header */}
        <div style={{ background: "linear-gradient(135deg,var(--xa-navy),#2d3a7c)", padding: "20px 24px", flexShrink: 0 }}>
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
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              {remainingMs != null && !result && <TimerPill remainingMs={remainingMs} />}
              {!submitting && !result && <button onClick={onClose} style={closeBtn}>✕</button>}
            </div>
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
            {timedOut && (
              <div style={{ padding: "10px 24px", background: "rgba(239,68,68,0.08)", borderBottom: `1px solid rgba(239,68,68,0.2)`, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13 }}>⏱</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: RED }}>Time's up - submitting your answers…</span>
              </div>
            )}
            <div style={{ flex: 1, overflowY: "auto", padding: 24, opacity: locked ? 0.6 : 1, pointerEvents: locked ? "none" : "auto" }}>
              {current.map((q, qi) => {
                const prevQ = page * perPage + qi > 0 ? questions[page * perPage + qi - 1] : null;
                const showSection = q.section && (!prevQ || prevQ.section !== q.section);
                return (
                <div key={q.id} style={{ marginBottom: qi < current.length - 1 ? 24 : 0 }}>
                  {showSection && (
                    <div style={{ padding: "12px 16px", background: "rgba(24, 40, 72,0.04)", borderLeft: "4px solid var(--xa-primary)", color: "var(--xa-navy)", borderRadius: "0 8px 8px 0", fontSize: 14, fontWeight: 800, marginBottom: 20 }}>
                      {q.section}
                    </div>
                  )}
                  <div style={{ fontSize: 13, fontWeight: 600, color: NAVY, marginBottom: 12, lineHeight: 1.5, display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span><span style={{ color: ORANGE, fontWeight: 800, marginRight: 6 }}>Q{page * perPage + qi + 1}.</span>{q.text}</span>
                    <span style={{ fontSize: 10, color: MUTED, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>{q.points} pt{q.points === 1 ? "" : "s"}</span>
                  </div>
                  <QuestionInput q={q} value={answers[q.id]} onChange={(a) => setAnswer(q, a)} disabled={locked} />
                </div>
              )})}
            </div>
            {submitError && <div style={{ padding: "0 24px", fontSize: 12, color: RED, fontWeight: 600 }}>{submitError}</div>}
            <div style={{ padding: "14px 24px", borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
              <button onClick={() => setPage((p) => p - 1)} disabled={page === 0 || locked} style={{ ...secondaryButton, opacity: page === 0 || locked ? 0.5 : 1 }}>← Previous</button>
              <span style={{ fontSize: 11, color: MUTED }}>{page + 1} of {pages}</span>
              {page < pages - 1
                ? <button onClick={() => setPage((p) => p + 1)} disabled={!pageAnswered || locked} style={{ ...primaryButton, opacity: pageAnswered && !locked ? 1 : 0.5 }}>Next →</button>
                : <button onClick={submit} disabled={submitting || locked || totalAnswered < questions.length} style={{ ...primaryButton, background: GREEN, opacity: submitting || locked || totalAnswered < questions.length ? 0.6 : 1 }}>{submitting ? "Submitting..." : "Submit Assessment ✓"}</button>}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

// isAnswered decides whether a question counts as answered (gates Next/Submit).
// Matching needs the question to know how many pairs must be selected - every
// left item must have a chosen right, otherwise the question is incomplete.
function isAnswered(q: QuestionDTO, a: AnswerInput | undefined): boolean {
  if (!a) return false;
  if (q.type === "matching") {
    const pairCount = q.match_pairs?.length ?? 0;
    if (pairCount === 0) return true;
    const chosen = a.matches ?? {};
    // Answered when every left index (0..pairCount-1) has a non-empty selection.
    for (let i = 0; i < pairCount; i++) {
      if (!chosen[String(i)]) return false;
    }
    return true;
  }
  return a.index !== undefined || (a.text !== undefined && a.text.trim().length > 0);
}

function QuestionInput({ q, value, onChange, disabled }: { q: QuestionDTO; value: AnswerInput | undefined; onChange: (a: AnswerInput) => void; disabled?: boolean }) {
  if (q.type === "mcq") {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(q.options ?? []).map((opt, oi) => (
          <button key={oi} disabled={disabled} onClick={() => onChange({ question_id: q.id, index: oi })}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: `1.5px solid ${value?.index === oi ? ORANGE : BORDER}`, borderRadius: 10, background: value?.index === oi ? "rgba(200, 168, 96,0.06)" : "#fff", cursor: disabled ? "default" : "pointer", fontFamily: "Poppins, sans-serif", textAlign: "left" }}>
            <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${value?.index === oi ? ORANGE : "#C9BFA8"}`, background: value?.index === oi ? ORANGE : "#fff", flexShrink: 0 }} />
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
          <button key={label} disabled={disabled} onClick={() => onChange({ question_id: q.id, index: oi })}
            style={{ flex: 1, padding: "12px 16px", border: `1.5px solid ${value?.index === oi ? ORANGE : BORDER}`, borderRadius: 10, background: value?.index === oi ? "rgba(200, 168, 96,0.06)" : "#fff", cursor: disabled ? "default" : "pointer", fontFamily: "Poppins, sans-serif", fontSize: 13, fontWeight: 600, color: value?.index === oi ? ORANGE : NAVY }}>
            {label}
          </button>
        ))}
      </div>
    );
  }
  if (q.type === "matching") {
    // Each left item gets a dropdown of the right-side options (shuffled). The
    // answer is a map of leftIndex -> chosen right text, scored per-pair by the
    // server for partial credit.
    const rights = (q.match_pairs ?? []).map((p) => p.right);
    const shuffled = [...rights].sort();
    const matches = value?.matches ?? {};
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {(q.match_pairs ?? []).map((pair, li) => (
          <div key={li} style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 10, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: NAVY, fontWeight: 600 }}>{pair.left}</span>
            <span style={{ fontSize: 12, color: MUTED }}>→</span>
            <select
              disabled={disabled}
              value={matches[String(li)] ?? ""}
              onChange={(e) => onChange({ question_id: q.id, matches: { ...matches, [String(li)]: e.target.value } })}
              style={{ width: "100%", border: `1.5px solid ${matches[String(li)] ? ORANGE : BORDER}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, fontFamily: "Poppins, sans-serif", color: NAVY, background: "#fff", cursor: disabled ? "default" : "pointer" }}
            >
              <option value="">- Select -</option>
              {shuffled.map((r, ri) => <option key={ri} value={r}>{r}</option>)}
            </select>
          </div>
        ))}
      </div>
    );
  }
  // open (faculty-graded)
  return (
    <textarea
      value={value?.text ?? ""}
      disabled={disabled}
      onChange={(e) => onChange({ question_id: q.id, text: e.target.value })}
      placeholder="Type your response here..."
      style={{ width: "100%", border: `1.5px solid ${BORDER}`, borderRadius: 10, padding: "10px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif", color: NAVY, outline: "none", resize: "vertical", height: 88, boxSizing: "border-box", lineHeight: 1.6 }}
    />
  );
}

// TimerPill renders mm:ss remaining, amber under 2 min, red-pulsing under 30s.
function TimerPill({ remainingMs }: { remainingMs: number }) {
  const totalSecs = Math.ceil(remainingMs / 1000);
  const mm = Math.floor(totalSecs / 60);
  const ss = totalSecs % 60;
  const urgent = remainingMs <= 30_000;
  const warn = remainingMs <= 120_000;
  const bg = urgent ? "rgba(239,68,68,0.9)" : warn ? "rgba(245,158,11,0.9)" : "rgba(255,255,255,0.12)";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: bg, color: "#fff", fontSize: 12, fontWeight: 700, borderRadius: 20, padding: "4px 11px", fontVariantNumeric: "tabular-nums", animation: urgent ? "xa-pulse 1s ease-in-out infinite" : undefined }}>
      ⏱ {mm}:{ss.toString().padStart(2, "0")}
    </span>
  );
}

function ResultsScreen({ result, onClose }: { result: AssessmentResultDTO; onClose: () => void }) {
  const pending = result.status === "pending_review";
  // Auto-scored portion so far; hidden as a "%" while a human review is pending
  // (the shown number would be misleadingly low before open answers are marked).
  const color = pending ? INDIGO : result.passed ? GREEN : result.score_pct >= 50 ? AMBER : RED;
  const openCount = result.questions.filter((q) => q.is_correct === undefined).length;
  return (
    <div style={{ flex: 1, overflowY: "auto" }}>
      <div style={{ padding: "32px 24px", textAlign: "center", borderBottom: `1px solid ${BORDER}` }}>
        {pending ? (
          <>
            <div style={{ width: 88, height: 88, borderRadius: "50%", border: `6px solid ${INDIGO}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px", fontSize: 34 }}>⏳</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 4 }}>Submitted - Awaiting Review</div>
            <div style={{ fontSize: 12, color: MUTED, maxWidth: 360, margin: "0 auto", lineHeight: 1.6 }}>
              This assessment has {openCount} open-ended answer{openCount === 1 ? "" : "s"} your faculty will grade. You'll be notified when your final score is ready - it will appear in your Assessment Results.
            </div>
          </>
        ) : (
          <>
            <div style={{ width: 88, height: 88, borderRadius: "50%", border: `6px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", margin: "0 auto 14px" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: NAVY }}>{Math.round(result.score_pct)}%</div>
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: NAVY, marginBottom: 4 }}>{result.passed ? "✓ Passed" : "Not Passed"}</div>
            <div style={{ fontSize: 12, color: MUTED }}>
              {result.score} of {result.max_score} points
              {result.attempts_left > 0 ? ` · ${result.attempts_left} attempt${result.attempts_left === 1 ? "" : "s"} remaining` : ""}
            </div>
          </>
        )}
        {result.timed_out && (
          <div style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(239,68,68,0.08)", color: RED, fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "4px 12px" }}>
          </div>
        )}
      </div>

      <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 10 }}>
        {result.questions.map((q, i) => {
          const prevQ = i > 0 ? result.questions[i - 1] : null;
          const showSection = q.section && (!prevQ || prevQ.section !== q.section);
          return (
          <div key={q.id}>
            {showSection && (
              <div style={{ padding: "12px 16px", background: "rgba(24, 40, 72,0.04)", borderLeft: "4px solid var(--xa-primary)", color: "var(--xa-navy)", borderRadius: "0 8px 8px 0", fontSize: 14, fontWeight: 800, marginBottom: 10, marginTop: i > 0 ? 10 : 0 }}>
                {q.section}
              </div>
            )}
            <div style={{ padding: "12px 14px", borderRadius: 10, border: `1px solid ${BORDER}`, background: q.is_correct === true ? "rgba(34,197,94,0.04)" : q.is_correct === false ? "rgba(239,68,68,0.04)" : "#F9FAFB" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: NAVY }}>Q{i + 1}. {q.text}</span>
                {q.is_correct === true && <span style={{ fontSize: 11, color: GREEN, fontWeight: 700, flexShrink: 0 }}>✓ Correct</span>}
                {q.is_correct === false && <span style={{ fontSize: 11, color: RED, fontWeight: 700, flexShrink: 0 }}>✕ Incorrect</span>}
                {q.is_correct === undefined && <span style={{ fontSize: 11, color: INDIGO, fontWeight: 700, flexShrink: 0 }}>Faculty review</span>}
              </div>
              {q.options && q.correct_index !== undefined && (
                <div style={{ fontSize: 11, color: MUTED }}>
                  Correct answer: <span style={{ color: NAVY, fontWeight: 600 }}>{q.options[q.correct_index]}</span>
                  {q.selected_index !== undefined && q.selected_index !== q.correct_index && (
                    <> · Your answer: <span style={{ color: RED }}>{q.options[q.selected_index]}</span></>
                  )}
                </div>
              )}
              {q.is_correct === undefined && q.selected_text && (
                <div style={{ fontSize: 11, color: MUTED, background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px", marginTop: 4, whiteSpace: "pre-wrap" }}>{q.selected_text}</div>
              )}
            </div>
          </div>
        )})}
      </div>
      
      <div style={{ padding: "14px 24px", borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "flex-end" }}>
        <button onClick={onClose} style={primaryButton}>Done</button>
      </div>
    </div>
  );
}

const primaryButton: CSSProperties = { padding: "9px 20px", background: ORANGE, border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins, sans-serif", whiteSpace: "nowrap" };
const secondaryButton: CSSProperties = { padding: "8px 16px", border: `1px solid ${BORDER}`, borderRadius: 8, background: "#fff", color: MUTED, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "Poppins, sans-serif" };
const overlay: CSSProperties = { position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.55)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 20px", fontFamily: "Poppins, sans-serif" };
const modalCard: CSSProperties = { background: "#fff", borderRadius: 20, width: "100%", maxWidth: 580, overflow: "hidden", boxShadow: "0 24px 64px rgba(24, 40, 72,0.25)", display: "flex", flexDirection: "column", maxHeight: "90vh" };
const closeBtn: CSSProperties = { width: 28, height: 28, border: "1px solid rgba(255,255,255,0.2)", borderRadius: "50%", background: "transparent", cursor: "pointer", color: "rgba(255,255,255,0.7)", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Poppins, sans-serif", flexShrink: 0 };
