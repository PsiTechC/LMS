"use client";

import { useEffect, useState, useCallback, use } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  raterApi, RaterForm, RaterError, BehaviorAnswer, OpenAnswer,
} from "@/lib/rater-api";

// Public, login-less 360° rater form. The token in the URL is the only
// credential. This page may be the rater's first and only exposure to the
// product, so it stands on its own - branded, self-explanatory, no LMS chrome.

const NAVY = "#182848";
const ORANGE = "#C8A860";
const GREEN = "#22c55e";
const PAGE = "#F7F5F0";
const BORDER = "#E6DED0";
const MUTED = "#4A5573";
const CARD_SHADOW = "0 1px 4px rgba(24, 40, 72,0.07)";

const SCALE = [1, 2, 3, 4, 5];
const SCALE_HINT: Record<number, string> = {
  1: "Rarely", 2: "Sometimes", 3: "Often", 4: "Usually", 5: "Consistently",
};

const REL_LABEL: Record<string, string> = {
  self: "Self", manager: "Manager", peer: "Peer", direct_report: "Direct Report",
  skip_level: "Skip Level", others: "Others",
};

// One rater's in-progress answer to a behavior question.  notObserved is no
// longer a rater-facing toggle - it's derived automatically at submit time for
// any optional question left blank (see submit()). Importance is not held
// here - it's asked once per competency (see competencyImportance).
interface Answer {
  score: number | null;
}

type Phase = "loading" | "invalid" | "submitted" | "form" | "thanks";

export default function RaterFormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);

  const [phase, setPhase] = useState<Phase>("loading");
  const [form, setForm] = useState<RaterForm | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  // Importance is asked once per competency (Manager / Skip-Manager only), keyed
  // by competency_id. It's fanned out onto that competency's behaviour rows on
  // submit, since the schema stores importance per behaviour.
  const [competencyImportance, setCompetencyImportance] = useState<Record<string, number>>({});
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
        c.behaviors.forEach((b) => { seed[b.behavior_id] = { score: null }; }),
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

  // ── Validation: every mandatory question needs a score. Optional questions
  // may be left blank - the admin already decided they don't require an answer,
  // so raters aren't asked to additionally flag "not observed" themselves. ──
  function firstUnanswered(): string | null {
    if (!form) return null;
    for (const c of form.competencies) {
      for (const b of c.behaviors) {
        if (b.mandatory && answers[b.behavior_id]?.score == null) return b.behavior_id;
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
      setError("Please answer every required question - look for the items marked “Required”.");
      return;
    }
    if (form.show_importance && form.competencies.some((c) => competencyImportance[c.competency_id] == null)) {
      setError("Please rate how important each competency is in their role.");
      return;
    }
    if (missingOpen()) {
      setError("Please answer the required written questions at the end.");
      return;
    }

    setSubmitting(true);
    try {
      // Map each behaviour back to its competency so the single per-competency
      // importance rating lands on every one of that competency's rows.
      const compOf: Record<string, string> = {};
      form.competencies.forEach((c) =>
        c.behaviors.forEach((b) => { compOf[b.behavior_id] = c.competency_id; }));

      // An optional question left blank is recorded as "not observed" - the
      // same signal the rater used to set manually - so scoring/aggregation
      // (which skips not_observed rows) is unaffected by removing the checkbox.
      const behaviors: BehaviorAnswer[] = Object.entries(answers).map(([behavior_id, a]) => {
        const notObserved = a.score == null;
        return {
          behavior_id,
          score: notObserved ? null : a.score,
          importance:
            form.show_importance && !notObserved
              ? competencyImportance[compOf[behavior_id]] ?? null
              : null,
          not_observed: notObserved,
        };
      });
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
          title={phase === "thanks" ? "Thank you - your feedback is in" : "You've already submitted this feedback"}
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
  const done = Object.values(answers).filter((a) => a.score != null).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const relLabel = REL_LABEL[form.relationship] || form.relationship;

  return (
    <Shell>
      {/* Intro */}
      <Card>
        <div style={{ fontSize: 20, fontWeight: 800, color: NAVY, marginBottom: 6 }}>
          360° Feedback for {form.participant_name || "a colleague"}
        </div>
        {form.relationship !== "self" && (
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 7, background: "rgba(24, 40, 72,0.06)",
            borderRadius: 20, padding: "5px 12px", marginBottom: 12,
          }}>
            <span style={{ fontSize: 12, color: MUTED }}>You&apos;re providing feedback as their</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>{relLabel}</span>
          </div>
        )}
        <div style={{ fontSize: 13, color: MUTED, lineHeight: 1.7 }}>
          {form.org_name ? <><strong style={{ color: NAVY }}>{form.org_name}</strong> has invited you to </> : "You've been invited to "}
          give confidential feedback as part of <strong style={{ color: NAVY }}>{form.cycle_name}</strong>.
          Rate how consistently you observe each behaviour. Items marked <strong style={{ color: ORANGE }}>Required</strong> need
          a rating to submit; anything marked <strong>Optional</strong> can be left blank if you haven&apos;t had the
          chance to observe it.
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
          <div style={{ height: 6, background: "#EFE9DC", borderRadius: 99 }}>
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
                  {b.statement}{" "}
                  {b.mandatory ? <RequiredTag /> : <OptionalTag />}
                </div>

                <ScaleRow
                  value={a?.score ?? null}
                  onPick={(v) => setAnswer(b.behavior_id, { score: v })}
                />
              </div>
            );
          })}

          {/* Importance - asked ONCE per competency, and only of Manager /
              Skip-Manager raters. Repeating it under every question made the
              form twice as long for no extra signal. */}
          {form.show_importance && (
            <div style={{ marginTop: 4, background: PAGE, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "14px 16px" }}>
              <div style={{ fontSize: 13, color: NAVY, lineHeight: 1.6, marginBottom: 10 }}>
                How important is <strong>{c.title}</strong> in {form.participant_name || "their"}
                {form.participant_name ? "’s" : ""} role?
              </div>
              <ScaleRow
                compact
                hints={false}
                value={competencyImportance[c.competency_id] ?? null}
                onPick={(v) => setCompetencyImportance((m) => ({ ...m, [c.competency_id]: v }))}
              />
            </div>
          )}
        </Card>
      ))}

      {/* Open-ended questions - once, at the end */}
      {form.open_questions.length > 0 && (
        <Card>
          <div style={{ fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 4 }}>In your own words</div>
          <div style={{ fontSize: 12, color: MUTED, marginBottom: 18, lineHeight: 1.6 }}>
            These written comments are often the most valuable part of a 360°. Be specific and constructive.
          </div>
          {form.open_questions.map((q, i) => (
            <div key={q.question_id} style={{ marginBottom: i < form.open_questions.length - 1 ? 18 : 0 }}>
              <div style={{ fontSize: 13, color: NAVY, lineHeight: 1.6, marginBottom: 8 }}>
                {q.prompt}{" "}
                {q.mandatory ? <RequiredTag /> : <OptionalTag />}
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

// ── Mandatory / optional badges ─────────────────────────────────────
function RequiredTag() {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color: ORANGE, background: "rgba(200, 168, 96,0.1)",
      borderRadius: 20, padding: "2px 7px", letterSpacing: 0.3, whiteSpace: "nowrap",
    }}>REQUIRED</span>
  );
}
function OptionalTag() {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, color: MUTED, background: "rgba(74, 85, 115,0.12)",
      borderRadius: 20, padding: "2px 7px", letterSpacing: 0.3, whiteSpace: "nowrap",
    }}>OPTIONAL</span>
  );
}

// ── 1-5 scale selector ────────────────────────────────────────────
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
              background: on ? "rgba(200, 168, 96,0.08)" : "#fff",
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
