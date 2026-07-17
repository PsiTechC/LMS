"use client";

import { useEffect, useState } from "react";
import ReactDOM from "react-dom";
import { PhaseType, ActivityFacultyDTO, ConflictDTO, OrgFacultyMember, ScheduledSessionDTO, programsApi } from "@/lib/programs-api";
import { contentApi, AssetDTO } from "@/lib/content-api";
import { cohortsApi, CohortDTO, ParticipantDTO, PoolParticipantDTO } from "@/lib/cohorts-api";
import { UPLOAD_ONLY_TYPES, QUESTION_SET_TYPES } from "@/components/content/ContentLibrary";
import QuestionBuilderModal from "@/components/content/QuestionBuilderModal";
import UploadOnlyModal from "@/components/content/UploadOnlyModal";
import OthersModal from "@/components/content/OthersModal";
import CaseStudyModal from "@/components/content/CaseStudyModal";

// ─── Shared tokens (mirrors PMDesignStudio.tsx) ─────────────────────────────
const C = {
  navy: "#1C2551", orange: "#EF4E24", indigo: "#6B73BF",
  green: "#22c55e", page: "#F5F7FB", card: "#FFFFFF",
  border: "#EAECF4", muted: "#8b90a7", inactive: "#D0D3E0",
};
const inp: React.CSSProperties = { border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", fontSize: 12, fontFamily: "Poppins,sans-serif", color: C.navy, boxSizing: "border-box", outline: "none", width: "100%" };
const lbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: 0.5, display: "block", marginBottom: 4 };

// UnitInput — a number input with a fixed suffix ("min", "%", "attempts")
// rendered inside the field instead of a bare browser <input type=number>.
// Native spinner arrows are suppressed (they eat width and add visual noise
// in a narrow 3-across grid) — the min/max/step still work via keyboard and
// scroll, just without the stepper buttons cluttering a 1fr column.
function UnitInput({ value, onChange, min, max, unit, placeholder }: {
  value: number; onChange: (v: number) => void; min: number; max?: number; unit: string; placeholder?: string;
}) {
  return (
    <div style={{ position: "relative" }}>
      <input
        type="number" min={min} max={max} value={value} placeholder={placeholder}
        onChange={e => {
          const raw = +e.target.value || 0;
          const clamped = max != null ? Math.min(max, Math.max(min, raw)) : Math.max(min, raw);
          onChange(clamped);
        }}
        style={{ ...inp, paddingRight: 40 }}
        className="xa-unit-input"
      />
      <span style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", fontSize: 11, fontWeight: 600, color: C.muted, pointerEvents: "none" }}>{unit}</span>
    </div>
  );
}

function Portal({ children }: { children: React.ReactNode }) {
  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(children, document.body);
}
function Overlay({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins,sans-serif" }}>
      {children}
    </div>
  );
}
function CloseBtn({ onClick }: { onClick: () => void }) {
  return <button onClick={onClick} style={{ width: 26, height: 26, border: `1px solid ${C.border}`, borderRadius: "50%", background: "#fff", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, flexShrink: 0 }}>✕</button>;
}

// ─── Phase type definitions (matches elev8-reference.jsx DS_PHASE_TYPES) ────
export const DS_PHASE_TYPES: { type: PhaseType; label: string; color: string; icon: string; defaultDays: number; deliveryMode?: string }[] = [
  { type: "pre-enrolment", label: "Pre-Enrolment", color: "#6B73BF", icon: "◎", defaultDays: 14 },
  { type: "orientation", label: "Orientation", color: "#1C2551", icon: "◈", defaultDays: 7 },
  { type: "module-virtual", label: "Module · Virtual", color: "#EF4E24", icon: "⬡", defaultDays: 3, deliveryMode: "virtual" },
  { type: "module-in-person", label: "Module · In-Person", color: "#1C2551", icon: "⬡", defaultDays: 3, deliveryMode: "in-person" },
  { type: "coaching", label: "Group Coaching", color: "#EF4E24", icon: "○", defaultDays: 42 },
  { type: "capstone", label: "Capstone", color: "#1C2551", icon: "▲", defaultDays: 5 },
  { type: "post-program", label: "Post Program", color: "#22c55e", icon: "◆", defaultDays: 60 },
];

export const DS_ACTIVITY_PHASE_TYPES: PhaseType[] = ["pre-enrolment", "post-program"];
export const DS_MODULE_PHASE_TYPES: PhaseType[] = ["module-virtual", "module-in-person"];
export function isActivityPhase(t: PhaseType) { return DS_ACTIVITY_PHASE_TYPES.includes(t); }
export function isModulePhase(t: PhaseType) { return DS_MODULE_PHASE_TYPES.includes(t); }

// ─── Element types (matches DS_ELEMENT_TYPES) ───────────────────────────────
export const DS_ELEMENT_TYPES = [
  { type: "coaching", label: "Coaching", icon: "◇", color: "#6B73BF", activityType: "coaching" },
  { type: "quiz", label: "Quiz", icon: "✦", color: "#6B73BF", activityType: "assessment" },
  { type: "elearning", label: "eLearning Module", icon: "▤", color: "#1C2551", activityType: "content" },
  { type: "assessment", label: "Assessment", icon: "◎", color: "#EF4E24", activityType: "assessment" },
  { type: "video", label: "Video", icon: "▶", color: "#1C2551", activityType: "video" },
  { type: "case-study", label: "Case Study", icon: "◈", color: "#6B73BF", activityType: "case_study" },
  { type: "360", label: "360° Feedback", icon: "◇", color: "#EF4E24", activityType: "peer_review" },
  { type: "l1-feedback", label: "L1 · Reaction", icon: "≡", color: "#22c55e", activityType: "survey" },
  { type: "l2-feedback", label: "L2 · Learning", icon: "≡", color: "#22c55e", activityType: "survey" },
  { type: "l3-feedback", label: "L3 · Behaviour", icon: "≡", color: "#22c55e", activityType: "survey" },
  { type: "l4-feedback", label: "L4 · Impact", icon: "≡", color: "#22c55e", activityType: "survey" },
  { type: "survey", label: "Survey", icon: "≡", color: "#8b90a7", activityType: "survey" },
  { type: "journal", label: "Reflection Journal", icon: "◈", color: "#8b90a7", activityType: "journal" },
  { type: "certificate", label: "Certificate", icon: "🏆", color: "#f59e0b", activityType: "assignment" },
] as const;
export type ElementType = typeof DS_ELEMENT_TYPES[number]["type"];
export function elMeta(type: string) { return DS_ELEMENT_TYPES.find(e => e.type === type) || { type, label: type, icon: "◈", color: "#8b90a7", activityType: "video" }; }

// Only these element types browse/create against the real Content Library.
// The key is the DS element type; the value is the content_assets asset_type
// it maps to (used both to LIST matching assets and to route the create modal).
const CONTENT_ASSET_TYPE: Partial<Record<string, string>> = {
  quiz: "quiz", elearning: "elearning", assessment: "assessment", video: "video",
  survey: "survey", "case-study": "case_study",
};
export function isConfigurable(type: string) { return type in CONTENT_ASSET_TYPE; }

// ─── Activity-phase presets (matches DS_ACTIVITY_PRESETS) ───────────────────
export const DS_ACTIVITY_PRESETS: Record<string, { title: string; color: string }[]> = {
  "pre-enrolment": [
    { title: "Nomination", color: "#6B73BF" },
    { title: "Participant Enrolment", color: "#6B73BF" },
    { title: "Welcome Email", color: "#1C2551" },
    { title: "Manager Briefing", color: "#EF4E24" },
    { title: "Pre-Program Survey", color: "#EF4E24" },
    { title: "Psychometric Assessment", color: "#22c55e" },
    { title: "Programme Agreement", color: "#22c55e" },
  ],
  "post-program": [
    { title: "L4 Impact Survey", color: "#22c55e" },
    { title: "30-Day Check-in", color: "#6B73BF" },
    { title: "60-Day Check-in", color: "#6B73BF" },
    { title: "90-Day Check-in", color: "#6B73BF" },
    { title: "End 360° Review", color: "#EF4E24" },
    { title: "Alumni Network", color: "#1C2551" },
    { title: "ROI Report", color: "#1C2551" },
  ],
};

// ─── Workflow configs (matches DS_WORKFLOW_CONFIGS) ─────────────────────────
export interface WorkflowFieldDef { key: string; label: string; required?: boolean; placeholder?: string; type?: string; }
export interface WorkflowConfigDef {
  icon: string; color: string; desc: string;
  itemLabel?: string; itemPlural?: string; fields?: WorkflowFieldDef[];
  hasEmailEditor?: boolean; configFields?: WorkflowFieldDef[];
}
export const DS_WORKFLOW_CONFIGS: Record<string, WorkflowConfigDef> = {
  "Nomination": {
    icon: "🏷", color: "#6B73BF", desc: "Track nominations for the program",
    itemLabel: "Nominee", itemPlural: "Nominees",
    fields: [
      { key: "name", label: "Full Name", required: true, placeholder: "Employee name" },
      { key: "dept", label: "Department", placeholder: "e.g. Strategy" },
      { key: "manager", label: "Nominated by", placeholder: "Manager name" },
    ],
  },
  "Welcome Email": {
    icon: "📧", color: "#1C2551", desc: "Configure the participant welcome email",
    hasEmailEditor: true,
    configFields: [
      { key: "subject", label: "Subject Line", placeholder: "Welcome to the Program!" },
      { key: "sendDate", label: "Scheduled Send", type: "date" },
      { key: "sender", label: "From Name", placeholder: "Program Team" },
      { key: "replyTo", label: "Reply-To Email", placeholder: "programs@company.com" },
    ],
  },
  "Manager Briefing": {
    icon: "🤝", color: "#EF4E24", desc: "Schedule manager briefing sessions",
    itemLabel: "Session", itemPlural: "Sessions",
    fields: [
      { key: "date", label: "Date", type: "date", required: true },
      { key: "time", label: "Time", placeholder: "10:00 AM" },
      { key: "location", label: "Location / Link", placeholder: "HQ Conf Room A" },
      { key: "capacity", label: "Capacity", placeholder: "20" },
    ],
  },
  "Pre-Program Survey": {
    icon: "📋", color: "#EF4E24", desc: "Set up the pre-program diagnostic survey",
    configFields: [
      { key: "link", label: "Survey Link", placeholder: "https://forms.example.com/..." },
      { key: "platform", label: "Platform", placeholder: "e.g. SurveyMonkey, Typeform" },
      { key: "openDate", label: "Open Date", type: "date" },
      { key: "closeDate", label: "Close Date", type: "date" },
    ],
  },
  "Psychometric Assessment": {
    icon: "🧠", color: "#22c55e", desc: "Configure the psychometric baseline assessment",
    configFields: [
      { key: "tool", label: "Assessment Tool", placeholder: "e.g. DiSC, MBTI, 16PF" },
      { key: "provider", label: "Provider / Vendor", placeholder: "e.g. Thomas International" },
      { key: "link", label: "Assessment Portal", placeholder: "https://..." },
      { key: "deadline", label: "Completion Deadline", type: "date" },
    ],
  },
  "Programme Agreement": {
    icon: "📝", color: "#22c55e", desc: "Manage learning contracts and agreements",
    configFields: [
      { key: "docName", label: "Document Title", placeholder: "Learning Contract 2026" },
      { key: "version", label: "Version", placeholder: "v1.0" },
      { key: "docLink", label: "Document Link", placeholder: "https://drive.example.com/..." },
      { key: "deadline", label: "Signing Deadline", type: "date" },
    ],
  },
};

// ══════════════════════════════════════════════════════════════════════════
// DSDateModal — add a new phase (choose dates, label, delivery mode)
// ══════════════════════════════════════════════════════════════════════════
export interface DateModalState { phaseType: typeof DS_PHASE_TYPES[number]; startDate: string; endDate: string; }
export function DSDateModal({ modal, onClose, onConfirm }: {
  modal: DateModalState; onClose: () => void;
  onConfirm: (pt: typeof DS_PHASE_TYPES[number], start: string, end: string, mode: string, label: string) => void;
}) {
  const pt = modal.phaseType;
  const [startDate, setStart] = useState(modal.startDate || "");
  const [endDate, setEnd] = useState(modal.endDate || "");
  const [label, setLabel] = useState(pt.label);
  const [mode, setMode] = useState("virtual");
  const showMode = pt.type === "orientation" || pt.type === "coaching";
  return (
    <Portal><Overlay onClose={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.22)" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 7, background: pt.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12 }}>{pt.icon}</div>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>Add {pt.label}</span>
          </div>
          <CloseBtn onClick={onClose} />
        </div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div><label style={lbl}>PHASE LABEL</label><input value={label} onChange={e => setLabel(e.target.value)} style={inp} placeholder={pt.label} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={lbl}>START DATE</label><input type="date" value={startDate} onChange={e => setStart(e.target.value)} style={inp} /></div>
            <div><label style={lbl}>END DATE</label><input type="date" value={endDate} onChange={e => setEnd(e.target.value)} style={inp} /></div>
          </div>
          {showMode && (
            <div>
              <label style={lbl}>DELIVERY MODE</label>
              <div style={{ display: "flex", gap: 6 }}>
                {(["virtual", "in-person"] as const).map(v => (
                  <button key={v} onClick={() => setMode(v)} style={{ flex: 1, padding: 8, border: `1.5px solid ${mode === v ? pt.color : C.border}`, borderRadius: 8, background: mode === v ? pt.color + "0C" : "#fff", cursor: "pointer", fontSize: 11, fontWeight: mode === v ? 700 : 400, color: mode === v ? pt.color : C.muted, fontFamily: "Poppins,sans-serif" }}>
                    {v === "virtual" ? "🌐 Virtual Session" : "🏛 In-Person Classroom"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.muted, fontFamily: "Poppins,sans-serif" }}>Cancel</button>
          <button disabled={!startDate || !endDate} onClick={() => { if (startDate && endDate) onConfirm(pt, startDate, endDate, mode, label); }} style={{ padding: "8px 20px", background: startDate && endDate ? pt.color : C.inactive, border: "none", borderRadius: 8, cursor: startDate && endDate ? "pointer" : "default", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif" }}>Add Phase →</button>
        </div>
      </div>
    </Overlay></Portal>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// DSPhaseEditModal — edit phase label/dates/delivery mode
// ══════════════════════════════════════════════════════════════════════════
export interface PhaseEditTarget {
  id: string; label: string; startDate: string; endDate: string; deliveryMode: string; icon: string; color: string;
  // Neighboring phases' dates (undefined at either end of the timeline) —
  // phases are modeled sequentially (see capturePhaseGaps/recomputePhaseDates
  // in PMDesignStudio.tsx), so this phase's start must not precede the
  // previous phase's end, and its end must not run past the next phase's
  // start. Without this check the PM could set e.g. Phase 1 ending 18 Jul
  // and Phase 2 starting 16 Jul — two phases overlapping/running out of
  // order, which the rest of the timeline UI assumes never happens.
  prevPhaseEnd?: string; nextPhaseStart?: string; prevPhaseLabel?: string; nextPhaseLabel?: string;
}
export function DSPhaseEditModal({ phase, onClose, onSave }: { phase: PhaseEditTarget; onClose: () => void; onSave: (id: string, u: { label: string; startDate: string; endDate: string; deliveryMode: string }) => void }) {
  const [label, setLabel] = useState(phase.label);
  const [start, setStart] = useState(phase.startDate);
  const [end, setEnd] = useState(phase.endDate);
  const [mode, setMode] = useState(phase.deliveryMode || "virtual");
  // A phase ending before it starts is never valid — block it here rather
  // than letting it silently save and produce an inverted/negative-duration
  // phase (dbw()'s Math.round would then compute a negative day count).
  let dateError = "";
  if (start && end && end < start) dateError = "End date can't be before the start date.";
  else if (start && phase.prevPhaseEnd && start < phase.prevPhaseEnd) dateError = `Start date can't be before "${phase.prevPhaseLabel ?? "the previous phase"}" ends (${phase.prevPhaseEnd}).`;
  else if (end && phase.nextPhaseStart && end > phase.nextPhaseStart) dateError = `End date can't be after "${phase.nextPhaseLabel ?? "the next phase"}" starts (${phase.nextPhaseStart}).`;
  const canSave = label.trim().length > 0 && !dateError;
  return (
    <Portal><Overlay onClose={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.22)" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: 6, background: phase.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11 }}>{phase.icon}</div>
            <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>Edit Phase</span>
          </div>
          <CloseBtn onClick={onClose} />
        </div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div><label style={lbl}>PHASE LABEL</label><input value={label} onChange={e => setLabel(e.target.value)} style={inp} /></div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={lbl}>START DATE</label><input type="date" value={start} min={phase.prevPhaseEnd || undefined} onChange={e => setStart(e.target.value)} style={{ ...inp, border: dateError ? "1px solid #ef4444" : inp.border }} /></div>
            <div><label style={lbl}>END DATE</label><input type="date" value={end} min={start || undefined} max={phase.nextPhaseStart || undefined} onChange={e => setEnd(e.target.value)} style={{ ...inp, border: dateError ? "1px solid #ef4444" : inp.border }} /></div>
          </div>
          {dateError && <div style={{ fontSize: 11, color: "#ef4444", fontWeight: 600, marginTop: -6 }}>⚠ {dateError}</div>}
          {(phase.prevPhaseEnd || phase.nextPhaseStart) && !dateError && (
            <div style={{ fontSize: 10, color: C.muted, marginTop: -6 }}>
              {phase.prevPhaseEnd ? `Must start on/after ${phase.prevPhaseEnd}` : ""}
              {phase.prevPhaseEnd && phase.nextPhaseStart ? " · " : ""}
              {phase.nextPhaseStart ? `Must end on/before ${phase.nextPhaseStart}` : ""}
            </div>
          )}
          <div>
            <label style={lbl}>DELIVERY MODE</label>
            <div style={{ display: "flex", gap: 6 }}>
              {(["virtual", "in-person", "none"] as const).map(v => (
                <button key={v} onClick={() => setMode(v)} style={{ flex: 1, padding: 7, border: `1.5px solid ${mode === v ? phase.color : C.border}`, borderRadius: 8, background: mode === v ? phase.color + "0C" : "#fff", cursor: "pointer", fontSize: 10, fontWeight: mode === v ? 700 : 400, color: mode === v ? phase.color : C.muted, fontFamily: "Poppins,sans-serif" }}>
                  {v === "virtual" ? "🌐 Virtual" : v === "in-person" ? "🏛 In-Person" : "None"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.muted, fontFamily: "Poppins,sans-serif" }}>Cancel</button>
          <button disabled={!canSave} onClick={() => canSave && onSave(phase.id, { label, startDate: start, endDate: end, deliveryMode: mode === "none" ? "" : mode })} style={{ padding: "8px 20px", background: canSave ? C.orange : C.inactive, border: "none", borderRadius: 8, cursor: canSave ? "pointer" : "default", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif" }}>Save Changes</button>
        </div>
      </div>
    </Overlay></Portal>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// DSModuleModal — add a module to a module-type phase
// ══════════════════════════════════════════════════════════════════════════
export function DSModuleModal({ phaseColor, onClose, onAdd }: { phaseColor: string; onClose: () => void; onAdd: (data: { title: string; type: "virtual" | "in-person"; date: string }) => void }) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"virtual" | "in-person">("virtual");
  const [date, setDate] = useState("");
  const submit = () => { if (title.trim()) onAdd({ title: title.trim(), type, date }); };
  return (
    <Portal><Overlay onClose={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 380, overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.22)" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>Add Module</span>
          <CloseBtn onClick={onClose} />
        </div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={lbl}>MODULE TITLE</label>
            <input autoFocus value={title} onChange={e => setTitle(e.target.value)} style={inp} placeholder="e.g. Self-Leadership Session" onKeyDown={e => e.key === "Enter" && submit()} />
          </div>
          <div>
            <label style={lbl}>DELIVERY MODE</label>
            <div style={{ display: "flex", gap: 6 }}>
              {(["virtual", "in-person"] as const).map(v => (
                <button key={v} onClick={() => setType(v)} style={{ flex: 1, padding: 8, border: `1.5px solid ${type === v ? phaseColor : C.border}`, borderRadius: 8, background: type === v ? phaseColor + "0C" : "#fff", cursor: "pointer", fontSize: 11, fontWeight: type === v ? 700 : 400, color: type === v ? phaseColor : C.muted, fontFamily: "Poppins,sans-serif" }}>
                  {v === "virtual" ? "🌐 Virtual Session" : "🏛 In-Person Classroom"}
                </button>
              ))}
            </div>
          </div>
          <div><label style={lbl}>SESSION DATE <span style={{ fontWeight: 400 }}>(optional)</span></label><input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} /></div>
        </div>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.muted, fontFamily: "Poppins,sans-serif" }}>Cancel</button>
          <button disabled={!title.trim()} onClick={submit} style={{ padding: "8px 20px", background: title.trim() ? phaseColor : C.inactive, border: "none", borderRadius: 8, cursor: title.trim() ? "pointer" : "default", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif" }}>Add Module →</button>
        </div>
      </div>
    </Overlay></Portal>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// DSElementModal — element type picker for a module's pre/post slot
// ══════════════════════════════════════════════════════════════════════════
export function DSElementModal({ initialSlot, moduleName, initialQuery, onClose, onAdd }: {
  initialSlot: "pre" | "post"; moduleName?: string; initialQuery?: string; onClose: () => void;
  onAdd: (slot: "pre" | "post", el: typeof DS_ELEMENT_TYPES[number]) => void;
}) {
  const [slot, setSlot] = useState<"pre" | "post">(initialSlot);
  const [q, setQ] = useState(initialQuery ?? "");
  const els = DS_ELEMENT_TYPES.filter(e => !q || e.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <Portal><Overlay onClose={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 540, maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.22)" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>Add Activity Element</div>
            {moduleName && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>for: {moduleName}</div>}
          </div>
          <CloseBtn onClick={onClose} />
        </div>
        <div style={{ padding: "10px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.muted, flexShrink: 0 }}>ATTACH TO:</span>
          {([["pre", "PRE-WORK", "#6B73BF"], ["post", "POST-WORK", "#EF4E24"]] as const).map(([s, l, c]) => (
            <button key={s} onClick={() => setSlot(s)} style={{ padding: "4px 14px", border: `1.5px solid ${slot === s ? c : C.border}`, borderRadius: 20, background: slot === s ? c + "12" : "#fff", cursor: "pointer", fontSize: 11, fontWeight: slot === s ? 700 : 400, color: slot === s ? c : C.muted, fontFamily: "Poppins,sans-serif" }}>{l}</button>
          ))}
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={{ marginLeft: "auto", padding: "5px 12px", border: `1px solid ${C.border}`, borderRadius: 20, fontSize: 11, fontFamily: "Poppins,sans-serif", color: C.navy, width: 140, outline: "none" }} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {els.map(el => (
              <div key={el.type} onClick={() => { onAdd(slot, el); onClose(); }}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, padding: "14px 10px", background: el.color + "08", border: `1.5px solid ${el.color}25`, borderRadius: 10, cursor: "pointer", transition: "all 0.12s" }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: el.color, color: "#fff", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>{el.icon}</div>
                <span style={{ fontSize: 11, fontWeight: 700, color: C.navy, textAlign: "center", lineHeight: 1.3 }}>{el.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Overlay></Portal>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// DSElementConfigModal — configure an element: browse real Content Library
// assets (filtered by mapped asset_type) or create one inline; set when it
// opens and is due, relative to the cohort's start date. Only called for
// isConfigurable() element types.
// ══════════════════════════════════════════════════════════════════════════
export interface ElementConfigTarget { elementType: string; elementLabel: string; moduleName: string; slot: "pre" | "post"; }
// KnowledgeCheckData is an OPTIONAL quiz attached to a content-style element
// (eLearning/video/PDF/case study). assetId points at a quiz-type content asset
// authored the same way a standalone quiz is. Threaded into config.knowledge_check.
export interface KnowledgeCheckData {
  assetId: string;
  assetTitle: string;
  timeLimitMins: number;
  attemptsAllowed: number;
  passingScorePct: number;
}
// QuizSettings is the timer/attempts/pass-score for a quiz/assessment element
// itself (as opposed to KnowledgeCheckData, which is for a quiz ATTACHED to
// some other content). Written to the activity's own top-level config
// (time_limit_mins/attempts_allowed/passing_score_pct — see assessmentCfg in
// api/internal/assessments/service.go), the same fields a knowledge_check
// carries, just not nested — this is the config a standalone Quiz/Assessment
// activity actually gets graded against.
export interface QuizSettings { timeLimitMins: number; attemptsAllowed: number; passingScorePct: number; }
export interface ElementConfigSave { assetId: string; assetTitle: string; startDay: number; dueDayOffset: number; knowledgeCheck?: KnowledgeCheckData | null; quizSettings?: QuizSettings; }

// Content-style element types that can carry an attached knowledge check.
// Excludes quiz/assessment/survey (they ARE the assessment) and certificate.
const KNOWLEDGE_CHECK_ELIGIBLE = new Set(["elearning", "video", "pdf", "case-study", "case_study"]);
export function knowledgeCheckEligible(elementType: string) { return KNOWLEDGE_CHECK_ELIGIBLE.has(elementType); }
// Element types that ARE a quiz/assessment themselves — these get the same
// Timer/Attempts/Pass Score panel, but writing directly to the activity's own
// config instead of a nested knowledge_check (see QuizSettings above).
const IS_QUIZ_ELEMENT = new Set(["quiz", "assessment"]);
export function DSElementConfigModal({ modal, orgId, existing, onClose, onSave }: {
  modal: ElementConfigTarget; orgId: string; existing?: ElementConfigSave;
  onClose: () => void; onSave: (data: ElementConfigSave) => void;
}) {
  const meta = elMeta(modal.elementType);
  const assetType = CONTENT_ASSET_TYPE[modal.elementType] ?? "video";
  const [tab, setTab] = useState<"browse" | "create">("browse");
  const [assets, setAssets] = useState<AssetDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<string | null>(existing?.assetId ?? null);
  const [q, setQ] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  // Days relative to the cohort's start date — matches the activities table's
  // start_day/due_day_offset columns exactly (server defaults: 1 / 7) so what
  // the PM sets here is what getMySurveysService actually computes "Opens"/
  // "Due" from, instead of a client-only cosmetic lock that was never saved.
  const [startDay, setStartDay] = useState(existing?.startDay ?? 1);
  const [dueDayOffset, setDueDayOffset] = useState(existing?.dueDayOffset ?? 7);

  // Optional attached Knowledge Check (content-style elements only).
  const canAttachKC = knowledgeCheckEligible(modal.elementType);
  const [kc, setKc] = useState<KnowledgeCheckData | null>(existing?.knowledgeCheck ?? null);
  const [kcPicker, setKcPicker] = useState(false);

  // Timer/Attempts/Pass Score for a standalone Quiz/Assessment element (the
  // element itself is the quiz — not the "attach a check to other content"
  // case above). Previously there was no UI for this at all: a plain Quiz/
  // Assessment activity silently ran untimed with attempts_allowed defaulting
  // to 1 server-side, with no way for a PM to change it.
  const isQuizElement = IS_QUIZ_ELEMENT.has(modal.elementType);
  const [quiz, setQuiz] = useState<QuizSettings>({
    timeLimitMins: existing?.quizSettings?.timeLimitMins ?? 0,
    attemptsAllowed: existing?.quizSettings?.attemptsAllowed ?? 1,
    passingScorePct: existing?.quizSettings?.passingScorePct ?? 0,
  });
  // First-time attach only (no existing placement config yet): pre-fill Quiz
  // Settings from the SELECTED asset's own defaults (set at creation time in
  // Content Library — see contentApi's default_time_limit_mins/etc.). A PM
  // re-opening an already-configured placement keeps whatever was explicitly
  // saved for it, never silently overwritten by the asset's defaults.
  useEffect(() => {
    if (existing || !isQuizElement || !sel) return;
    const item = assets.find(a => a.id === sel);
    if (!item) return;
    if (item.default_time_limit_mins == null && item.default_attempts_allowed == null && item.default_passing_score_pct == null) return;
    setQuiz({
      timeLimitMins: item.default_time_limit_mins ?? 0,
      attemptsAllowed: item.default_attempts_allowed ?? 1,
      passingScorePct: item.default_passing_score_pct ?? 0,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, assets]);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      if (!cancelled) setLoading(true);
      try {
        // Show both draft and active assets — the Content Library has no
        // "publish" step of its own today, so most real assets sit in draft
        // forever. Filtering to active-only made every uploaded asset invisible here.
        const r = await contentApi.list(orgId, { type: assetType });
        if (!cancelled) setAssets((r.data.assets ?? []).filter(a => a.status !== "archived"));
      } catch {
        if (!cancelled) setAssets([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId, assetType]);

  const filtered = assets.filter(a => !q || a.title.toLowerCase().includes(q.toLowerCase()));

  async function saveBrowse() {
    if (!sel) return;
    const item = assets.find(a => a.id === sel);
    if (!item) return;
    onSave({ assetId: item.id, assetTitle: item.title, startDay, dueDayOffset, knowledgeCheck: kc, quizSettings: isQuizElement ? quiz : undefined });
    onClose();
  }
  // Creating a new asset routes into the SAME real authoring modals Content
  // Library uses (manual question builder / AI generate / upload) instead of
  // a bare title-only stub — a title-only "quiz"/"survey"/"assessment" asset
  // has no question_set at all and is permanently unusable (0 questions,
  // "Not ready yet" on the participant side) with no way to fix it from here.
  function onAssetCreated(asset: AssetDTO) {
    setShowCreateModal(false);
    onSave({ assetId: asset.id, assetTitle: asset.title, startDay, dueDayOffset, knowledgeCheck: kc, quizSettings: isQuizElement ? quiz : undefined });
    onClose();
  }

  // Creating swaps to the SAME single overlay layer as browse/config (not a
  // modal stacked on top of this one) — closing it goes back to the "create"
  // tab here rather than all the way out, so the OPENS ON DAY/DUE inputs
  // below aren't lost.
  if (showCreateModal && orgId) {
    const back = () => setShowCreateModal(false);
    if (UPLOAD_ONLY_TYPES.has(assetType)) {
      return <UploadOnlyModal orgId={orgId} assetType={assetType} onClose={onClose} onBack={back} onSuccess={onAssetCreated} />;
    }
    if (QUESTION_SET_TYPES.has(assetType)) {
      return <QuestionBuilderModal orgId={orgId} assetType={assetType} onClose={back} onSuccess={onAssetCreated} />;
    }
    // Case studies get the dedicated body-text/upload builder (same one the
    // Content Library uses), not the generic Others form. Closing returns to
    // the config screen (back) so the Opens/Due settings aren't lost.
    if (assetType === "case_study") {
      return <CaseStudyModal orgId={orgId} onClose={back} onSuccess={onAssetCreated} />;
    }
    return <OthersModal orgId={orgId} assetType={assetType} assetLabel={modal.elementLabel} onClose={onClose} onSuccess={onAssetCreated} />;
  }

  // Knowledge-check picker overlay — browse/create an `assessment` quiz asset to
  // attach. Swaps to the same single overlay layer (like showCreateModal).
  if (kcPicker && orgId) {
    return (
      <KnowledgeCheckPicker
        orgId={orgId}
        existingAssetId={kc?.assetId}
        onBack={() => setKcPicker(false)}
        onClose={onClose}
        onPicked={(assetId, assetTitle) => {
          setKc(prev => ({
            assetId, assetTitle,
            timeLimitMins: prev?.timeLimitMins ?? 0,
            attemptsAllowed: prev?.attemptsAllowed ?? 1,
            passingScorePct: prev?.passingScorePct ?? 0,
          }));
          setKcPicker(false);
        }}
      />
    );
  }

  return (
    <Portal><Overlay onClose={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 520, maxHeight: "82vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.22)" }}>
        <div style={{ padding: "14px 20px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, background: meta.color + "08" }}>
          <div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>Configure activity for: <strong style={{ color: C.navy }}>{modal.moduleName}</strong> · {modal.slot === "pre" ? "PRE-WORK" : "POST-WORK"}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, display: "flex", alignItems: "center", gap: 7 }}>
              <div style={{ width: 22, height: 22, borderRadius: 6, background: meta.color, color: "#fff", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>{meta.icon}</div>
              {modal.elementLabel}
            </div>
          </div>
          <CloseBtn onClick={onClose} />
        </div>
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          {(["browse", "create"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: 10, border: "none", background: tab === t ? meta.color + "08" : "transparent", borderBottom: tab === t ? `2px solid ${meta.color}` : "2px solid transparent", cursor: "pointer", fontSize: 12, fontWeight: tab === t ? 700 : 400, color: tab === t ? meta.color : C.muted, fontFamily: "Poppins,sans-serif" }}>
              {t === "browse" ? "📚 Browse Library" : "✚ Create New"}
            </button>
          ))}
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
          {tab === "browse" && (<>
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search library…" style={{ ...inp, marginBottom: 12 }} />
            {loading && <div style={{ textAlign: "center", padding: 30, color: C.muted, fontSize: 12 }}>Loading…</div>}
            {!loading && filtered.length === 0 && (
              <div style={{ textAlign: "center", padding: "30px 20px" }}>
                <div style={{ fontSize: 24, marginBottom: 8, opacity: 0.4 }}>{meta.icon}</div>
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>
                  {q ? `No ${assetType.replace("_", " ")} assets match “${q}”.` : `No ${assetType.replace("_", " ")} assets in the Content Library yet.`}
                </div>
                <div style={{ fontSize: 11, color: C.inactive, marginBottom: 14 }}>Nothing&apos;s broken — this asset type just hasn&apos;t been created for this organization.</div>
                <button onClick={() => setTab("create")} style={{ padding: "7px 16px", background: meta.color, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif" }}>✚ Create the first one</button>
              </div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map(item => {
                const isSel = sel === item.id;
                return (
                  <div key={item.id} onClick={() => setSel(item.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: isSel ? meta.color + "0C" : C.page, border: `1.5px solid ${isSel ? meta.color + "50" : C.border}`, borderRadius: 10, cursor: "pointer" }}>
                    <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${isSel ? meta.color : C.inactive}`, background: isSel ? meta.color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {isSel && <span style={{ color: "#fff", fontSize: 9, fontWeight: 800 }}>✓</span>}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{item.title}</div>
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{item.status} {item.duration_mins ? `· ${item.duration_mins} min` : ""}{item.question_count ? `· ${item.question_count} questions` : ""}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>)}
          {tab === "create" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "24px 12px", gap: 10 }}>
              <div style={{ fontSize: 26, opacity: 0.4 }}>{meta.icon}</div>
              <div style={{ fontSize: 12, color: C.muted, maxWidth: 320 }}>
                Opens the full {assetType.replace("_", " ")} builder — build it manually, generate it with AI, or upload a file, same as Content Library — then tags the finished asset here.
              </div>
              <button onClick={() => setShowCreateModal(true)} style={{ padding: "9px 20px", background: meta.color, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif", marginTop: 4 }}>
                ✚ Create {modal.elementLabel}
              </button>
            </div>
          )}

          {/* Participant Access + Knowledge Check used to sit OUTSIDE this
              scrollable area as fixed-height flexShrink:0 panels — every pixel
              they took (and the Knowledge Check panel grows once a quiz is
              attached: asset name row + Timer/Attempts/Pass Score + helper
              text) was subtracted from the library list's scroll space above,
              squeezing "Browse Library" into a sliver a few rows tall. Moving
              both inside the scroll container lets the whole modal scroll as
              one column instead, so the asset list keeps whatever room it
              naturally needs. */}
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 14 }}>📅</span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>Participant Access</div>
                <div style={{ fontSize: 10, color: C.muted }}>Relative to the cohort&apos;s start date — enforced, not just displayed.</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <label style={{ fontSize: 9, fontWeight: 700, color: C.muted, display: "block", marginBottom: 3 }}>OPENS ON DAY</label>
                <input type="number" min={0} value={startDay} onChange={e => setStartDay(Math.max(0, +e.target.value || 0))} style={inp} />
              </div>
              <div>
                <label style={{ fontSize: 9, fontWeight: 700, color: C.muted, display: "block", marginBottom: 3 }}>DUE (DAYS LATER)</label>
                <input type="number" min={0} value={dueDayOffset} onChange={e => setDueDayOffset(Math.max(0, +e.target.value || 0))} style={inp} />
              </div>
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 6 }}>
              Opens day {startDay} of the program (cohort start + {startDay} day{startDay === 1 ? "" : "s"}), due {dueDayOffset} day{dueDayOffset === 1 ? "" : "s"} after that — day {startDay + dueDayOffset} overall.
            </div>
          </div>

          {/* Quiz/Assessment settings — the element itself IS the quiz, so
              this writes straight to the activity's own config (no nested
              knowledge_check) — see QuizSettings above. */}
          {isQuizElement && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 14 }}>⏱</span>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>Quiz Settings</div>
                <div style={{ fontSize: 10, color: C.muted }}>Timer, attempts, and passing score for this {modal.elementLabel.toLowerCase()}.</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div>
                <label style={{ fontSize: 9, fontWeight: 700, color: C.muted, display: "block", marginBottom: 3 }}>TIMER</label>
                <UnitInput value={quiz.timeLimitMins} onChange={v => setQuiz({ ...quiz, timeLimitMins: v })} min={0} unit="min" placeholder="0 = none" />
              </div>
              <div>
                <label style={{ fontSize: 9, fontWeight: 700, color: C.muted, display: "block", marginBottom: 3 }}>ATTEMPTS</label>
                <UnitInput value={quiz.attemptsAllowed} onChange={v => setQuiz({ ...quiz, attemptsAllowed: Math.max(1, v) })} min={1} unit="×" />
              </div>
              <div>
                <label style={{ fontSize: 9, fontWeight: 700, color: C.muted, display: "block", marginBottom: 3 }}>PASS SCORE</label>
                <UnitInput value={quiz.passingScorePct} onChange={v => setQuiz({ ...quiz, passingScorePct: v })} min={0} max={100} unit="%" placeholder="0 = none" />
              </div>
            </div>
            <div style={{ fontSize: 9, color: C.muted, marginTop: 6 }}>Timer 0 = untimed. Open-ended questions are graded by faculty; objective questions auto-score.</div>
          </div>
          )}

          {/* Attach a Knowledge Check — content-style elements only */}
          {canAttachKC && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${C.border}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14 }}>✦</span>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>Knowledge Check <span style={{ color: C.muted, fontWeight: 500 }}>(optional)</span></div>
                  <div style={{ fontSize: 10, color: C.muted }}>A short quiz on this {modal.elementLabel.toLowerCase()} — graded like an assessment.</div>
                </div>
              </div>
              {!kc ? (
                <button onClick={() => setKcPicker(true)} style={{ padding: "6px 14px", background: "rgba(239,78,36,0.08)", border: "1px solid rgba(239,78,36,0.25)", borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#EF4E24", fontFamily: "Poppins,sans-serif", whiteSpace: "nowrap" }}>+ Attach</button>
              ) : (
                <button onClick={() => setKc(null)} style={{ padding: "6px 12px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.muted, fontFamily: "Poppins,sans-serif", whiteSpace: "nowrap" }}>Remove</button>
              )}
            </div>
            {kc && (
              <div style={{ marginTop: 10, padding: "10px 12px", background: C.page, border: `1px solid ${C.border}`, borderRadius: 10 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📝 {kc.assetTitle}</div>
                  <button onClick={() => setKcPicker(true)} style={{ padding: "4px 10px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", fontSize: 10, fontWeight: 700, color: C.navy, fontFamily: "Poppins,sans-serif", flexShrink: 0 }}>Change</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <div>
                    <label style={{ fontSize: 9, fontWeight: 700, color: C.muted, display: "block", marginBottom: 3 }}>TIMER</label>
                    <UnitInput value={kc.timeLimitMins} onChange={v => setKc({ ...kc, timeLimitMins: v })} min={0} unit="min" placeholder="0 = none" />
                  </div>
                  <div>
                    <label style={{ fontSize: 9, fontWeight: 700, color: C.muted, display: "block", marginBottom: 3 }}>ATTEMPTS</label>
                    <UnitInput value={kc.attemptsAllowed} onChange={v => setKc({ ...kc, attemptsAllowed: Math.max(1, v) })} min={1} unit="×" />
                  </div>
                  <div>
                    <label style={{ fontSize: 9, fontWeight: 700, color: C.muted, display: "block", marginBottom: 3 }}>PASS SCORE</label>
                    <UnitInput value={kc.passingScorePct} onChange={v => setKc({ ...kc, passingScorePct: v })} min={0} max={100} unit="%" placeholder="0 = none" />
                  </div>
                </div>
                <div style={{ fontSize: 9, color: C.muted, marginTop: 6 }}>Timer 0 = untimed. Open-ended questions are graded by faculty; objective questions auto-score.</div>
              </div>
            )}
          </div>
          )}
        </div>

        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: "8px 16px", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.muted, fontFamily: "Poppins,sans-serif" }}>Cancel</button>
          {tab === "browse" && (
            <button disabled={!sel} onClick={saveBrowse} style={{ padding: "8px 20px", background: sel ? meta.color : C.inactive, border: "none", borderRadius: 8, cursor: sel ? "pointer" : "default", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif" }}>Tag to Module →</button>
          )}
        </div>
      </div>
    </Overlay></Portal>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// DSActivityModal — add a preset or custom activity card to an activity-phase
// ══════════════════════════════════════════════════════════════════════════
export function DSActivityModal({ phaseType, phaseColor, onClose, onAdd }: {
  phaseType: string; phaseColor: string; onClose: () => void;
  onAdd: (title: string, color: string, date: string) => void;
}) {
  const presets = DS_ACTIVITY_PRESETS[phaseType] || [];
  const [custom, setCustom] = useState("");
  const [date, setDate] = useState("");
  const addIt = (title: string, color: string) => { onAdd(title, color || phaseColor, date); onClose(); };
  return (
    <Portal><Overlay onClose={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 460, overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.22)" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>Add Activity</span>
          <CloseBtn onClick={onClose} />
        </div>
        <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {presets.length > 0 && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.8, marginBottom: 8 }}>QUICK ADD</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {presets.map(p => (
                  <button key={p.title} onClick={() => addIt(p.title, p.color)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: p.color + "10", border: `1.5px solid ${p.color}30`, borderRadius: 20, cursor: "pointer", fontSize: 11, fontWeight: 600, color: p.color, fontFamily: "Poppins,sans-serif" }}>
                    <div style={{ width: 7, height: 7, borderRadius: "50%", background: p.color, flexShrink: 0 }} />{p.title}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 14 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.8, marginBottom: 8 }}>CUSTOM ACTIVITY</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input value={custom} onChange={e => setCustom(e.target.value)} style={{ ...inp, flex: 1 }} placeholder="e.g. Tech Setup Session" onKeyDown={e => e.key === "Enter" && custom.trim() && addIt(custom.trim(), phaseColor)} />
              <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...inp, width: 130 }} />
              <button disabled={!custom.trim()} onClick={() => custom.trim() && addIt(custom.trim(), phaseColor)} style={{ padding: "7px 14px", background: custom.trim() ? phaseColor : C.inactive, border: "none", borderRadius: 8, cursor: custom.trim() ? "pointer" : "default", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif", flexShrink: 0 }}>Add</button>
            </div>
          </div>
        </div>
      </div>
    </Overlay></Portal>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// DSActivityWorkflowModal — configure an admin_task activity (Nomination,
// Welcome Email, etc.): config fields, an item list, and an AI-draftable
// email body. Persists into activities.config_json (WorkflowConfig on the Go side).
// ══════════════════════════════════════════════════════════════════════════
export interface WorkflowData { fields?: Record<string, string>; items?: Record<string, string>[]; email_body?: string; }
export function DSActivityWorkflowModal({ activityTitle, data, onClose, onSave }: {
  activityTitle: string; data: WorkflowData; onClose: () => void; onSave: (data: WorkflowData) => void;
}) {
  const config = DS_WORKFLOW_CONFIGS[activityTitle];
  const [cfg, setCfg] = useState<Record<string, string>>(data.fields ?? {});
  const [items, setItems] = useState<Record<string, string>[]>(data.items ?? []);
  const [form, setForm] = useState<Record<string, string>>({});
  const [emailBody, setEmailBody] = useState(data.email_body ?? "");
  const [generating, setGenerating] = useState(false);

  if (!config) return null;

  function generateEmail() {
    setGenerating(true);
    const subject = cfg["subject"] || "our Leadership Program";
    const fallback = `Dear [First Name],\n\nWelcome to the program! We are delighted to have you on board for what promises to be a transformative learning journey.\n\nOver the coming months, you will:\n• Engage with expert facilitators and coaches\n• Collaborate with a cohort of outstanding peers\n• Apply insights directly to your leadership context\n\nTo get started, please:\n1. Log in to the LMS platform and complete your profile\n2. Review the program schedule sent separately\n3. Block your calendar for the Orientation Session\n\nWe look forward to an exceptional journey together.\n\nWarm regards,\n${cfg["sender"] || "Program Team"}`;
    void subject;
    setTimeout(() => { setEmailBody(fallback); setGenerating(false); }, 700);
  }
  function addItem() {
    const firstKey = config.fields?.[0]?.key;
    if (!firstKey || !form[firstKey]) return;
    setItems(prev => [...prev, { ...form, id: `w${Date.now().toString(36)}` }]);
    setForm({});
  }
  function removeItem(idx: number) { setItems(prev => prev.filter((_, i) => i !== idx)); }

  return (
    <Portal><Overlay onClose={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "82vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.22)" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0, background: config.color + "08" }}>
          <div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 3 }}>{config.desc}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{config.icon} {activityTitle}</div>
            {config.fields && <div style={{ fontSize: 11, color: config.color, marginTop: 2 }}>{items.length} {config.itemPlural}</div>}
          </div>
          <CloseBtn onClick={onClose} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {config.configFields && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, letterSpacing: 0.8, marginBottom: 10 }}>CONFIGURATION</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                {config.configFields.map(f => (
                  <div key={f.key}>
                    <label style={lbl}>{f.label.toUpperCase()}</label>
                    <input type={f.type || "text"} value={cfg[f.key] || ""} onChange={e => setCfg(p => ({ ...p, [f.key]: e.target.value }))} style={inp} placeholder={f.placeholder || ""} />
                  </div>
                ))}
              </div>
            </div>
          )}
          {config.hasEmailEditor && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, letterSpacing: 0.8 }}>EMAIL BODY</div>
                <button onClick={generateEmail} disabled={generating} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", background: generating ? C.page : "linear-gradient(135deg,#1C2551,#2d3a7c)", border: "none", borderRadius: 20, cursor: generating ? "default" : "pointer", fontSize: 11, fontWeight: 700, color: generating ? C.muted : "#fff", fontFamily: "Poppins,sans-serif" }}>
                  {generating ? "⟳ Generating..." : "✦ AI Draft"}
                </button>
              </div>
              <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} placeholder="Click '✦ AI Draft' to generate, or type your email body here..." style={{ width: "100%", minHeight: 200, border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, fontSize: 12, fontFamily: "Poppins,sans-serif", color: C.navy, outline: "none", resize: "vertical", boxSizing: "border-box", lineHeight: 1.7 }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 4 }}>
                <span style={{ fontSize: 10, color: C.inactive }}>Editable — changes are saved with the activity</span>
                <span style={{ fontSize: 10, color: C.muted }}>{emailBody.trim().split(/\s+/).filter(Boolean).length} words</span>
              </div>
            </div>
          )}
          {config.fields && (
            <div>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, letterSpacing: 0.8, marginBottom: 10 }}>{(config.itemPlural || "ITEMS").toUpperCase()} ({items.length})</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
                {config.fields.map(f => (
                  <input key={f.key} type={f.type || "text"} value={form[f.key] || ""} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder || f.label} style={{ ...inp, width: "auto", flex: f.required ? "2 1 120px" : "1 1 80px" }} onKeyDown={e => e.key === "Enter" && addItem()} />
                ))}
                <button disabled={!form[config.fields[0]?.key ?? ""]} onClick={addItem} style={{ padding: "7px 14px", background: form[config.fields[0]?.key ?? ""] ? config.color : C.inactive, border: "none", borderRadius: 7, cursor: form[config.fields[0]?.key ?? ""] ? "pointer" : "default", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif", flexShrink: 0 }}>Add</button>
              </div>
              {items.length === 0 && <div style={{ textAlign: "center", padding: 20, color: C.inactive, fontSize: 12 }}>No {(config.itemLabel || "items").toLowerCase()}s yet</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {items.map((it, idx) => (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: C.page, borderRadius: 8 }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: config.color, color: "#fff", fontWeight: 700, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{idx + 1}</div>
                    {config.fields!.map(f => (
                      <span key={f.key} style={{ flex: f.required ? "2" : "1", fontSize: 12, color: f.required ? C.navy : C.muted, fontWeight: f.required ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it[f.key] || "—"}</span>
                    ))}
                    <button onClick={() => removeItem(idx)} style={{ width: 18, height: 18, border: "none", background: "none", cursor: "pointer", color: C.inactive, fontSize: 12, flexShrink: 0 }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: "8px 16px", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.muted, fontFamily: "Poppins,sans-serif" }}>Cancel</button>
          <button onClick={() => { onSave({ fields: cfg, items, email_body: emailBody }); onClose(); }} style={{ padding: "8px 20px", background: config.color, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif" }}>Save Changes</button>
        </div>
      </div>
    </Overlay></Portal>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// DSGenericActivityModal — fallback config for any activity-phase card whose
// title doesn't match a DS_WORKFLOW_CONFIGS preset (i.e. a custom-named
// activity). Simple title/date/instructions editor, stored in config_json.
// ══════════════════════════════════════════════════════════════════════════
export interface GenericActivityData { date?: string; instructions?: string; }
export function DSGenericActivityModal({ title, data, onClose, onSave }: {
  title: string; data: GenericActivityData; onClose: () => void; onSave: (data: GenericActivityData) => void;
}) {
  const [date, setDate] = useState(data.date ?? "");
  const [instructions, setInstructions] = useState(data.instructions ?? "");
  return (
    <Portal><Overlay onClose={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 440, overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.22)" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>{title}</span>
          <CloseBtn onClick={onClose} />
        </div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.6 }}>This is a custom activity — add a target date and any notes/instructions for whoever runs it.</div>
          <div><label style={lbl}>DATE</label><input type="date" value={date} onChange={e => setDate(e.target.value)} style={inp} /></div>
          <div><label style={lbl}>INSTRUCTIONS / NOTES</label><textarea value={instructions} onChange={e => setInstructions(e.target.value)} rows={4} style={{ ...inp, resize: "none" }} placeholder="What needs to happen for this activity?" /></div>
        </div>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.muted, fontFamily: "Poppins,sans-serif" }}>Cancel</button>
          <button onClick={() => { onSave({ date, instructions }); onClose(); }} style={{ padding: "8px 20px", background: C.orange, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif" }}>Save Changes</button>
        </div>
      </div>
    </Overlay></Portal>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// DSEnrolModal — participant enrolment, wired to real cohorts/enrollments.
// Design Studio enrolment is program-level; we resolve/create a single
// default cohort ("Cohort 1") for the program to hold these enrolments.
// ══════════════════════════════════════════════════════════════════════════
export function DSEnrolModal({ orgId, programId, onClose }: { orgId: string; programId: string; onClose: () => void }) {
  const [tab, setTab] = useState<"existing" | "individual" | "bulk">("existing");
  const [cohort, setCohort] = useState<CohortDTO | null>(null);
  const [participants, setParticipants] = useState<ParticipantDTO[]>([]);
  const [pool, setPool] = useState<PoolParticipantDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dept, setDept] = useState("");
  const [bulk, setBulk] = useState("");
  const [q, setQ] = useState("");
  const [poolQ, setPoolQ] = useState("");
  const [selectedPool, setSelectedPool] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [fileDragging, setFileDragging] = useState(false);

  async function loadPool() {
    try { const r = await cohortsApi.pool(programId, orgId); setPool(r.data ?? []); } catch { setPool([]); }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await cohortsApi.list(orgId, programId);
        let c = list.data?.[0] ?? null;
        if (!c) {
          const created = await cohortsApi.create(orgId, { program_id: programId, name: "Cohort 1" });
          c = created.data;
        }
        if (cancelled) return;
        setCohort(c);
        const ps = await cohortsApi.listParticipants(c.id);
        if (!cancelled) setParticipants(ps.data ?? []);
        await loadPool();
      } catch { if (!cancelled) setParticipants([]); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, programId]);

  async function refresh() {
    if (!cohort) return;
    const ps = await cohortsApi.listParticipants(cohort.id);
    setParticipants(ps.data ?? []);
    await loadPool();
  }

  async function enrollSelectedFromPool() {
    if (!cohort || selectedPool.size === 0) return;
    setBusy(true);
    try {
      for (const userId of selectedPool) {
        await cohortsApi.transfer(cohort.id, { user_id: userId }).catch(() => {});
      }
      setSelectedPool(new Set());
      await refresh();
      setTab("individual");
    } finally { setBusy(false); }
  }

  async function addOne() {
    if (!cohort || !name.trim() || !email.trim()) return;
    setBusy(true);
    try {
      await cohortsApi.enrollByEmail(cohort.id, [{ name: name.trim(), email: email.trim(), department: dept.trim() || undefined }]);
      setName(""); setEmail(""); setDept("");
      await refresh();
    } finally { setBusy(false); }
  }
  async function importBulk() {
    if (!cohort || !bulk.trim()) return;
    setBusy(true);
    try {
      const rows = bulk.split("\n").map(r => r.trim()).filter(Boolean);
      const parsed = rows.map(r => {
        const parts = r.split(",").map(p => p.trim());
        return { name: parts[0] || "", email: parts[1] || "", department: parts[2] || undefined };
      }).filter(p => p.name && p.email);
      if (parsed.length) await cohortsApi.enrollByEmail(cohort.id, parsed);
      setBulk("");
      await refresh();
    } finally { setBusy(false); }
  }

  const filtered = participants.filter(p => !q || p.name.toLowerCase().includes(q.toLowerCase()));
  const filteredPool = pool.filter(p => !poolQ || p.name.toLowerCase().includes(poolQ.toLowerCase()) || p.email.toLowerCase().includes(poolQ.toLowerCase()));
  const initials = (n: string) => { const w = n.split(" "); return (w[0]?.[0] ?? "") + (w[1]?.[0] ?? ""); };

  return (
    <Portal><Overlay onClose={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.22)" }}>
        <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>Participant Enrolment</div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{loading ? "Loading…" : `${participants.length} enrolled${cohort ? ` in ${cohort.name}` : ""}`}</div>
          </div>
          <CloseBtn onClick={onClose} />
        </div>
        <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          {(["existing", "individual", "bulk"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: 10, border: "none", background: tab === t ? "rgba(239,78,36,0.06)" : "transparent", borderBottom: tab === t ? `2px solid ${C.orange}` : "2px solid transparent", cursor: "pointer", fontSize: 12, fontWeight: tab === t ? 700 : 400, color: tab === t ? C.orange : C.muted, fontFamily: "Poppins,sans-serif" }}>
              {t === "existing" ? "🏢 In Organization" : t === "individual" ? "👤 New / Enrolled" : "📋 Bulk Import"}
            </button>
          ))}
        </div>
        {tab === "existing" && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.border}`, flexShrink: 0, display: "flex", gap: 8 }}>
              <input value={poolQ} onChange={e => setPoolQ(e.target.value)} placeholder="Search by name or email…" style={{ ...inp, flex: 1 }} />
              <button disabled={selectedPool.size === 0 || busy} onClick={enrollSelectedFromPool} style={{ padding: "7px 16px", background: selectedPool.size > 0 ? C.orange : C.inactive, border: "none", borderRadius: 7, cursor: selectedPool.size > 0 ? "pointer" : "default", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif", flexShrink: 0 }}>
                {busy ? "Enrolling…" : `Enroll ${selectedPool.size > 0 ? selectedPool.size : ""}`.trim()}
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", padding: "10px 20px" }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: C.muted, letterSpacing: 0.8, marginBottom: 8 }}>ORGANIZATION PARTICIPANTS ({pool.length})</div>
              {!loading && filteredPool.length === 0 && <div style={{ textAlign: "center", padding: "30px 0", color: C.inactive, fontSize: 12 }}>No unenrolled participants found in this organization. Use &ldquo;New / Enrolled&rdquo; to add someone new.</div>}
              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {filteredPool.map(p => {
                  const isSel = selectedPool.has(p.user_id);
                  return (
                    <div key={p.user_id} onClick={() => setSelectedPool(prev => { const n = new Set(prev); if (n.has(p.user_id)) n.delete(p.user_id); else n.add(p.user_id); return n; })}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: isSel ? "rgba(239,78,36,0.06)" : C.page, border: `1.5px solid ${isSel ? C.orange + "50" : "transparent"}`, borderRadius: 8, cursor: "pointer" }}>
                      <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${isSel ? C.orange : C.inactive}`, background: isSel ? C.orange : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {isSel && <span style={{ color: "#fff", fontSize: 9, fontWeight: 800 }}>✓</span>}
                      </div>
                      <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.indigo, color: "#fff", fontWeight: 700, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initials(p.name)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                        <div style={{ fontSize: 10, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.email}</div>
                      </div>
                      {p.department && <span style={{ fontSize: 11, color: C.muted, flexShrink: 0 }}>{p.department}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
        {tab === "individual" && (<>
          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name *" onKeyDown={e => e.key === "Enter" && addOne()} style={{ ...inp, flex: 1 }} />
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email *" onKeyDown={e => e.key === "Enter" && addOne()} style={{ ...inp, flex: 1 }} />
              <input value={dept} onChange={e => setDept(e.target.value)} placeholder="Department" style={{ ...inp, flex: 1 }} />
              <button disabled={!name.trim() || !email.trim() || busy} onClick={addOne} style={{ padding: "7px 16px", background: name.trim() && email.trim() ? C.orange : C.inactive, border: "none", borderRadius: 7, cursor: name.trim() && email.trim() ? "pointer" : "default", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif", flexShrink: 0 }}>Add</button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: "auto", padding: "10px 20px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: C.muted, letterSpacing: 0.8 }}>ENROLLED ({participants.length})</span>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" style={{ padding: "4px 10px", border: `1px solid ${C.border}`, borderRadius: 20, fontSize: 11, fontFamily: "Poppins,sans-serif", color: C.navy, outline: "none", width: 140 }} />
            </div>
            {filtered.length === 0 && <div style={{ textAlign: "center", padding: "30px 0", color: C.inactive, fontSize: 12 }}>No participants yet</div>}
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {filtered.map(p => (
                <div key={p.enrollment_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 10px", background: C.page, borderRadius: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: C.navy, color: "#fff", fontWeight: 700, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{initials(p.name)}</div>
                  <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.navy }}>{p.name}</span>
                  <span style={{ fontSize: 11, color: C.muted }}>{p.department || p.role}</span>
                </div>
              ))}
            </div>
          </div>
        </>)}
        {tab === "bulk" && (
          <div style={{ flex: 1, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12, overflowY: "auto" }}>
            <div
              onDragOver={e => { e.preventDefault(); setFileDragging(true); }}
              onDragLeave={() => setFileDragging(false)}
              onDrop={e => {
                e.preventDefault(); setFileDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) { const r = new FileReader(); r.onload = ev => setBulk(String(ev.target?.result ?? "")); r.readAsText(f); }
              }}
              style={{ border: `2px dashed ${fileDragging ? C.orange : C.inactive}`, borderRadius: 10, padding: 20, textAlign: "center", background: fileDragging ? "rgba(239,78,36,0.04)" : C.page, cursor: "pointer" }}
              onClick={() => document.getElementById("enrol-file-input")?.click()}>
              <input id="enrol-file-input" type="file" accept=".csv,.xls,.xlsx" style={{ display: "none" }}
                onChange={e => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = ev => setBulk(String(ev.target?.result ?? "")); r.readAsText(f); } e.target.value = ""; }} />
              <div style={{ fontSize: 24, marginBottom: 6, opacity: 0.4 }}>📂</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, marginBottom: 3 }}>Click to upload or drag & drop</div>
              <div style={{ fontSize: 11, color: C.muted }}>.CSV — columns: Name, Email, Department</div>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.8, textAlign: "center" }}>— OR PASTE DIRECTLY —</div>
            <textarea value={bulk} onChange={e => setBulk(e.target.value)} placeholder={"Riya Sharma, riya@company.com, Strategy\nArjun Das, arjun@company.com, Operations"} style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: 10, fontSize: 12, fontFamily: "Poppins,sans-serif", color: C.navy, outline: "none", resize: "none", minHeight: 80 }} />
            {bulk.trim() && (
              <div style={{ fontSize: 11, color: C.indigo, fontWeight: 600, padding: "4px 8px", background: "rgba(107,115,191,0.08)", borderRadius: 6 }}>
                ✓ {bulk.split("\n").filter(Boolean).length} row(s) ready to import
              </div>
            )}
            <button disabled={!bulk.trim() || busy} onClick={importBulk} style={{ padding: 9, background: bulk.trim() ? C.orange : C.inactive, border: "none", borderRadius: 8, cursor: bulk.trim() ? "pointer" : "default", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif" }}>
              {busy ? "Importing…" : `Import ${bulk.trim() ? bulk.split("\n").filter(Boolean).length : 0} Participant(s)`}
            </button>
          </div>
        )}
      </div>
    </Overlay></Portal>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ConflictOverlay — faculty scheduling conflict, ported from the Gantt studio
// ══════════════════════════════════════════════════════════════════════════
export function ConflictOverlay({ faculty, conflicts, onCancel, onOverride }: {
  faculty: OrgFacultyMember; conflicts: ConflictDTO[]; onCancel: () => void; onOverride: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Portal><Overlay onClose={onCancel}>
      <div style={{ background: "#fff", borderRadius: 14, width: "100%", maxWidth: 440, boxShadow: "0 24px 64px rgba(28,37,81,0.22)", overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, background: "rgba(239,78,36,0.05)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>⚠ Scheduling Conflict</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}><b style={{ color: C.navy }}>{faculty.name}</b> is already assigned to {conflicts.length} other session{conflicts.length > 1 ? "s" : ""} that overlap.</div>
        </div>
        <div style={{ padding: "10px 18px", maxHeight: 200, overflowY: "auto" }}>
          {conflicts.map((c, i) => (
            <div key={i} style={{ padding: "7px 0", borderBottom: i < conflicts.length - 1 ? "1px solid #F4F5F8" : "none" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>{c.activity_title}</div>
              <div style={{ fontSize: 11, color: C.muted }}>{c.program_title}{c.cohort_name ? ` · ${c.cohort_name}` : ""}</div>
              <div style={{ fontSize: 10, color: C.orange }}>{c.start_date} → {c.end_date} · {c.role}</div>
            </div>
          ))}
        </div>
        <div style={{ padding: "10px 18px", borderTop: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 5 }}>OVERRIDE REASON (REQUIRED)</div>
          <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="e.g. Faculty confirmed availability for this slot" style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", fontSize: 12, fontFamily: "Poppins,sans-serif", color: C.navy, resize: "none", boxSizing: "border-box", outline: "none" }} />
        </div>
        <div style={{ padding: "10px 18px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ padding: "7px 14px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 7, cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.navy, fontFamily: "Poppins,sans-serif" }}>Cancel</button>
          <button onClick={() => { if (note.trim()) onOverride(note.trim()); }} disabled={!note.trim()} style={{ padding: "7px 14px", background: C.orange, border: "none", borderRadius: 7, cursor: note.trim() ? "pointer" : "not-allowed", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif", opacity: note.trim() ? 1 : 0.5 }}>Override & Assign</button>
        </div>
      </div>
    </Overlay></Portal>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// ScheduleSessionModal — schedule a class_session for a live_session/coaching
// element, ported from the Gantt studio's RPanel inline modal.
// ══════════════════════════════════════════════════════════════════════════
export function ScheduleSessionModal({ programId, orgId, activityTitle, activityId, activityType, sessionFormat, activityFaculty, orgFaculty, defaultDurationMins, onClose, onScheduled }: {
  programId: string; orgId: string; activityTitle: string; activityId: string;
  // activityType/sessionFormat: when this is a live_session activity, its
  // meeting format was decided once in Program Design (Phase 4a) — this
  // modal reads it and never shows a manual picker or lets it be overridden
  // per-instance. Undefined/omitted for non-live_session (e.g. coaching)
  // activities, which keep the existing manual session-type picker below.
  activityType?: string; sessionFormat?: "in_person" | "virtual";
  activityFaculty: ActivityFacultyDTO[]; orgFaculty: OrgFacultyMember[]; defaultDurationMins: number;
  onClose: () => void; onScheduled: (s: ScheduledSessionDTO) => void;
}) {
  const isLiveSession = activityType === "live_session";
  const formatUnset = isLiveSession && sessionFormat !== "in_person" && sessionFormat !== "virtual";

  const [cohorts, setCohorts] = useState<CohortDTO[]>([]);
  const [form, setForm] = useState({
    cohort_id: "", faculty_id: activityFaculty[0]?.faculty_user_id ?? "",
    title: `${activityTitle} – ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`,
    scheduled_at: "", duration_mins: defaultDurationMins || 60, session_type: "classroom", virtual_link: "",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!orgId || !programId) return;
    cohortsApi.list(orgId, programId).then(r => setCohorts(r.data ?? [])).catch(() => {});
  }, [orgId, programId]);

  async function submit() {
    if (!form.faculty_id || !form.scheduled_at || formatUnset) return;
    setSaving(true); setErr("");
    try {
      const r = await programsApi.scheduleSession(programId, activityId, {
        program_id: programId, cohort_id: form.cohort_id || undefined, faculty_id: form.faculty_id,
        title: form.title, session_type: form.session_type, virtual_link: form.virtual_link,
        scheduled_at: new Date(form.scheduled_at).toISOString(), duration_mins: form.duration_mins,
      });
      if (r.data) onScheduled(r.data);
      onClose();
    } catch (e) {
      setErr((e as Error).message || "Failed to schedule session");
    } finally { setSaving(false); }
  }

  return (
    <Portal><Overlay onClose={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, width: 440, maxWidth: "100%", boxShadow: "0 24px 64px rgba(28,37,81,0.22)", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>Schedule Session</div>
          <CloseBtn onClick={onClose} />
        </div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div><label style={lbl}>TITLE</label><input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} style={inp} /></div>
          <div>
            <label style={lbl}>COHORT</label>
            <select value={form.cohort_id} onChange={e => setForm(f => ({ ...f, cohort_id: e.target.value }))} style={inp}>
              <option value="">— Select cohort —</option>
              {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {cohorts.length === 0 && <div style={{ fontSize: 9, color: C.muted, marginTop: 3 }}>No cohorts yet for this program.</div>}
          </div>
          <div>
            <label style={lbl}>FACULTY</label>
            <select value={form.faculty_id} onChange={e => setForm(f => ({ ...f, faculty_id: e.target.value }))} style={inp}>
              <option value="">— Select faculty —</option>
              {activityFaculty.map(f => <option key={f.faculty_user_id} value={f.faculty_user_id}>{f.name} ({f.role})</option>)}
              {orgFaculty.filter(f => !activityFaculty.some(af => af.faculty_user_id === f.id)).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={lbl}>DATE & TIME</label><input type="datetime-local" value={form.scheduled_at} onChange={e => setForm(f => ({ ...f, scheduled_at: e.target.value }))} style={inp} /></div>
            <div><label style={lbl}>DURATION (MINS)</label><input type="number" min={5} max={480} step={5} value={form.duration_mins} onChange={e => setForm(f => ({ ...f, duration_mins: +e.target.value }))} style={inp} /></div>
          </div>
          {isLiveSession ? (
            formatUnset ? (
              <div style={{ padding: "10px 12px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 8, fontSize: 11.5, color: "#92400e", lineHeight: 1.5 }}>
                ⚠ This activity's format isn't set — edit it in Program Design first (Virtual or In-person), then come back to schedule.
              </div>
            ) : (
              <div>
                <label style={lbl}>FORMAT</label>
                <div style={{ padding: "9px 12px", border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12, color: C.navy, background: C.page }}>
                  {sessionFormat === "virtual" ? "🌐 Virtual — decided in Program Design" : "🏛 In-person — decided in Program Design"}
                </div>
              </div>
            )
          ) : (
            <div>
              <label style={lbl}>SESSION TYPE</label>
              <select value={form.session_type} onChange={e => setForm(f => ({ ...f, session_type: e.target.value }))} style={inp}>
                <option value="classroom">Classroom</option>
                <option value="coaching_group">Group Coaching</option>
                <option value="coaching_individual">1:1 Coaching</option>
                <option value="virtual">Virtual</option>
              </select>
            </div>
          )}
          <div><label style={lbl}>VIRTUAL LINK (optional)</label><input value={form.virtual_link} onChange={e => setForm(f => ({ ...f, virtual_link: e.target.value }))} placeholder="https://..." style={inp} /></div>
          {err && <div style={{ fontSize: 11.5, color: "#ef4444" }}>{err}</div>}
        </div>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontFamily: "Poppins,sans-serif", color: C.muted, fontWeight: 600, fontSize: 12, background: "#fff" }}>Cancel</button>
          <button onClick={submit} disabled={saving || !form.faculty_id || !form.scheduled_at || formatUnset} style={{ padding: "8px 20px", border: "none", borderRadius: 8, cursor: saving ? "not-allowed" : "pointer", fontFamily: "Poppins,sans-serif", color: "#fff", fontWeight: 700, fontSize: 12, background: C.navy, opacity: (saving || !form.faculty_id || !form.scheduled_at || formatUnset) ? 0.5 : 1 }}>
            {saving ? "Saving…" : "Create Session"}
          </button>
        </div>
      </div>
    </Overlay></Portal>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// KnowledgeCheckPicker — browse or create an `assessment` quiz asset to attach
// as a knowledge check. Create routes into the SAME QuestionBuilderModal the
// Content Library uses (manual / AI-generate-from-file / upload), so the quiz
// is authored exactly like any other assessment.
// ══════════════════════════════════════════════════════════════════════════
function KnowledgeCheckPicker({ orgId, existingAssetId, onBack, onClose, onPicked }: {
  orgId: string; existingAssetId?: string; onBack: () => void; onClose: () => void;
  onPicked: (assetId: string, assetTitle: string) => void;
}) {
  const [assets, setAssets] = useState<AssetDTO[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<string | null>(existingAssetId ?? null);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await contentApi.list(orgId, { type: "assessment" });
        if (!cancelled) setAssets((r.data.assets ?? []).filter(a => a.status !== "archived"));
      } catch {
        if (!cancelled) setAssets([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orgId]);

  if (creating) {
    return (
      <QuestionBuilderModal
        orgId={orgId}
        assetType="assessment"
        onClose={() => setCreating(false)}
        onSuccess={(a) => { setCreating(false); onPicked(a.id, a.title); }}
      />
    );
  }

  const filtered = assets.filter(a => !q || a.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <Portal><Overlay onClose={onClose}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 480, maxHeight: "80vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.22)" }}>
        <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0, background: "rgba(239,78,36,0.05)" }}>
          <div>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 2 }}>Attach a Knowledge Check</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>✦ Choose a quiz</div>
          </div>
          <CloseBtn onClick={onBack} />
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 20px" }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search quizzes…" style={{ ...inp, marginBottom: 12 }} />
          {loading && <div style={{ textAlign: "center", padding: 30, color: C.muted, fontSize: 12 }}>Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "24px 20px" }}>
              <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>{q ? "No quizzes match your search." : "No quiz assets yet — create one to attach."}</div>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map(item => {
              const isSel = sel === item.id;
              return (
                <div key={item.id} onClick={() => setSel(item.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", background: isSel ? "rgba(239,78,36,0.06)" : C.page, border: `1.5px solid ${isSel ? "rgba(239,78,36,0.4)" : C.border}`, borderRadius: 10, cursor: "pointer" }}>
                  <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${isSel ? "#EF4E24" : C.inactive}`, background: isSel ? "#EF4E24" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {isSel && <span style={{ color: "#fff", fontSize: 9, fontWeight: 800 }}>✓</span>}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{item.status}{item.question_count ? ` · ${item.question_count} questions` : ""}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, justifyContent: "space-between", flexShrink: 0 }}>
          <button onClick={() => setCreating(true)} style={{ padding: "8px 16px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: C.navy, fontFamily: "Poppins,sans-serif" }}>✚ Create New Quiz</button>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onBack} style={{ padding: "8px 16px", border: `1px solid ${C.border}`, borderRadius: 8, background: "#fff", cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.muted, fontFamily: "Poppins,sans-serif" }}>Cancel</button>
            <button disabled={!sel} onClick={() => { const item = assets.find(a => a.id === sel); if (item) onPicked(item.id, item.title); }} style={{ padding: "8px 20px", background: sel ? "#EF4E24" : C.inactive, border: "none", borderRadius: 8, cursor: sel ? "pointer" : "default", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif" }}>Attach →</button>
          </div>
        </div>
      </div>
    </Overlay></Portal>
  );
}
