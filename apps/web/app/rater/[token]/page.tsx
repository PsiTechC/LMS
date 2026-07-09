"use client";

import { useEffect, useState, useCallback, use } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  raterApi, RaterForm, RaterError, BehaviorAnswer, OpenAnswer,
} from "@/lib/rater-api";

// Public, login-less 360° rater form. The token in the URL is the only
// credential. This page may be the rater's first and only exposure to the
// product, so it stands on its own — branded, self-explanatory, no LMS chrome.

const NAVY = "#1C2551";
const ORANGE = "#EF4E24";
const GREEN = "#22c55e";
const PAGE = "#F5F7FB";
const BORDER = "#EAECF4";
const MUTED = "#8b90a7";
const CARD_SHADOW = "0 1px 4px rgba(28,37,81,0.07)";

const SCALE = [1, 2, 3, 4, 5];
const SCALE_HINT: Record<number, string> = {
  1: "Rarely", 2: "Sometimes", 3: "Often", 4: "Usually", 5: "Consistently",
};

// One rater's in-progress answer to a behavior question.
interface Answer {
  score: number | null;
  importance: number | null;
  notObserved: boolean;
}

type Phase = "loading" | "invalid" | "submitted" | "form" | "thanks";

export default function RaterFormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [phase, setPhase] = useState<Phase>("loading");
  const [form, setForm] = useState<RaterForm | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [openAnswers, setOpenAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const f = await raterApi.getForm(token);
      setForm(f);
      if (f.already_submitted) { setPhase("submitted"); return; }
      // Seed a blank answer per behavior so the form is fully controlled.
      const seed: Record<string, Answer> = {};
      f.competencies.forEach((c) =>
        c.behaviors.forEach((b) => { seed[b.behavior_id] = { score: null, importance: null, notObserved: false }; }),
      );
      setAnswers(seed);
      setOpenAnswers(Object.fromEntries(f.open_questions.map((q) => [q.question_id, ""])));
      setPhase("form");
    } catch {
      // Never reveal whether the token expired, never existed, or was malformed.
      setPhase("invalid");
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  function setAnswer(id: string, patch: Partial<Answer>) {
    setAnswers((a) => ({ ...a, [id]: { ...a[id], ...patch } }));
  }

  // ── Validation: every mandatory question needs a score or "not observed" ──
  function firstUnanswered(): string | null {
    if (!form) return null;
    for (const c of form.competencies) {
      for (const b of c.behaviors) {
        const a = answers[b.behavior_id];
        if (b.mandatory && !a?.notObserved && a?.score == null) return b.behavior_id;
      }
    }
    return null;
  }
  function missingOpen(): boolean {
    if (!form) return false;
    return form.open_questions.some((q) => q.mandatory && !openAnswers[q.question_id]?.trim());
  }

  async function submit() {
    if (!form) return;
    setError("");
    if (firstUnanswered()) {
      setError("Please answer every required question, or mark it “Unable to rate”.");
      return;
    }
    if (missingOpen()) {
      setError("Please answer the required written questions at the end.");
      return;
    }

    setSubmitting(true);
    try {
      const behaviors: BehaviorAnswer[] = Object.entries(answers).map(([behavior_id, a]) => ({
        behavior_id,
        score: a.notObserved ? null : a.score,
        importance: form.show_importance && !a.notObserved ? a.importance : null,
        not_observed: a.notObserved,
      }));
      const open_answers: OpenAnswer[] = Object.entries(openAnswers).map(([question_id, answer_text]) => ({
        question_id, answer_text,
      }));
      await raterApi.submit(token, { behaviors, open_answers });
      setPhase("thanks");
    } catch (e) {
      const msg = e instanceof RaterError ? e.message : "Something went wrong. Please try again.";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  // ── States ──────────────────────────────────────────────────────
  if (phase === "loading") return <Shell><Center>Loading your feedback form…</Center></Shell>;

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
          title={phase === "thanks" ? "Thank you — your feedback is in" : "You've already submitted this feedback"}
          body={
            phase === "thanks"
              ? `Your responses have been recorded${form?.participant_name ? ` for ${form.participant_name}` : ""}. They're confidential and will be combined with other reviewers' before being shared. You can close this page.`
              : "Our records show this form has already been completed, so there's nothing more to do. Thank you for taking the time. You can close this page."
          }
        />
      </Shell>
    );
  }

  if (!form) return <Shell><Center>Loading…</Center></Shell>;

  const total = form.competencies.reduce((n, c) => n + c.behaviors.length, 0);
  const done = Object.values(answers).filter((a) => a.notObserved || a.score != null).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <Shell>
      {/* Intro */}
      <Card>
        <div style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 6 }}>
          360° Feedback for {form.participant_name || "a colleague"}
        </div>
        <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.7 }}>
          {form.org_name ? <><strong style={{ color: NAVY }}>{form.org_name}</strong> has invited you to </> : "You've been invited to "}
          give confidential feedback as part of <strong style={{ color: NAVY }}>{form.cycle_name}</strong>.
          Rate how consistently you observe each behaviour. If you haven&apos;t had the chance to observe
          something, choose <em>Unable to rate</em> rather than guessing — it keeps the results honest.
          <br /><br />
          Your individual answers are <strong style={{ color: NAVY }}>never shown on their own</strong>; they&apos;re
          combined with other reviewers&apos; responses. This takes about 10 minutes.
        </div>
      </Card>

      {/* Sticky progress */}
      <div style={{ position: "sticky", top: 0, zIndex: 10, background: PAGE, paddingTop: 4, paddingBottom: 4 }}>
        <Card style={{ padding: "12px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>Your progress</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: pct === 100 ? GREEN : ORANGE }}>{done} of {total}</span>
          </div>
          <div style={{ height: 6, background: "#F0F1F7", borderRadius: 99 }}>
            <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? GREEN : ORANGE, borderRadius: 99, transition: "width .3s" }} />
          </div>
        </Card>
      </div>

      {/* Competency sections */}
      {form.competencies.map((c, ci) => (
        <Card key={c.competency_id}>
          <div style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4 }}>
            Section {ci + 1} of {form.competencies.length}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 16 }}>{c.title}</div>

          {c.behaviors.map((b, bi) => {
            const a = answers[b.behavior_id];
            return (
              <div key={b.behavior_id} style={{
                paddingBottom: 18, marginBottom: 18,
                borderBottom: bi < c.behaviors.length - 1 ? `1px solid ${BORDER}` : "none",
              }}>
                <div style={{ fontSize: 13, color: NAVY, lineHeight: 1.6, marginBottom: 12 }}>
                  {b.question_text}
                  {!b.mandatory && <span style={{ fontSize: 10, color: MUTED, fontWeight: 600, marginLeft: 6 }}>(optional)</span>}
                </div>

                <ScaleRow
                  value={a?.notObserved ? null : a?.score ?? null}
                  disabled={a?.notObserved ?? false}
                  onPick={(v) => setAnswer(b.behavior_id, { score: v, notObserved: false })}
                />

                <label style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 12, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={a?.notObserved ?? false}
                    onChange={(e) => setAnswer(b.behavior_id, { notObserved: e.target.checked, score: null, importance: null })}
                  />
                  <span style={{ fontSize: 12, color: MUTED }}>Unable to rate / Not observed</span>
                </label>

                {/* Importance — Manager & Skip-Manager only */}
                {form.show_importance && !a?.notObserved && (
                  <div style={{ marginTop: 14, background: PAGE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "12px 14px" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 8 }}>
                      How important is this behaviour in their role?
                    </div>
                    <ScaleRow
                      compact
                      value={a?.importance ?? null}
                      onPick={(v) => setAnswer(b.behavior_id, { importance: v })}
                      hints={false}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </Card>
      ))}

      {/* Open-ended questions — once, at the end */}
      {form.open_questions.length > 0 && (
        <Card>
          <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 4 }}>In your own words</div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 18, lineHeight: 1.6 }}>
            These written comments are often the most valuable part of a 360°. Be specific and constructive.
          </div>
          {form.open_questions.map((q, i) => (
            <div key={q.question_id} style={{ marginBottom: i < form.open_questions.length - 1 ? 18 : 0 }}>
              <div style={{ fontSize: 13, color: NAVY, lineHeight: 1.6, marginBottom: 8 }}>
                {q.prompt}
                {!q.mandatory && <span style={{ fontSize: 10, color: MUTED, fontWeight: 600, marginLeft: 6 }}>(optional)</span>}
              </div>
              <textarea
                value={openAnswers[q.question_id] ?? ""}
                onChange={(e) => setOpenAnswers((o) => ({ ...o, [q.question_id]: e.target.value }))}
                placeholder="Your answer…"
                rows={4}
                style={textareaStyle}
              />
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
        Once submitted, your answers can&apos;t be changed. Your responses are confidential.
      </div>
    </Shell>
  );
}

// ── 1–5 scale selector ────────────────────────────────────────────
function ScaleRow({
  value, onPick, disabled = false, compact = false, hints = true,
}: {
  value: number | null;
  onPick: (v: number) => void;
  disabled?: boolean;
  compact?: boolean;
  hints?: boolean;
}) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", opacity: disabled ? 0.4 : 1 }}>
      {SCALE.map((n) => {
        const on = value === n;
        return (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onPick(n)}
            style={{
              flex: "1 1 0", minWidth: compact ? 56 : 72,
              padding: compact ? "8px 4px" : "10px 4px",
              borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer",
              border: `1.5px solid ${on ? ORANGE : BORDER}`,
              background: on ? "rgba(239,78,36,0.08)" : "#fff",
              color: on ? ORANGE : NAVY,
              fontFamily: "Poppins, sans-serif",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
            }}
          >
            <span style={{ fontSize: compact ? 13 : 15, fontWeight: 800 }}>{n}</span>
            {hints && !compact && (
              <span style={{ fontSize: 9, color: on ? ORANGE : MUTED, fontWeight: 600 }}>{SCALE_HINT[n]}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Layout primitives ─────────────────────────────────────────────
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
  boxSizing: "border-box", resize: "vertical", lineHeight: 1.6,
};
