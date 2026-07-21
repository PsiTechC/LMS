"use client";

import { useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import {
  programsApi, ProgramDetailDTO, PhaseDTO, ModuleDTO, ActivityDTO, PhaseType,
  ActivityFacultyDTO, OrgFacultyMember, ConflictDTO, ScheduledSessionDTO,
} from "@/lib/programs-api";
import { ApiError } from "@/lib/api";
import { capstoneManageApi } from "@/lib/capstone-api";
import {
  DS_PHASE_TYPES, DS_ELEMENT_TYPES, isActivityPhase, isModulePhase, isConfigurable, elMeta,
  DSDateModal, DSPhaseEditModal, DSModuleModal, DSElementModal, DSElementConfigModal,
  DSActivityModal, DSActivityWorkflowModal, DSGenericActivityModal, DSEnrolModal, ConflictOverlay, ScheduleSessionModal,
  DS_WORKFLOW_CONFIGS, ElementConfigSave, WorkflowData, GenericActivityData, PhaseEditTarget, DateModalState,
} from "./DesignStudioModals";
import { buildProgramBrochureHTML } from "./ProgramExportTemplate";
import ProgramPricingModal from "./ProgramPricingModal";

// ─── Design tokens ───────────────────────────────────────────────────────────
const C = {
  navy: "var(--xa-text)", orange: "var(--xa-primary)", indigo: "#4A5573",
  green: "#22c55e", page: "#F7F5F0", card: "#FFFFFF",
  border: "#E6DED0", muted: "#4A5573", inactive: "#C9BFA8",
};

function dbw(a: string, b: string) { return Math.max(1, Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000)); }
// True calendar-day gap between two date strings, with NO artificial
// minimum (dbw() above floors to 1 so display labels never read "0d" -
// correct for showing a phase's duration, but wrong for persisting a
// genuinely same-day phase's span - see the sd/ed comment in handleSave).
function calendarDiffDays(a: string, b: string) { return Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000); }
// Built on UTC (Date.UTC + getUTC/setUTCDate + toISOString) rather than local-time
// Date methods + toISOString, because toISOString always renders in UTC - mixing it
// with a local-midnight Date (`new Date(d+"T00:00:00")`) silently shifts the result
// by a day in any positive UTC-offset timezone (e.g. IST, UTC+5:30 rolls local
// midnight back to 18:30 the previous day before formatting).
function addDaysStr(d: string, n: number) {
  const [y, m, day] = d.split("-").map(Number);
  const r = new Date(Date.UTC(y, m - 1, day));
  r.setUTCDate(r.getUTCDate() + n);
  return r.toISOString().split("T")[0];
}
function fmtShort(d: string) { try { return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }); } catch { return d; } }

// Learner-facing time commitment, in minutes, for one activity - every
// LocalActivity (flat phase.activities entries and module pre/post entries
// alike) carries durationMins, so this is a single field read, not a lookup.
function actEffortMins(a: LocalActivity): number { return a.durationMins || 0; }

// Total learner minutes for a phase: flat activities (activity-type phases)
// plus every module's pre + post work (module-type / generic phases). Both
// buckets are summed unconditionally since a phase only ever populates one
// of them (see LocalPhase - activities vs modules), so there's no double count.
function phaseEffortMins(phase: LocalPhase): number {
  const modMins = phase.modules.reduce((n, m) => n + [...m.pre, ...m.post].reduce((nn, a) => nn + actEffortMins(a), 0), 0);
  const actMins = phase.activities.reduce((n, a) => n + actEffortMins(a), 0);
  return modMins + actMins;
}

// Renders minutes as "1h 30m" / "45m" / "2h" - compact, no leading zeros.
function fmtEffort(mins: number): string {
  if (mins <= 0) return "0m";
  const h = Math.floor(mins / 60), m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// Per-phase gap-before-it (days between the previous phase's end and this
// phase's start), captured from a phase array's CURRENT order before that
// order is disturbed by a reorder/delete. Keyed by id so it can still be
// looked up correctly once phases are moved next to different neighbors.
function capturePhaseGaps(phases: { id: string; startDate: string; endDate: string }[]): Record<string, number> {
  const gaps: Record<string, number> = {};
  phases.forEach((ph, i) => { gaps[ph.id] = i === 0 ? 0 : Math.max(0, dbw(phases[i - 1].endDate, ph.startDate) - 1); });
  return gaps;
}

// Gap that used to sit between two specific phases (by id), read from the
// pre-reorder order - used to look up "the gap this pair had" regardless of
// which one now leads. `pairGaps[laterId][earlierId]` = old gap between them.
function capturePairGaps(phases: { id: string; startDate: string; endDate: string }[]): Record<string, Record<string, number>> {
  const pairGaps: Record<string, Record<string, number>> = {};
  phases.forEach((ph, i) => {
    if (i === 0) return;
    const prev = phases[i - 1];
    pairGaps[ph.id] = { [prev.id]: Math.max(0, dbw(prev.endDate, ph.startDate) - 1) };
  });
  return pairGaps;
}

// Re-dates phases back-to-back starting at programStart, preserving each
// phase's own duration and its own gap-before-it (looked up from `gaps`,
// captured from the pre-reorder/pre-delete order - NOT recomputed from the
// already-shuffled `phases` array, since a moved phase's stale startDate no
// longer has any relation to its new neighbor). This is what keeps phase
// order and phase dates from drifting apart after a drag reorder or delete.
function recomputePhaseDates<T extends { id: string; startDate: string; endDate: string }>(phases: T[], programStart: string, gaps: Record<string, number>): T[] {
  let cursor = programStart;
  return phases.map((ph, i) => {
    const duration = dbw(ph.startDate, ph.endDate);
    const gap = i === 0 ? 0 : (gaps[ph.id] ?? 0);
    // cursor holds the PREVIOUS phase's end date (inclusive) - starting the
    // next phase on that same day overlaps it by one day. +1 moves onto the
    // first genuinely free day before applying any extra gap on top. This was
    // the source of every drag-reordered phase overlapping its predecessor
    // by a day (and, transitively, saving overlapping start_day/end_day to
    // the server - visible as e.g. phase A: day 1-5, phase B: day 3-5).
    const newStart = i === 0 ? cursor : addDaysStr(cursor, gap + 1);
    const newEnd = addDaysStr(newStart, duration);
    cursor = newEnd; // next phase's start = this end + 1 + that phase's own gap
    return { ...ph, startDate: newStart, endDate: newEnd };
  });
}

// Several element picker types (Quiz, eLearning, L1-L4 Feedback, etc.) collapse
// onto the same backend activity_type (assessment/video/survey) on save, so the
// activity_type alone can't tell them apart again. Prefer the original picker
// type stashed in config.element_type; fall back to the activity_type for
// activities created before this fix existed.
export function elementTypeOf(act: LocalActivity): string {
  return typeof act.config?.element_type === "string" ? act.config.element_type : act.type;
}

// ─── Local editable state (kept close to the server shape; extra client-only
// bits like `date` bookkeeping are derived, never duplicated) ───────────────
// Config is either the typed ActivityConfig (content-backed types) or an
// arbitrary WorkflowData bag (admin_task activities) - both round-trip through
// the same activities.config_json column, so we keep it loosely typed here.
export interface LocalActivity {
  id: string; type: string; title: string; date: string; config?: Record<string, unknown>;
  faculty?: ActivityFacultyDTO[]; durationMins: number;
  // Days relative to the cohort's start date - startDay is when it opens,
  // startDay+dueDayOffset is the due date. Only meaningful for module
  // pre/post-work activities; the Studio previously never surfaced these,
  // so every such activity silently used the server's defaults (1 / 7).
  startDay?: number; dueDayOffset?: number;
}
export interface LocalModule {
  id: string; title: string; type: "virtual" | "in-person"; date: string;
  pre: LocalActivity[]; post: LocalActivity[];
}
export interface LocalPhase {
  id: string; type: PhaseType; label: string; color: string; icon: string;
  startDate: string; endDate: string; deliveryMode: string;
  modules: LocalModule[]; // module-type phases: exactly one entry; generic phases: 0+
  activities: LocalActivity[]; // activity-type phases only (flat cards)
}

const uid = () => "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

function actToLocal(a: ActivityDTO): LocalActivity {
  return {
    id: a.id, type: a.type, title: a.title, date: "", config: a.config as Record<string, unknown> | undefined,
    faculty: a.faculty, durationMins: a.duration_mins, startDay: a.start_day, dueDayOffset: a.due_day_offset,
  };
}
function moduleToLocal(m: ModuleDTO): LocalModule {
  return { id: m.id, title: m.title, type: m.delivery_mode, date: m.session_date || "", pre: m.pre.map(actToLocal), post: m.post.map(actToLocal) };
}
function phaseToLocal(p: PhaseDTO, fallbackIcon: string): LocalPhase {
  const tpl = DS_PHASE_TYPES.find(t => t.type === p.phase_type);
  const startDate = p.start_day > 0 ? "" : ""; // dates are derived from program start elsewhere; placeholder replaced in buildPhases
  void startDate;
  return {
    id: p.id, type: p.phase_type, label: p.title, color: p.color, icon: tpl?.icon || fallbackIcon,
    startDate: "", endDate: "", deliveryMode: p.delivery_mode || "",
    modules: p.modules.map(moduleToLocal),
    activities: p.activities.map(actToLocal),
  };
}

// Convert absolute day offsets (1-based, relative to program start) to ISO dates,
// since the server stores start_day/end_day but the reference UI works in dates.
//
// Deliberately does NOT trust raw start_day for POSITIONING - only for each
// phase's own DURATION (end_day - start_day). Phases are laid out sequentially
// in array order instead, exactly like recomputePhaseDates(): phase 0 starts
// at progStart, phase N+1 starts the day after phase N ends. This makes the
// studio self-healing against historically-corrupted start_day/end_day data
// (several bugs upstream of this fix - a save-time off-by-one, and a
// drag-reorder recompute that let a phase start on the same day its
// predecessor ended - could persist overlapping or collapsed day ranges to
// the server, e.g. phase A: day 1-5, phase B: day 3-5). Trusting array order
// for position + each phase's own duration is exactly the invariant the rest
// of the Studio (drag reorder, delete) already relies on, so this just
// applies it uniformly on load too, instead of only after a client-side edit.
function buildPhases(program: ProgramDetailDTO): LocalPhase[] {
  const progStart = program.start_date ? new Date(program.start_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  const rawPhases = program.phases ?? [];
  let cursor = progStart;
  return rawPhases.map((p, i) => {
    const local = phaseToLocal(p, DS_PHASE_TYPES[i % DS_PHASE_TYPES.length].icon);
    const durationDays = Math.max(0, p.end_day - p.start_day);
    const startDate = i === 0 ? cursor : addDaysStr(cursor, 1);
    const endDate = addDaysStr(startDate, durationDays);
    cursor = endDate;
    local.startDate = startDate;
    local.endDate = endDate;
    local.modules.forEach(m => { if (!m.date) m.date = local.startDate; });
    return local;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────
interface Props { program: ProgramDetailDTO; orgId?: string; onProgramUpdated: (p: ProgramDetailDTO) => void; onBack: () => void; onNavigateToCapstone?: () => void; }

export default function PMDesignStudio({ program, orgId, onProgramUpdated, onBack, onNavigateToCapstone }: Props) {
  const progColor = program.color || C.orange;
  // progStart/progEnd default to "today.."today+140" purely so the date
  // pickers have something sensible to show for a program that has never had
  // dates set - but that fabricated default must never be silently persisted
  // as if the PM had chosen it. datesTouched tracks whether the program
  // already had real saved dates OR the PM has actually edited a picker this
  // session; handleSave only sends start_date/end_date when true. Without
  // this, ANY save (e.g. just adding an activity) on a dates-never-set
  // program would PATCH today's date in as the real program start/end, and
  // every phase/module date - derived from progStart in buildPhases - would
  // then collapse onto that same day on next reopen.
  const [progStart, setProgStart] = useState(program.start_date ? new Date(program.start_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [progEnd, setProgEnd] = useState(program.end_date ? new Date(program.end_date).toISOString().slice(0, 10) : addDaysStr(new Date().toISOString().slice(0, 10), 140));
  const [datesTouched, setDatesTouched] = useState(!!(program.start_date && program.end_date));
  // A program ending before it starts can't be saved - dbw()'s day-count math
  // (used to derive every phase's start_day/end_day from these two dates)
  // has no sane meaning for a negative span.
  const progDatesInvalid = !!(progStart && progEnd && progEnd < progStart);

  const [phases, setPhases] = useState<LocalPhase[]>(() => buildPhases(program));
  const phasesExceedEnd = !!(phases.length > 0 && progEnd && phases[phases.length - 1].endDate > progEnd);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  // Capstone attach: creating a config links this program to the Capstone tab
  // and notifies faculty to configure it. Keyed by phaseId → status message.
  const [capstoneAttach, setCapstoneAttach] = useState<Record<string, "idle" | "busy" | "done" | "error">>({});

  // Hydrate from the backend on mount/program change - capstoneAttach starts
  // empty every remount (e.g. navigating away and back into the Studio), so
  // without this the "Set up Capstone" button would show as available again
  // for a phase that already has a config, letting a re-click create a
  // second capstone for the same phase.
  useEffect(() => {
    let cancelled = false;
    capstoneManageApi.list(orgId).then(res => {
      if (cancelled) return;
      const attached: Record<string, "done"> = {};
      for (const cfg of res.data ?? []) {
        if (cfg.program_id === program.id && cfg.phase_id) attached[cfg.phase_id] = "done";
      }
      setCapstoneAttach(s => ({ ...attached, ...s }));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [program.id, orgId]);

  async function attachCapstone(phaseId: string) {
    if (capstoneAttach[phaseId] === "busy") return;
    setCapstoneAttach(s => ({ ...s, [phaseId]: "busy" }));
    try {
      await capstoneManageApi.create({ program_id: program.id, phase_id: phaseId, title: "Capstone Project" });
      setCapstoneAttach(s => ({ ...s, [phaseId]: "done" }));
    } catch {
      setCapstoneAttach(s => ({ ...s, [phaseId]: "error" }));
    }
  }
  const [saveMsg, setSaveMsg] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [showEnrol, setShowEnrol] = useState(false);
  const [publishFlow, setPublishFlow] = useState<null | "confirm" | "success">(null);
  const [confirmDel, setConfirmDel] = useState<{ type: string; id: string; label: string } | null>(null);

  // Autosave
  const lastSavedPhases = useRef(JSON.stringify(phases));
  const lastSavedStart = useRef(progStart);
  const lastSavedEnd = useRef(progEnd);

  useEffect(() => {
    const currentPhasesJson = JSON.stringify(phases);
    if (
      currentPhasesJson === lastSavedPhases.current &&
      progStart === lastSavedStart.current &&
      progEnd === lastSavedEnd.current
    ) {
      return;
    }

    const timer = setTimeout(() => {
      lastSavedPhases.current = currentPhasesJson;
      lastSavedStart.current = progStart;
      lastSavedEnd.current = progEnd;
      handleSave(false);
    }, 2000);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phases, progStart, progEnd]);

  // Open Program (marketplace) toggle - lists the program on the public landing
  // page and opens it for self-enrollment.
  const [isOpen, setIsOpen] = useState(!!program.is_open);
  const [openSaving, setOpenSaving] = useState(false);
  // Program Pricing modal - prompted on the off→on transition (see
  // toggleOpen below), or immediately if the program is already open but has
  // never had a price set (lazy initializer, so this is a one-time check
  // against the program's initial props rather than a synchronous setState
  // inside an effect).
  const [showPricingModal, setShowPricingModal] = useState(() => !!program.is_open && !program.payment_required);
  async function toggleOpen() {
    const next = !isOpen;
    setIsOpen(next);
    setOpenSaving(true);
    try {
      const body: Partial<{ is_open: boolean; payment_required: boolean }> = { is_open: next };
      // Turning the program back off also turns off payment_required - the
      // previously saved price_amount/currency/GST fields are deliberately
      // left OUT of this partial update (not cleared), so re-opening later
      // restores the exact same pricing without re-entering it.
      if (!next && program.payment_required) {
        body.payment_required = false;
      }
      await programsApi.update(program.id, body);
      onProgramUpdated({ ...program, is_open: next, ...(body.payment_required === false ? { payment_required: false } : {}) });
      if (next && !program.payment_required) {
        setShowPricingModal(true);
      }
    } catch (e) {
      setIsOpen(!next); // revert on failure
      setSaveMsg(`✗ ${e instanceof Error ? e.message : "Failed to update"}`);
    } finally {
      setOpenSaving(false);
    }
  }


  // Modal state
  const [dateModal, setDateModal] = useState<DateModalState | null>(null);
  const [phaseEditModal, setPhaseEditModal] = useState<PhaseEditTarget | null>(null);
  const [moduleModal, setModuleModal] = useState<{ phaseId: string; phaseColor: string } | null>(null);
  const [elementModal, setElementModal] = useState<{ phaseId: string; moduleId: string; slot: "pre" | "post" } | null>(null);
  // Clicking an ELEMENTS-band chip has no specific module to target (unlike
  // the in-module "+" button), so it opens the same picker pre-filtered to
  // that element type and lets the user pick which module/slot to attach it
  // to. Attaches to the first available module in the program as a sane
  // default target, same as the in-module "+" flow otherwise.
  const [elementPicker, setElementPicker] = useState<{ presetType: string } | null>(null);
  const [elementConfigModal, setElementConfigModal] = useState<{ phaseId: string; moduleId: string; slot: "pre" | "post"; act: LocalActivity } | null>(null);
  const [activityModal, setActivityModal] = useState<{ phaseId: string; phaseType: string; phaseColor: string } | null>(null);
  const [workflowModal, setWorkflowModal] = useState<{ phaseId: string; actId: string; title: string } | null>(null);
  const [genericActivityModal, setGenericActivityModal] = useState<{ phaseId: string; actId: string; title: string } | null>(null);
  const [scheduleModal, setScheduleModal] = useState<{ phaseId: string; moduleId?: string; act: LocalActivity } | null>(null);
  const [conflictModal, setConflictModal] = useState<{ phaseId: string; moduleId?: string; actId: string; faculty: OrgFacultyMember; role: string; conflicts: ConflictDTO[] } | null>(null);

  // Faculty roster (for drag-assign)
  const [orgFaculty, setOrgFaculty] = useState<OrgFacultyMember[]>([]);
  useEffect(() => { if (orgId) programsApi.listOrgFaculty(orgId).then(r => setOrgFaculty(r.data ?? [])).catch(() => {}); }, [orgId]);

  // Session lists per session-capable activity, loaded lazily when its card is shown
  const [sessionsByAct, setSessionsByAct] = useState<Record<string, ScheduledSessionDTO[]>>({});
  useEffect(() => {
    const ids: string[] = [];
    phases.forEach(ph => {
      ph.modules.forEach(m => [...m.pre, ...m.post].forEach(a => { if ((a.type === "live_session" || a.type === "coaching") && /^[0-9a-f-]{36}$/i.test(a.id)) ids.push(a.id); }));
    });
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    ids.filter(id => uuidRe.test(id) && !(id in sessionsByAct)).forEach(id => {
      programsApi.listActivitySessions(program.id, id).then(r => setSessionsByAct(prev => ({ ...prev, [id]: r.data ?? [] }))).catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phases]);

  const totalModules = phases.reduce((n, p) => n + p.modules.length, 0);
  const totalElements = phases.reduce((n, p) => n + p.modules.reduce((nm, m) => nm + m.pre.length + m.post.length, 0) + p.activities.length, 0);
  const totalEffortMins = phases.reduce((n, p) => n + phaseEffortMins(p), 0);
  const [showEffort, setShowEffort] = useState(false);

  // ── Phase mutations (local state only - persisted on Save Draft) ──────────
  function addPhaseClick(pt: typeof DS_PHASE_TYPES[number]) {
    const last = phases.length ? phases[phases.length - 1] : null;
    const rawStart = last ? addDaysStr(last.endDate, 7) : progStart;
    // The suggested start (previous phase's end + a 7-day gap) can itself
    // already be past the program's own end date on a short program - clamp
    // it first, then clamp the default-duration end date off the clamped
    // start, so the modal never opens with start > end (which produced a
    // permanently-invalid "End date can't be before the start date" state
    // the PM couldn't get out of without manually retyping both fields).
    const sd = progEnd && rawStart > progEnd ? progEnd : rawStart;
    const defaultEnd = addDaysStr(sd, pt.defaultDays);
    const ed = progEnd && defaultEnd > progEnd ? progEnd : defaultEnd;
    setDateModal({ phaseType: pt, startDate: sd, endDate: ed });
  }
  function confirmAddPhase(pt: typeof DS_PHASE_TYPES[number], start: string, end: string, mode: string, label: string) {
    const dl = pt.deliveryMode || mode || "";
    const autoMod: LocalModule[] = isModulePhase(pt.type) ? [{ id: uid(), title: label || pt.label, type: (dl as "virtual" | "in-person") || "virtual", date: start, pre: [], post: [] }] : [];
    const np: LocalPhase = { id: uid(), type: pt.type, label: label || pt.label, color: pt.color, icon: pt.icon, startDate: start, endDate: end, deliveryMode: dl, modules: autoMod, activities: [] };
    setPhases(prev => [...prev, np]);
    setDateModal(null);
  }
  // Squeezes every phase's start/end date proportionally into the program's
  // own [progStart, progEnd] window, by relative duration share (a stacked-bar
  // layout, not a fixed 7-day-gap reflow like recomputePhaseDates) - used to
  // fix an existing draft whose phases already run past the program's dates,
  // per the PM's dates being the fixed boundary rather than something the
  // tool should widen to cover the overflow. Every offset is derived from
  // progStart + a day-count clamped into [0, totalSpanDays], so the result
  // can never fall outside the program's own timeline - including the
  // degenerate case of a same-day program, where every phase collapses onto
  // that single day since there's nowhere else for them to fit.
  function fitPhasesToProgramDates() {
    if (!progStart || !progEnd || phases.length === 0) return;
    const totalSpanDays = Math.max(0, Math.round((new Date(progEnd + "T00:00:00").getTime() - new Date(progStart + "T00:00:00").getTime()) / 86400000));
    const durations = phases.map(p => dbw(p.startDate, p.endDate));
    const totalDuration = durations.reduce((a, b) => a + b, 0) || 1;
    let cumulative = 0;
    const updated = phases.map((p, i) => {
      const startOffset = Math.round((cumulative / totalDuration) * totalSpanDays);
      cumulative += durations[i];
      const endOffset = Math.max(startOffset, Math.round((cumulative / totalDuration) * totalSpanDays));
      const start = addDaysStr(progStart, startOffset);
      const end = addDaysStr(progStart, endOffset);
      return { ...p, startDate: start, endDate: end, modules: p.modules.map(m => ({ ...m, date: start })) };
    });
    setPhases(updated);
    setSaveMsg("");
  }
  function updatePhase(id: string, u: Partial<LocalPhase>) {
    setPhases(prev => prev.map(p => {
      if (p.id !== id) return p;
      const next = { ...p, ...u };
      // A module-type phase's single auto-created module carries its own
      // `date` field (shown on the module row, separately from the phase's
      // startDate/endDate range on the left) - editing the phase's start
      // date here without also moving the module's date left it stuck on
      // whatever date the module was first created with, so the module row
      // and the phase's own timeline range silently drifted apart.
      if (u.startDate && u.startDate !== p.startDate && isModulePhase(p.type)) {
        return { ...next, modules: next.modules.map(m => ({ ...m, date: u.startDate! })) };
      }
      return next;
    }));
  }
  // recomputePhaseDates() only touches startDate/endDate (it's generic over
  // any {id,startDate,endDate} shape, used elsewhere for non-module phases
  // too) - a module-type phase's module.date needs the same shift applied
  // afterward, or it drifts away from its own phase's dates exactly like the
  // updatePhase() case above.
  function syncModuleDates(list: LocalPhase[]): LocalPhase[] {
    return list.map(p => isModulePhase(p.type) ? { ...p, modules: p.modules.map(m => ({ ...m, date: p.startDate })) } : p);
  }
  function deletePhaseLocal(id: string) {
    setPhases(prev => {
      const gaps = capturePhaseGaps(prev);
      return syncModuleDates(recomputePhaseDates(prev.filter(p => p.id !== id), progStart, gaps));
    });
    setConfirmDel(null);
  }

  function addModule(phaseId: string, data: { title: string; type: "virtual" | "in-person"; date: string }) {
    setPhases(prev => prev.map(p => p.id !== phaseId ? p : { ...p, modules: [...p.modules, { id: uid(), pre: [], post: [], ...data }] }));
    setModuleModal(null);
  }
  function deleteModuleLocal(phaseId: string, modId: string) { setPhases(prev => prev.map(p => p.id !== phaseId ? p : { ...p, modules: p.modules.filter(m => m.id !== modId) })); }
  function renameModule(phaseId: string, modId: string, title: string) { setPhases(prev => prev.map(p => p.id !== phaseId ? p : { ...p, modules: p.modules.map(m => m.id !== modId ? m : { ...m, title }) })); }

  function addElement(phaseId: string, modId: string, slot: "pre" | "post", el: typeof DS_ELEMENT_TYPES[number]) {
    // Several element types (Quiz, eLearning, L1-L4 Feedback, etc.) collapse
    // onto the same backend activity_type (assessment/video/survey) - store the
    // original picker type in config so content-library lookups stay exact
    // instead of being lossily re-derived from the collapsed activity type.
    const baseConfig: Record<string, unknown> = { element_type: el.type };
    // L1-L4 Kirkpatrick feedback chips tag the created survey activity with a
    // level (matches SurveyConfig.Level in api/internal/programs/activity_configs.go)
    // so Design Studio's picker actually means something, instead of silently
    // collapsing to an untagged generic survey.
    const levelMatch = el.type.match(/^l([1-4])-feedback$/);
    if (levelMatch) baseConfig.level = `l${levelMatch[1]}`;
    const na: LocalActivity = { id: uid(), type: el.activityType, title: el.label, date: "", durationMins: 30, config: baseConfig };
    setPhases(prev => prev.map(p => p.id !== phaseId ? p : {
      ...p, modules: p.modules.map(m => m.id !== modId ? m : { ...m, [slot]: [...m[slot], na] }),
    }));
  }
  function removeElement(phaseId: string, modId: string, slot: "pre" | "post", elId: string) {
    setPhases(prev => prev.map(p => p.id !== phaseId ? p : {
      ...p, modules: p.modules.map(m => m.id !== modId ? m : { ...m, [slot]: m[slot].filter(e => e.id !== elId) }),
    }));
  }
  function updateElementConfig(phaseId: string, modId: string, slot: "pre" | "post", elId: string, data: ElementConfigSave) {
    // Optional attached knowledge check → config.knowledge_check (matches the
    // Go KnowledgeCheck sub-config). Cleared when detached.
    const kc = data.knowledgeCheck
      ? {
          asset_id: data.knowledgeCheck.assetId,
          time_limit_mins: data.knowledgeCheck.timeLimitMins,
          attempts_allowed: data.knowledgeCheck.attemptsAllowed,
          passing_score_pct: data.knowledgeCheck.passingScorePct,
        }
      : undefined;
    // Standalone Quiz/Assessment element's own timer/attempts/pass score →
    // TOP-LEVEL config fields (matches assessmentCfg in
    // api/internal/assessments/service.go: time_limit_mins/attempts_allowed/
    // passing_score_pct read directly off the activity's config_json) - not
    // nested, unlike knowledge_check which is for a quiz attached to OTHER
    // content.
    const quizFields = data.quizSettings
      ? {
          time_limit_mins: data.quizSettings.timeLimitMins,
          attempts_allowed: data.quizSettings.attemptsAllowed,
          passing_score_pct: data.quizSettings.passingScorePct,
        }
      : undefined;
    setPhases(prev => prev.map(p => p.id !== phaseId ? p : {
      ...p, modules: p.modules.map(m => m.id !== modId ? m : {
        ...m, [slot]: m[slot].map(e => e.id !== elId ? e : {
          ...e, title: data.assetTitle,
          config: {
            ...e.config, asset_id: data.assetId, knowledge_check: kc, ...quizFields,
            ...(data.externalLinkEnabled !== undefined ? { external_link_enabled: data.externalLinkEnabled } : {}),
          },
          startDay: data.startDay, dueDayOffset: data.dueDayOffset,
        }),
      }),
    }));
  }
  // Live Session format (Virtual/In-person) - same local-draft-then-batch-save
  // pattern as updateElementConfig above; persisted with everything else on
  // "Save Program", not immediately.
  function setSessionFormat(phaseId: string, modId: string, slot: "pre" | "post", elId: string, sessionType: "in_person" | "virtual") {
    setPhases(prev => prev.map(p => p.id !== phaseId ? p : {
      ...p, modules: p.modules.map(m => m.id !== modId ? m : {
        ...m, [slot]: m[slot].map(e => e.id !== elId ? e : { ...e, config: { ...e.config, session_type: sessionType } }),
      }),
    }));
  }

  function addActivityToPhase(phaseId: string, title: string, color: string, date: string) {
    void color;
    const na: LocalActivity = { id: uid(), type: "admin_task", title, date, durationMins: 30 };
    setPhases(prev => prev.map(p => p.id !== phaseId ? p : { ...p, activities: [...p.activities, na] }));
    setActivityModal(null);
  }
  function deleteActivityFromPhase(phaseId: string, actId: string) {
    setPhases(prev => prev.map(p => p.id !== phaseId ? p : { ...p, activities: p.activities.filter(a => a.id !== actId) }));
  }
  function saveWorkflow(phaseId: string, actId: string, data: WorkflowData) {
    setPhases(prev => prev.map(p => p.id !== phaseId ? p : {
      ...p, activities: p.activities.map(a => a.id !== actId ? a : { ...a, config: { fields: data.fields, items: data.items, email_body: data.email_body } }),
    }));
  }
  function saveGenericActivity(phaseId: string, actId: string, data: GenericActivityData) {
    setPhases(prev => prev.map(p => p.id !== phaseId ? p : {
      ...p, activities: p.activities.map(a => a.id !== actId ? a : { ...a, date: data.date ?? a.date, config: { ...a.config, instructions: data.instructions } }),
    }));
  }

  // ── Faculty assignment (persists immediately - needs a real activity id) ──
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  async function assignFacultyToAct(phaseId: string, modId: string | undefined, actId: string, faculty: OrgFacultyMember, role = "Lead", overrideNote?: string) {
    if (!uuidRe.test(actId)) { setSaveMsg("Save the program first before assigning faculty."); setTimeout(() => setSaveMsg(""), 3000); return; }
    try {
      const res = await programsApi.assignFaculty(program.id, actId, { faculty_user_id: faculty.id, role, ...(overrideNote ? { override_note: overrideNote } : {}) });
      const entry = res.data as ActivityFacultyDTO;
      patchActFaculty(phaseId, modId, actId, prev => [...(prev ?? []).filter(f => f.faculty_user_id !== faculty.id), entry]);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const conflicts = (e.data as { conflicts?: ConflictDTO[] } | undefined)?.conflicts ?? [];
        setConflictModal({ phaseId, moduleId: modId, actId, faculty, role, conflicts });
      }
    }
  }
  async function removeFacultyFromAct(phaseId: string, modId: string | undefined, actId: string, facultyUserId: string) {
    if (!uuidRe.test(actId)) return;
    await programsApi.removeFaculty(program.id, actId, facultyUserId).catch(() => {});
    patchActFaculty(phaseId, modId, actId, prev => (prev ?? []).filter(f => f.faculty_user_id !== facultyUserId));
  }
  function patchActFaculty(phaseId: string, modId: string | undefined, actId: string, fn: (prev: ActivityFacultyDTO[] | undefined) => ActivityFacultyDTO[]) {
    setPhases(prev => prev.map(p => {
      if (p.id !== phaseId) return p;
      if (modId) return { ...p, modules: p.modules.map(m => m.id !== modId ? m : { ...m, pre: m.pre.map(a => a.id === actId ? { ...a, faculty: fn(a.faculty) } : a), post: m.post.map(a => a.id === actId ? { ...a, faculty: fn(a.faculty) } : a) }) };
      return { ...p, activities: p.activities.map(a => a.id === actId ? { ...a, faculty: fn(a.faculty) } : a) };
    }));
  }

  // ── Save (create/update phases → modules → activities against real API) ──
  const savedPhaseIds = useRef<Set<string>>(new Set(program.phases?.map(p => p.id) ?? []));
  const savedModuleIds = useRef<Set<string>>(new Set(program.phases?.flatMap(p => p.modules.map(m => m.id)) ?? []));
  const savedActIds = useRef<Set<string>>(new Set(program.phases?.flatMap(p => [...p.activities, ...p.modules.flatMap(m => [...m.pre, ...m.post])].map(a => a.id)) ?? []));
  // moduleId -> owning phaseId, needed for deleteModule's URL even after the
  // module has already been removed from local `phases` state.
  const savedModulePhase = useRef<Map<string, string>>(new Map(
    program.phases?.flatMap(p => p.modules.map(m => [m.id, p.id] as const)) ?? []
  ));

  async function handleSave(publish = false) {
    if (saving) return false;
    if (progDatesInvalid) { setSaveMsg("✗ End date can't be before the start date"); return false; }
    if (phasesExceedEnd) {
      const lastEnd = phases[phases.length - 1].endDate;
      setSaveMsg(`✗ Your last phase runs through ${fmtShort(lastEnd)}, past the program's end date (${fmtShort(progEnd)}). Phases must stay inside the program's own dates - use "Fit phases to program dates" below, or edit/remove phases individually.`);
      return false;
    }
    // A published program must have a real, PM-set timeline - everything
    // downstream (phase/module/activity dates, cohort scheduling, faculty
    // session windows) is derived from progStart/progEnd, so publishing
    // without ever touching the date pickers would launch a program whose
    // dates are just today..today+140 defaults, never actually seen or
    // confirmed by the PM.
    if (publish && !datesTouched) { setSaveMsg("✗ Set a program start and end date before publishing"); return false; }
    setSaving(true); setSaveMsg("Saving…");
    try {
      // Only persist dates once they're real - see datesTouched comment above.
      if (datesTouched) {
        await programsApi.update(program.id, { start_date: progStart, end_date: progEnd });
      }

      const prevPhaseIds = new Set(savedPhaseIds.current);
      const prevModuleIds = new Set(savedModuleIds.current);
      const prevActIds = new Set(savedActIds.current);

      for (let i = 0; i < phases.length; i++) {
        const ph = phases[i];
        const isNewPh = !savedPhaseIds.current.has(ph.id);
        // start_day/end_day are decoded back into dates the same way
        // buildPhases() and recomputePhaseDates() do: endDate = startDate +
        // (end_day - start_day) days, with NO extra "-1". An earlier version
        // here computed ed = sd + dbw(...) - 1, which under-counts the span
        // by one day - e.g. a phase visibly running 15→18 Jul (3 day-steps)
        // saved as start_day=1/end_day=3 (a 2-day span), so the very next
        // load recomputed endDate as 15+2=17 Jul: the phase's end date would
        // visibly shrink by a day on every single save, with no user edit.
        //
        // The duration term uses calendarDiffDays(), NOT dbw(), because dbw()
        // floors to a minimum of 1 - for a genuinely same-day phase (start
        // and end both 21 Jul, e.g. a single-day module), that floor forced
        // end_day = start_day + 1, so the very next load reconstructed
        // endDate as 21+1 = 22 Jul: a phase the PM set to a single day would
        // visibly grow by a day on every save, with no user edit.
        const sd = dbw(progStart, ph.startDate);
        const ed = sd + calendarDiffDays(ph.startDate, ph.endDate);
        let phId = ph.id;
        if (isNewPh) {
          const r = await programsApi.createPhase(program.id, { title: ph.label, color: ph.color, phase_number: i, start_day: sd, end_day: ed, phase_type: ph.type, delivery_mode: ph.deliveryMode });
          phId = r.data.id;
          savedPhaseIds.current.add(phId);
        } else {
          await programsApi.updatePhase(program.id, ph.id, { title: ph.label, color: ph.color, phase_number: i, start_day: sd, end_day: ed, phase_type: ph.type, delivery_mode: ph.deliveryMode });
        }

        // Modules
        for (const m of ph.modules) {
          const isNewMod = !savedModuleIds.current.has(m.id);
          let modId = m.id;
          if (isNewMod) {
            const r = await programsApi.createModule(program.id, phId, { title: m.title, delivery_mode: m.type, session_date: m.date || undefined });
            modId = r.data.id;
            savedModuleIds.current.add(modId);
            savedModulePhase.current.set(modId, phId);
          } else {
            await programsApi.updateModule(program.id, phId, m.id, { title: m.title, delivery_mode: m.type, session_date: m.date || undefined });
          }
          for (const slot of ["pre", "post"] as const) {
            for (const a of m[slot]) {
              await saveActivity(phId, a, modId, slot);
            }
          }
        }

        // Flat activities (activity-type phases)
        for (const a of ph.activities) {
          await saveActivity(phId, a);
        }
      }

      // Deletions - mirror the create/update loop above: anything that was
      // saved before but is no longer present in the live `phases` tree was
      // removed via the × icon and needs an explicit DELETE call, since the
      // save loop only ever creates/updates items it currently sees.
      const liveActIds = new Set(phases.flatMap(p => [...p.activities, ...p.modules.flatMap(m => [...m.pre, ...m.post])].map(a => a.id)));
      for (const prevId of prevActIds) {
        if (!liveActIds.has(prevId)) {
          await programsApi.deleteActivity(program.id, prevId).catch(() => {});
          savedActIds.current.delete(prevId);
        }
      }

      const liveModuleIds = new Set(phases.flatMap(p => p.modules.map(m => m.id)));
      const livePhaseIds = new Set(phases.map(p => p.id));
      for (const prevId of prevModuleIds) {
        if (!liveModuleIds.has(prevId)) {
          const ownerPhaseId = savedModulePhase.current.get(prevId);
          // Only call deleteModule if its phase is still around - a phase
          // delete already cascades its modules server-side, and the phase
          // itself is gone this save, so this URL would just 404.
          if (ownerPhaseId && livePhaseIds.has(ownerPhaseId)) {
            await programsApi.deleteModule(program.id, ownerPhaseId, prevId).catch(() => {});
          }
          savedModuleIds.current.delete(prevId);
          savedModulePhase.current.delete(prevId);
        }
      }

      for (const prevId of prevPhaseIds) {
        if (!phases.some(p => p.id === prevId)) {
          await programsApi.deletePhase(program.id, prevId).catch(() => {});
          savedPhaseIds.current.delete(prevId);
        }
      }

      if (publish) await programsApi.publish(program.id);

      const r = await programsApi.get(program.id);
      onProgramUpdated(r.data);
      savedPhaseIds.current = new Set(r.data.phases?.map(p => p.id) ?? []);
      savedModuleIds.current = new Set(r.data.phases?.flatMap(p => p.modules.map(m => m.id)) ?? []);
      savedActIds.current = new Set(r.data.phases?.flatMap(p => [...p.activities, ...p.modules.flatMap(m => [...m.pre, ...m.post])].map(a => a.id)) ?? []);
      savedModulePhase.current = new Map(r.data.phases?.flatMap(p => p.modules.map(m => [m.id, p.id] as const)) ?? []);
      setPhases(buildPhases(r.data));
      // Re-sync from what the server actually now has, and mark dates as
      // real once they exist - either they always did, or this save just set
      // them for the first time via datesTouched above.
      if (r.data.start_date) setProgStart(new Date(r.data.start_date).toISOString().slice(0, 10));
      if (r.data.end_date) setProgEnd(new Date(r.data.end_date).toISOString().slice(0, 10));
      if (r.data.start_date && r.data.end_date) setDatesTouched(true);
      setSaveMsg("✓ Saved");
      setTimeout(() => setSaveMsg(""), 2500);
      return true;
    } catch (e) {
      // Left visible until the ErrorToast (below) dismisses it - no separate timer here.
      setSaveMsg(`✗ ${e instanceof Error ? e.message : "Error"}`);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function saveActivity(phaseId: string, a: LocalActivity, moduleId?: string, slot?: "pre" | "post") {
    // Self-heal live_session activities missing session_type - the backend's
    // LiveSessionConfig.Validate() rejects the whole save otherwise. New
    // activities already default this at creation (see addElement), but an
    // activity created before that fix, or one whose config was otherwise
    // never given a format, would still be missing it and block every future
    // save of this program until fixed here, not just its own edit.
    const config = a.type === "live_session" && a.config?.session_type !== "in_person" && a.config?.session_type !== "virtual"
      ? { ...a.config, session_type: "virtual" }
      : a.config;

    const isNew = !savedActIds.current.has(a.id);
    if (isNew) {
      const r = await programsApi.createActivity(program.id, {
        phase_id: phaseId, module_id: moduleId, slot, title: a.title, type: a.type,
        duration_mins: a.durationMins, config, start_day: a.startDay, due_day_offset: a.dueDayOffset,
      });
      savedActIds.current.add(r.data.id);
    } else {
      await programsApi.updateActivity(program.id, a.id, {
        title: a.title, duration_mins: a.durationMins, config, start_day: a.startDay, due_day_offset: a.dueDayOffset,
      });
    }
  }

  function exportPDF() {
    const w = window.open("", "_blank", "width=900,height=700"); if (!w) return;
    w.document.write(buildProgramBrochureHTML(program, phases, progStart, progEnd));
    w.document.close(); w.focus(); setTimeout(() => w.print(), 350);
  }

  // ── Drag reorder ──────────────────────────────────────────────────────────
  const dragPhaseIdRef = useRef<string | null>(null);
  const [dragPhaseId, setDragPhaseId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  function reorderPhases(fromId: string, toId: string) {
    if (!fromId || fromId === toId) return;
    setPhases(prev => {
      const from = prev.find(p => p.id === fromId);
      if (!from) return prev;
      const gaps = capturePhaseGaps(prev);
      const pairGaps = capturePairGaps(prev);
      const rest = prev.filter(p => p.id !== fromId);
      let toIdx = rest.findIndex(p => p.id === toId);
      if (toIdx === -1) toIdx = rest.length;
      const reordered = [...rest.slice(0, toIdx), from, ...rest.slice(toIdx)];
      // Every phase keeps ITS OWN duration (untouched above). Only the
      // gap-before-it needs re-deriving, because a gap is a relationship
      // between two neighbors and the neighbors just changed:
      //  - the dragged phase now leads into whoever it displaced - reuse
      //    the gap that pair had between them before the drag (e.g. P1<->P2's
      //    old gap), so swapping two adjacent phases preserves the same
      //    breathing room at that junction instead of collapsing to 0.
      //  - everyone else still follows the same neighbor they always did
      //    (just shifted by one slot), so their own captured gap still
      //    applies unchanged.
      const newGaps: Record<string, number> = { ...gaps };
      const draggedIdx = reordered.findIndex(p => p.id === fromId);
      if (draggedIdx > 0) {
        const newPrev = reordered[draggedIdx - 1];
        newGaps[fromId] = pairGaps[fromId]?.[newPrev.id] ?? pairGaps[newPrev.id]?.[fromId] ?? gaps[toId] ?? 0;
      }
      const afterDragged = reordered[draggedIdx + 1];
      if (afterDragged) {
        newGaps[afterDragged.id] = pairGaps[afterDragged.id]?.[fromId] ?? pairGaps[fromId]?.[afterDragged.id] ?? gaps[afterDragged.id] ?? 0;
      }
      return syncModuleDates(recomputePhaseDates(reordered, progStart, newGaps));
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", fontFamily: "Poppins,sans-serif" }}>

      {/* TOP PALETTE BAND */}
      <div style={{ background: C.navy, flexShrink: 0, userSelect: "none", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 0, padding: "8px 16px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <button onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.45)", fontFamily: "Poppins,sans-serif", padding: 0, flexShrink: 0 }}>← Programs</button>
          <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.15)", margin: "0 10px", flexShrink: 0 }} />
          <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{program.title}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, marginLeft: 16 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontWeight: 600 }}>Dates:</span>
            <input type="date" value={progStart} onChange={e => { setProgStart(e.target.value); setDatesTouched(true); }} style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: "4px 10px", fontSize: 11, fontFamily: "Poppins,sans-serif", color: C.navy, outline: "none", background: "#fff", fontWeight: 600 }} />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>→</span>
            <input type="date" value={progEnd} min={progStart || undefined} onChange={e => { setProgEnd(e.target.value); setDatesTouched(true); }} style={{ border: `1px solid ${progDatesInvalid ? "#ef4444" : C.border}`, borderRadius: 7, padding: "4px 10px", fontSize: 11, fontFamily: "Poppins,sans-serif", color: C.navy, outline: "none", background: "#fff", fontWeight: 600 }} />
            {progDatesInvalid && <span style={{ fontSize: 10, fontWeight: 700, color: "#fca5a5" }}>⚠ End before start</span>}
            <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.15)", margin: "0 4px" }} />
            {saveMsg && <span style={{ fontSize: 11, fontWeight: 700, color: saveMsg.startsWith("✓") ? C.green : saveMsg.startsWith("✗") ? "#ef4444" : "rgba(255,255,255,0.7)" }}>{saveMsg}</span>}
            <button onClick={() => {
              const allCollapsed = phases.every(p => collapsed[p.id]);
              const next: Record<string, boolean> = {}; phases.forEach(p => { next[p.id] = !allCollapsed; }); setCollapsed(next);
            }} style={{ padding: "4px 12px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", fontFamily: "Poppins,sans-serif" }}>{phases.length > 0 && phases.every(p => collapsed[p.id]) ? "⊞ Expand All" : "⊟ Collapse All"}</button>
            <button onClick={() => setShowPreview(true)} style={{ padding: "4px 12px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", fontFamily: "Poppins,sans-serif" }}>👁 Preview</button>
            <button onClick={() => setShowEffort(true)} title="Estimated learner time commitment per phase" style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", fontFamily: "Poppins,sans-serif" }}>
              ⏱ Effort <span style={{ color: "#fff", fontWeight: 700 }}>{fmtEffort(totalEffortMins)}</span>
            </button>
            <button onClick={exportPDF} style={{ padding: "4px 12px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", fontFamily: "Poppins,sans-serif" }}>⬇ PDF</button>
            {/* Open Program (marketplace) toggle - always available, independent of publish status */}
            <button onClick={toggleOpen} disabled={openSaving}
              title="List this program on the public landing page and open it for self-enrollment"
              style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 12px", background: isOpen ? "rgba(200, 168, 96,0.9)" : "rgba(255,255,255,0.1)", border: `1px solid ${isOpen ? C.orange : "rgba(255,255,255,0.18)"}`, borderRadius: 7, cursor: openSaving ? "wait" : "pointer", fontFamily: "Poppins,sans-serif", opacity: openSaving ? 0.7 : 1 }}>
              <span style={{ width: 26, height: 14, borderRadius: 99, background: isOpen ? "#fff" : "rgba(255,255,255,0.25)", position: "relative", flexShrink: 0, transition: "background 0.15s" }}>
                <span style={{ position: "absolute", top: 2, left: isOpen ? 14 : 2, width: 10, height: 10, borderRadius: "50%", background: isOpen ? C.orange : "#fff", transition: "left 0.15s" }} />
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#fff", whiteSpace: "nowrap" }}>Open Program</span>
            </button>
            <button onClick={() => handleSave(false)} disabled={saving || progDatesInvalid || phasesExceedEnd} title={progDatesInvalid ? "Fix the program dates before saving" : phasesExceedEnd ? "Phases extend beyond program end date" : undefined} style={{ padding: "4px 12px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 7, cursor: (progDatesInvalid || phasesExceedEnd) ? "not-allowed" : "pointer", opacity: (progDatesInvalid || phasesExceedEnd) ? 0.5 : 1, fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", fontFamily: "Poppins,sans-serif" }}>{saving ? "…" : program.status === "draft" ? "Save Draft" : "Save"}</button>
            {program.status === "draft" && (
              <button onClick={() => setPublishFlow("confirm")} disabled={saving} style={{ padding: "4px 14px", background: C.orange, border: "none", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif" }}>Publish →</button>
            )}
          </div>
        </div>
        {/* Row 2: phase types */}
        <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid rgba(255,255,255,0.07)", overflow: "hidden" }}>
          <div style={{ display: "flex", alignItems: "center", padding: "0 14px", flex: 1, overflowX: "auto", minWidth: 0 }}>
            <span style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.3)", letterSpacing: 1.4, whiteSpace: "nowrap", marginRight: 10, flexShrink: 0 }}>PHASES</span>
            <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 0" }}>
              {DS_PHASE_TYPES.map(pt => {
                const isCapstone = pt.type === "capstone";
                const hasCapstone = isCapstone && phases.some(p => p.type === "capstone");
                return (
                  <div key={pt.type} onClick={() => { if (!hasCapstone) addPhaseClick(pt); }} title={hasCapstone ? "Program already has a Capstone phase" : `Add ${pt.label} phase`}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: hasCapstone ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.07)", borderRadius: 20, cursor: hasCapstone ? "not-allowed" : "pointer", border: "1px solid rgba(255,255,255,0.1)", flexShrink: 0, opacity: hasCapstone ? 0.4 : 1 }}>
                    <span style={{ width: 14, height: 14, borderRadius: "50%", background: hasCapstone ? "#999" : pt.color, color: "#fff", fontSize: 11, fontWeight: 800, lineHeight: "14px", textAlign: "center", flexShrink: 0 }}>+</span>
                    <span style={{ fontSize: 11, color: "rgba(255,255,255,0.82)", fontWeight: 500, whiteSpace: "nowrap" }}>{pt.label}</span>
                  </div>
                );
              })}
            </div>
            <div onClick={() => setShowEnrol(true)} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", background: "rgba(255,255,255,0.07)", borderRadius: 20, cursor: "pointer", border: "1px solid rgba(255,255,255,0.12)", flexShrink: 0, margin: "6px 14px 6px 6px" }}>
              <span style={{ fontSize: 11 }}>👥</span>
              <span style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>{program.enrolled_count ?? 0}</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)" }}>Enrolled</span>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", padding: "0 14px", overflowX: "auto" }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: "rgba(255,255,255,0.3)", letterSpacing: 1.4, whiteSpace: "nowrap", marginRight: 10, flexShrink: 0 }}>ELEMENTS</span>
          <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 0" }}>
            {DS_ELEMENT_TYPES.map(el => (
              <div key={el.type}
                draggable
                onDragStart={e => { e.dataTransfer.setData("elementType", el.type); e.dataTransfer.effectAllowed = "copy"; }}
                onClick={() => setElementPicker({ presetType: el.type })}
                title={`Click to add ${el.label} to a module, or drag onto PRE-WORK/POST-WORK`}
                style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", background: "rgba(255,255,255,0.04)", borderRadius: 20, border: "1px solid rgba(255,255,255,0.07)", flexShrink: 0, cursor: "grab", transition: "background 0.12s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.14)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.04)"; }}>
                <span style={{ fontSize: 9, color: el.color }}>{el.icon}</span>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap" }}>{el.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: C.page }}>
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 20px 80px" }}>
          {phases.length === 0 && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 40px", color: C.muted, textAlign: "center" }}>
              <div style={{ fontSize: 44, marginBottom: 14, opacity: 0.2 }}>📅</div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: C.navy }}>No phases yet</div>
              <div style={{ fontSize: 12, lineHeight: 1.7, maxWidth: 300 }}>Click any Phase Type in the top band to build your program timeline.</div>
            </div>
          )}
          {phases.length > 0 && (
            <div style={{ display: "flex", gap: 0 }}>
              <div style={{ flex: 1, position: "relative" }}>
                <div style={{ position: "absolute", left: 77, top: 4, bottom: 4, width: 2, background: "linear-gradient(180deg,#E0E3EF 0%,#E6DED0 100%)", borderRadius: 2, zIndex: 0 }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {phases.map((phase, pi) => {
                    const isCollapsed = !!collapsed[phase.id];
                    const durationDays = dbw(phase.startDate, phase.endDate);
                    const prevPhase = pi > 0 ? phases[pi - 1] : null;
                    const gapDays = prevPhase ? Math.max(0, dbw(prevPhase.endDate, phase.startDate) - 1) : 0;
                    const modCount = phase.modules.length + phase.activities.length;
                    const exceedsProgram = !!(progEnd && phase.endDate > progEnd);
                    return (
                      <div key={phase.id}>
                        {gapDays > 0 && pi > 0 && (
                          <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                            <div style={{ width: 64, flexShrink: 0 }} />
                            <div style={{ width: 40, flexShrink: 0, display: "flex", justifyContent: "center" }}><div style={{ width: 2, height: 22, background: C.border, borderRadius: 1 }} /></div>
                            <span style={{ fontSize: 10, color: C.inactive, fontStyle: "italic", paddingLeft: 6 }}>{gapDays}d gap</span>
                          </div>
                        )}
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 0, position: "relative", zIndex: 1, marginBottom: 10 }}>
                          <div style={{ width: 64, flexShrink: 0, paddingRight: 10, paddingTop: 13, textAlign: "right" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: phase.color, lineHeight: 1.5, whiteSpace: "nowrap" }}>{fmtShort(phase.startDate)}</div>
                            <div style={{ fontSize: 9, color: C.inactive, lineHeight: 1 }}>-</div>
                            <div title={exceedsProgram ? `Runs past the program's end date (${fmtShort(progEnd)})` : undefined} style={{ fontSize: 10, color: exceedsProgram ? "#ef4444" : C.muted, fontWeight: exceedsProgram ? 700 : 400, lineHeight: 1.5, whiteSpace: "nowrap" }}>{fmtShort(phase.endDate)}{exceedsProgram && " ⚠"}</div>
                          </div>
                          <div style={{ width: 40, flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 13, position: "relative", zIndex: 2 }}>
                            <div style={{ width: 26, height: 26, borderRadius: "50%", background: phase.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff", fontWeight: 800, boxShadow: `0 0 0 3px ${C.page}` }}>{phase.icon}</div>
                          </div>
                          <div style={{ flex: 1 }}>
                            <div
                              draggable
                              onDragStart={e => { e.dataTransfer.setData("reorderPhaseId", phase.id); dragPhaseIdRef.current = phase.id; setDragPhaseId(phase.id); }}
                              onDragOver={e => { e.preventDefault(); setDragOverId(phase.id); }}
                              onDragLeave={() => setDragOverId(null)}
                              onDrop={e => { e.preventDefault(); e.stopPropagation(); const fid = e.dataTransfer.getData("reorderPhaseId"); if (fid) reorderPhases(fid, phase.id); setDragPhaseId(null); setDragOverId(null); }}
                              onDragEnd={() => { setDragPhaseId(null); setDragOverId(null); }}
                              onClick={() => setCollapsed(p => ({ ...p, [phase.id]: !p[phase.id] }))}
                              style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", background: dragOverId === phase.id && dragPhaseId !== phase.id ? "#EFF6FF" : "#fff", border: `1.5px solid ${dragOverId === phase.id && dragPhaseId !== phase.id ? "#3b82f6" : phase.color + "35"}`, borderRadius: isCollapsed ? 10 : "10px 10px 0 0", boxShadow: "0 1px 4px rgba(24, 40, 72,0.06)", cursor: "grab", opacity: dragPhaseId === phase.id ? 0.5 : 1 }}>
                              <span style={{ fontSize: 12, color: C.inactive, marginRight: 2 }}>⠿</span>
                              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{phase.label}</span>
                                {phase.deliveryMode && (
                                  <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 8, fontWeight: 700, flexShrink: 0, background: phase.deliveryMode === "virtual" ? "rgba(24, 40, 72,0.07)" : "rgba(200, 168, 96,0.08)", color: phase.deliveryMode === "virtual" ? C.navy : C.orange }}>
                                    {phase.deliveryMode === "virtual" ? "🌐 Virtual" : "🏛 In-Person"}
                                  </span>
                                )}
                                <span style={{ fontSize: 9, color: C.inactive, flexShrink: 0 }}>{durationDays}d · {modCount} mod. · ⏱ {fmtEffort(phaseEffortMins(phase))}</span>
                              </div>
                              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                <button onClick={e => { e.stopPropagation(); setPhaseEditModal({
                                  id: phase.id, label: phase.label, startDate: phase.startDate, endDate: phase.endDate, deliveryMode: phase.deliveryMode, icon: phase.icon, color: phase.color,
                                  prevPhaseEnd: phases[pi - 1]?.endDate, nextPhaseStart: phases[pi + 1]?.startDate,
                                  prevPhaseLabel: phases[pi - 1]?.label, nextPhaseLabel: phases[pi + 1]?.label,
                                }); }} style={{ width: 22, height: 22, border: `1px solid ${C.border}`, borderRadius: 5, background: "#fff", cursor: "pointer", fontSize: 10, color: C.muted }}>✎</button>
                                <button onClick={e => { e.stopPropagation(); setConfirmDel({ type: "Phase", id: phase.id, label: phase.label }); }} style={{ width: 22, height: 22, border: "1px solid #fecdd3", borderRadius: 5, background: "#fff", cursor: "pointer", fontSize: 10, color: "#ef4444" }}>✕</button>
                                <button style={{ width: 22, height: 22, border: `1px solid ${C.border}`, borderRadius: 5, background: "#fff", cursor: "pointer", fontSize: 9, color: C.muted }}>{isCollapsed ? "▼" : "▲"}</button>
                              </div>
                            </div>
                            {!isCollapsed && (
                              <div style={{ padding: "10px 12px", background: phase.color + "06", border: `1.5px solid ${phase.color}22`, borderTop: "none", borderRadius: "0 0 10px 10px", display: "flex", flexDirection: "column", gap: 7 }}>
                                {isModulePhase(phase.type) ? (
                                  phase.modules[0] && (
                                    <ModuleGrid
                                      phase={phase} mod={phase.modules[0]}
                                      onRename={t => renameModule(phase.id, phase.modules[0].id, t)}
                                      onAddElement={slot => setElementModal({ phaseId: phase.id, moduleId: phase.modules[0].id, slot })}
                                      onDropElement={(slot, type) => { const el = DS_ELEMENT_TYPES.find(e => e.type === type); if (el) addElement(phase.id, phase.modules[0].id, slot, el); }}
                                      onRemoveElement={(slot, elId) => removeElement(phase.id, phase.modules[0].id, slot, elId)}
                                      onConfigureElement={(act, slot) => setElementConfigModal({ phaseId: phase.id, moduleId: phase.modules[0].id, slot, act })}
                                      onScheduleElement={act => setScheduleModal({ phaseId: phase.id, moduleId: phase.modules[0].id, act })}
                                      onAssignFaculty={(act, f) => assignFacultyToAct(phase.id, phase.modules[0].id, act.id, f)}
                                      onRemoveFaculty={(act, fid) => removeFacultyFromAct(phase.id, phase.modules[0].id, act.id, fid)}
                                      onSetSessionFormat={(slot, elId, v) => setSessionFormat(phase.id, phase.modules[0].id, slot, elId, v)}
                                      orgFaculty={orgFaculty} sessionsByAct={sessionsByAct}
                                    />
                                  )
                                ) : phase.type === "capstone" ? (
                                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    <div style={{ fontSize: 11, color: "#4A5573", lineHeight: 1.6, padding: "2px 2px 6px" }}>
                                      Attach a capstone to this phase. Faculty then configure the brief, rubric, teams and milestones from the Capstone Projects tab.
                                    </div>
                                    {(() => {
                                      const st = capstoneAttach[phase.id] ?? "idle";
                                      if (st === "done") {
                                        return (
                                          <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 12px", background: "rgba(34,197,94,0.06)", borderRadius: 8 }}>
                                            <div style={{ fontSize: 12, fontWeight: 700, color: "#22c55e" }}>✓ Capstone attached</div>
                                            {onNavigateToCapstone && (
                                              <button onClick={onNavigateToCapstone} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "6px 0", background: "#fff", border: "1px solid #22c55e", borderRadius: 6, cursor: "pointer", fontSize: 11, color: "#22c55e", fontFamily: "Poppins,sans-serif", fontWeight: 700 }}>
                                                Configure Capstone →
                                              </button>
                                            )}
                                          </div>
                                        );
                                      }
                                      return (
                                        <button onClick={() => attachCapstone(phase.id)} disabled={st === "busy"}
                                          style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: 9, background: st === "busy" ? "#C9BFA8" : phase.color, border: "none", borderRadius: 8, cursor: st === "busy" ? "default" : "pointer", fontSize: 12, color: "#fff", fontFamily: "Poppins,sans-serif", fontWeight: 700 }}>
                                          {st === "busy" ? "Attaching…" : st === "error" ? "Retry - attach failed" : "▲ Set up Capstone"}
                                        </button>
                                      );
                                    })()}
                                  </div>
                                ) : isActivityPhase(phase.type) ? (
                                  <>
                                    {phase.activities.map(act => (
                                      <ActivityCardRow key={act.id} act={act}
                                        onDelete={() => deleteActivityFromPhase(phase.id, act.id)}
                                        onClick={
                                          act.title === "Participant Enrolment" || act.title.toLowerCase().includes("enrol") ? () => setShowEnrol(true)
                                          : DS_WORKFLOW_CONFIGS[act.title] ? () => setWorkflowModal({ phaseId: phase.id, actId: act.id, title: act.title })
                                          : () => setGenericActivityModal({ phaseId: phase.id, actId: act.id, title: act.title })
                                        } />
                                    ))}
                                    <button onClick={() => setActivityModal({ phaseId: phase.id, phaseType: phase.type, phaseColor: phase.color })}
                                      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: 7, background: "transparent", border: `1.5px dashed ${phase.color}50`, borderRadius: 8, cursor: "pointer", fontSize: 11, color: phase.color, fontFamily: "Poppins,sans-serif", fontWeight: 600 }}>+ Add Activity</button>
                                  </>
                                ) : (
                                  <>
                                    {phase.modules.map(m => (
                                      <ModuleGrid key={m.id}
                                        phase={phase} mod={m}
                                        onRename={t => renameModule(phase.id, m.id, t)}
                                        onDelete={() => deleteModuleLocal(phase.id, m.id)}
                                        onAddElement={slot => setElementModal({ phaseId: phase.id, moduleId: m.id, slot })}
                                        onDropElement={(slot, type) => { const el = DS_ELEMENT_TYPES.find(e => e.type === type); if (el) addElement(phase.id, m.id, slot, el); }}
                                        onRemoveElement={(slot, elId) => removeElement(phase.id, m.id, slot, elId)}
                                        onConfigureElement={(act, slot) => setElementConfigModal({ phaseId: phase.id, moduleId: m.id, slot, act })}
                                        onScheduleElement={act => setScheduleModal({ phaseId: phase.id, moduleId: m.id, act })}
                                        onAssignFaculty={(act, f) => assignFacultyToAct(phase.id, m.id, act.id, f)}
                                        onRemoveFaculty={(act, fid) => removeFacultyFromAct(phase.id, m.id, act.id, fid)}
                                        onSetSessionFormat={(slot, elId, v) => setSessionFormat(phase.id, m.id, slot, elId, v)}
                                        orgFaculty={orgFaculty} sessionsByAct={sessionsByAct}
                                      />
                                    ))}
                                    <button onClick={() => setModuleModal({ phaseId: phase.id, phaseColor: phase.color })}
                                      style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: 7, background: "transparent", border: `1.5px dashed ${phase.color}50`, borderRadius: 8, cursor: "pointer", fontSize: 11, color: phase.color, fontFamily: "Poppins,sans-serif", fontWeight: 600 }}>+ Add Module</button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* MODALS */}
      {showPreview && (
        <PreviewModal program={program} phases={phases} progStart={progStart} progEnd={progEnd} totalModules={totalModules} totalElements={totalElements} progColor={progColor} onClose={() => setShowPreview(false)} />
      )}
      {showEffort && (
        <EffortCalculatorModal phases={phases} progStart={progStart} progEnd={progEnd} onClose={() => setShowEffort(false)} />
      )}
      {elementConfigModal && (
        <DSElementConfigModal
          modal={{ elementType: elementTypeOf(elementConfigModal.act), elementLabel: elementConfigModal.act.title, moduleName: phases.find(p => p.id === elementConfigModal.phaseId)?.modules.find(m => m.id === elementConfigModal.moduleId)?.title ?? "", slot: elementConfigModal.slot }}
          orgId={orgId || ""}
          existing={typeof elementConfigModal.act.config?.asset_id === "string" ? {
            assetId: elementConfigModal.act.config.asset_id, assetTitle: elementConfigModal.act.title,
            startDay: elementConfigModal.act.startDay ?? 1, dueDayOffset: elementConfigModal.act.dueDayOffset ?? 7,
            knowledgeCheck: (() => {
              const k = elementConfigModal.act.config?.knowledge_check as
                | { asset_id?: string; time_limit_mins?: number; attempts_allowed?: number; passing_score_pct?: number }
                | undefined;
              return k && typeof k.asset_id === "string" ? {
                assetId: k.asset_id, assetTitle: "Attached quiz",
                timeLimitMins: k.time_limit_mins ?? 0, attemptsAllowed: k.attempts_allowed ?? 1,
                passingScorePct: k.passing_score_pct ?? 0,
              } : null;
            })(),
            // Re-hydrate a standalone Quiz/Assessment element's own timer/
            // attempts/pass score from its top-level config (see
            // updateElementConfig's quizFields) so reopening it to edit shows
            // the values actually saved, not the 0/1/0 defaults.
            quizSettings: (() => {
              const c = elementConfigModal.act.config as
                | { time_limit_mins?: number; attempts_allowed?: number; passing_score_pct?: number }
                | undefined;
              return c ? {
                timeLimitMins: c.time_limit_mins ?? 0, attemptsAllowed: c.attempts_allowed ?? 1,
                passingScorePct: c.passing_score_pct ?? 0,
              } : undefined;
            })(),
            externalLinkEnabled: elementConfigModal.act.config?.external_link_enabled === true,
          } : undefined}
          onClose={() => setElementConfigModal(null)}
          onSave={data => updateElementConfig(elementConfigModal.phaseId, elementConfigModal.moduleId, elementConfigModal.slot, elementConfigModal.act.id, data)} />
      )}
      {workflowModal && (
        <DSActivityWorkflowModal activityTitle={workflowModal.title}
          data={(() => { const a = phases.find(p => p.id === workflowModal.phaseId)?.activities.find(a => a.id === workflowModal.actId); return (a?.config as WorkflowData) ?? {}; })()}
          onClose={() => setWorkflowModal(null)}
          onSave={data => saveWorkflow(workflowModal.phaseId, workflowModal.actId, data)} />
      )}
      {genericActivityModal && (
        <DSGenericActivityModal title={genericActivityModal.title}
          data={(() => { const a = phases.find(p => p.id === genericActivityModal.phaseId)?.activities.find(a => a.id === genericActivityModal.actId); return { date: a?.date, instructions: a?.config?.instructions as string | undefined }; })()}
          onClose={() => setGenericActivityModal(null)}
          onSave={data => saveGenericActivity(genericActivityModal.phaseId, genericActivityModal.actId, data)} />
      )}
      {showEnrol && orgId && <DSEnrolModal orgId={orgId} programId={program.id} onClose={() => setShowEnrol(false)} />}
      {showPricingModal && (
        <ProgramPricingModal
          program={program}
          onClose={() => setShowPricingModal(false)}
          onSaved={updated => { onProgramUpdated(updated); setShowPricingModal(false); }}
        />
      )}
      {activityModal && <DSActivityModal phaseType={activityModal.phaseType} phaseColor={activityModal.phaseColor} onClose={() => setActivityModal(null)} onAdd={(t, c, d) => addActivityToPhase(activityModal.phaseId, t, c, d)} />}
      {dateModal && <DSDateModal modal={dateModal} programStart={progStart} programEnd={progEnd} onClose={() => setDateModal(null)} onConfirm={confirmAddPhase} />}
      {moduleModal && <DSModuleModal phaseColor={moduleModal.phaseColor} onClose={() => setModuleModal(null)} onAdd={data => addModule(moduleModal.phaseId, data)} />}
      {elementModal && <DSElementModal initialSlot={elementModal.slot} moduleName={phases.find(p => p.id === elementModal.phaseId)?.modules.find(m => m.id === elementModal.moduleId)?.title} onClose={() => setElementModal(null)} onAdd={(slot, el) => addElement(elementModal.phaseId, elementModal.moduleId, slot, el)} />}
      {elementPicker && (() => {
        // Default target: first module found across all phases, in order -
        // same "attach to a module" concept as the in-module "+" button, just
        // without a pre-selected module since the click came from the
        // top-level ELEMENTS band rather than a specific module's slot.
        const target = phases.map(p => p.modules[0] ? { phaseId: p.id, moduleId: p.modules[0].id, title: p.modules[0].title } : null).find(Boolean);
        const preset = DS_ELEMENT_TYPES.find(e => e.type === elementPicker.presetType);
        if (!target) { setElementPicker(null); return null; }
        return (
          <DSElementModal initialSlot="pre" moduleName={target.title} initialQuery={preset?.label}
            onClose={() => setElementPicker(null)}
            onAdd={(slot, el) => addElement(target.phaseId, target.moduleId, slot, el)} />
        );
      })()}
      {phaseEditModal && <DSPhaseEditModal phase={phaseEditModal} programStart={progStart} programEnd={progEnd} onClose={() => setPhaseEditModal(null)} onSave={(id, u) => { updatePhase(id, u); setPhaseEditModal(null); }} />}
      {scheduleModal && orgId && (
        <ScheduleSessionModal programId={program.id} orgId={orgId} activityTitle={scheduleModal.act.title} activityId={scheduleModal.act.id}
          activityType={scheduleModal.act.type}
          sessionFormat={scheduleModal.act.config?.session_type === "in_person" || scheduleModal.act.config?.session_type === "virtual" ? scheduleModal.act.config.session_type : undefined}
          activityFaculty={scheduleModal.act.faculty ?? []} orgFaculty={orgFaculty} defaultDurationMins={scheduleModal.act.durationMins}
          onClose={() => setScheduleModal(null)}
          onScheduled={s => setSessionsByAct(prev => ({ ...prev, [scheduleModal.act.id]: [...(prev[scheduleModal.act.id] ?? []), s] }))} />
      )}
      {conflictModal && (
        <ConflictOverlay faculty={conflictModal.faculty} conflicts={conflictModal.conflicts}
          onCancel={() => setConflictModal(null)}
          onOverride={note => { const m = conflictModal; setConflictModal(null); assignFacultyToAct(m.phaseId, m.moduleId, m.actId, m.faculty, m.role, note); }} />
      )}
      {confirmDel && typeof document !== "undefined" && ReactDOM.createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.5)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins,sans-serif" }} onClick={e => { if (e.target === e.currentTarget) setConfirmDel(null); }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 340, padding: "28px 24px", boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 6 }}>Delete {confirmDel.type}?</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, marginBottom: 20 }}>This will remove <strong style={{ color: C.navy }}>{confirmDel.label}</strong> and all its content.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDel(null)} style={{ flex: 1, padding: 10, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.muted, fontFamily: "Poppins,sans-serif", background: "#fff" }}>Cancel</button>
              <button onClick={() => deletePhaseLocal(confirmDel.id)} style={{ flex: 1, padding: 10, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif", background: "#ef4444" }}>Delete</button>
            </div>
          </div>
        </div>,
        document.body
      )}
      {publishFlow === "confirm" && (
        <PublishConfirmModal program={program} phases={phases} totalModules={totalModules} totalElements={totalElements} datesTouched={datesTouched}
          onCancel={() => setPublishFlow(null)}
          onConfirm={() => handleSave(true).then(ok => { if (ok) setPublishFlow("success"); else setPublishFlow(null); })} />
      )}
      {publishFlow === "success" && (
        <PublishSuccessModal programTitle={program.title} onDone={() => { setPublishFlow(null); onBack(); }} />
      )}
      {saveMsg.startsWith("✗") && (
        <ErrorToast
          message={saveMsg.slice(1).trim()}
          onClose={() => setSaveMsg("")}
          action={phasesExceedEnd ? {
            label: "Fit phases to program dates",
            onClick: fitPhasesToProgramDates,
          } : undefined}
        />
      )}

      {/* Hidden print content */}
    </div>
  );
}

// ─── Error toast - floating, dismissable popup for save/publish failures ────
function ErrorToast({ message, onClose, action }: { message: string; onClose: () => void; action?: { label: string; onClick: () => void } }) {
  // Suppress the auto-dismiss timer while an actionable fix is offered - a
  // 6s timeout hiding the toast before the PM can even click "Extend
  // program end date" defeats the point of offering it.
  useEffect(() => {
    if (action) return;
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [message, onClose, action]);

  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div style={{
      position: "fixed", top: 20, right: 20, zIndex: 5000, maxWidth: 420,
      background: "#fff", borderRadius: 12, border: "1px solid #fecaca",
      boxShadow: "0 12px 32px rgba(24, 40, 72,0.18)", padding: "14px 16px",
      display: "flex", alignItems: "flex-start", gap: 10, fontFamily: "Poppins,sans-serif",
    }}>
      <span style={{ fontSize: 16, color: "#ef4444", flexShrink: 0, lineHeight: 1.3 }}>⚠</span>
      <div style={{ flex: 1, fontSize: 12.5, color: C.navy, lineHeight: 1.5 }}>
        {message}
        {action && (
          <button onClick={action.onClick} style={{ display: "block", marginTop: 8, padding: "6px 12px", background: C.orange, border: "none", borderRadius: 7, cursor: "pointer", fontSize: 11.5, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif" }}>
            {action.label}
          </button>
        )}
      </div>
      <button onClick={onClose} style={{ border: "none", background: "none", cursor: "pointer", color: C.inactive, fontSize: 13, flexShrink: 0, padding: 0 }}>✕</button>
    </div>,
    document.body
  );
}

// ─── Module grid (PRE-WORK / POST-WORK) ─────────────────────────────────────
function ModuleGrid({ phase, mod, onRename, onDelete, onAddElement, onDropElement, onRemoveElement, onConfigureElement, onScheduleElement, onAssignFaculty, onRemoveFaculty, onSetSessionFormat, orgFaculty, sessionsByAct }: {
  phase: LocalPhase; mod: LocalModule;
  onRename: (t: string) => void; onDelete?: () => void;
  onAddElement: (slot: "pre" | "post") => void;
  onDropElement: (slot: "pre" | "post", elementType: string) => void;
  onRemoveElement: (slot: "pre" | "post", elId: string) => void;
  onConfigureElement: (act: LocalActivity, slot: "pre" | "post") => void;
  onScheduleElement: (act: LocalActivity) => void;
  onAssignFaculty: (act: LocalActivity, f: OrgFacultyMember) => void;
  onRemoveFaculty: (act: LocalActivity, facultyUserId: string) => void;
  onSetSessionFormat: (slot: "pre" | "post", elId: string, sessionType: "in_person" | "virtual") => void;
  orgFaculty: OrgFacultyMember[];
  sessionsByAct: Record<string, ScheduledSessionDTO[]>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(mod.title);
  const [dragOverSlot, setDragOverSlot] = useState<"pre" | "post" | null>(null);
  function commit() { if (draft.trim() && draft.trim() !== mod.title) onRename(draft.trim()); setEditing(false); }
  const slots: ("pre" | "post")[] = ["pre", "post"];

  return (
    <div style={{ background: C.page, border: `1px solid ${C.border}`, borderRadius: 9, overflow: "hidden", boxShadow: "0 1px 3px rgba(24, 40, 72,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, background: "#fff" }}>
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, fontWeight: 700, background: mod.type === "virtual" ? "rgba(24, 40, 72,0.08)" : "rgba(200, 168, 96,0.08)", color: mod.type === "virtual" ? C.navy : C.orange }}>
          {mod.type === "virtual" ? "🌐 Virtual" : "🏛 In-Person"}
        </span>
        {editing ? (
          <input autoFocus value={draft} onChange={e => setDraft(e.target.value)} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(mod.title); setEditing(false); } }} style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C.navy, border: "none", borderBottom: `1.5px solid ${C.orange}`, outline: "none", background: "transparent", fontFamily: "Poppins,sans-serif", padding: "1px 0" }} />
        ) : (
          <span onClick={() => { setDraft(mod.title); setEditing(true); }} title="Click to rename" style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C.navy, cursor: "text" }}>{mod.title}</span>
        )}
        {mod.date && <span style={{ fontSize: 10, color: C.muted }}>{fmtShort(mod.date)}</span>}
        {onDelete && <button onClick={onDelete} style={{ width: 18, height: 18, border: "none", background: "none", cursor: "pointer", color: C.inactive, fontSize: 12 }}>✕</button>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        {slots.map(slot => (
          <div key={slot}
            onDragOver={e => { if (e.dataTransfer.types.includes("elementtype")) { e.preventDefault(); setDragOverSlot(slot); } }}
            onDragLeave={() => setDragOverSlot(null)}
            onDrop={e => {
              e.preventDefault();
              const type = e.dataTransfer.getData("elementType");
              if (type) onDropElement(slot, type);
              setDragOverSlot(null);
            }}
            style={{
              padding: "8px 10px", borderRight: slot === "pre" ? `1px solid ${C.border}` : undefined,
              background: dragOverSlot === slot ? (slot === "pre" ? "rgba(74, 85, 115,0.08)" : "rgba(200, 168, 96,0.08)") : undefined,
              outline: dragOverSlot === slot ? `1.5px dashed ${slot === "pre" ? C.indigo : C.orange}` : undefined,
              transition: "background 0.1s",
            }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.8, color: slot === "pre" ? C.indigo : C.orange }}>{slot === "pre" ? "PRE-WORK" : "POST-WORK"}</span>
              <button onClick={() => onAddElement(slot)} style={{ width: 16, height: 16, borderRadius: 4, background: slot === "pre" ? C.indigo : C.orange, border: "none", color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 900, lineHeight: 1 }}>+</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {mod[slot].map(act => {
                const m = elMeta(elementTypeOf(act));
                const configurable = isConfigurable(elementTypeOf(act));
                // Faculty assignment + session scheduling has been removed from Program
                // Design for live_session/coaching activities (now handled exclusively
                // from the standalone Sessions page) - keep this false so ElementPill
                // never renders the assign-faculty/schedule-session UI here.
                const isSessionType = false;
                const isLiveSession = elementTypeOf(act) === "live-session";
                return (
                  <ElementPill key={act.id} act={act} meta={m} configurable={configurable} isSessionType={isSessionType}
                    onConfigure={configurable ? () => onConfigureElement(act, slot) : undefined}
                    onSchedule={isSessionType ? () => onScheduleElement(act) : undefined}
                    onRemove={() => onRemoveElement(slot, act.id)}
                    onAssignFaculty={f => onAssignFaculty(act, f)} onRemoveFaculty={fid => onRemoveFaculty(act, fid)}
                    orgFaculty={orgFaculty} sessionCount={sessionsByAct[act.id]?.length ?? 0}
                    isLiveSession={isLiveSession}
                    sessionFormat={typeof act.config?.session_type === "string" ? act.config.session_type : undefined}
                    onSetFormat={v => onSetSessionFormat(slot, act.id, v)} />
                );
              })}
              {mod[slot].length === 0 && <span style={{ fontSize: 10, color: C.inactive, fontStyle: "italic" }}>None yet - click +</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const DELIVERY_ROLES = ["Lead", "Co-Facilitator", "Observer"];

function ElementPill({ act, meta, configurable, isSessionType, onConfigure, onSchedule, onRemove, onAssignFaculty, onRemoveFaculty, orgFaculty, sessionCount, isLiveSession, sessionFormat, onSetFormat }: {
  act: LocalActivity; meta: { icon: string; color: string; label: string };
  configurable: boolean; isSessionType: boolean;
  onConfigure?: () => void; onSchedule?: () => void; onRemove: () => void;
  onAssignFaculty: (f: OrgFacultyMember) => void; onRemoveFaculty: (facultyUserId: string) => void;
  orgFaculty: OrgFacultyMember[]; sessionCount: number;
  isLiveSession?: boolean; sessionFormat?: string; onSetFormat?: (v: "in_person" | "virtual") => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [facPick, setFacPick] = useState(false);
  const [selFacId, setSelFacId] = useState("");
  const [selRole, setSelRole] = useState("Lead");
  const configured = !!act.config?.asset_id;

  return (
    <div style={{ background: meta.color + "12", border: `1px solid ${meta.color}28`, borderRadius: 5 }}>
      <div onClick={() => (isSessionType ? setExpanded(e => !e) : onConfigure?.())}
        style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 7px", cursor: onConfigure || isSessionType ? "pointer" : "default" }}>
        <span style={{ fontSize: 9, color: meta.color, flexShrink: 0 }}>{meta.icon}</span>
        <span style={{ flex: 1, fontSize: 10, color: C.navy, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{act.title}</span>
        {configurable && !configured && <span style={{ fontSize: 8, color: meta.color, opacity: 0.6, flexShrink: 0 }}>⚙</span>}
        {configurable && configured && <span style={{ fontSize: 8, color: C.green, flexShrink: 0 }}>✓</span>}
        {isSessionType && sessionCount > 0 && <span style={{ fontSize: 8, color: C.indigo, flexShrink: 0 }}>📅{sessionCount}</span>}
        {isLiveSession && (
          <select
            value={sessionFormat === "in_person" || sessionFormat === "virtual" ? sessionFormat : ""}
            onClick={e => e.stopPropagation()}
            onChange={e => onSetFormat?.(e.target.value as "in_person" | "virtual")}
            title="Session format - decided here, not re-asked when scheduling"
            style={{
              fontSize: 8, fontWeight: 700, padding: "1px 3px", borderRadius: 4, flexShrink: 0,
              border: `1px solid ${sessionFormat ? meta.color + "40" : "#f59e0b60"}`,
              background: sessionFormat ? "#fff" : "rgba(245,158,11,0.1)",
              color: sessionFormat ? C.navy : "#f59e0b",
              fontFamily: "Poppins,sans-serif",
            }}>
            <option value="" disabled>Format?</option>
            <option value="virtual">🌐 Virtual</option>
            <option value="in_person">🏛 In-person</option>
          </select>
        )}
        <button onClick={e => { e.stopPropagation(); onRemove(); }} style={{ width: 12, height: 12, border: "none", background: "none", cursor: "pointer", color: C.inactive, fontSize: 9, flexShrink: 0 }}>✕</button>
      </div>
      {isSessionType && expanded && (
        <div style={{ padding: "0 7px 6px", display: "flex", flexDirection: "column", gap: 4 }} onClick={e => e.stopPropagation()}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
            {(act.faculty ?? []).map(f => (
              <span key={f.faculty_user_id} style={{ display: "flex", alignItems: "center", gap: 3, fontSize: 8, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "1px 6px", color: C.navy }}>
                {f.name} <button onClick={() => onRemoveFaculty(f.faculty_user_id)} style={{ border: "none", background: "none", cursor: "pointer", color: C.inactive, fontSize: 8, padding: 0 }}>✕</button>
              </span>
            ))}
          </div>
          {!facPick && <button onClick={() => setFacPick(true)} style={{ fontSize: 8, color: C.indigo, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, fontFamily: "Poppins,sans-serif", fontWeight: 700 }}>+ Assign faculty</button>}
          {facPick && (
            <div style={{ display: "flex", gap: 3 }}>
              <select value={selFacId} onChange={e => setSelFacId(e.target.value)} style={{ fontSize: 8, flex: 1, border: `1px solid ${C.border}`, borderRadius: 4, padding: "2px 3px" }}>
                <option value="">- Faculty -</option>
                {orgFaculty.filter(f => !(act.faculty ?? []).some(af => af.faculty_user_id === f.id)).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
              <select value={selRole} onChange={e => setSelRole(e.target.value)} style={{ fontSize: 8, border: `1px solid ${C.border}`, borderRadius: 4 }}>
                {DELIVERY_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
              <button disabled={!selFacId} onClick={() => { const f = orgFaculty.find(x => x.id === selFacId); if (f) { onAssignFaculty(f); setFacPick(false); setSelFacId(""); } }} style={{ fontSize: 8, background: C.indigo, color: "#fff", border: "none", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}>Add</button>
            </div>
          )}
          {onSchedule && <button onClick={onSchedule} style={{ fontSize: 8, color: C.navy, background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: 0, fontFamily: "Poppins,sans-serif", fontWeight: 700 }}>📅 Schedule session</button>}
        </div>
      )}
    </div>
  );
}

function ActivityCardRow({ act, onDelete, onClick }: { act: LocalActivity; onDelete: () => void; onClick?: () => void }) {
  const isActionable = !!onClick;
  return (
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 1px 2px rgba(24, 40, 72,0.04)", cursor: isActionable ? "pointer" : "default" }}>
      <div style={{ width: 9, height: 9, borderRadius: "50%", background: C.indigo, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: C.navy }}>{act.title}</span>
      {isActionable && <span style={{ fontSize: 10, color: C.orange, fontWeight: 700, flexShrink: 0 }}>→</span>}
      {act.date && <span style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>{fmtShort(act.date)}</span>}
      <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{ width: 16, height: 16, border: "none", background: "none", cursor: "pointer", color: C.inactive, fontSize: 11, flexShrink: 0 }}>✕</button>
    </div>
  );
}

// ─── Preview modal ───────────────────────────────────────────────────────────
function PreviewModal({ program, phases, progStart, progEnd, totalModules, totalElements, progColor, onClose }: {
  program: ProgramDetailDTO; phases: LocalPhase[]; progStart: string; progEnd: string; totalModules: number; totalElements: number; progColor: string; onClose: () => void;
}) {
  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.55)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins,sans-serif" }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: C.page, borderRadius: 16, width: "100%", maxWidth: 740, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(24, 40, 72,0.28)" }}>
        <div style={{ background: "linear-gradient(135deg,var(--xa-sidebar),#2d3a7c)", padding: "22px 28px 18px", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", fontWeight: 700, letterSpacing: 1, marginBottom: 5 }}>PROGRAM OUTLINE PREVIEW</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 3 }}>{program.title}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{phases.length} phases · {totalModules} modules · {totalElements} activities · {Math.round(dbw(progStart, progEnd) / 7)} weeks</div>
            </div>
            <button onClick={onClose} style={{ width: 28, height: 28, border: "1px solid rgba(255,255,255,0.2)", borderRadius: "50%", background: "rgba(255,255,255,0.1)", cursor: "pointer", fontSize: 13, color: "#fff" }}>✕</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            {([["Phases", phases.length, progColor], ["Modules", totalModules, "#4A5573"], ["Activities", totalElements, "#22c55e"], ["Duration", Math.round(dbw(progStart, progEnd) / 7) + " wks", "#fff"]] as const).map(([l, v, c]) => (
              <div key={l} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: c, lineHeight: 1 }}>{v}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 800, color: C.muted, letterSpacing: 1 }}>PHASE OUTLINE</div>
            {phases.map(phase => (
              <div key={phase.id} style={{ background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "0 1px 3px rgba(24, 40, 72,0.05)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 15px", background: phase.color + "0D", borderBottom: `1px solid ${phase.color}25` }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: phase.color, color: "#fff", fontWeight: 800, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{phase.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{phase.label}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{fmtShort(phase.startDate)} - {fmtShort(phase.endDate)}</div>
                  </div>
                  {phase.deliveryMode && <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 8, fontWeight: 700, background: phase.deliveryMode === "virtual" ? "rgba(24, 40, 72,0.07)" : "rgba(200, 168, 96,0.08)", color: phase.deliveryMode === "virtual" ? C.navy : C.orange }}>{phase.deliveryMode === "virtual" ? "🌐 Virtual" : "🏛 In-Person"}</span>}
                  <span style={{ fontSize: 9, color: C.muted, flexShrink: 0 }}>{phase.modules.length + phase.activities.length} mod.</span>
                </div>
                {(phase.modules.length > 0 || phase.activities.length > 0) ? (
                  <div style={{ padding: "10px 15px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {phase.modules.map(mod => (
                      <div key={mod.id} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 6, fontWeight: 700, background: mod.type === "virtual" ? "rgba(24, 40, 72,0.07)" : "rgba(200, 168, 96,0.08)", color: mod.type === "virtual" ? C.navy : C.orange }}>{mod.type === "virtual" ? "🌐" : "🏛"}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{mod.title}</span>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, paddingLeft: 4 }}>
                          {(["pre", "post"] as const).map(slot => {
                            const els = mod[slot];
                            if (!els.length) return null;
                            return (
                              <div key={slot}>
                                <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.7, color: slot === "pre" ? C.indigo : C.orange, marginBottom: 4 }}>{slot === "pre" ? "PRE-WORK" : "POST-WORK"}</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                  {els.map(el => { const m = elMeta(elementTypeOf(el)); return <span key={el.id} style={{ fontSize: 10, padding: "2px 8px", background: m.color + "12", border: `1px solid ${m.color}28`, borderRadius: 20, color: m.color, fontWeight: 600 }}>{el.title}</span>; })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {phase.activities.map(a => <div key={a.id} style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>• {a.title}</div>)}
                  </div>
                ) : <div style={{ padding: "8px 15px", fontSize: 11, color: C.inactive, fontStyle: "italic" }}>No modules yet</div>}
              </div>
            ))}
          </div>
        </div>
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${C.border}`, background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: C.muted }}>This is how the program outline will appear.</span>
          <button onClick={onClose} style={{ padding: "9px 22px", background: C.orange, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif" }}>Close Preview</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Estimated effort calculator ─────────────────────────────────────────────
// Learner time-commitment per phase, derived entirely from each activity's
// durationMins - no separate estimate is stored server-side, so this is
// always in sync with whatever's on the canvas (including unsaved edits).
function EffortCalculatorModal({ phases, progStart, progEnd, onClose }: {
  phases: LocalPhase[]; progStart: string; progEnd: string; onClose: () => void;
}) {
  if (typeof document === "undefined") return null;
  const totalMins = phases.reduce((n, p) => n + phaseEffortMins(p), 0);
  const weeks = Math.max(1, Math.round(dbw(progStart, progEnd) / 7));
  const perWeekMins = Math.round(totalMins / weeks);
  const maxPhaseMins = Math.max(1, ...phases.map(phaseEffortMins));

  return ReactDOM.createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.55)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins,sans-serif" }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: C.page, borderRadius: 16, width: "100%", maxWidth: 640, maxHeight: "88vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(24, 40, 72,0.28)" }}>
        <div style={{ background: "linear-gradient(135deg,var(--xa-sidebar),#2d3a7c)", padding: "22px 28px 18px", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", fontWeight: 700, letterSpacing: 1, marginBottom: 5 }}>ESTIMATED EFFORT</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 3 }}>Learner Time Commitment</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>Based on the duration set on each activity, across {phases.length} phase{phases.length !== 1 ? "s" : ""}</div>
            </div>
            <button onClick={onClose} style={{ width: 28, height: 28, border: "1px solid rgba(255,255,255,0.2)", borderRadius: "50%", background: "rgba(255,255,255,0.1)", cursor: "pointer", fontSize: 13, color: "#fff" }}>✕</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
            {([["Total effort", fmtEffort(totalMins), C.orange], ["Program length", `${weeks} wk${weeks !== 1 ? "s" : ""}`, "#fff"], ["Avg. per week", fmtEffort(perWeekMins), "#4A5573"]] as const).map(([l, v, c]) => (
              <div key={l} style={{ background: "rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: c, lineHeight: 1.2 }}>{v}</div>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 3 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {phases.length === 0 ? (
            <div style={{ padding: "30px 10px", textAlign: "center", fontSize: 12, color: C.muted }}>Add phases and activities to see the effort breakdown.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ fontSize: 9, fontWeight: 800, color: C.muted, letterSpacing: 1 }}>PER-PHASE BREAKDOWN</div>
              {phases.map(phase => {
                const mins = phaseEffortMins(phase);
                const modCount = phase.modules.length + phase.activities.length;
                const barPct = Math.max(mins > 0 ? 4 : 0, Math.round((mins / maxPhaseMins) * 100));
                return (
                  <div key={phase.id} style={{ background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, padding: "12px 15px", boxShadow: "0 1px 3px rgba(24, 40, 72,0.05)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", background: phase.color, color: "#fff", fontWeight: 800, fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{phase.icon}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{phase.label}</div>
                        <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{fmtShort(phase.startDate)} - {fmtShort(phase.endDate)} · {modCount} mod.</div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: phase.color, flexShrink: 0 }}>{fmtEffort(mins)}</div>
                    </div>
                    <div style={{ height: 6, background: C.page, borderRadius: 99, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${barPct}%`, background: phase.color, borderRadius: 99, transition: "width 0.2s" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${C.border}`, background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: C.muted }}>Estimate only - actual pace depends on each learner.</span>
          <button onClick={onClose} style={{ padding: "9px 22px", background: C.orange, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif" }}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Publish confirm / success ───────────────────────────────────────────────
function PublishConfirmModal({ program, phases, totalModules, totalElements, datesTouched, onCancel, onConfirm }: {
  program: ProgramDetailDTO; phases: LocalPhase[]; totalModules: number; totalElements: number; datesTouched: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const checks: [string, boolean][] = [
    ["Phases defined", phases.length >= 2],
    // datesTouched, not phases.every(...) - phase dates are always populated
    // (buildPhases fabricates a today..today+140 default when the program
    // has never had real dates), so that check was always true and never
    // actually caught an unset program timeline.
    ["Dates configured", datesTouched],
    ["Modules added", totalModules >= 1],
    ["Activities assigned", totalElements >= 1],
  ];
  const canPublish = datesTouched;
  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.5)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins,sans-serif" }} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 460, overflow: "hidden", boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)" }}>
        <div style={{ background: "linear-gradient(135deg,var(--xa-sidebar),#2d3a7c)", padding: "20px 24px 16px" }}>
          <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>PUBLISHING PROGRAM</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 2 }}>{program.title}</div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>{phases.length} phases · {totalModules} modules · {totalElements} activities</div>
        </div>
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
          {checks.map(([l, done], i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 20, height: 20, borderRadius: "50%", background: done ? C.green : "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ color: "#fff", fontSize: 11 }}>{done ? "✓" : "⚠"}</span></div>
              <span style={{ fontSize: 13, color: done ? C.navy : C.muted }}>{l}</span>
            </div>
          ))}
        </div>
        {!canPublish && (
          <div style={{ margin: "0 24px 14px", padding: "8px 12px", background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)", borderRadius: 8, fontSize: 11, color: "#b45309" }}>
            Set a start and end date for this program before publishing.
          </div>
        )}
        <div style={{ padding: "0 24px 20px", display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: 10, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.navy, fontFamily: "Poppins,sans-serif" }}>Cancel</button>
          <button onClick={onConfirm} disabled={!canPublish} style={{ flex: 2, padding: 10, background: canPublish ? C.orange : "#C9BFA8", border: "none", borderRadius: 8, cursor: canPublish ? "pointer" : "not-allowed", fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif" }}>Confirm & Publish 🚀</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function PublishSuccessModal({ programTitle, onDone }: { programTitle: string; onDone: () => void }) {
  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.5)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins,sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, overflow: "hidden", boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)", textAlign: "center", padding: "40px 32px", animation: "popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)" }}>
        <style>
          {`
            @keyframes popIn {
              0% { transform: scale(0.8); opacity: 0; }
              100% { transform: scale(1); opacity: 1; }
            }
            @keyframes bounceTada {
              0% { transform: scale3d(1, 1, 1); }
              10%, 20% { transform: scale3d(0.9, 0.9, 0.9) rotate3d(0, 0, 1, -3deg); }
              30%, 50%, 70%, 90% { transform: scale3d(1.1, 1.1, 1.1) rotate3d(0, 0, 1, 3deg); }
              40%, 60%, 80% { transform: scale3d(1.1, 1.1, 1.1) rotate3d(0, 0, 1, -3deg); }
              100% { transform: scale3d(1, 1, 1); }
            }
          `}
        </style>
        <div style={{ fontSize: 48, marginBottom: 16, animation: "bounceTada 1s ease-in-out" }}>🎉</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: C.navy, marginBottom: 8 }}>Program Published!</div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 20 }}><strong style={{ color: C.navy }}>{programTitle}</strong> is now live. Participants can be enrolled.</div>
        <button onClick={onDone} style={{ width: "100%", padding: 12, background: C.orange, border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif" }}>Back to Programs →</button>
      </div>
    </div>,
    document.body
  );
}
