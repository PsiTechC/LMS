"use client";

import { useEffect, useRef, useState } from "react";
import {
  programsApi, ProgramDetailDTO, PhaseDTO, ModuleDTO, ActivityDTO, PhaseType,
  ActivityFacultyDTO, OrgFacultyMember, ConflictDTO, ScheduledSessionDTO,
} from "@/lib/programs-api";
import { ApiError } from "@/lib/api";
import {
  DS_PHASE_TYPES, DS_ELEMENT_TYPES, isActivityPhase, isModulePhase, isConfigurable, elMeta,
  DSDateModal, DSPhaseEditModal, DSModuleModal, DSElementModal, DSElementConfigModal,
  DSActivityModal, DSActivityWorkflowModal, DSGenericActivityModal, DSEnrolModal, ConflictOverlay, ScheduleSessionModal,
  DS_WORKFLOW_CONFIGS, ElementConfigSave, WorkflowData, GenericActivityData, PhaseEditTarget, DateModalState,
} from "./DesignStudioModals";
import { buildProgramBrochureHTML } from "./ProgramExportTemplate";

// ─── Design tokens ───────────────────────────────────────────────────────────
const C = {
  navy: "#1C2551", orange: "#EF4E24", indigo: "#6B73BF",
  green: "#22c55e", page: "#F5F7FB", card: "#FFFFFF",
  border: "#EAECF4", muted: "#8b90a7", inactive: "#D0D3E0",
};

function dbw(a: string, b: string) { return Math.max(1, Math.round((new Date(b + "T00:00:00").getTime() - new Date(a + "T00:00:00").getTime()) / 86400000)); }
function addDaysStr(d: string, n: number) { const r = new Date(d + "T00:00:00"); r.setDate(r.getDate() + n); return r.toISOString().split("T")[0]; }
function fmtShort(d: string) { try { return new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }); } catch { return d; } }

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
// arbitrary WorkflowData bag (admin_task activities) — both round-trip through
// the same activities.config_json column, so we keep it loosely typed here.
export interface LocalActivity {
  id: string; type: string; title: string; date: string; config?: Record<string, unknown>;
  faculty?: ActivityFacultyDTO[]; durationMins: number;
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
  return { id: a.id, type: a.type, title: a.title, date: "", config: a.config as Record<string, unknown> | undefined, faculty: a.faculty, durationMins: a.duration_mins };
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
function buildPhases(program: ProgramDetailDTO): LocalPhase[] {
  const progStart = program.start_date ? new Date(program.start_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
  return (program.phases ?? []).map((p, i) => {
    const local = phaseToLocal(p, DS_PHASE_TYPES[i % DS_PHASE_TYPES.length].icon);
    local.startDate = addDaysStr(progStart, Math.max(0, p.start_day - 1));
    local.endDate = addDaysStr(progStart, Math.max(0, p.end_day - 1));
    local.modules.forEach(m => { if (!m.date) m.date = local.startDate; });
    return local;
  });
}

// ─── Component ────────────────────────────────────────────────────────────────
interface Props { program: ProgramDetailDTO; orgId?: string; onProgramUpdated: (p: ProgramDetailDTO) => void; onBack: () => void; }

export default function PMDesignStudio({ program, orgId, onProgramUpdated, onBack }: Props) {
  const progColor = program.color || C.orange;
  const [progStart, setProgStart] = useState(program.start_date ? new Date(program.start_date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
  const [progEnd, setProgEnd] = useState(program.end_date ? new Date(program.end_date).toISOString().slice(0, 10) : addDaysStr(new Date().toISOString().slice(0, 10), 140));

  const [phases, setPhases] = useState<LocalPhase[]>(() => buildPhases(program));
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [showEnrol, setShowEnrol] = useState(false);
  const [publishFlow, setPublishFlow] = useState<null | "confirm" | "success">(null);
  const [confirmDel, setConfirmDel] = useState<{ type: string; id: string; label: string } | null>(null);

  // Modal state
  const [dateModal, setDateModal] = useState<DateModalState | null>(null);
  const [phaseEditModal, setPhaseEditModal] = useState<PhaseEditTarget | null>(null);
  const [moduleModal, setModuleModal] = useState<{ phaseId: string; phaseColor: string } | null>(null);
  const [elementModal, setElementModal] = useState<{ phaseId: string; moduleId: string; slot: "pre" | "post" } | null>(null);
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

  // ── Phase mutations (local state only — persisted on Save Draft) ──────────
  function addPhaseClick(pt: typeof DS_PHASE_TYPES[number]) {
    const last = phases.length ? phases[phases.length - 1] : null;
    const sd = last ? addDaysStr(last.endDate, 7) : progStart;
    const ed = addDaysStr(sd, pt.defaultDays);
    setDateModal({ phaseType: pt, startDate: sd, endDate: ed });
  }
  function confirmAddPhase(pt: typeof DS_PHASE_TYPES[number], start: string, end: string, mode: string, label: string) {
    const dl = pt.deliveryMode || mode || "";
    const autoMod: LocalModule[] = isModulePhase(pt.type) ? [{ id: uid(), title: label || pt.label, type: (dl as "virtual" | "in-person") || "virtual", date: start, pre: [], post: [] }] : [];
    const np: LocalPhase = { id: uid(), type: pt.type, label: label || pt.label, color: pt.color, icon: pt.icon, startDate: start, endDate: end, deliveryMode: dl, modules: autoMod, activities: [] };
    setPhases(prev => [...prev, np]);
    setDateModal(null);
  }
  function updatePhase(id: string, u: Partial<LocalPhase>) { setPhases(prev => prev.map(p => p.id === id ? { ...p, ...u } : p)); }
  function deletePhaseLocal(id: string) { setPhases(prev => prev.filter(p => p.id !== id)); setConfirmDel(null); }

  function addModule(phaseId: string, data: { title: string; type: "virtual" | "in-person"; date: string }) {
    setPhases(prev => prev.map(p => p.id !== phaseId ? p : { ...p, modules: [...p.modules, { id: uid(), pre: [], post: [], ...data }] }));
    setModuleModal(null);
  }
  function deleteModuleLocal(phaseId: string, modId: string) { setPhases(prev => prev.map(p => p.id !== phaseId ? p : { ...p, modules: p.modules.filter(m => m.id !== modId) })); }
  function renameModule(phaseId: string, modId: string, title: string) { setPhases(prev => prev.map(p => p.id !== phaseId ? p : { ...p, modules: p.modules.map(m => m.id !== modId ? m : { ...m, title }) })); }

  function addElement(phaseId: string, modId: string, slot: "pre" | "post", el: typeof DS_ELEMENT_TYPES[number]) {
    // Several element types (Quiz, eLearning, L1-L4 Feedback, etc.) collapse
    // onto the same backend activity_type (assessment/video/survey) — store the
    // original picker type in config so content-library lookups stay exact
    // instead of being lossily re-derived from the collapsed activity type.
    const na: LocalActivity = { id: uid(), type: el.activityType, title: el.label, date: "", durationMins: 30, config: { element_type: el.type } };
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
    setPhases(prev => prev.map(p => p.id !== phaseId ? p : {
      ...p, modules: p.modules.map(m => m.id !== modId ? m : {
        ...m, [slot]: m[slot].map(e => e.id !== elId ? e : { ...e, title: data.assetTitle, config: { ...e.config, asset_id: data.assetId } }),
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

  // ── Faculty assignment (persists immediately — needs a real activity id) ──
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

  async function handleSave(publish = false) {
    if (saving) return;
    setSaving(true); setSaveMsg("Saving…");
    try {
      await programsApi.update(program.id, { start_date: progStart, end_date: progEnd });

      const prevPhaseIds = new Set(savedPhaseIds.current);

      for (let i = 0; i < phases.length; i++) {
        const ph = phases[i];
        const isNewPh = !savedPhaseIds.current.has(ph.id);
        const sd = 1 + dbw(progStart, ph.startDate) - 1;
        const ed = sd + dbw(ph.startDate, ph.endDate) - 1;
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
      setPhases(buildPhases(r.data));
      setSaveMsg("✓ Saved");
    } catch {
      setSaveMsg("✗ Error");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 2500);
    }
  }

  async function saveActivity(phaseId: string, a: LocalActivity, moduleId?: string, slot?: "pre" | "post") {
    const isNew = !savedActIds.current.has(a.id);
    if (isNew) {
      const r = await programsApi.createActivity(program.id, {
        phase_id: phaseId, module_id: moduleId, slot, title: a.title, type: a.type,
        duration_mins: a.durationMins, config: a.config,
      });
      savedActIds.current.add(r.data.id);
    } else {
      await programsApi.updateActivity(program.id, a.id, { title: a.title, duration_mins: a.durationMins, config: a.config });
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
      const rest = prev.filter(p => p.id !== fromId);
      let toIdx = rest.findIndex(p => p.id === toId);
      if (toIdx === -1) toIdx = rest.length;
      return [...rest.slice(0, toIdx), from, ...rest.slice(toIdx)];
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
            <input type="date" value={progStart} onChange={e => setProgStart(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: "4px 10px", fontSize: 11, fontFamily: "Poppins,sans-serif", color: C.navy, outline: "none", background: "#fff", fontWeight: 600 }} />
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>→</span>
            <input type="date" value={progEnd} onChange={e => setProgEnd(e.target.value)} style={{ border: `1px solid ${C.border}`, borderRadius: 7, padding: "4px 10px", fontSize: 11, fontFamily: "Poppins,sans-serif", color: C.navy, outline: "none", background: "#fff", fontWeight: 600 }} />
            <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.15)", margin: "0 4px" }} />
            {saveMsg && <span style={{ fontSize: 11, fontWeight: 700, color: saveMsg.startsWith("✓") ? C.green : saveMsg.startsWith("✗") ? "#ef4444" : "rgba(255,255,255,0.7)" }}>{saveMsg}</span>}
            <button onClick={() => {
              const allCollapsed = phases.every(p => collapsed[p.id]);
              const next: Record<string, boolean> = {}; phases.forEach(p => { next[p.id] = !allCollapsed; }); setCollapsed(next);
            }} style={{ padding: "4px 12px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", fontFamily: "Poppins,sans-serif" }}>{phases.length > 0 && phases.every(p => collapsed[p.id]) ? "⊞ Expand All" : "⊟ Collapse All"}</button>
            <button onClick={() => setShowPreview(true)} style={{ padding: "4px 12px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", fontFamily: "Poppins,sans-serif" }}>👁 Preview</button>
            <button onClick={exportPDF} style={{ padding: "4px 12px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", fontFamily: "Poppins,sans-serif" }}>⬇ PDF</button>
            <button onClick={() => handleSave(false)} disabled={saving} style={{ padding: "4px 12px", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.18)", borderRadius: 7, cursor: "pointer", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.85)", fontFamily: "Poppins,sans-serif" }}>{saving ? "…" : program.status === "draft" ? "Save Draft" : "Save"}</button>
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
              {DS_PHASE_TYPES.map(pt => (
                <div key={pt.type} onClick={() => addPhaseClick(pt)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", background: "rgba(255,255,255,0.07)", borderRadius: 20, cursor: "pointer", border: "1px solid rgba(255,255,255,0.1)", flexShrink: 0 }}>
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: pt.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.82)", fontWeight: 500, whiteSpace: "nowrap" }}>{pt.label}</span>
                </div>
              ))}
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
              <div key={el.type} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", background: "rgba(255,255,255,0.04)", borderRadius: 20, border: "1px solid rgba(255,255,255,0.07)", flexShrink: 0 }}>
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
                <div style={{ position: "absolute", left: 77, top: 4, bottom: 4, width: 2, background: "linear-gradient(180deg,#E0E3EF 0%,#EAECF4 100%)", borderRadius: 2, zIndex: 0 }} />
                <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                  {phases.map((phase, pi) => {
                    const isCollapsed = !!collapsed[phase.id];
                    const durationDays = dbw(phase.startDate, phase.endDate);
                    const prevPhase = pi > 0 ? phases[pi - 1] : null;
                    const gapDays = prevPhase ? Math.max(0, dbw(prevPhase.endDate, phase.startDate) - 1) : 0;
                    const modCount = phase.modules.length + phase.activities.length;
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
                            <div style={{ fontSize: 9, color: C.inactive, lineHeight: 1 }}>—</div>
                            <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.5, whiteSpace: "nowrap" }}>{fmtShort(phase.endDate)}</div>
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
                              style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 13px", background: dragOverId === phase.id && dragPhaseId !== phase.id ? "#EFF6FF" : "#fff", border: `1.5px solid ${dragOverId === phase.id && dragPhaseId !== phase.id ? "#3b82f6" : phase.color + "35"}`, borderRadius: isCollapsed ? 10 : "10px 10px 0 0", boxShadow: "0 1px 4px rgba(28,37,81,0.06)", cursor: "grab", opacity: dragPhaseId === phase.id ? 0.5 : 1 }}>
                              <span style={{ fontSize: 12, color: C.inactive, marginRight: 2 }}>⠿</span>
                              <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{phase.label}</span>
                                {phase.deliveryMode && (
                                  <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 8, fontWeight: 700, flexShrink: 0, background: phase.deliveryMode === "virtual" ? "rgba(28,37,81,0.07)" : "rgba(239,78,36,0.08)", color: phase.deliveryMode === "virtual" ? C.navy : C.orange }}>
                                    {phase.deliveryMode === "virtual" ? "🌐 Virtual" : "🏛 In-Person"}
                                  </span>
                                )}
                                <span style={{ fontSize: 9, color: C.inactive, flexShrink: 0 }}>{durationDays}d · {modCount} mod.</span>
                              </div>
                              <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                                <button onClick={e => { e.stopPropagation(); setPhaseEditModal({ id: phase.id, label: phase.label, startDate: phase.startDate, endDate: phase.endDate, deliveryMode: phase.deliveryMode, icon: phase.icon, color: phase.color }); }} style={{ width: 22, height: 22, border: `1px solid ${C.border}`, borderRadius: 5, background: "#fff", cursor: "pointer", fontSize: 10, color: C.muted }}>✎</button>
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
                                      onRemoveElement={(slot, elId) => removeElement(phase.id, phase.modules[0].id, slot, elId)}
                                      onConfigureElement={(act, slot) => setElementConfigModal({ phaseId: phase.id, moduleId: phase.modules[0].id, slot, act })}
                                      onScheduleElement={act => setScheduleModal({ phaseId: phase.id, moduleId: phase.modules[0].id, act })}
                                      onAssignFaculty={(act, f) => assignFacultyToAct(phase.id, phase.modules[0].id, act.id, f)}
                                      onRemoveFaculty={(act, fid) => removeFacultyFromAct(phase.id, phase.modules[0].id, act.id, fid)}
                                      orgFaculty={orgFaculty} sessionsByAct={sessionsByAct}
                                    />
                                  )
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
                                        onRemoveElement={(slot, elId) => removeElement(phase.id, m.id, slot, elId)}
                                        onConfigureElement={(act, slot) => setElementConfigModal({ phaseId: phase.id, moduleId: m.id, slot, act })}
                                        onScheduleElement={act => setScheduleModal({ phaseId: phase.id, moduleId: m.id, act })}
                                        onAssignFaculty={(act, f) => assignFacultyToAct(phase.id, m.id, act.id, f)}
                                        onRemoveFaculty={(act, fid) => removeFacultyFromAct(phase.id, m.id, act.id, fid)}
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
      {elementConfigModal && (
        <DSElementConfigModal
          modal={{ elementType: elementTypeOf(elementConfigModal.act), elementLabel: elementConfigModal.act.title, moduleName: phases.find(p => p.id === elementConfigModal.phaseId)?.modules.find(m => m.id === elementConfigModal.moduleId)?.title ?? "", slot: elementConfigModal.slot }}
          orgId={orgId || ""}
          existing={typeof elementConfigModal.act.config?.asset_id === "string" ? { assetId: elementConfigModal.act.config.asset_id, assetTitle: elementConfigModal.act.title, unlockDate: "", unlockTime: "09:00" } : undefined}
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
      {activityModal && <DSActivityModal phaseType={activityModal.phaseType} phaseColor={activityModal.phaseColor} onClose={() => setActivityModal(null)} onAdd={(t, c, d) => addActivityToPhase(activityModal.phaseId, t, c, d)} />}
      {dateModal && <DSDateModal modal={dateModal} onClose={() => setDateModal(null)} onConfirm={confirmAddPhase} />}
      {moduleModal && <DSModuleModal phaseColor={moduleModal.phaseColor} onClose={() => setModuleModal(null)} onAdd={data => addModule(moduleModal.phaseId, data)} />}
      {elementModal && <DSElementModal initialSlot={elementModal.slot} moduleName={phases.find(p => p.id === elementModal.phaseId)?.modules.find(m => m.id === elementModal.moduleId)?.title} onClose={() => setElementModal(null)} onAdd={(slot, el) => addElement(elementModal.phaseId, elementModal.moduleId, slot, el)} />}
      {phaseEditModal && <DSPhaseEditModal phase={phaseEditModal} onClose={() => setPhaseEditModal(null)} onSave={(id, u) => { updatePhase(id, u); setPhaseEditModal(null); }} />}
      {scheduleModal && orgId && (
        <ScheduleSessionModal programId={program.id} orgId={orgId} activityTitle={scheduleModal.act.title} activityId={scheduleModal.act.id}
          activityFaculty={scheduleModal.act.faculty ?? []} orgFaculty={orgFaculty} defaultDurationMins={scheduleModal.act.durationMins}
          onClose={() => setScheduleModal(null)}
          onScheduled={s => setSessionsByAct(prev => ({ ...prev, [scheduleModal.act.id]: [...(prev[scheduleModal.act.id] ?? []), s] }))} />
      )}
      {conflictModal && (
        <ConflictOverlay faculty={conflictModal.faculty} conflicts={conflictModal.conflicts}
          onCancel={() => setConflictModal(null)}
          onOverride={note => { const m = conflictModal; setConflictModal(null); assignFacultyToAct(m.phaseId, m.moduleId, m.actId, m.faculty, m.role, note); }} />
      )}
      {confirmDel && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins,sans-serif" }} onClick={e => { if (e.target === e.currentTarget) setConfirmDel(null); }}>
          <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 340, padding: "28px 24px", boxShadow: "0 24px 64px rgba(28,37,81,0.22)", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>⚠️</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 6 }}>Delete {confirmDel.type}?</div>
            <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.7, marginBottom: 20 }}>This will remove <strong style={{ color: C.navy }}>{confirmDel.label}</strong> and all its content.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => setConfirmDel(null)} style={{ flex: 1, padding: 10, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.muted, fontFamily: "Poppins,sans-serif", background: "#fff" }}>Cancel</button>
              <button onClick={() => deletePhaseLocal(confirmDel.id)} style={{ flex: 1, padding: 10, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif", background: "#ef4444" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
      {publishFlow === "confirm" && (
        <PublishConfirmModal program={program} phases={phases} totalModules={totalModules} totalElements={totalElements}
          onCancel={() => setPublishFlow(null)} onConfirm={() => handleSave(true).then(() => setPublishFlow("success"))} />
      )}
      {publishFlow === "success" && (
        <PublishSuccessModal programTitle={program.title} onDone={() => { setPublishFlow(null); onBack(); }} />
      )}

      {/* Hidden print content */}
    </div>
  );
}

// ─── Module grid (PRE-WORK / POST-WORK) ─────────────────────────────────────
function ModuleGrid({ phase, mod, onRename, onDelete, onAddElement, onRemoveElement, onConfigureElement, onScheduleElement, onAssignFaculty, onRemoveFaculty, orgFaculty, sessionsByAct }: {
  phase: LocalPhase; mod: LocalModule;
  onRename: (t: string) => void; onDelete?: () => void;
  onAddElement: (slot: "pre" | "post") => void;
  onRemoveElement: (slot: "pre" | "post", elId: string) => void;
  onConfigureElement: (act: LocalActivity, slot: "pre" | "post") => void;
  onScheduleElement: (act: LocalActivity) => void;
  onAssignFaculty: (act: LocalActivity, f: OrgFacultyMember) => void;
  onRemoveFaculty: (act: LocalActivity, facultyUserId: string) => void;
  orgFaculty: OrgFacultyMember[];
  sessionsByAct: Record<string, ScheduledSessionDTO[]>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(mod.title);
  function commit() { if (draft.trim() && draft.trim() !== mod.title) onRename(draft.trim()); setEditing(false); }
  const slots: ("pre" | "post")[] = ["pre", "post"];

  return (
    <div style={{ background: C.page, border: `1px solid ${C.border}`, borderRadius: 9, overflow: "hidden", boxShadow: "0 1px 3px rgba(28,37,81,0.04)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderBottom: `1px solid ${C.border}`, background: "#fff" }}>
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, fontWeight: 700, background: mod.type === "virtual" ? "rgba(28,37,81,0.08)" : "rgba(239,78,36,0.08)", color: mod.type === "virtual" ? C.navy : C.orange }}>
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
          <div key={slot} style={{ padding: "8px 10px", borderRight: slot === "pre" ? `1px solid ${C.border}` : undefined }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.8, color: slot === "pre" ? C.indigo : C.orange }}>{slot === "pre" ? "PRE-WORK" : "POST-WORK"}</span>
              <button onClick={() => onAddElement(slot)} style={{ width: 16, height: 16, borderRadius: 4, background: slot === "pre" ? C.indigo : C.orange, border: "none", color: "#fff", cursor: "pointer", fontSize: 11, fontWeight: 900, lineHeight: 1 }}>+</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              {mod[slot].map(act => {
                const m = elMeta(elementTypeOf(act));
                const configurable = isConfigurable(elementTypeOf(act));
                const isSessionType = act.type === "live_session" || act.type === "coaching";
                return (
                  <ElementPill key={act.id} act={act} meta={m} configurable={configurable} isSessionType={isSessionType}
                    onConfigure={configurable ? () => onConfigureElement(act, slot) : undefined}
                    onSchedule={isSessionType ? () => onScheduleElement(act) : undefined}
                    onRemove={() => onRemoveElement(slot, act.id)}
                    onAssignFaculty={f => onAssignFaculty(act, f)} onRemoveFaculty={fid => onRemoveFaculty(act, fid)}
                    orgFaculty={orgFaculty} sessionCount={sessionsByAct[act.id]?.length ?? 0} />
                );
              })}
              {mod[slot].length === 0 && <span style={{ fontSize: 10, color: C.inactive, fontStyle: "italic" }}>None yet — click +</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const DELIVERY_ROLES = ["Lead", "Co-Facilitator", "Observer"];

function ElementPill({ act, meta, configurable, isSessionType, onConfigure, onSchedule, onRemove, onAssignFaculty, onRemoveFaculty, orgFaculty, sessionCount }: {
  act: LocalActivity; meta: { icon: string; color: string; label: string };
  configurable: boolean; isSessionType: boolean;
  onConfigure?: () => void; onSchedule?: () => void; onRemove: () => void;
  onAssignFaculty: (f: OrgFacultyMember) => void; onRemoveFaculty: (facultyUserId: string) => void;
  orgFaculty: OrgFacultyMember[]; sessionCount: number;
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
                <option value="">— Faculty —</option>
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
    <div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 9, padding: "8px 12px", background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 1px 2px rgba(28,37,81,0.04)", cursor: isActionable ? "pointer" : "default" }}>
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
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.55)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins,sans-serif" }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: C.page, borderRadius: 16, width: "100%", maxWidth: 740, maxHeight: "90vh", display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.28)" }}>
        <div style={{ background: "linear-gradient(135deg,#1C2551,#2d3a7c)", padding: "22px 28px 18px", flexShrink: 0 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.45)", fontWeight: 700, letterSpacing: 1, marginBottom: 5 }}>PROGRAM OUTLINE PREVIEW</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#fff", marginBottom: 3 }}>{program.title}</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.55)" }}>{phases.length} phases · {totalModules} modules · {totalElements} activities · {Math.round(dbw(progStart, progEnd) / 7)} weeks</div>
            </div>
            <button onClick={onClose} style={{ width: 28, height: 28, border: "1px solid rgba(255,255,255,0.2)", borderRadius: "50%", background: "rgba(255,255,255,0.1)", cursor: "pointer", fontSize: 13, color: "#fff" }}>✕</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            {([["Phases", phases.length, progColor], ["Modules", totalModules, "#6B73BF"], ["Activities", totalElements, "#22c55e"], ["Duration", Math.round(dbw(progStart, progEnd) / 7) + " wks", "#fff"]] as const).map(([l, v, c]) => (
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
              <div key={phase.id} style={{ background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, overflow: "hidden", boxShadow: "0 1px 3px rgba(28,37,81,0.05)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 15px", background: phase.color + "0D", borderBottom: `1px solid ${phase.color}25` }}>
                  <div style={{ width: 26, height: 26, borderRadius: "50%", background: phase.color, color: "#fff", fontWeight: 800, fontSize: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{phase.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{phase.label}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{fmtShort(phase.startDate)} — {fmtShort(phase.endDate)}</div>
                  </div>
                  {phase.deliveryMode && <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 8, fontWeight: 700, background: phase.deliveryMode === "virtual" ? "rgba(28,37,81,0.07)" : "rgba(239,78,36,0.08)", color: phase.deliveryMode === "virtual" ? C.navy : C.orange }}>{phase.deliveryMode === "virtual" ? "🌐 Virtual" : "🏛 In-Person"}</span>}
                  <span style={{ fontSize: 9, color: C.muted, flexShrink: 0 }}>{phase.modules.length + phase.activities.length} mod.</span>
                </div>
                {(phase.modules.length > 0 || phase.activities.length > 0) ? (
                  <div style={{ padding: "10px 15px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {phase.modules.map(mod => (
                      <div key={mod.id} style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 6, fontWeight: 700, background: mod.type === "virtual" ? "rgba(28,37,81,0.07)" : "rgba(239,78,36,0.08)", color: mod.type === "virtual" ? C.navy : C.orange }}>{mod.type === "virtual" ? "🌐" : "🏛"}</span>
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
    </div>
  );
}

// ─── Publish confirm / success ───────────────────────────────────────────────
function PublishConfirmModal({ program, phases, totalModules, totalElements, onCancel, onConfirm }: {
  program: ProgramDetailDTO; phases: LocalPhase[]; totalModules: number; totalElements: number; onCancel: () => void; onConfirm: () => void;
}) {
  const checks: [string, boolean][] = [
    ["Phases defined", phases.length >= 2],
    ["Dates configured", phases.every(p => p.startDate && p.endDate)],
    ["Modules added", totalModules >= 1],
    ["Activities assigned", totalElements >= 1],
  ];
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins,sans-serif" }} onClick={e => { if (e.target === e.currentTarget) onCancel(); }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 460, overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.22)" }}>
        <div style={{ background: "linear-gradient(135deg,#1C2551,#2d3a7c)", padding: "20px 24px 16px" }}>
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
        <div style={{ padding: "0 24px 20px", display: "flex", gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: 10, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.navy, fontFamily: "Poppins,sans-serif" }}>Cancel</button>
          <button onClick={onConfirm} style={{ flex: 2, padding: 10, background: C.orange, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif" }}>Confirm & Publish 🚀</button>
        </div>
      </div>
    </div>
  );
}

function PublishSuccessModal({ programTitle, onDone }: { programTitle: string; onDone: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins,sans-serif" }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, overflow: "hidden", boxShadow: "0 24px 64px rgba(28,37,81,0.22)", textAlign: "center", padding: "40px 32px" }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🎉</div>
        <div style={{ fontSize: 20, fontWeight: 800, color: C.navy, marginBottom: 8 }}>Program Published!</div>
        <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.7, marginBottom: 20 }}><strong style={{ color: C.navy }}>{programTitle}</strong> is now live. Participants can be enrolled.</div>
        <button onClick={onDone} style={{ width: "100%", padding: 12, background: C.orange, border: "none", borderRadius: 10, cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "Poppins,sans-serif" }}>Back to Programs →</button>
      </div>
    </div>
  );
}
