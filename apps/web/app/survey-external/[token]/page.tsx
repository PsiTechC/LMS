"use client";

import { useEffect, useState, useCallback, use } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  surveyExternalApi, ExternalForm, ExternalQuestion, SurveyExternalError, ExternalAnswerInput,
} from "@/lib/survey-external-api";

// Public, login-less external respondent form (facilitator/manager/business
// sponsor answering a survey/L1-L4 feedback form). The token in the URL is the
// only credential. Modeled directly on app/rater/[token]/page.tsx - this may
// be the respondent's first and only exposure to the product, so it stands on
// its own - branded, self-explanatory, no LMS chrome.

const NAVY = "#182848";
const ORANGE = "#C8A860";
const GREEN = "#22c55e";
const PAGE = "#F7F5F0";
const BORDER = "#E6DED0";
const MUTED = "#4A5573";
const CARD_SHADOW = "0 1px 4px rgba(24, 40, 72,0.07)";

type Answer = number | string | null;
type Phase = "loading" | "invalid" | "submitted" | "form" | "thanks";

export default function SurveyExternalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [phase, setPhase] = useState<Phase>("loading");
  const [form, setForm] = useState<ExternalForm | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const f = await surveyExternalApi.getForm(token);
      setForm(f);
      if (f.already_submitted) { setPhase("submitted"); return; }
      const seed: Record<string, Answer> = {};
      f.questions.forEach((q) => { seed[q.id] = null; });
      setAnswers(seed);
      setPhase("form");
    } catch {
      // Never reveal whether the token expired, never existed, or was malformed.
      setPhase("invalid");
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  function setAnswer(id: string, v: Answer) {
    setAnswers((a) => ({ ...a, [id]: v }));
  }

  async function submit() {
    if (!form) return;
    setError("");
    setSubmitting(true);
    try {
      const payload: ExternalAnswerInput[] = form.questions.map((q) => {
        const v = answers[q.id];
        return typeof v === "number"
          ? { question_id: q.id, num: v }
          : { question_id: q.id, text: typeof v === "string" ? v : undefined };
      });
      await surveyExternalApi.submit(token, payload);
      setPhase("thanks");
    } catch (e) {
      if (e instanceof SurveyExternalError && e.status === 400 && /not open yet/i.test(e.message)) {
        setError("This form isn't open yet - please come back once it's scheduled to start.");
      } else {
        const msg = e instanceof SurveyExternalError ? e.message : "Something went wrong. Please try again.";
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  }

  // ── States ──────────────────────────────────────────────────────
  if (phase === "loading") return <Shell><Center>Loading the feedback form…</Center></Shell>;

  if (phase === "invalid") {
    return (
      <Shell>
        <Notice
          title="This link isn't valid"
          body="The feedback link you followed doesn't work. It may have been mistyped or replaced by a newer invitation. If you were expecting to give feedback, please ask the person who invited you to resend their invitation."
        />
      </Shell>
    );
  }

  if (phase === "submitted" || phase === "thanks") {
    return (
      <Shell>
        <Notice
          icon="✓"
          accent={GREEN}
          title={phase === "thanks" ? "Thank you - your feedback is in" : "You've already submitted this feedback"}
          body={
            phase === "thanks"
              ? "Your responses have been recorded. You can close this page."
              : "Our records show this form has already been completed, so there's nothing more to do. Thank you for taking the time. You can close this page."
          }
        />
      </Shell>
    );
  }

  if (!form) return <Shell><Center>Loading…</Center></Shell>;

  const total = form.questions.length;
  const done = Object.values(answers).filter((v) => v !== null && v !== "").length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <Shell>
      {/* Intro */}
      <Card>
        <div style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 6 }}>{form.title}</div>
        {form.role_label && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(24, 40, 72,0.06)",
            borderRadius: 20, padding: "5px 12px", marginBottom: 12,
          }}>
            <span style={{ fontSize: 12, color: MUTED }}>You&apos;re providing feedback as</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{form.role_label}</span>
          </div>
        )}
        <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.7 }}>
          You&apos;ve been asked to complete this feedback form. This only takes a few minutes, and you don&apos;t need an
          account - just answer the questions below and submit.
        </div>
      </Card>

      {/* Sticky progress */}
      {total > 0 && (
        <div style={{ position: "sticky", top: 0, zIndex: 10, background: PAGE, paddingTop: 4, paddingBottom: 4 }}>
          <Card style={{ padding: "12px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>Your progress</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: pct === 100 ? GREEN : ORANGE }}>{done} of {total}</span>
            </div>
            <div style={{ height: 6, background: "#EFE9DC", borderRadius: 99 }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? GREEN : ORANGE, borderRadius: 99, transition: "width .3s" }} />
            </div>
          </Card>
        </div>
      )}

      {/* Questions */}
      {form.questions.length === 0 ? (
        <Card><div style={{ fontSize: 13, color: MUTED, textAlign: "center", padding: 20 }}>This form has no questions yet.</div></Card>
      ) : (
        <Card>
          {form.questions.map((q, i) => (
            <div key={q.id} style={{
              paddingBottom: 18, marginBottom: 18,
              borderBottom: i < form.questions.length - 1 ? `1px solid ${BORDER}` : "none",
            }}>
              <div style={{ fontSize: 13, color: NAVY, lineHeight: 1.6, marginBottom: 12 }}>{q.text}</div>
              <QuestionInput q={q} value={answers[q.id] ?? null} onChange={(v) => setAnswer(q.id, v)} />
            </div>
          ))}
        </Card>
      )}

      {error && (
        <div style={{
          background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
          borderRadius: 8, padding: "11px 14px", fontSize: 12, color: "#ef4444", fontWeight: 600,
        }}>{error}</div>
      )}

      <button
        onClick={submit}
        disabled={submitting}
        style={{
          padding: "14px 20px", background: submitting ? "#F0A08C" : ORANGE, border: "none",
          borderRadius: 10, color: "#fff", fontSize: 14, fontWeight: 700,
          cursor: submitting ? "not-allowed" : "pointer", fontFamily: "Poppins, sans-serif",
          width: "100%", marginBottom: 8,
        }}
      >
        {submitting ? "Submitting…" : "Submit Feedback"}
      </button>
      <div style={{ fontSize: 11, color: MUTED, textAlign: "center", lineHeight: 1.6, paddingBottom: 24 }}>
        Once submitted, your answers can&apos;t be changed.
      </div>
    </Shell>
  );
}

// ── Question renderer - mirrors SurveysExperience.tsx's QuestionInput ──────
function QuestionInput({ q, value, onChange }: { q: ExternalQuestion; value: number | string | null; onChange: (v: number | string) => void }) {
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
    <textarea value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} placeholder="Type your response here…" style={textareaStyle} />
  );
}

// ── Layout primitives - mirrors app/rater/[token]/page.tsx ─────────
function Shell({ children }: { children: ReactNode }) {
  return (
    <div style={{ minHeight: "100vh", background: PAGE, fontFamily: "Poppins, sans-serif" }}>
      <header style={{ background: NAVY, padding: "18px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto" }}>
          <div style={{ fontSize: 19, fontWeight: 700, color: "#fff", letterSpacing: "-0.5px" }}>
            XA <span style={{ color: ORANGE }}>LMS</span>
          </div>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>by Executive Acceleration</div>
        </div>
      </header>
      <main style={{ maxWidth: 720, margin: "0 auto", padding: 24, display: "flex", flexDirection: "column", gap: 14 }}>
        {children}
      </main>
    </div>
  );
}

function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, border: `1px solid ${BORDER}`, boxShadow: CARD_SHADOW, padding: 20, ...style }}>
      {children}
    </div>
  );
}

function Center({ children }: { children: ReactNode }) {
  return <Card style={{ textAlign: "center", padding: 48, color: MUTED, fontSize: 13 }}>{children}</Card>;
}

function Notice({ title, body, icon, accent = NAVY }: { title: string; body: string; icon?: string; accent?: string }) {
  return (
    <Card style={{ textAlign: "center", padding: 48 }}>
      {icon && (
        <div style={{
          width: 52, height: 52, borderRadius: "50%", background: `${accent}14`, color: accent,
          fontSize: 24, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 16px",
        }}>{icon}</div>
      )}
      <div style={{ fontSize: 18, fontWeight: 800, color: NAVY, marginBottom: 10 }}>{title}</div>
      <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.7, maxWidth: 460, margin: "0 auto" }}>{body}</div>
    </Card>
  );
}

const textareaStyle: CSSProperties = {
  width: "100%", border: `1.5px solid ${BORDER}`, borderRadius: 8, padding: "10px 12px",
  fontSize: 13, fontFamily: "Poppins, sans-serif", color: NAVY, outline: "none",
  boxSizing: "border-box", resize: "vertical", height: 88, lineHeight: 1.6,
};
