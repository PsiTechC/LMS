"use client";

import { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom";
import { programsApi, ProgramDetailDTO, PhaseDTO, ModuleDTO, ActivityDTO, FacultyAssignmentDTO, ProgramDTO } from "@/lib/programs-api";
import { sessionsApi } from "@/lib/faculty-api";
import { UserDTO } from "@/lib/api";

const ff: React.CSSProperties = { fontFamily: "Poppins, sans-serif" };
const C = { navy: "#1C2551", orange: "#EF4E24", indigo: "#6B73BF", green: "#22c55e", muted: "#8b90a7", border: "#EAECF4", page: "#F5F7FB", inactive: "#D0D3E0" };

// Dummy meet-link generator (placeholder until a real provider is wired).
function genMeetLink(): string {
  const seg = () => Math.random().toString(36).slice(2, 6);
  return `https://meet.xa-lms.dev/${seg()}-${seg()}-${seg()}`;
}

// Which phase is "current" today, from program start_date + phase start_day/end_day.
// Returns the phase index whose [start_day, end_day] window contains today, else -1.
function currentPhaseIndex(program: ProgramDetailDTO): number {
  if (!program.start_date) return -1;
  const start = new Date(program.start_date + "T00:00:00").getTime();
  if (Number.isNaN(start)) return -1;
  const dayOffset = Math.floor((Date.now() - start) / 86400000) + 1; // day 1 = start date
  return program.phases.findIndex(p => dayOffset >= p.start_day && dayOffset <= p.end_day);
}

interface Props {
  user: UserDTO;
  onSessionCreated?: () => void;
}

export default function ProgramJourneyPanel({ user, onSessionCreated }: Props) {
  const canCreate = user.role === "program_manager" || user.role === "faculty" || user.role === "superadmin" || user.role === "superadmin_secondary";

  const [programList, setProgramList] = useState<{ id: string; title: string }[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [detail, setDetail] = useState<ProgramDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [createFor, setCreateFor] = useState<{ phase: PhaseDTO; module: ModuleDTO } | null>(null);
  const [toast, setToast] = useState("");

  // Load the program list for this user.
  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      let progs: { id: string; title: string }[] = [];
      if (user.role === "faculty") {
        const r = await programsApi.getFacultyAssignments(user.id).catch(() => ({ data: [] as FacultyAssignmentDTO[] }));
        const seen = new Set<string>();
        (r.data ?? []).forEach(a => { if (!seen.has(a.program_id)) { seen.add(a.program_id); progs.push({ id: a.program_id, title: a.program_title }); } });
      } else if (user.org_id) {
        const r = await programsApi.list(user.org_id).catch(() => ({ data: [] as ProgramDTO[] }));
        progs = (r.data ?? []).filter(p => p.status === "active" || p.status === "upcoming").map(p => ({ id: p.id, title: p.title }));
      }
      if (!active) return;
      setProgramList(progs);
      setSelectedId(prev => prev || progs[0]?.id || "");
      if (!progs.length) setLoading(false);
    })();
    return () => { active = false; };
  }, [user.id, user.role, user.org_id]);

  // Load the selected program's detail (phases/modules).
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let active = true;
    setLoading(true);
    programsApi.get(selectedId)
      .then(r => { if (active) setDetail(r.data ?? null); })
      .catch(() => { if (active) setDetail(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedId]);

  const curIdx = useMemo(() => (detail ? currentPhaseIndex(detail) : -1), [detail]);

  async function handleCreate(phase: PhaseDTO, module: ModuleDTO, scheduledAt: string, durationMins: number) {
    if (!detail) return;
    const link = genMeetLink();
    await sessionsApi.create({
      program_id: detail.id,
      cohort_id: "",                       // program-level session (cohort_id is nullable server-side)
      faculty_id: user.id,
      title: module.title || phase.title,
      session_type: "virtual",
      virtual_link: link,
      scheduled_at: new Date(scheduledAt).toISOString(),
      duration_mins: durationMins,
    }).then(() => {
      setToast(`Session created · ${link}`);
      setTimeout(() => setToast(""), 4000);
      onSessionCreated?.();
    }).catch(() => {
      setToast("Could not create session. Try again.");
      setTimeout(() => setToast(""), 3000);
    });
    setCreateFor(null);
  }

  if (loading && !detail) {
    return (
      <div style={{ ...ff, background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, padding: "18px 20px", marginBottom: 16, fontSize: 12, color: C.muted }}>
        Loading program journey…
      </div>
    );
  }

  if (!detail) {
    return null; // no programs for this user — silently hide the panel
  }

  return (
    <div style={{ ...ff, background: "#fff", borderRadius: 12, border: `1px solid ${C.border}`, marginBottom: 16, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>Program Journey</div>
        {programList.length > 1 && (
          <select value={selectedId} onChange={e => setSelectedId(e.target.value)}
            style={{ ...ff, fontSize: 12, border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 10px", color: C.navy, background: "#fff", cursor: "pointer", maxWidth: 260 }}>
            {programList.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
          </select>
        )}
      </div>

      {/* Phases */}
      <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {detail.phases.length === 0 && (
          <div style={{ fontSize: 12, color: C.muted, padding: "8px 4px" }}>This program has no phases designed yet.</div>
        )}
        {detail.phases.map((phase, idx) => {
          const isCurrent = idx === curIdx;
          return (
            <div key={phase.id} style={{ border: `1.5px solid ${isCurrent ? phase.color : C.border}`, borderRadius: 10, overflow: "hidden", boxShadow: isCurrent ? `0 2px 10px ${phase.color}22` : undefined }}>
              {/* Phase header */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", background: isCurrent ? phase.color + "10" : C.page, borderBottom: `1px solid ${C.border}` }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: phase.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: C.navy, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{phase.title}</span>
                {isCurrent && <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.5, color: "#fff", background: phase.color, borderRadius: 20, padding: "2px 9px" }}>TODAY</span>}
              </div>

              {/* Modules */}
              <div style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                {phase.modules.length === 0 && (
                  <span style={{ fontSize: 11, color: C.inactive, fontStyle: "italic" }}>No modules in this phase.</span>
                )}
                {phase.modules.map(mod => (
                  <ModuleRow key={mod.id} phase={phase} mod={mod} canCreate={canCreate}
                    onCreate={() => setCreateFor({ phase, module: mod })} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {createFor && (
        <CreateSessionModal
          moduleTitle={createFor.module.title || createFor.phase.title}
          onClose={() => setCreateFor(null)}
          onConfirm={(when, dur) => handleCreate(createFor.phase, createFor.module, when, dur)} />
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 4000, background: C.navy, color: "#fff", padding: "12px 18px", borderRadius: 10, fontSize: 12, fontWeight: 600, maxWidth: 360, boxShadow: "0 8px 32px rgba(28,37,81,0.28)", ...ff }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Module row: shows pre/post work, and create-session for virtual modules ──
function ModuleRow({ phase, mod, canCreate, onCreate }: {
  phase: PhaseDTO; mod: ModuleDTO; canCreate: boolean; onCreate: () => void;
}) {
  const isVirtual = mod.delivery_mode === "virtual";
  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#fff", borderBottom: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, fontWeight: 700, flexShrink: 0, background: isVirtual ? "rgba(28,37,81,0.08)" : "rgba(239,78,36,0.08)", color: isVirtual ? C.navy : C.orange }}>
          {isVirtual ? "🌐 Virtual" : "🏛 In-Person"}
        </span>
        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mod.title}</span>
        {isVirtual && canCreate && (
          <button onClick={onCreate}
            style={{ ...ff, flexShrink: 0, fontSize: 11, fontWeight: 700, color: "#fff", background: phase.color, border: "none", borderRadius: 8, padding: "5px 12px", cursor: "pointer" }}>
            + Create Session
          </button>
        )}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        <WorkColumn label="PRE-WORK" color={C.indigo} items={mod.pre} border />
        <WorkColumn label="POST-WORK" color={C.orange} items={mod.post} />
      </div>
    </div>
  );
}

function WorkColumn({ label, color, items, border }: { label: string; color: string; items: ActivityDTO[]; border?: boolean }) {
  return (
    <div style={{ padding: "8px 12px", borderRight: border ? `1px solid ${C.border}` : undefined }}>
      <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.8, color, marginBottom: 5 }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {items.length === 0 && <span style={{ fontSize: 10, color: C.inactive, fontStyle: "italic" }}>None</span>}
        {items.map(a => (
          <div key={a.id} style={{ fontSize: 11, color: C.navy, background: C.page, borderRadius: 5, padding: "3px 8px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {a.title}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Create-session modal: date/time + duration; meet link auto-generated ──
function CreateSessionModal({ moduleTitle, onClose, onConfirm }: {
  moduleTitle: string; onClose: () => void; onConfirm: (scheduledAt: string, durationMins: number) => void;
}) {
  // Default: tomorrow 10:00 local, in the datetime-local format.
  const def = (() => {
    const d = new Date(Date.now() + 86400000);
    d.setHours(10, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  })();
  const [when, setWhen] = useState(def);
  const [dur, setDur] = useState(60);
  const [saving, setSaving] = useState(false);

  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 3000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, ...ff }}>
      <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 420, boxShadow: "0 24px 64px rgba(28,37,81,0.22)", overflow: "hidden" }}>
        <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>Create Virtual Session</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{moduleTitle}</div>
        </div>
        <div style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Date & Time</label>
            <input type="datetime-local" value={when} onChange={e => setWhen(e.target.value)}
              style={{ ...ff, width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: C.navy, boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, textTransform: "uppercase", display: "block", marginBottom: 6 }}>Duration (minutes)</label>
            <select value={dur} onChange={e => setDur(Number(e.target.value))}
              style={{ ...ff, width: "100%", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: C.navy, background: "#fff", cursor: "pointer" }}>
              {[30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}
            </select>
          </div>
          <div style={{ fontSize: 11, color: C.muted, background: C.page, borderRadius: 8, padding: "10px 12px" }}>
            🔗 A meeting link will be generated automatically for this session.
          </div>
        </div>
        <div style={{ padding: "0 22px 20px", display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onClose} disabled={saving}
            style={{ ...ff, fontSize: 12, fontWeight: 600, color: C.navy, background: "#fff", border: `1px solid ${C.border}`, borderRadius: 8, padding: "9px 18px", cursor: "pointer" }}>Cancel</button>
          <button disabled={saving || !when} onClick={() => { setSaving(true); onConfirm(when, dur); }}
            style={{ ...ff, fontSize: 12, fontWeight: 700, color: "#fff", background: saving ? C.inactive : C.orange, border: "none", borderRadius: 8, padding: "9px 20px", cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Creating…" : "Create Session"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
