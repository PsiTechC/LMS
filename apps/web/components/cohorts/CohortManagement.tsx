"use client";

import { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import {
  cohortsApi, CohortDTO, ParticipantDTO,
} from "@/lib/cohorts-api";
import { programsApi, ProgramDTO } from "@/lib/programs-api";
import { analyticsApi, CohortHealthScore } from "@/lib/analytics-api";

// ── Design tokens ───────────────────────────────────────────────────
const C = {
  navy: "var(--xa-navy)", orange: "var(--xa-primary)", indigo: "var(--xa-muted)",
  bg: "var(--xa-bg)", card: "#fff", border: "#E6DED0", muted: "var(--xa-muted)",
  green: "#22c55e", amber: "#f59e0b", red: "#ef4444",
};
const S = {
  primBtn: { padding: "9px 20px", background: C.orange, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif", display: "flex", alignItems: "center", gap: 6 } as React.CSSProperties,
  secBtn: { padding: "8px 16px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.navy, fontFamily: "Poppins, sans-serif" } as React.CSSProperties,
  iconBtn: { padding: "6px 10px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", fontSize: 11, color: C.navy, fontFamily: "Poppins, sans-serif", fontWeight: 600 } as React.CSSProperties,
};

function initials(n: string) {
  return n.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}
function riskColor(r: string) {
  return r === "high" ? C.red : r === "medium" ? C.amber : C.green;
}
function riskLabel(r: string) {
  return r.charAt(0).toUpperCase() + r.slice(1);
}
function enrollmentStatusColor(s: string) {
  switch (s) {
    case "invited":   return C.amber;
    case "on_hold":   return C.muted;
    case "withdrawn": return C.red;
    case "completed": return C.green;
    default:          return C.navy; // enrolled / active
  }
}
function enrollmentStatusLabel(s: string) {
  if (s === "on_hold") return "On Hold";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
// get a stable color from a ProgramDTO
function progColor(p: ProgramDTO): string {
  const colors = [C.orange, C.navy, C.indigo, C.green, C.amber, "#0891B2"];
  let h = 0;
  for (let i = 0; i < p.title.length; i++) h = (h * 31 + p.title.charCodeAt(i)) % colors.length;
  return p.color || colors[h];
}

// ── Overlay ─────────────────────────────────────────────────────────
function Overlay({ children, onClose, maxWidth = 480 }: { children: React.ReactNode; onClose: () => void; maxWidth?: number }) {
  // Rendered via a portal to <body> - the page's <main> (DashboardShell)
  // has a CSS `transform` for its entrance animation, which creates a new
  // containing block for `position: fixed` descendants. Without the portal,
  // this overlay would be pinned to <main>'s box instead of the real
  // viewport, leaving the header undimmed and exposing bright gaps on scroll.
  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      className="xa-modal-overlay"
      style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins, sans-serif" }}>
      <div className="xa-modal-content" style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth, maxHeight: "88vh", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)" }}>
        {children}
      </div>
    </div>,
    document.body
  );
}

// ── Badge ────────────────────────────────────────────────────────────
function Badge({ label, color = C.orange }: { label: string; color?: string }) {
  return (
    <span style={{ background: `${color}14`, color, fontSize: 10, fontWeight: 700, borderRadius: 20, padding: "3px 9px" }}>
      {label}
    </span>
  );
}

// ── Cohort Health Score ────────────────────────────────────────────
// Executive-facing composite score + narrative, generated on demand (LLM
// call) when a PM drills into a cohort - not fetched for every card on load.
function healthLabelColor(label: string) {
  switch (label) {
    case "Excellent":       return C.green;
    case "On Track":        return C.indigo;
    case "Needs Attention": return C.amber;
    case "At Risk":         return C.red;
    default:                return C.muted;
  }
}

function CohortHealthPanel({ cohortId }: { cohortId: string }) {
  const [score, setScore] = useState<CohortHealthScore | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGenerate = useCallback(async () => {
    setLoading(true); setError(""); setScore(null);
    try {
      const res = await analyticsApi.cohortHealthScore(cohortId);
      setScore(res.data ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't score this cohort right now.");
    } finally {
      setLoading(false);
    }
  }, [cohortId]);

  // Auto-score as soon as a cohort is opened, so the PM sees a result on
  // first view instead of an empty state behind a button press. Re-fires
  // whenever a different cohort is selected (this panel instance is reused
  // across cohorts, not remounted, since it's rendered without a `key`).
  useEffect(() => {
    handleGenerate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cohortId]);

  return (
    <div style={{ background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ color: C.indigo }}>✦</span> Cohort Health Score
        </div>
        <button
          onClick={handleGenerate}
          disabled={loading}
          style={{ ...S.iconBtn, opacity: loading ? 0.6 : 1, cursor: loading ? "default" : "pointer" }}
        >
          {loading ? "Scoring…" : score ? "Rescore" : "Generate Score"}
        </button>
      </div>

      {loading && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span className="xa-typing-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: C.muted, display: "inline-block" }} />
          <span className="xa-typing-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: C.muted, display: "inline-block" }} />
          <span className="xa-typing-dot" style={{ width: 5, height: 5, borderRadius: "50%", background: C.muted, display: "inline-block" }} />
          <span style={{ fontSize: 11, color: C.muted, marginLeft: 4 }}>Analyzing cohort data...</span>
        </div>
      )}

      {!loading && error && <div style={{ fontSize: 11, color: C.red }}>{error}</div>}

      {!loading && score && (
        <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
          <div style={{ flexShrink: 0, width: 56, height: 56, borderRadius: "50%", background: `${healthLabelColor(score.label)}14`, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: healthLabelColor(score.label) }}>{score.score}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
            <Badge label={score.label} color={healthLabelColor(score.label)} />
            <div style={{ fontSize: 12, color: C.navy, lineHeight: 1.6 }}>{score.narrative}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Nudge Modal ──────────────────────────────────────────────────────
function NudgeModal({ cohortId, participant, onClose }: {
  cohortId: string;
  participant: ParticipantDTO;
  onClose: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  async function send() {
    setSending(true);
    try {
      await cohortsApi.nudge(cohortId, participant.enrollment_id);
      setDone(true);
    } catch { /* ignore */ }
    finally { setSending(false); }
  }

  return (
    <Overlay onClose={onClose} maxWidth={400}>
      <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>Send Nudge</div>
      </div>
      <div style={{ padding: "20px 22px" }}>
        {done ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ fontSize: 30, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>Nudge sent to {participant.name}</div>
          </div>
        ) : (
          <>
            <div style={{ fontSize: 13, color: C.navy, marginBottom: 8 }}>
              Send an AI-personalized nudge to <strong>{participant.name}</strong>?
            </div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
              Their current progress is <strong style={{ color: C.orange }}>{Math.round(participant.completion_percent)}%</strong> with risk level <strong style={{ color: riskColor(participant.risk_level) }}>{riskLabel(participant.risk_level)}</strong>.
            </div>
          </>
        )}
      </div>
      <div style={{ padding: "14px 22px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 }}>
        <button onClick={onClose} style={S.secBtn}>{done ? "Close" : "Cancel"}</button>
        {!done && (
          <button onClick={send} disabled={sending} style={{ ...S.primBtn, opacity: sending ? 0.6 : 1 }}>
            {sending ? "Sending…" : "Send Nudge"}
          </button>
        )}
      </div>
    </Overlay>
  );
}

// ── Setup Cohorts & Allocate wizard ──────────────────────────────────
// Step 1: define N named cohorts for a program (creates real cohorts).
// Step 2: allocate - Randomize builds a client-side preview (real enrolled
// participants shuffled across the new cohorts, reshuffleable) and commits
// EXACTLY what was previewed via per-participant transfer calls; Manual
// creates the cohorts empty, left for the per-row "Move to Cohort" dropdown.
const COHORT_COLORS = ["var(--xa-primary)", "var(--xa-muted)", "#22c55e", "#0891B2", "#f59e0b"];

type AllocatableParticipant = ParticipantDTO & { cohortId: string };
interface PreviewCohort { name: string; color: string; members: AllocatableParticipant[] }

function buildShuffledPreview(participants: AllocatableParticipant[], names: string[]): PreviewCohort[] {
  const defs: PreviewCohort[] = names.map((n, i) => ({ name: n, color: COHORT_COLORS[i % 5], members: [] }));
  const shuffled = [...participants].sort(() => Math.random() - 0.5);
  shuffled.forEach((p, i) => defs[i % defs.length].members.push(p));
  return defs;
}

function SetupCohortsWizard({ orgId, program, existingCohortCount, participants, onClose, onDone }: {
  orgId: string;
  program: ProgramDTO;
  existingCohortCount: number; // real cohorts already in this program - offsets the "Cohort N" name fallback below so a re-run of this wizard can't collide with an already-existing "Cohort 1" etc.
  participants: AllocatableParticipant[]; // enrolled (non-withdrawn, non-invited) participants for this program
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState(1);
  const [sessionName, setSessionName] = useState("");
  const [num, setNum] = useState(3);
  const [names, setNames] = useState<string[]>(["Cohort A", "Cohort B", "Cohort C"]);
  const [mode, setMode] = useState<"random" | "manual">("random");
  const [preview, setPreview] = useState<PreviewCohort[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function setCount(n: number) {
    if (n < 1) return;
    setNum(n);
    setNames((prev) => {
      const a = [...prev];
      while (a.length < n) a.push(`Cohort ${String.fromCharCode(65 + a.length)}`);
      return a.slice(0, n);
    });
    setPreview(null);
  }

  function reshuffle() {
    setPreview(buildShuffledPreview(participants, names.slice(0, num)));
  }

  async function finish() {
    setBusy(true); setError("");
    try {
      // 1) Create the N cohorts under this program.
      const created = await Promise.all(
        Array.from({ length: num }).map((_, i) =>
          cohortsApi.create(orgId, {
            program_id: program.id,
            // Offset by existingCohortCount so re-running this wizard (or
            // leaving the name field blank a second time) can't mint another
            // cohort with the exact same fallback name as one that's already
            // there - confusingly indistinguishable in the cohort list since
            // nothing else about the name says which is which.
            name: (names[i] || `Cohort ${existingCohortCount + i + 1}`).trim(),
            description: sessionName.trim() || undefined,
          }).then((r) => r.data).catch(() => null)
        )
      );
      if (created.filter(Boolean).length === 0) { setError("Could not create cohorts. Check your permissions."); setBusy(false); return; }

      // 2) Randomize commits EXACTLY the previewed grouping (falling back to a
      // fresh shuffle if the user never opened the preview) via per-participant
      // transfer calls - never a second, independent server-side shuffle, so
      // what the admin saw is what gets applied.
      if (mode === "random") {
        const finalPreview = preview ?? buildShuffledPreview(participants, names.slice(0, num));
        const failures: string[] = [];
        for (let ci = 0; ci < finalPreview.length; ci++) {
          const cohortId = created[ci]?.id;
          if (!cohortId) continue;
          for (const p of finalPreview[ci].members) {
            try {
              await cohortsApi.transfer(cohortId, { user_id: p.user_id, from_cohort_id: p.cohortId || undefined });
            } catch {
              failures.push(p.name);
            }
          }
        }
        if (failures.length > 0) {
          setError(`Cohorts created, but ${failures.length} participant(s) could not be assigned: ${failures.slice(0, 3).join(", ")}${failures.length > 3 ? "…" : ""}`);
          setBusy(false);
          return;
        }
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <Overlay onClose={onClose} maxWidth={560}>
      {/* Header + stepper */}
      <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>Setup Cohorts &amp; Allocate</div>
          <div style={{ display: "flex", gap: 4, marginTop: 8, alignItems: "center" }}>
            {[["1", "Define Cohorts"], ["2", "Allocate"]].map(([n, label], i) => {
              const active = step === i + 1, done = step > i + 1;
              return (
                <div key={n} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  {i > 0 && <div style={{ width: 16, height: 1, background: done ? C.green : C.border, marginRight: 2 }} />}
                  <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 99, background: active ? C.navy : done ? "rgba(34,197,94,0.1)" : C.bg }}>
                    <span style={{ width: 16, height: 16, borderRadius: "50%", background: active ? C.orange : done ? C.green : "#C9BFA8", color: "#fff", fontSize: 9, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{done ? "✓" : n}</span>
                    <span style={{ fontSize: 11, fontWeight: active ? 700 : 400, color: active ? "#fff" : done ? C.green : C.muted, whiteSpace: "nowrap" }}>{label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: C.muted }}>✕</button>
      </div>

      {/* Step 1 */}
      {step === 1 && (
        <div style={{ padding: "20px 22px", flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>Define the session and cohorts for <strong style={{ color: C.navy }}>{program.title}</strong>.</div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 6 }}>SESSION NAME</div>
            <input value={sessionName} onChange={(e) => setSessionName(e.target.value)} placeholder="e.g. Session 1 - Strategic Leadership · Apr 15, 2026" style={wInput} />
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>NUMBER OF COHORTS</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.bg, borderRadius: 8, padding: "4px 8px" }}>
              <button onClick={() => setCount(num - 1)} style={stepBtn}>−</button>
              <span style={{ fontSize: 18, fontWeight: 800, color: C.navy, minWidth: 24, textAlign: "center" }}>{num}</span>
              <button onClick={() => setCount(num + 1)} style={stepBtn}>+</button>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {Array.from({ length: num }).map((_, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: COHORT_COLORS[i % 5], flexShrink: 0 }} />
                <input value={names[i] || ""} onChange={(e) => { const v = e.target.value; setNames((prev) => { const a = [...prev]; a[i] = v; return a; }); setPreview(null); }} placeholder={`Cohort ${i + 1} name`} style={{ ...wInput, flex: 1 }} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <div style={{ padding: "20px 22px", flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.65 }}>Distribute <strong style={{ color: C.navy }}>{participants.length} participants</strong> across <strong style={{ color: C.navy }}>{num} cohorts</strong>.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {([["random", "🎲 Randomize", "System shuffles and assigns participants evenly across cohorts"], ["manual", "✍️ Manual", "Use the cohort dropdown per participant row after closing"]] as const).map(([m, title, desc]) => (
              <div key={m} onClick={() => { setMode(m); setPreview(null); }} style={{ padding: 14, border: `2px solid ${mode === m ? C.navy : C.border}`, borderRadius: 10, cursor: "pointer", background: mode === m ? "rgba(24, 40, 72,0.04)" : "#fff" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: mode === m ? C.navy : C.muted, marginBottom: 5 }}>{title}</div>
                <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
          {mode === "random" && participants.length === 0 && (
            <div style={{ padding: "10px 14px", background: "rgba(239,68,68,0.06)", borderRadius: 8, fontSize: 11, color: C.red, lineHeight: 1.6 }}>
              No enrolled participants to distribute yet. Enroll participants into this program first.
            </div>
          )}
          {mode === "random" && participants.length > 0 && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted }}>ASSIGNMENT PREVIEW</div>
                <button onClick={reshuffle} style={{ padding: "4px 12px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, fontWeight: 600, color: C.navy, cursor: "pointer", fontFamily: "Poppins, sans-serif" }}>🎲 Reshuffle</button>
              </div>
              {!preview ? (
                <button onClick={reshuffle} style={{ width: "100%", padding: 10, background: C.bg, border: `1.5px dashed ${C.border}`, borderRadius: 8, fontSize: 12, color: C.muted, cursor: "pointer", fontFamily: "Poppins, sans-serif" }}>Click to preview random assignment</button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {preview.map((c, ci) => (
                    <div key={ci} style={{ background: "#F9FAFB", borderRadius: 8, border: `1px solid ${c.color}33`, overflow: "hidden" }}>
                      <div style={{ padding: "8px 12px", background: `${c.color}12`, borderBottom: `1px solid ${c.color}22`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{c.name || "Unnamed cohort"}</span>
                        </div>
                        <span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>{c.members.length} participants</span>
                      </div>
                      <div style={{ padding: "8px 12px", display: "flex", flexWrap: "wrap", gap: 5 }}>
                        {c.members.map((m) => (
                          <span key={m.user_id} style={{ fontSize: 10, background: `${c.color}18`, color: c.color, borderRadius: 99, padding: "3px 9px", fontWeight: 600 }}>{m.name}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {mode === "manual" && (
            <div style={{ padding: "10px 14px", background: "#F9FAFB", borderRadius: 8, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
              After finishing, use the <strong style={{ color: C.navy }}>Move to Cohort</strong> dropdown in each participant row to assign manually.
            </div>
          )}
          {error && <div style={{ color: C.red, fontSize: 12, fontWeight: 600 }}>{error}</div>}
        </div>
      )}

      {/* Footer */}
      <div style={{ padding: "14px 22px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "space-between", flexShrink: 0 }}>
        <button onClick={() => (step > 1 ? setStep(step - 1) : onClose())} style={S.secBtn}>{step === 1 ? "Cancel" : "← Back"}</button>
        <button onClick={() => (step < 2 ? setStep(step + 1) : finish())} disabled={busy || (step === 2 && mode === "random" && participants.length === 0)} style={{ ...S.primBtn, opacity: busy || (step === 2 && mode === "random" && participants.length === 0) ? 0.5 : 1 }}>
          {step === 2 ? (busy ? "Working…" : mode === "random" ? "🎲 Apply & Finish" : "Confirm & Finish →") : "Next →"}
        </button>
      </div>
    </Overlay>
  );
}

const wInput: React.CSSProperties = { width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 12, fontFamily: "Poppins, sans-serif", color: C.navy, outline: "none", boxSizing: "border-box" };
const stepBtn: React.CSSProperties = { width: 28, height: 28, border: `1px solid ${C.border}`, borderRadius: 6, background: "#fff", cursor: "pointer", fontSize: 16, fontWeight: 700, color: C.navy, fontFamily: "Poppins, sans-serif", display: "flex", alignItems: "center", justifyContent: "center" };

// ── Program filter control ─────────────────────────────────────────
// Below the threshold, the existing pill row reads fine at a glance. Above
// it, rendering one pill per program turns into a wall of small buttons
// (the reported bug - orgs with 40-50+ programs), so we swap to a searchable
// dropdown instead. Same selection state (`onSelect`/`selectedId`) either way
// - this is presentation-only, callers don't change.
const PROGRAM_PILL_THRESHOLD = 8;

function ProgramFilterDropdown({ programs, selectedId, onSelect, countFor, totalCount, totalLabel = "All Programs" }: {
  programs: ProgramDTO[];
  selectedId: string | null; // null/ALL_PROGRAMS-equivalent handled by caller via isAllSelected
  onSelect: (id: string | null) => void; // null = "All Programs"
  countFor: (progId: string) => number;
  totalCount: number;
  totalLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const isAllSelected = selectedId === null;
  const selected = programs.find(p => p.id === selectedId) ?? null;
  const filtered = programs.filter(p => p.title.toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const el = document.getElementById("program-filter-dropdown-root");
      if (el && !el.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const triggerLabel = isAllSelected ? totalLabel : (selected?.title.split("-")[0].trim() ?? totalLabel);
  const triggerColor = isAllSelected ? C.navy : (selected ? progColor(selected) : C.navy);
  const triggerCount = isAllSelected ? totalCount : (selected ? countFor(selected.id) : 0);

  return (
    <div id="program-filter-dropdown-root" style={{ position: "relative", width: 280, fontFamily: "Poppins, sans-serif" }}>
      <button
        onClick={() => { setOpen(o => !o); setQuery(""); }}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: `1.5px solid ${open ? triggerColor : C.border}`, borderRadius: 10, background: "#fff", cursor: "pointer", fontFamily: "Poppins, sans-serif" }}
      >
        {!isAllSelected && <div style={{ width: 8, height: 8, borderRadius: "50%", background: triggerColor, flexShrink: 0 }} />}
        <span style={{ flex: 1, textAlign: "left", fontSize: 12, fontWeight: 700, color: C.navy, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{triggerLabel}</span>
        <span style={{ fontSize: 10, background: `${triggerColor}18`, color: triggerColor, borderRadius: 99, padding: "1px 7px", fontWeight: 700, flexShrink: 0 }}>{triggerCount}</span>
        <span style={{ fontSize: 9, color: C.muted, flexShrink: 0, transform: open ? "rotate(180deg)" : "none" }}>▼</span>
      </button>

      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, width: "100%", minWidth: 300, background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 8px 32px rgba(24,40,72,0.14)", zIndex: 400, overflow: "hidden" }}>
          <div style={{ padding: 10, borderBottom: `1px solid ${C.border}` }}>
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search programs…"
              style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "8px 10px", fontSize: 12, fontFamily: "Poppins, sans-serif", color: C.navy, outline: "none", boxSizing: "border-box" }}
            />
          </div>
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            <button
              onClick={() => { onSelect(null); setOpen(false); }}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", border: "none", borderBottom: `1px solid ${C.bg}`, background: isAllSelected ? `${C.navy}0d` : "#fff", cursor: "pointer", textAlign: "left", fontFamily: "Poppins, sans-serif" }}
            >
              <span style={{ flex: 1, fontSize: 12, fontWeight: isAllSelected ? 700 : 500, color: isAllSelected ? C.navy : C.navy }}>{totalLabel}</span>
              <span style={{ fontSize: 10, background: isAllSelected ? `${C.navy}22` : C.bg, color: isAllSelected ? C.navy : C.muted, borderRadius: 99, padding: "1px 7px", fontWeight: 700 }}>{totalCount}</span>
            </button>
            {filtered.length === 0 && (
              <div style={{ padding: "14px 12px", fontSize: 11, color: C.muted, textAlign: "center" }}>No programs match &ldquo;{query}&rdquo;.</div>
            )}
            {filtered.map((p) => {
              const active = selectedId === p.id;
              const col = progColor(p);
              const count = countFor(p.id);
              return (
                <button
                  key={p.id}
                  onClick={() => { onSelect(p.id); setOpen(false); }}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", border: "none", borderBottom: `1px solid ${C.bg}`, background: active ? `${col}0d` : "#fff", cursor: "pointer", textAlign: "left", fontFamily: "Poppins, sans-serif" }}
                >
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: col, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 12, fontWeight: active ? 700 : 500, color: active ? col : C.navy, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.title}</span>
                  <span style={{ fontSize: 10, background: active ? `${col}22` : C.bg, color: active ? col : C.muted, borderRadius: 99, padding: "1px 7px", fontWeight: 700, flexShrink: 0 }}>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Move to Cohort dropdown (uses transfer endpoint) ──────────────────
function MoveToCohortSelect({ participant, currentCohortId, cohorts, onMoved }: {
  participant: ParticipantDTO;
  currentCohortId: string;
  cohorts: CohortDTO[];
  onMoved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  async function change(target: string) {
    if (!target || target === currentCohortId || busy) return;
    setBusy(true);
    try {
      await cohortsApi.transfer(target, { user_id: participant.user_id, from_cohort_id: currentCohortId || undefined });
      onMoved();
    } finally { setBusy(false); }
  }
  return (
    <select
      value={currentCohortId}
      disabled={busy}
      onChange={(e) => change(e.target.value)}
      style={{ padding: "4px 8px", border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 11, fontFamily: "Poppins, sans-serif", color: C.navy, cursor: "pointer", background: "#fff", opacity: busy ? 0.6 : 1 }}
    >
      {cohorts.map((c) => <option key={c.id} value={c.id}>{c.name.split("-")[1]?.trim() || c.name}</option>)}
    </select>
  );
}

// ── Main Component ───────────────────────────────────────────────────
// Sentinel for "All Programs" selected in the program pill row - distinct
// from `null` (which means "no explicit choice made yet, default to the
// first program") so the two states don't collapse into each other.
const ALL_PROGRAMS = "__all__";

export default function CohortManagement({ orgId }: { orgId: string }) {
  const [programs, setPrograms] = useState<ProgramDTO[]>([]);
  const [selProgId, setSelProgId] = useState<string | null>(null);
  const [cohorts, setCohorts] = useState<CohortDTO[]>([]);
  const [allParticipants, setAllParticipants] = useState<Record<string, ParticipantDTO[]>>({});
  const [loading, setLoading] = useState(false);
  const [nudgeTarget, setNudgeTarget] = useState<{ cohortId: string; participant: ParticipantDTO } | null>(null);
  const [wizardProgram, setWizardProgram] = useState<ProgramDTO | null>(null);
  const [selCohortId, setSelCohortId] = useState<string | null>(null);
  const [aiPulse, setAiPulse] = useState<string | null>(null);
  const [aiPulseLoading, setAiPulseLoading] = useState(false);

  // Load all programs once ("" org = All Orgs, not gated)
  useEffect(() => {
    programsApi.list(orgId).then(r => {
      const list = (r.data ?? []).filter(p => p.status !== "archived");
      setPrograms(list);
    }).catch(() => {});
  }, [orgId]);

  // Load cohorts + participants for all programs
  const loadAll = useCallback(async () => {
    if (programs.length === 0) return;
    setLoading(true);
    try {
      const allCohorts: CohortDTO[] = [];
      const partMap: Record<string, ParticipantDTO[]> = {};

      await Promise.allSettled(programs.map(async (prog) => {
        try {
          const res = await cohortsApi.list(orgId, prog.id);
          const list = res.data ?? [];
          allCohorts.push(...list);
          await Promise.allSettled(list.map(async (c) => {
            try {
              const pr = await cohortsApi.listParticipants(c.id);
              partMap[c.id] = pr.data ?? [];
            } catch { partMap[c.id] = []; }
          }));
        } catch { /* ignore */ }
      }));

      setCohorts(allCohorts);
      setAllParticipants(partMap);
    } finally { setLoading(false); }
  }, [orgId, programs]);

  useEffect(() => { void Promise.resolve().then(loadAll); }, [loadAll]);

  // ── Derived data ──
  // The auto "Unassigned" cohort is a holding bucket, not a real cohort - its
  // members show in the Unassigned section, and it's hidden from cohort cards.
  const isUnassignedCohort = (c: CohortDTO) => c.name === "Unassigned";

  function cohortsForProg(progId: string) {
    return cohorts.filter(c => c.program_id === progId && !isUnassignedCohort(c));
  }
  function unassignedCohortIds(progId: string): Set<string> {
    return new Set(cohorts.filter(c => c.program_id === progId && isUnassignedCohort(c)).map(c => c.id));
  }
  // Deduped participants for a program (a user appears once even across cohorts).
  // Members of the Unassigned bucket are surfaced with an empty cohortId.
  function participantsForProg(progId: string): (ParticipantDTO & { cohortId: string })[] {
    const seen = new Set<string>();
    const out: (ParticipantDTO & { cohortId: string })[] = [];
    const unassignedIds = unassignedCohortIds(progId);
    const allCohorts = cohorts.filter(c => c.program_id === progId);
    for (const c of allCohorts) {
      for (const p of allParticipants[c.id] ?? []) {
        if (p.status === "withdrawn") continue;
        if (seen.has(p.user_id)) continue;
        seen.add(p.user_id);
        out.push({ ...p, cohortId: unassignedIds.has(c.id) ? "" : c.id });
      }
    }
    return out;
  }

  // No explicit choice yet (selProgId === null) defaults to "All Programs",
  // same as picking the ALL_PROGRAMS pill - a specific program is only shown
  // once the user actually clicks it.
  const isAllPrograms = selProgId === ALL_PROGRAMS || selProgId === null;
  const activeProg = (!isAllPrograms ? programs.find(p => p.id === selProgId) : null) ?? null;
  const realCohorts = cohorts.filter(c => !isUnassignedCohort(c));
  const totalEnrolled = cohorts.reduce((a, c) => a + c.enrolled_count, 0);
  const totalCohorts = realCohorts.length;
  const allParticipantsList = Object.values(allParticipants).flat().filter(p => p.status !== "withdrawn");
  const atRiskTotal = allParticipantsList.filter(p => p.risk_level === "high").length;

  const progParticipants = activeProg ? participantsForProg(activeProg.id) : [];
  const progCohorts = activeProg ? cohortsForProg(activeProg.id) : [];
  const unassigned = progParticipants.filter(p => !p.cohortId);
  const cohortColor = (i: number) => COHORT_COLORS[i % COHORT_COLORS.length];

  // AI Cohort Pulse - real LLM-generated insight, fetched whenever the active
  // program changes. Falls back to a locally-derived line (rendered below) if
  // the AI call fails or no program is selected.
  useEffect(() => {
    if (!activeProg) { setAiPulse(null); return; }
    let alive = true;
    setAiPulseLoading(true);
    setAiPulse(null);
    cohortsApi.aiPulse(activeProg.id)
      .then(r => { if (alive) setAiPulse(r.data?.insight ?? null); })
      .catch(() => { if (alive) setAiPulse(null); })
      .finally(() => { if (alive) setAiPulseLoading(false); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProg?.id]);

  // Group a program's cohorts by their "session" label (description) for the
  // session-grouped card layout.
  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Poppins, sans-serif", overflowY: "auto" }}>

      {/* KPI stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        {[
          { label: "Total Programs",       value: programs.length, sub: "with cohort groups",   color: C.navy,   icon: "▤" },
          { label: "Total Enrolled",       value: totalEnrolled,   sub: "across all programs",  color: C.orange, icon: "◇" },
          { label: "Total Cohorts",        value: totalCohorts,    sub: "active sub-groups",    color: C.indigo, icon: "◈" },
          { label: "Participants At Risk", value: atRiskTotal,     sub: "need immediate action",color: C.red,    icon: "✦" },
        ].map((s, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, padding: "16px 18px", boxShadow: "0 1px 4px rgba(24, 40, 72,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
              <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>{s.label}</div>
              <span style={{ fontSize: 16, opacity: 0.3, color: s.color }}>{s.icon}</span>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color, marginBottom: 4 }}>{s.value}</div>
            <div style={{ fontSize: 10, color: C.muted }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* AI Cohort Pulse */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, background: "linear-gradient(135deg,var(--xa-navy),#2d3a7c)", borderRadius: 12, padding: "14px 20px", color: "#fff" }}>
        <span style={{ fontSize: 16, marginTop: 1, flexShrink: 0 }}>✦</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 3 }}>AI Cohort Pulse</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.65 }}>
            {activeProg
              ? aiPulseLoading
                ? "Thinking…"
                : aiPulse
                ?? `${activeProg.title} has ${unassigned.length} unassigned participant(s). Use Randomize or Manual allocation to balance cohort loads.`
              : isAllPrograms
              ? `Viewing ${totalCohorts} cohort(s) across ${programs.length} program(s). Select a program to allocate participants.`
              : "Create a program and cohorts to start allocating participants."}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
        <button
          onClick={() => {
            // No specific program selected (e.g. default "All Programs" view) -
            // fall back to the first available program instead of leaving the
            // button dead, so the wizard always has a target to create cohorts under.
            const target = activeProg ?? programs[0];
            if (target) {
              setSelProgId(target.id);
              setWizardProgram(target);
            }
          }}
          disabled={programs.length === 0}
          style={{ ...S.primBtn, opacity: programs.length === 0 ? 0.5 : 1 }}
        >+ Create Cohort</button>
      </div>

      {loading && <div style={{ padding: "32px 0", textAlign: "center", fontSize: 13, color: C.muted }}>Loading cohorts...</div>}

      {/* Program selector (only when >1 program) - "All Programs" shows every
          program's cohorts grouped by program, instead of forcing one program
          to be picked before anything renders. Small program counts keep the
          pill row (quick at-a-glance switching); once it would render more
          pills than PROGRAM_PILL_THRESHOLD, swap to a searchable dropdown so
          orgs with 40-50 programs get a scannable list instead of a wall of
          tiny buttons. */}
      {!loading && programs.length > 1 && (
        programs.length > PROGRAM_PILL_THRESHOLD ? (
          <ProgramFilterDropdown
            programs={programs}
            selectedId={isAllPrograms ? null : (activeProg?.id ?? null)}
            onSelect={(id) => { setSelProgId(id ?? ALL_PROGRAMS); setSelCohortId(null); }}
            countFor={(progId) => cohortsForProg(progId).length}
            totalCount={totalCohorts}
          />
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => { setSelProgId(ALL_PROGRAMS); setSelCohortId(null); }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 16px", border: `1.5px solid ${isAllPrograms ? C.navy : C.border}`, borderRadius: 10, background: isAllPrograms ? `${C.navy}0d` : "#fff", cursor: "pointer", fontFamily: "Poppins, sans-serif" }}>
              <span style={{ fontSize: 12, fontWeight: isAllPrograms ? 700 : 400, color: isAllPrograms ? C.navy : C.muted, whiteSpace: "nowrap" }}>All Programs</span>
              <span style={{ fontSize: 10, background: isAllPrograms ? `${C.navy}22` : C.bg, color: isAllPrograms ? C.navy : C.muted, borderRadius: 99, padding: "1px 7px", fontWeight: 700 }}>{totalCohorts}</span>
            </button>
            {programs.map((p) => {
              const active = !isAllPrograms && activeProg?.id === p.id;
              const col = progColor(p);
              return (
                <button key={p.id} onClick={() => { setSelProgId(p.id); setSelCohortId(null); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 16px", border: `1.5px solid ${active ? col : C.border}`, borderRadius: 10, background: active ? `${col}0d` : "#fff", cursor: "pointer", fontFamily: "Poppins, sans-serif" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: col, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: active ? 700 : 400, color: active ? col : C.muted, whiteSpace: "nowrap" }}>{p.title.split("-")[0].trim()}</span>
                  <span style={{ fontSize: 10, background: active ? `${col}22` : C.bg, color: active ? col : C.muted, borderRadius: 99, padding: "1px 7px", fontWeight: 700 }}>{cohortsForProg(p.id).length}</span>
                </button>
              );
            })}
          </div>
        )
      )}

      {!loading && !isAllPrograms && !activeProg && (
        <div style={{ padding: 48, textAlign: "center", color: C.muted, fontSize: 13, background: "#fff", borderRadius: 12, border: `1px solid ${C.border}` }}>No programs found. Create a program first.</div>
      )}

      {/* Program header row */}
      {!loading && activeProg && (() => {
        const col = progColor(activeProg);
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 16px", background: "#F9FAFB", borderRadius: 10, border: `1px solid ${C.border}` }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: col, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{activeProg.title}</span>
              <span style={{ fontSize: 11, color: C.muted, marginLeft: 12 }}>
                {activeProg.duration_weeks ? `${activeProg.duration_weeks} weeks` : ""}
                {activeProg.phase_count > 0 ? ` · ${activeProg.phase_count} phases` : ""}
              </span>
            </div>
            <span style={{ fontSize: 11, background: "rgba(34,197,94,0.1)", color: C.green, borderRadius: 10, padding: "3px 10px", fontWeight: 700 }}>{activeProg.status.toUpperCase()}</span>
            <span style={{ fontSize: 11, color: C.muted }}>{progParticipants.length} participants · {progCohorts.length} cohorts · {unassigned.length} unassigned</span>
          </div>
        );
      })()}

      {/* Cohort cards - flat list, not grouped by description (that field is
          free text a PM types per-cohort, e.g. "ss" as a shorthand note; it's
          already shown inside each card below and shouldn't double as an
          implicit section header - a cohort with no special description
          shouldn't split into its own surprise category). */}
      {!loading && activeProg && progCohorts.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.navy, letterSpacing: 0.5 }}>COHORTS</div>
            <div style={{ flex: 1, height: 1, background: C.border }} />
            <div style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>
              {progCohorts.length} cohort{progCohorts.length !== 1 ? "s" : ""} · {progParticipants.filter(p => p.cohortId).length} participants
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14 }}>
            {progCohorts.map((c, ci) => {
              const members = progParticipants.filter(p => p.cohortId === c.id);
              const isSel = selCohortId === c.id;
              const col = cohortColor(ci);
              return (
                <div key={c.id} onClick={() => setSelCohortId(isSel ? null : c.id)}
                  style={{ background: "#fff", borderRadius: 12, border: `2px solid ${isSel ? col : C.border}`, boxShadow: "0 1px 4px rgba(24, 40, 72,0.06)", cursor: "pointer", overflow: "hidden" }}>
                  <div style={{ background: `${col}12`, borderBottom: `1px solid ${col}22`, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div><div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 2 }}>{c.name}</div><div style={{ fontSize: 10, color: C.muted }}>{c.description || ""}</div></div>
                    <div style={{ width: 38, height: 38, borderRadius: 10, background: `${col}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: col, flexShrink: 0 }}>{members.length}</div>
                  </div>
                  <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex" }}>
                      {members.slice(0, 5).map((m, mi) => (
                        <div key={mi} style={{ width: 26, height: 26, borderRadius: "50%", background: col, color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff", marginLeft: mi > 0 ? -8 : 0, flexShrink: 0 }}>{initials(m.name)}</div>
                      ))}
                      {members.length > 5 && <div style={{ width: 26, height: 26, borderRadius: "50%", background: C.bg, color: C.muted, fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff", marginLeft: -8 }}>+{members.length - 5}</div>}
                    </div>
                    <span style={{ fontSize: 11, color: col, fontWeight: 700 }}>{isSel ? "Hide ↑" : "View →"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Unassigned participants */}
      {!loading && activeProg && unassigned.length > 0 && (
        <div style={{ background: "rgba(200, 168, 96,0.04)", borderRadius: 12, border: "2px dashed rgba(200, 168, 96,0.3)", padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.orange }}>⚠️ Unassigned Participants</span>
            <span style={{ fontSize: 10, background: "rgba(200, 168, 96,0.1)", color: C.orange, borderRadius: 99, padding: "2px 8px", fontWeight: 700 }}>{unassigned.length}</span>
          </div>
          <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.55 }}>These participants are enrolled in <strong style={{ color: C.navy }}>{activeProg.title}</strong> but not yet assigned to a cohort.</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{unassigned.map((p, i) => <span key={i} style={{ fontSize: 10, background: "rgba(200, 168, 96,0.08)", color: C.orange, borderRadius: 99, padding: "3px 10px", fontWeight: 600 }}>{p.name}</span>)}</div>
          <button onClick={() => { if (activeProg) setWizardProgram(activeProg); }} style={{ alignSelf: "flex-start", padding: "6px 14px", background: C.orange, border: "none", borderRadius: 8, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "Poppins, sans-serif" }}>Assign via Cohort Wizard →</button>
        </div>
      )}

      {/* Selected cohort - participant table */}
      {!loading && activeProg && selCohortId && (() => {
        const cohort = progCohorts.find(c => c.id === selCohortId);
        const ci = progCohorts.findIndex(c => c.id === selCohortId);
        const members = progParticipants.filter(p => p.cohortId === selCohortId);
        if (!cohort) return null;
        const col = cohortColor(ci);
        return (
          <div style={{ background: "#fff", borderRadius: 12, boxShadow: "0 1px 4px rgba(24, 40, 72,0.07)", border: `1px solid ${C.border}`, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", background: `${col}0d`, borderBottom: `1px solid ${col}22`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: C.navy }}>{cohort.name} - Participants</div>
              <span style={{ fontSize: 11, color: C.muted }}>{members.length} members</span>
            </div>
            <div style={{ padding: "16px 18px" }}>
              <CohortHealthPanel cohortId={cohort.id} />
            </div>
            {members.length === 0 ? (
              <div style={{ padding: "32px 18px", textAlign: "center", color: C.muted, fontSize: 13 }}>No participants in this cohort yet.</div>
            ) : (
              <div className="xa-table-wrap">
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ background: C.bg }}>{["Participant", "Dept", "Status", "Enrolled", "Progress", "Risk", "Move to Cohort"].map(h => <th key={h} style={{ padding: "10px 16px", textAlign: "left", fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, whiteSpace: "nowrap" }}>{h}</th>)}</tr></thead>
                <tbody>{members.map((p, i) => {
                  const cc = p.completion_percent >= 60 ? C.green : p.completion_percent >= 30 ? C.amber : C.orange;
                  return (
                    <tr key={p.enrollment_id ?? i} style={{ borderTop: `1px solid ${C.bg}` }}>
                      <td style={{ padding: "11px 16px" }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><div style={{ width: 30, height: 30, borderRadius: "50%", background: col, color: "#fff", fontWeight: 700, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initials(p.name)}</div><span style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>{p.name}</span></div></td>
                      <td style={{ padding: "11px 16px", fontSize: 11, color: C.muted }}>{p.department || "-"}</td>
                      <td style={{ padding: "11px 16px" }}><Badge label={enrollmentStatusLabel(p.status)} color={enrollmentStatusColor(p.status)} /></td>
                      <td style={{ padding: "11px 16px", fontSize: 11, color: C.muted }}>{p.enrolled_at ? new Date(p.enrolled_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "-"}</td>
                      <td style={{ padding: "11px 16px", minWidth: 130 }}><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ flex: 1, height: 5, background: "#EFE9DC", borderRadius: 99 }}><div style={{ height: "100%", width: `${p.completion_percent}%`, background: cc, borderRadius: 99 }} /></div><span style={{ fontSize: 11, fontWeight: 700, color: C.navy, minWidth: 30 }}>{Math.round(p.completion_percent)}%</span></div></td>
                      <td style={{ padding: "11px 16px" }}><Badge label={riskLabel(p.risk_level)} color={riskColor(p.risk_level)} /></td>
                      <td style={{ padding: "11px 16px" }}><MoveToCohortSelect participant={p} currentCohortId={p.cohortId} cohorts={progCohorts} onMoved={loadAll} /></td>
                    </tr>
                  );
                })}</tbody>
              </table>
              </div>
            )}
          </div>
        );
      })()}

      {/* All Programs - every program's cohorts, grouped by program, read-only
          overview (no cohort selection/participant table drill-down here;
          pick a specific program pill for that). */}
      {!loading && isAllPrograms && (
        programs.length === 0 ? (
          <div style={{ padding: 48, textAlign: "center", color: C.muted, fontSize: 13, background: "#fff", borderRadius: 12, border: `1px solid ${C.border}` }}>No programs found. Create a program first.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {programs.map((p) => {
              const col = progColor(p);
              const pCohorts = cohortsForProg(p.id);
              const pParticipants = participantsForProg(p.id);
              if (pCohorts.length === 0) return null;
              return (
                <div key={p.id} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 16px", background: "#F9FAFB", borderRadius: 10, border: `1px solid ${C.border}` }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: col, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: C.navy }}>{p.title}</span>
                    <span style={{ fontSize: 11, color: C.muted }}>{pParticipants.length} participants · {pCohorts.length} cohorts</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(260px,1fr))", gap: 14 }}>
                    {pCohorts.map((c, ci) => {
                      const members = pParticipants.filter(pt => pt.cohortId === c.id);
                      const mcol = cohortColor(ci);
                      return (
                        <button key={c.id} onClick={() => { setSelProgId(p.id); setSelCohortId(c.id); }}
                          style={{ textAlign: "left", background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(24, 40, 72,0.06)", cursor: "pointer", overflow: "hidden", fontFamily: "Poppins, sans-serif" }}>
                          <div style={{ background: `${mcol}12`, borderBottom: `1px solid ${mcol}22`, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div><div style={{ fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 2 }}>{c.name}</div><div style={{ fontSize: 10, color: C.muted }}>{c.description || ""}</div></div>
                            <div style={{ width: 38, height: 38, borderRadius: 10, background: `${mcol}22`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 800, color: mcol, flexShrink: 0 }}>{members.length}</div>
                          </div>
                          <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex" }}>
                              {members.slice(0, 5).map((m, mi) => (
                                <div key={mi} style={{ width: 26, height: 26, borderRadius: "50%", background: mcol, color: "#fff", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff", marginLeft: mi > 0 ? -8 : 0, flexShrink: 0 }}>{initials(m.name)}</div>
                              ))}
                              {members.length > 5 && <div style={{ width: 26, height: 26, borderRadius: "50%", background: C.bg, color: C.muted, fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff", marginLeft: -8 }}>+{members.length - 5}</div>}
                            </div>
                            <span style={{ fontSize: 11, color: mcol, fontWeight: 700 }}>View →</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {programs.every((p) => cohortsForProg(p.id).length === 0) && (
              <div style={{ padding: 48, textAlign: "center", color: C.muted, fontSize: 13, background: "#fff", borderRadius: 12, border: `1px solid ${C.border}` }}>No cohorts found across any program yet.</div>
            )}
          </div>
        )
      )}

      {/* Modals */}
      {nudgeTarget && (
        <NudgeModal
          cohortId={nudgeTarget.cohortId}
          participant={nudgeTarget.participant}
          onClose={() => setNudgeTarget(null)}
        />
      )}
      {wizardProgram && (
        <SetupCohortsWizard
          orgId={wizardProgram.org_id}
          program={wizardProgram}
          existingCohortCount={cohortsForProg(wizardProgram.id).length}
          participants={participantsForProg(wizardProgram.id).filter(p => p.status !== "withdrawn" && p.status !== "invited")}
          onClose={() => setWizardProgram(null)}
          onDone={() => { setWizardProgram(null); setSelProgId(wizardProgram.id); loadAll(); }}
        />
      )}
    </div>
  );
}
