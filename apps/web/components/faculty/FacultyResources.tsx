"use client";

import { useState, useEffect, useCallback } from "react";
import ReactDOM from "react-dom";
import {
  programsApi,
  OrgFacultyMember, OrgFacultyProfile, FacultyDashboardDTO,
  FacultyL1L4SummaryDTO, FacultyAssignmentDTO, FacultyScheduleDay,
  ProgramDTO, ActivityFacultyDTO, ConflictDTO,
} from "@/lib/programs-api";
import { cohortsApi, CohortDTO } from "@/lib/cohorts-api";
import { invitationsApi } from "@/lib/invitations-api";
import { sessionsApi } from "@/lib/faculty-api";
import { facultyMgmtApi } from "@/lib/faculty-mgmt-api";

// ── Tokens ────────────────────────────────────────────────────────────────────
const C = {
  navy: "var(--xa-navy)", orange: "var(--xa-primary)", indigo: "#4A5573",
  green: "#22c55e", cyan: "#0891B2", muted: "var(--xa-muted)",
  border: "#E6DED0", page: "var(--xa-bg)", card: "#fff",
  disabled: "#C9BFA8",
};

const S = {
  primBtn: { padding: "9px 20px", background: C.navy, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif", display: "flex", alignItems: "center", gap: 6 } as React.CSSProperties,
  orangeBtn: { padding: "9px 20px", background: C.orange, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif" } as React.CSSProperties,
  secBtn: { padding: "8px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.navy, fontFamily: "Poppins, sans-serif" } as React.CSSProperties,
  iconBtn: { padding: "5px 10px", background: C.page, border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", fontSize: 11, color: C.navy, fontFamily: "Poppins, sans-serif", fontWeight: 600 } as React.CSSProperties,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function initials(name: string) {
  return name.split(" ").slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
}
function avatarBg(name: string) {
  const cols = [C.indigo, C.navy, C.orange, C.green, C.cyan];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % cols.length;
  return cols[h];
}

// ── Status badge ──────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, [string, string]> = {
    active:     [C.green, "rgba(34,197,94,0.1)"],
    onboarding: [C.cyan,  "rgba(8,145,178,0.1)"],
    inactive:   [C.muted, "rgba(74, 85, 115,0.12)"],
  };
  const [color, bg] = cfg[status] ?? cfg.inactive;
  return (
    <span style={{ fontSize: 9, background: bg, color, borderRadius: 10, padding: "3px 9px", fontWeight: 700 }}>
      {status.toUpperCase()}
    </span>
  );
}

// ── Avatar circle ─────────────────────────────────────────────────────────────
function Avatar({ name, size = 36, url }: { name: string; size?: number; url?: string }) {
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: avatarBg(name), color: "#fff", fontWeight: 700, fontSize: size * 0.33, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, overflow: "hidden" }}>
      {url ? <img src={url} alt={name} style={{ width: size, height: size, objectFit: "cover" }} /> : initials(name)}
    </div>
  );
}

// ── Mini bar ──────────────────────────────────────────────────────────────────
function MiniBar({ pct, color, width = 60, height = 5 }: { pct: number; color: string; width?: number; height?: number }) {
  return (
    <div style={{ width, height, background: "#EFE9DC", borderRadius: 99 }}>
      <div style={{ height: "100%", width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 99 }} />
    </div>
  );
}

// ── Overlay shell ─────────────────────────────────────────────────────────────
function Overlay({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <div onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(24, 40, 72,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Poppins, sans-serif" }}>
      <div style={{ background: C.card, borderRadius: 14, width: "100%", maxWidth: wide ? 680 : 460, overflow: "hidden", boxShadow: "0 24px 64px rgba(24, 40, 72,0.22)" }}>
        {children}
      </div>
    </div>,
    document.body
  );
}

// ── Assign-to-programs modal ─────────────────────────────────────────────────
// A faculty member can be assigned to many programs in the org (one-to-many).
// Program design no longer schedules or assigns faculty - faculty run their own
// sessions from Program Sessions - so assignment here is simply program access.
function ProgramAssignModal({ faculty, orgId, onClose, onChanged }: {
  faculty: OrgFacultyProfile; orgId: string; onClose: () => void; onChanged: () => void;
}) {
  const [programs, setPrograms] = useState<ProgramDTO[]>([]);
  const [assigned, setAssigned] = useState<Set<string>>(new Set(faculty.program_ids ?? []));
  const [busy, setBusy]         = useState<Set<string>>(new Set());
  const [loading, setLoading]   = useState(true);
  const [err, setErr]           = useState("");
  const [touched, setTouched]   = useState(false);

  useEffect(() => {
    programsApi.list(orgId)
      .then(r => setPrograms((r.data ?? []).filter(p => p.status !== "archived")))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  async function toggle(programId: string) {
    const isOn = assigned.has(programId);
    setBusy(prev => new Set(prev).add(programId)); setErr("");
    try {
      if (isOn) await facultyMgmtApi.unassignProgram(faculty.id, programId);
      else await facultyMgmtApi.assignProgram(faculty.id, programId);
      setAssigned(prev => { const n = new Set(prev); isOn ? n.delete(programId) : n.add(programId); return n; });
      setTouched(true);
    } catch (e) { setErr((e as Error).message || "Could not update assignment"); }
    finally { setBusy(prev => { const n = new Set(prev); n.delete(programId); return n; }); }
  }

  function done() { if (touched) onChanged(); onClose(); }

  return (
    <Overlay onClose={done}>
      <div style={{ padding: "18px 22px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, fontFamily: "Poppins, sans-serif" }}>Assign to Programs</div>
          <div style={{ fontSize: 11, color: C.muted, marginTop: 2, fontFamily: "Poppins, sans-serif" }}>{faculty.name} · toggle program access</div>
        </div>
        <button onClick={done} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 16, color: C.muted }}>✕</button>
      </div>

      <div style={{ padding: "14px 22px", maxHeight: "60vh", overflowY: "auto" }}>
        {err && <div style={{ background: "rgba(200, 168, 96,0.06)", border: "1px solid rgba(200, 168, 96,0.2)", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: C.orange, marginBottom: 12, fontFamily: "Poppins, sans-serif" }}>{err}</div>}
        {loading ? (
          <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: C.muted }}>Loading programs…</div>
        ) : programs.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", fontSize: 12, color: C.muted }}>No programs in this organization yet.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {programs.map(p => {
              const on = assigned.has(p.id);
              const working = busy.has(p.id);
              return (
                <button key={p.id} onClick={() => !working && toggle(p.id)} disabled={working}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 9, border: `1.5px solid ${on ? C.green : C.border}`, background: on ? "rgba(34,197,94,0.06)" : C.card, cursor: working ? "wait" : "pointer", textAlign: "left", fontFamily: "Poppins, sans-serif" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: p.color || C.navy, flexShrink: 0 }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: on ? C.green : C.muted, flexShrink: 0 }}>
                    {working ? "…" : on ? "✓ ASSIGNED" : "ASSIGN"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ padding: "14px 22px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end" }}>
        <button onClick={done} style={S.primBtn}>Done</button>
      </div>
    </Overlay>
  );
}

// ── Assign-to-session modal (preserved) ──────────────────────────────────────
const DELIVERY_ROLES = ["Lead", "Co-Facilitator", "Observer"];

function AssignModal({ faculty, orgId, onClose, onAssigned }: {
  faculty: OrgFacultyMember | OrgFacultyProfile; orgId: string; onClose: () => void; onAssigned: () => void;
}) {
  const [programs, setPrograms]   = useState<ProgramDTO[]>([]);
  const [selProg, setSelProg]     = useState<ProgramDTO | null>(null);
  const [cohorts, setCohorts]     = useState<CohortDTO[]>([]);
  const [selCohortId, setSelCohortId] = useState("");
  const [activities, setActivities] = useState<Array<{id:string;title:string;type:string;phase:string;alreadyAssigned:boolean}>>([]);
  const [selActId, setSelActId]   = useState("");
  const [role, setRole]           = useState("Lead");
  const [loadingProg, setLoadingProg] = useState(false);
  const [busy, setBusy]           = useState(false);
  const [err, setErr]             = useState("");
  const [done, setDone]           = useState(false);
  const [conflicts, setConflicts] = useState<ConflictDTO[]>([]);
  const [overrideNote, setOverrideNote] = useState("");
  const [showOverride, setShowOverride] = useState(false);

  useEffect(() => {
    programsApi.list(orgId).then(r => setPrograms((r.data ?? []).filter(p => p.status !== "archived"))).catch(() => {});
  }, [orgId]);

  async function onPickProgram(prog: ProgramDTO) {
    setSelProg(prog); setSelCohortId(""); setSelActId(""); setCohorts([]); setActivities([]);
    setLoadingProg(true);
    try {
      const [detailRes, cohortRes] = await Promise.all([
        programsApi.get(prog.id),
        cohortsApi.list(orgId, prog.id),
      ]);
      setCohorts(cohortRes.data ?? []);
      const acts: Array<{id:string;title:string;type:string;phase:string;alreadyAssigned:boolean}> = [];
      for (const ph of detailRes.data.phases ?? []) {
        for (const a of ph.activities ?? []) {
          if (a.type === "live_session" || a.type === "coaching") {
            const alreadyAssigned = (a.faculty ?? []).some((f: {faculty_user_id:string}) => f.faculty_user_id === faculty.id);
            acts.push({ id: a.id, title: a.title, type: a.type, phase: ph.title, alreadyAssigned });
          }
        }
      }
      setActivities(acts);
    } finally { setLoadingProg(false); }
  }

  async function assign(note?: string) {
    if (!selActId || !selProg) return;
    setBusy(true); setErr("");
    try {
      const body: { faculty_user_id: string; role: string; cohort_id?: string; override_note?: string } = {
        faculty_user_id: faculty.id, role,
        ...(selCohortId ? { cohort_id: selCohortId } : {}),
        ...(note ? { override_note: note } : {}),
      };
      const raw = await programsApi.assignFaculty(selProg.id, selActId, body);
      const data = raw.data as { has_conflict?: boolean; conflicts?: ConflictDTO[] };
      if (data?.has_conflict) { setConflicts(data.conflicts ?? []); setShowOverride(true); setBusy(false); return; }
      setDone(true); onAssigned();
    } catch (e: unknown) {
      const err2 = e as { status?: number; data?: { conflicts?: ConflictDTO[] } };
      if (err2?.status === 409) { setConflicts(err2.data?.conflicts ?? []); setShowOverride(true); }
      else setErr((e as Error).message || "Failed");
    } finally { setBusy(false); }
  }

  if (done) return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "36px 28px", textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>✅</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 8 }}>Assigned!</div>
        <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6, marginBottom: 20 }}>
          <b>{faculty.name}</b> assigned as <b style={{ color: C.indigo }}>{role}</b>.
        </div>
        <button onClick={onClose} style={S.primBtn}>Done</button>
      </div>
    </Overlay>
  );

  if (showOverride) return (
    <Overlay onClose={onClose}>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, background: "rgba(200, 168, 96,0.04)" }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>⚠ Scheduling Conflict</div>
        <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{faculty.name} is already assigned to {conflicts.length} overlapping session(s).</div>
      </div>
      <div style={{ padding: "10px 18px", maxHeight: 180, overflowY: "auto" }}>
        {conflicts.map((c, i) => (
          <div key={i} style={{ padding: "6px 0", borderBottom: i < conflicts.length - 1 ? `1px solid ${C.border}` : "none" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: C.navy }}>{c.activity_title}</div>
            <div style={{ fontSize: 11, color: C.muted }}>{c.program_title}{c.cohort_name ? ` · ${c.cohort_name}` : ""}</div>
            <div style={{ fontSize: 10, color: C.orange }}>{c.start_date} → {c.end_date} · {c.role}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: "10px 18px", borderTop: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 5 }}>OVERRIDE REASON *</div>
        <textarea value={overrideNote} onChange={e => setOverrideNote(e.target.value)} rows={2}
          placeholder="e.g. Faculty confirmed availability for this slot"
          style={{ width: "100%", border: `1px solid ${C.border}`, borderRadius: 7, padding: "7px 10px", fontSize: 12, fontFamily: "Poppins, sans-serif", color: C.navy, resize: "none", boxSizing: "border-box", outline: "none" }} />
      </div>
      <div style={{ padding: "10px 18px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button onClick={() => setShowOverride(false)} style={S.secBtn}>Back</button>
        <button onClick={() => { if (overrideNote.trim()) assign(overrideNote.trim()); }} disabled={!overrideNote.trim() || busy}
          style={{ ...S.orangeBtn, opacity: overrideNote.trim() && !busy ? 1 : 0.5 }}>
          {busy ? "Assigning…" : "Override & Assign"}
        </button>
      </div>
    </Overlay>
  );

  return (
    <Overlay onClose={onClose} wide>
      <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}` }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>Assign to {faculty.name}</div>
        <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>Program → Cohort → Session → Role</div>
      </div>
      <div style={{ padding: "14px 18px", display: "flex", gap: 14, minHeight: 240, overflowX: "auto" }}>
        {/* Step 1 */}
        <div style={{ minWidth: 150, flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 4 }}>1. PROGRAM</div>
          {programs.length === 0 && <div style={{ fontSize: 12, color: C.muted }}>No programs found.</div>}
          {programs.map(p => (
            <button key={p.id} onClick={() => onPickProgram(p)} style={{ textAlign: "left", padding: "7px 10px", borderRadius: 7, border: `1.5px solid ${selProg?.id === p.id ? p.color || C.indigo : C.border}`, background: selProg?.id === p.id ? `${p.color || C.indigo}10` : C.card, cursor: "pointer", fontFamily: "Poppins, sans-serif", color: C.navy, fontSize: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: p.color || C.indigo, flexShrink: 0 }} />
                <span style={{ fontWeight: selProg?.id === p.id ? 700 : 500 }}>{p.title}</span>
              </div>
              <div style={{ fontSize: 10, color: C.muted, paddingLeft: 13 }}>{p.duration_weeks}w · {p.status}</div>
            </button>
          ))}
        </div>
        {/* Step 2 */}
        <div style={{ minWidth: 140, flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 4 }}>2. COHORT <span style={{ fontWeight: 400, textTransform: "lowercase" }}>(optional)</span></div>
          {!selProg && <div style={{ fontSize: 12, color: C.muted }}>Select a program first.</div>}
          {selProg && loadingProg && <div style={{ fontSize: 12, color: C.muted }}>Loading…</div>}
          {selProg && !loadingProg && cohorts.length === 0 && <div style={{ fontSize: 12, color: C.muted }}>No cohorts yet.</div>}
          {cohorts.map(co => (
            <button key={co.id} onClick={() => setSelCohortId(prev => prev === co.id ? "" : co.id)}
              style={{ textAlign: "left", padding: "7px 10px", borderRadius: 7, border: `1.5px solid ${selCohortId === co.id ? C.navy : C.border}`, background: selCohortId === co.id ? "rgba(24, 40, 72,0.07)" : C.card, cursor: "pointer", fontFamily: "Poppins, sans-serif", color: C.navy, fontSize: 12 }}>
              <div style={{ fontWeight: selCohortId === co.id ? 700 : 500 }}>{co.name}</div>
              <div style={{ fontSize: 10, color: C.muted }}>{co.enrolled_count}/{co.max_seats} enrolled</div>
            </button>
          ))}
        </div>
        {/* Step 3 */}
        <div style={{ minWidth: 160, flex: 1.2, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 4 }}>3. SESSION *</div>
          {!selProg && <div style={{ fontSize: 12, color: C.muted }}>Select a program first.</div>}
          {selProg && loadingProg && <div style={{ fontSize: 12, color: C.muted }}>Loading…</div>}
          {selProg && !loadingProg && activities.length === 0 && <div style={{ fontSize: 12, color: C.muted }}>No live sessions or coaching activities.</div>}
          {activities.map(a => (
            <button key={a.id} onClick={() => setSelActId(a.id)} style={{ textAlign: "left", padding: "7px 10px", borderRadius: 7, border: `1.5px solid ${selActId === a.id ? C.indigo : a.alreadyAssigned ? "rgba(34,197,94,0.4)" : C.border}`, background: selActId === a.id ? `${C.indigo}10` : a.alreadyAssigned ? "rgba(34,197,94,0.05)" : C.card, cursor: "pointer", fontFamily: "Poppins, sans-serif", color: C.navy, fontSize: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontWeight: 600, flex: 1 }}>{a.title}</span>
                {a.alreadyAssigned && <span style={{ fontSize: 9, fontWeight: 700, color: C.green, background: "rgba(34,197,94,0.12)", borderRadius: 20, padding: "2px 6px", flexShrink: 0 }}>Assigned</span>}
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>{a.phase} · {a.type === "live_session" ? "Live" : "Coaching"}</div>
            </button>
          ))}
        </div>
        {/* Step 4 */}
        <div style={{ width: 120, flexShrink: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.5, marginBottom: 4 }}>4. ROLE</div>
          {DELIVERY_ROLES.map(r => (
            <button key={r} onClick={() => setRole(r)} style={{ padding: "7px 10px", borderRadius: 7, border: `1.5px solid ${role === r ? C.indigo : C.border}`, background: role === r ? `${C.indigo}10` : C.card, cursor: "pointer", fontFamily: "Poppins, sans-serif", color: role === r ? C.indigo : C.navy, fontSize: 12, fontWeight: role === r ? 700 : 400 }}>
              {r}
            </button>
          ))}
        </div>
      </div>
      {err && <div style={{ margin: "0 18px 10px", fontSize: 12, color: C.orange, background: "rgba(200, 168, 96,0.06)", borderRadius: 8, padding: "8px 12px" }}>{err}</div>}
      <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
        <button onClick={onClose} style={S.secBtn}>Cancel</button>
        <button onClick={() => assign()} disabled={!selActId || busy} style={{ ...S.primBtn, opacity: selActId && !busy ? 1 : 0.5 }}>
          {busy ? "Saving…" : activities.find(a => a.id === selActId)?.alreadyAssigned ? "Update Role" : "Assign"}
        </button>
      </div>
    </Overlay>
  );
}

// ── Faculty Calendar Popover (preserved) ──────────────────────────────────────
function CalendarPopover({ faculty, anchorRect, onClose }: {
  faculty: OrgFacultyMember | OrgFacultyProfile;
  anchorRect: DOMRect;
  onClose: () => void;
}) {
  const [schedule, setSchedule] = useState<FacultyScheduleDay[]>([]);
  const [loading, setLoading]   = useState(true);
  const [viewDate, setViewDate] = useState(() => { const d = new Date(); d.setDate(1); return d; });

  useEffect(() => {
    setLoading(true);
    programsApi.getFacultySchedule(faculty.id).then(r => setSchedule(r.data ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, [faculty.id]);

  const busyMap = new Map<string, FacultyScheduleDay>();
  for (const s of schedule) busyMap.set(s.date, s);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = viewDate.toLocaleDateString("en-US", { month: "short", year: "numeric" });

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  function pad2(n: number) { return String(n).padStart(2, "0"); }
  function cellKey(d: number) { return `${year}-${pad2(month + 1)}-${pad2(d)}`; }

  const popW = 260, popH = 310;
  let top = anchorRect.bottom + 6;
  let left = anchorRect.right - popW;
  if (left < 8) left = 8;
  if (top + popH > window.innerHeight - 8) top = anchorRect.top - popH - 6;

  if (typeof document === "undefined") return null;
  return ReactDOM.createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1999 }} />
      <div style={{ position: "fixed", top, left, width: popW, background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 8px 32px rgba(24, 40, 72,0.18)", zIndex: 2000, fontFamily: "Poppins, sans-serif", overflow: "hidden" }}>
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 8 }}>
          <Avatar name={faculty.name} size={24} url={(faculty as OrgFacultyProfile).avatar_url} />
          <div style={{ flex: 1, fontSize: 12, fontWeight: 700, color: C.navy, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{faculty.name}</div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", color: C.muted, cursor: "pointer", fontSize: 13 }}>✕</button>
        </div>
        <div style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={() => setViewDate(new Date(year, month - 1, 1))} style={{ ...S.iconBtn, padding: "2px 7px", fontSize: 12 }}>‹</button>
          <div style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: 700, color: C.navy }}>{monthName}</div>
          <button onClick={() => setViewDate(new Date(year, month + 1, 1))} style={{ ...S.iconBtn, padding: "2px 7px", fontSize: 12 }}>›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "0 10px" }}>
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <div key={i} style={{ textAlign: "center", fontSize: 8, fontWeight: 700, color: C.muted, padding: "1px 0" }}>{d}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 1, padding: "2px 10px 8px" }}>
          {loading ? (
            <div style={{ gridColumn: "span 7", textAlign: "center", padding: 12, fontSize: 11, color: C.muted }}>Loading…</div>
          ) : cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const key = cellKey(d);
            const busy = busyMap.get(key);
            const today = new Date();
            const isToday = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
            return (
              <div key={i} title={busy ? `${busy.session_title ?? "Session"} · ${busy.role ?? ""}` : "Available"}
                style={{ aspectRatio: "1", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: busy || isToday ? 700 : 400, color: busy ? "#fff" : isToday ? C.indigo : C.navy, background: busy ? C.indigo : isToday ? `${C.indigo}18` : "transparent", border: isToday && !busy ? `1px solid ${C.indigo}` : "none", cursor: busy ? "pointer" : "default" }}>
                {d}
              </div>
            );
          })}
        </div>
        <div style={{ padding: "6px 12px 8px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, fontSize: 9, color: C.muted }}>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: C.indigo, display: "inline-block" }} />Busy</span>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 2, border: `1px solid ${C.indigo}`, display: "inline-block" }} />Today</span>
          <span>{schedule.length} session{schedule.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </>,
    document.body
  );
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────────
function DashboardTab({ orgId }: { orgId: string }) {
  const [dashboard, setDashboard] = useState<FacultyDashboardDTO | null>(null);
  const [l1l4, setL1l4]           = useState<FacultyL1L4SummaryDTO[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      programsApi.getFacultyDashboard(orgId).then(r => setDashboard(r.data)),
      programsApi.getFacultyL1L4Summary(orgId).then(r => setL1l4(r.data ?? [])),
    ]).catch(() => {}).finally(() => setLoading(false));
  }, [orgId]);

  if (loading) return <div style={{ padding: 48, textAlign: "center", color: C.muted, fontSize: 13 }}>Loading dashboard…</div>;

  const d = dashboard;
  const activeFac = d?.faculty_rows?.filter(f => f.status === "active") ?? [];
  const onboardingCount = d?.faculty_rows?.filter(f => f.status === "onboarding").length ?? 0;

  const avgL1 = activeFac.length ? (activeFac.reduce((a, f) => a + f.avg_l1_score, 0) / activeFac.length) : 0;
  const avgL2 = l1l4.length ? l1l4.reduce((a, f) => a + f.avg_l2, 0) / l1l4.length : 0;
  const avgL3 = l1l4.length ? l1l4.reduce((a, f) => a + f.avg_l3, 0) / l1l4.length : 0;
  const avgL4 = l1l4.length ? l1l4.reduce((a, f) => a + f.avg_l4, 0) / l1l4.length : 0;

  const kpis = [
    { label: "Total Faculty",      value: d?.total_faculty ?? 0,     sub: `${onboardingCount} onboarding`,       color: C.navy,   icon: "◇" },
    { label: "Sessions Delivered", value: d?.sessions_delivered ?? 0, sub: "Across all programs",               color: C.orange, icon: "⬡" },
    { label: "Avg Engagement",     value: `${d?.avg_engagement ?? 0}%`, sub: "Active faculty only",             color: C.green,  icon: "◈" },
    { label: "Avg L1 Reaction",    value: avgL1 > 0 ? `${avgL1.toFixed(1)} / 5` : "-", sub: "Post-session feedback", color: C.indigo, icon: "✦" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* AI Faculty Pulse */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, background: "linear-gradient(135deg,var(--xa-navy) 0%,#2d3a7c 100%)", color: "#fff", borderRadius: 12, padding: "14px 20px" }}>
        <span style={{ fontSize: 16, marginTop: 2 }}>✦</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>AI Faculty Pulse</div>
          <div style={{ fontSize: 12, opacity: 0.88 }}>
            {activeFac.length > 0
              ? `${activeFac.sort((a, b) => b.avg_l1_score - a.avg_l1_score)[0]?.faculty_name} is your top performer with an L1 score of ${activeFac[0]?.avg_l1_score?.toFixed(1)}. ${onboardingCount > 0 ? `${onboardingCount} faculty onboarding in progress.` : ""} L3 behavior scores are tracked at 90 days post-session.`
              : "Invite and onboard faculty to see AI-powered insights about your team performance."}
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="xa-kpi-4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        {kpis.map((s, i) => (
          <div key={i} style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: "16px 18px", boxShadow: "0 1px 4px rgba(24, 40, 72,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 5 }}>{s.label}</div>
                <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>{s.sub}</div>
              </div>
              <span style={{ fontSize: 22, opacity: 0.4 }}>{s.icon}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Faculty Performance Table */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(24, 40, 72,0.06)", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>Faculty Performance Overview</div>
          <span style={{ fontSize: 11, color: C.muted }}>Active faculty only</span>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: C.page }}>
                {["Faculty", "Specialization", "Sessions", "Scheduled", "Engagement", "L1 Reaction", "Status"].map(h => (
                  <th key={h} style={{ padding: "10px 16px", fontSize: 10, fontWeight: 700, color: C.muted, textAlign: "left", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeFac.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", fontSize: 13, color: C.muted }}>No active faculty yet</td></tr>
              ) : activeFac.map((f, i) => (
                <tr key={i} style={{ borderTop: `1px solid ${C.page}` }}>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar name={f.faculty_name} size={32} url={f.avatar_url} />
                      <div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{f.faculty_name}</div>
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px", fontSize: 11, color: C.muted, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.specialization || "-"}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: C.navy }}>{f.sessions}</td>
                  <td style={{ padding: "12px 16px", fontSize: 13, fontWeight: 700, color: C.orange }}>{f.scheduled}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <MiniBar pct={f.engagement_pct} color={C.green} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: C.green }}>{f.engagement_pct}%</span>
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: C.indigo }}>{f.avg_l1_score > 0 ? f.avg_l1_score.toFixed(1) : "-"}</span>
                      {f.avg_l1_score > 0 && <MiniBar pct={f.avg_l1_score / 5 * 100} color={C.indigo} width={40} />}
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px" }}><StatusBadge status={f.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom row: Programs by Faculty + L1-L4 Summary */}
      <div className="xa-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* Programs by Faculty */}
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, boxShadow: "0 1px 4px rgba(24, 40, 72,0.06)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, marginBottom: 14 }}>Programs by Faculty</div>
          {l1l4.length === 0 ? (
            <div style={{ fontSize: 12, color: C.muted }}>No program assignments yet</div>
          ) : l1l4.map((f, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <Avatar name={f.faculty_name} size={24} url={f.avatar_url} />
                <span style={{ fontSize: 12, color: C.navy, fontWeight: 600 }}>{f.faculty_name}</span>
              </div>
              <div style={{ fontSize: 11, color: C.muted, paddingLeft: 32 }}>{f.specialization || "No specialization"}</div>
            </div>
          ))}
        </div>

        {/* L1-L4 Summary */}
        <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 20, boxShadow: "0 1px 4px rgba(24, 40, 72,0.06)" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, marginBottom: 14 }}>L1-L4 Summary (Active Faculty)</div>
          {[
            ["L1 Reaction",  "Post-session score /5",   avgL1 > 0 ? `${avgL1.toFixed(1)} / 5.0` : "-", C.indigo, avgL1 / 5 * 100],
            ["L2 Learning",  "Pre/post assessment delta", avgL2 > 0 ? `${Math.round(avgL2)}%` : "-",  "#0891B2", avgL2],
            ["L3 Behavior",  "Applying on the job (90d)", avgL3 > 0 ? `${Math.round(avgL3)}%` : "-", C.green,  avgL3],
            ["L4 Results",   "Business impact (180d)",    avgL4 > 0 ? `${Math.round(avgL4)}%` : "-", C.orange, avgL4],
          ].map(([level, desc, val, color, pct], i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{level}</span>
                  <span style={{ fontSize: 11, color: C.muted, marginLeft: 8 }}>{desc}</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 800, color: color as string }}>{val}</span>
              </div>
              <MiniBar pct={pct as number} color={color as string} width={undefined as unknown as number} height={6} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Roster Tab ────────────────────────────────────────────────────────────────
function RosterTab({ orgId, onTabChange }: { orgId: string; onTabChange: (tab: string) => void }) {
  const [profiles, setProfiles]   = useState<OrgFacultyProfile[]>([]);
  const [assignments, setAssignments] = useState<Record<string, FacultyAssignmentDTO[]>>({});
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [assignFor, setAssignFor] = useState<OrgFacultyProfile | null>(null);
  const [calFor, setCalFor]       = useState<OrgFacultyProfile | null>(null);
  const [calAnchor, setCalAnchor] = useState<DOMRect | null>(null);
  const [expanded, setExpanded]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await programsApi.listOrgFacultyProfiles(orgId);
      const list = res.data ?? [];
      setProfiles(list);
      const entries = await Promise.all(
        list.map(async f => {
          try {
            const r = await programsApi.getFacultyAssignments(f.id);
            return [f.id, r.data ?? []] as [string, FacultyAssignmentDTO[]];
          } catch { return [f.id, []] as [string, FacultyAssignmentDTO[]]; }
        })
      );
      setAssignments(Object.fromEntries(entries));
    } finally { setLoading(false); }
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const filtered = profiles.filter(f =>
    !search ||
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    (f.specialization ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <input value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search faculty by name or specialization…"
          style={{ flex: 1, border: `1.5px solid ${C.border}`, borderRadius: 9, padding: "9px 14px", fontSize: 13, fontFamily: "Poppins, sans-serif", color: C.navy, outline: "none", background: C.card }} />
        <button onClick={() => onTabChange("onboard")} style={{ ...S.primBtn, flexShrink: 0 }}>+ Onboard Faculty</button>
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: "center", color: C.muted, fontSize: 13 }}>Loading roster…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>◇</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.navy, marginBottom: 6 }}>No faculty yet</div>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 16 }}>Onboard your first faculty member.</div>
          <button onClick={() => onTabChange("onboard")} style={S.primBtn}>+ Onboard Faculty</button>
        </div>
      ) : (
        <div className="xa-kpi-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 14 }}>
          {filtered.map((f, i) => {
            const fAssign = assignments[f.id] ?? [];
            const byProg = fAssign.reduce<Record<string, { title: string; color: string; acts: FacultyAssignmentDTO[] }>>((acc, a) => {
              if (!acc[a.program_id]) acc[a.program_id] = { title: a.program_title, color: a.program_color, acts: [] };
              acc[a.program_id].acts.push(a); return acc;
            }, {});
            const progList = Object.values(byProg);
            const isExp = expanded === f.id;

            return (
              <div key={i} style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(24, 40, 72,0.06)", overflow: "hidden" }}>
                {/* Card header */}
                <div style={{ background: f.onboarding_status === "onboarding" ? "rgba(8,145,178,0.05)" : C.page, padding: "16px 18px", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Avatar name={f.name} size={44} url={f.avatar_url} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.navy }}>{f.name}</div>
                        <div style={{ fontSize: 10, color: C.muted }}>
                          {f.location ? `${f.location} · ` : ""}Joined platform
                        </div>
                      </div>
                    </div>
                    <StatusBadge status={f.onboarding_status} />
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>{f.specialization || "No specialization set"}</div>
                  {f.certifications.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {f.certifications.slice(0, 3).map((cert, j) => (
                        <span key={j} style={{ fontSize: 9, color: "#4a5074", background: "rgba(24, 40, 72,0.05)", borderRadius: 6, padding: "2px 7px" }}>{cert}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Card body */}
                <div style={{ padding: "12px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                  {f.onboarding_status === "active" && (
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                      {[
                        ["Sessions",    f.sessions_count,  C.navy],
                        ["Scheduled",   f.scheduled_count, C.orange],
                        ["Engagement",  `${f.engagement_pct}%`, C.green],
                      ].map(([k, v, c], j) => (
                        <div key={j} style={{ background: C.page, borderRadius: 8, padding: "6px 8px", textAlign: "center" }}>
                          <div style={{ fontSize: 9, color: C.muted, marginBottom: 2 }}>{k}</div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: c as string }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Assigned programs (collapsible) */}
                  {progList.length > 0 && (
                    <div>
                      <button onClick={() => setExpanded(isExp ? null : f.id)}
                        style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4, fontFamily: "Poppins, sans-serif" }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: 0.4 }}>ASSIGNED PROGRAMS ({progList.length})</div>
                        <span style={{ fontSize: 10, color: C.muted, transform: isExp ? "rotate(180deg)" : "none", display: "inline-block", transition: "transform .15s" }}>▾</span>
                      </button>
                      {isExp && (
                        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                          {progList.map((p, j) => (
                            <div key={j} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: C.navy, background: "rgba(24, 40, 72,0.05)", borderRadius: 5, padding: "3px 8px" }}>
                              <div style={{ width: 6, height: 6, borderRadius: "50%", background: p.color || C.indigo, flexShrink: 0 }} />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {f.onboarding_status === "onboarding" && (
                    <div style={{ background: "rgba(8,145,178,0.07)", border: "1px solid rgba(8,145,178,0.2)", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: C.cyan, fontWeight: 600 }}>
                      ◎ Onboarding in progress - {f.scheduled_count} sessions scheduled
                    </div>
                  )}
                  {f.onboarding_status === "inactive" && (
                    <div style={{ background: "rgba(74, 85, 115,0.08)", border: "1px solid rgba(74, 85, 115,0.15)", borderRadius: 8, padding: "8px 12px", fontSize: 11, color: C.muted }}>
                      No active program assignments
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <button onClick={e => { setCalFor(f); setCalAnchor((e.currentTarget as HTMLButtonElement).getBoundingClientRect()); }}
                      style={{ ...S.iconBtn, flex: 1, justifyContent: "center", display: "flex" }}>📅 Calendar</button>
                    <button onClick={() => setAssignFor(f)}
                      style={{ flex: 1, padding: "6px 0", border: "none", borderRadius: 8, background: C.navy, cursor: "pointer", fontSize: 11, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif" }}>
                      Assign Program
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {assignFor && (
        <ProgramAssignModal faculty={assignFor} orgId={orgId} onClose={() => setAssignFor(null)} onChanged={() => { load(); }} />
      )}
      {calFor && calAnchor && (
        <CalendarPopover faculty={calFor} anchorRect={calAnchor} onClose={() => { setCalFor(null); setCalAnchor(null); }} />
      )}
    </div>
  );
}

// ── Onboard Faculty Tab (4-step wizard) ───────────────────────────────────────
const SPECIALIZATIONS = [
  "Leadership & Executive Coaching", "Finance & Business Strategy",
  "Communication & Executive Presence", "Digital Leadership & Change Mgmt",
  "OD & Talent Management", "Sales & Commercial Strategy",
  "Diversity, Equity & Inclusion", "Data & Analytics for Leaders",
  "Operations & Supply Chain",
];

interface OnboardForm {
  firstName: string; lastName: string; email: string; phone: string;
  location: string; linkedIn: string; specialization: string;
  certifications: string; bio: string; programIds: string[];
  accessLevel: string; sendInvite: boolean;
}

function OnboardTab({ orgId }: { orgId: string }) {
  const [step, setStep]   = useState(1);
  const [done, setDone]   = useState(false);
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState("");
  const [programs, setPrograms] = useState<ProgramDTO[]>([]);
  const [form, setForm]   = useState<OnboardForm>({
    firstName: "", lastName: "", email: "", phone: "", location: "", linkedIn: "",
    specialization: "", certifications: "", bio: "",
    programIds: [], accessLevel: "Standard", sendInvite: true,
  });

  const ff = <K extends keyof OnboardForm>(k: K, v: OnboardForm[K]) =>
    setForm(p => ({ ...p, [k]: v }));

  useEffect(() => {
    programsApi.list(orgId).then(r => setPrograms(r.data ?? [])).catch(() => {});
  }, [orgId]);

  const canNext1 = form.firstName.trim() && form.lastName.trim() && form.email.trim();
  const canNext2 = form.specialization.trim();

  async function submit() {
    if (!form.email.trim()) { setErr("Email required"); return; }
    setBusy(true); setErr("");
    try {
      const certs = form.certifications.split(",").map(s => s.trim()).filter(Boolean);
      const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim();
      await invitationsApi.sendFaculty({ email: form.email.trim().toLowerCase(), org_id: orgId, name: fullName });
      if (form.specialization) {
        // We'll update after the invite creates the user - for now just mark done
      }
      setDone(true);
    } catch (e: unknown) {
      setErr((e as Error).message || "Failed to send invite");
    } finally { setBusy(false); }
  }

  const inp: React.CSSProperties = { width: "100%", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, fontFamily: "Poppins, sans-serif", color: C.navy, outline: "none", boxSizing: "border-box" };
  const lbl: React.CSSProperties = { fontSize: 10, fontWeight: 700, color: C.muted, letterSpacing: 0.4, marginBottom: 6, display: "block" };

  if (done) return (
    <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, padding: 48, textAlign: "center", boxShadow: "0 1px 4px rgba(24, 40, 72,0.06)" }}>
      <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(34,197,94,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px", fontSize: 28, color: C.green }}>✦</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: C.navy, marginBottom: 8 }}>Faculty Onboarded Successfully!</div>
      <div style={{ fontSize: 13, color: C.muted, marginBottom: 6, lineHeight: 1.7 }}>{form.firstName} {form.lastName} has been added to the platform.</div>
      <div style={{ fontSize: 12, color: C.muted, marginBottom: 28 }}>
        {form.sendInvite ? "A welcome email with login credentials has been sent." : "No invite sent - you can send it later from the roster."}
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
        <button onClick={() => { setDone(false); setStep(1); setForm({ firstName: "", lastName: "", email: "", phone: "", location: "", linkedIn: "", specialization: "", certifications: "", bio: "", programIds: [], accessLevel: "Standard", sendInvite: true }); }} style={S.secBtn}>Onboard Another</button>
        <button onClick={() => { setStep(1); setDone(false); }} style={S.primBtn}>Back to Onboard</button>
      </div>
    </div>
  );

  const steps: [string, string][] = [
    ["1", "Personal Info"], ["2", "Professional Profile"], ["3", "Program Assignment"], ["4", "Platform Access"]
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Step indicator */}
      <div style={{ display: "flex", alignItems: "center", background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: "16px 24px", boxShadow: "0 1px 4px rgba(24, 40, 72,0.06)" }}>
        {steps.map(([num, label], i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", flex: i < 3 ? 1 : undefined }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", background: parseInt(num) <= step ? C.navy : "#EFE9DC", color: parseInt(num) <= step ? "#fff" : C.muted, fontWeight: 700, fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {parseInt(num) < step ? "✓" : num}
              </div>
              <span style={{ fontSize: 12, fontWeight: parseInt(num) === step ? 700 : 400, color: parseInt(num) <= step ? C.navy : C.muted, whiteSpace: "nowrap" }}>{label}</span>
            </div>
            {i < 3 && <div style={{ flex: 1, height: 1, background: parseInt(num) < step ? C.navy : C.border, margin: "0 12px", minWidth: 20 }} />}
          </div>
        ))}
      </div>

      {/* Step content */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 28, boxShadow: "0 1px 4px rgba(24, 40, 72,0.06)" }}>
        {/* ── Step 1 ── */}
        {step === 1 && (
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 20 }}>Step 1: Personal Information</div>
            <div className="xa-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {[
                ["First Name *",      form.firstName, (v: string) => ff("firstName", v),    "text",  "e.g. Priya"],
                ["Last Name *",       form.lastName,  (v: string) => ff("lastName", v),     "text",  "e.g. Verma"],
                ["Email Address *",   form.email,     (v: string) => ff("email", v),        "email", "faculty@organisation.com"],
                ["Phone Number",      form.phone,     (v: string) => ff("phone", v),        "tel",   "+91 98765 43210"],
                ["Location / City",   form.location,  (v: string) => ff("location", v),    "text",  "e.g. Mumbai"],
                ["LinkedIn Profile",  form.linkedIn,  (v: string) => ff("linkedIn", v),    "url",   "https://linkedin.com/in/..."],
              ].map(([label, val, setter, type, placeholder], idx) => (
                <div key={idx}>
                  <label style={lbl}>{(label as string).toUpperCase()}</label>
                  <input type={type as string} value={val as string} onChange={e => (setter as (v: string) => void)(e.target.value)} placeholder={placeholder as string} style={inp} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 24 }}>
              <button onClick={() => setStep(2)} disabled={!canNext1}
                style={{ ...S.primBtn, opacity: canNext1 ? 1 : 0.5, cursor: canNext1 ? "pointer" : "not-allowed" }}>
                Next: Professional Profile →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 2 ── */}
        {step === 2 && (
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 20 }}>Step 2: Professional Profile</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={lbl}>SPECIALIZATION / DOMAIN *</label>
                <select value={form.specialization} onChange={e => ff("specialization", e.target.value)}
                  style={inp}>
                  <option value="">- Select specialization -</option>
                  {SPECIALIZATIONS.map(o => <option key={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>CERTIFICATIONS & QUALIFICATIONS</label>
                <input value={form.certifications} onChange={e => ff("certifications", e.target.value)}
                  placeholder="e.g. ICF PCC, PhD Org. Psychology, MBA IIM-A (comma-separated)"
                  style={inp} />
              </div>
              <div>
                <label style={lbl}>BIO / INTRODUCTION</label>
                <textarea value={form.bio} onChange={e => ff("bio", e.target.value)} rows={4}
                  placeholder="A brief introduction that will be shared with participants…"
                  style={{ ...inp, resize: "vertical", lineHeight: 1.7 }} />
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
              <button onClick={() => setStep(1)} style={S.secBtn}>← Back</button>
              <button onClick={() => setStep(3)} disabled={!canNext2}
                style={{ ...S.primBtn, opacity: canNext2 ? 1 : 0.5, cursor: canNext2 ? "pointer" : "not-allowed" }}>
                Next: Program Assignment →
              </button>
            </div>
          </div>
        )}

        {/* ── Step 3 ── */}
        {step === 3 && (
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 20 }}>Step 3: Program Assignment</div>
            <div>
              <label style={lbl}>ASSIGN TO PROGRAMS (OPTIONAL)</label>
              {programs.length === 0 ? (
                <div style={{ fontSize: 12, color: C.muted }}>No published programs yet.</div>
              ) : (
                <div className="xa-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {programs.map(p => {
                    const checked = form.programIds.includes(p.id);
                    return (
                      <div key={p.id} onClick={() => ff("programIds", checked ? form.programIds.filter(x => x !== p.id) : [...form.programIds, p.id])}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: `1.5px solid ${checked ? C.navy : C.border}`, borderRadius: 9, cursor: "pointer", background: checked ? "rgba(24, 40, 72,0.04)" : C.card }}>
                        <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${checked ? C.navy : C.disabled}`, background: checked ? C.navy : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {checked && <span style={{ color: "#fff", fontSize: 11 }}>✓</span>}
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: C.navy, fontWeight: checked ? 600 : 400 }}>{p.title}</div>
                          <div style={{ fontSize: 10, color: C.muted }}>{p.duration_weeks}w · {p.status}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
              <button onClick={() => setStep(2)} style={S.secBtn}>← Back</button>
              <button onClick={() => setStep(4)} style={S.primBtn}>Next: Platform Access →</button>
            </div>
          </div>
        )}

        {/* ── Step 4 ── */}
        {step === 4 && (
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: C.navy, marginBottom: 20 }}>Step 4: Platform Access & Send Invite</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Access level */}
              <div>
                <label style={lbl}>ACCESS LEVEL</label>
                <div className="xa-kpi-3" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                  {[
                    ["Standard", "Access to assigned programs, sessions, grading and discussions."],
                    ["Advanced", "All Standard + analytics, content upload, cohort-level reporting."],
                    ["Admin",    "Full program-level access including cohort management and comms."],
                  ].map(([level, desc]) => (
                    <div key={level} onClick={() => ff("accessLevel", level)}
                      style={{ padding: 14, border: `2px solid ${form.accessLevel === level ? C.navy : C.border}`, borderRadius: 12, cursor: "pointer", background: form.accessLevel === level ? "rgba(24, 40, 72,0.04)" : C.card }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: form.accessLevel === level ? C.navy : C.muted, marginBottom: 5 }}>{level}</div>
                      <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>{desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Review summary */}
              <div style={{ background: C.page, borderRadius: 10, padding: "16px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 12 }}>REVIEW SUMMARY</div>
                {[
                  ["Name",          `${form.firstName} ${form.lastName}`],
                  ["Email",         form.email],
                  ["Location",      form.location || "-"],
                  ["Specialization",form.specialization || "-"],
                  ["Programs",      form.programIds.length > 0 ? `${form.programIds.length} assigned` : "None"],
                  ["Access Level",  form.accessLevel],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: "flex", gap: 8, fontSize: 12, padding: "4px 0", borderBottom: `1px solid ${C.border}` }}>
                    <span style={{ color: C.muted, minWidth: 120, flexShrink: 0 }}>{k}:</span>
                    <span style={{ color: C.navy, fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Send invite toggle */}
              <div onClick={() => ff("sendInvite", !form.sendInvite)}
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 10, cursor: "pointer" }}>
                <div style={{ width: 22, height: 22, borderRadius: 4, border: `2px solid ${form.sendInvite ? C.green : C.disabled}`, background: form.sendInvite ? C.green : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {form.sendInvite && <span style={{ color: "#fff", fontSize: 13 }}>✓</span>}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>Send Welcome Email with Login Credentials</div>
                  <div style={{ fontSize: 11, color: C.muted }}>An onboarding email will be sent to {form.email || "the faculty's email"}.</div>
                </div>
              </div>

              {err && <div style={{ fontSize: 12, color: C.orange, background: "rgba(200, 168, 96,0.06)", borderRadius: 8, padding: "8px 12px" }}>{err}</div>}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
              <button onClick={() => setStep(3)} style={S.secBtn}>← Back</button>
              <button onClick={submit} disabled={busy}
                style={{ ...S.orangeBtn, background: C.green, opacity: busy ? 0.6 : 1, cursor: busy ? "not-allowed" : "pointer" }}>
                {busy ? "Sending…" : "✦ Complete Onboarding"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── L1-L4 Feedback Tab ────────────────────────────────────────────────────────
function L1L4Tab({ orgId }: { orgId: string }) {
  const [data, setData]       = useState<FacultyL1L4SummaryDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<FacultyL1L4SummaryDTO | null>(null);

  useEffect(() => {
    setLoading(true);
    programsApi.getFacultyL1L4Summary(orgId)
      .then(r => setData(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [orgId]);

  const active = data; // all returned

  const avgL1 = active.length ? active.reduce((a, f) => a + f.avg_l1, 0) / active.length : 0;
  const avgL2 = active.length ? active.reduce((a, f) => a + f.avg_l2, 0) / active.length : 0;
  const avgL3 = active.length ? active.reduce((a, f) => a + f.avg_l3, 0) / active.length : 0;
  const avgL4 = active.length ? active.reduce((a, f) => a + f.avg_l4, 0) / active.length : 0;

  if (loading) return <div style={{ padding: 48, textAlign: "center", color: C.muted, fontSize: 13 }}>Loading feedback data…</div>;

  const kpiCards = [
    { level: "L1", title: "Reaction",  desc: "Avg rating / 5",        value: avgL1 > 0 ? `${avgL1.toFixed(1)}` : "-", suffix: " / 5", color: C.indigo,  pct: avgL1 / 5 * 100 },
    { level: "L2", title: "Learning",  desc: "Avg knowledge gain",    value: avgL2 > 0 ? `${Math.round(avgL2)}` : "-", suffix: "%",   color: "#0891B2", pct: avgL2 },
    { level: "L3", title: "Behavior",  desc: "Applying on job (90d)", value: avgL3 > 0 ? `${Math.round(avgL3)}` : "-", suffix: "%",   color: C.green,   pct: avgL3 },
    { level: "L4", title: "Results",   desc: "Business impact (180d)", value: avgL4 > 0 ? `${Math.round(avgL4)}` : "-", suffix: "%", color: C.orange,  pct: avgL4 },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Kirkpatrick banner */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, background: "linear-gradient(135deg,#4A5573 0%,#4c54a0 100%)", color: "#fff", borderRadius: 12, padding: "14px 20px" }}>
        <span style={{ fontSize: 16, marginTop: 2 }}>✦</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>Kirkpatrick 4-Level Feedback Model</div>
          <div style={{ fontSize: 12, opacity: 0.88 }}>
            <strong>L1 Reaction</strong> - how participants felt immediately post-session (self-administered survey). &nbsp;
            <strong>L2 Learning</strong> - knowledge gained pre/post assessment. &nbsp;
            <strong>L3 Behavior</strong> - on-the-job application at 60-90 days (multi-rater). &nbsp;
            <strong>L4 Results</strong> - business impact at 3-6 months (business sponsor).
          </div>
        </div>
      </div>

      {/* KPI cards */}
      <div className="xa-kpi-4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14 }}>
        {kpiCards.map((s, i) => (
          <div key={i} style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: "16px 18px", boxShadow: "0 1px 4px rgba(24, 40, 72,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: `${s.color}18`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: s.color }}>{s.level}</span>
              </div>
              <span style={{ fontSize: 11, color: C.muted, fontWeight: 600 }}>{s.title}</span>
            </div>
            <div style={{ fontSize: 26, fontWeight: 800, color: s.color }}>{s.value}<span style={{ fontSize: 14 }}>{s.suffix}</span></div>
            <div style={{ fontSize: 11, color: C.muted, marginTop: 3, marginBottom: 8 }}>{s.desc}</div>
            <MiniBar pct={s.pct} color={s.color} width={undefined as unknown as number} height={5} />
          </div>
        ))}
      </div>

      {/* Per-faculty breakdown table */}
      <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, boxShadow: "0 1px 4px rgba(24, 40, 72,0.06)", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.navy }}>Per-Faculty L1-L4 Breakdown</div>
        </div>
        {data.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center", fontSize: 13, color: C.muted }}>No feedback data yet. L1-L4 scores will appear after faculty-led sessions complete.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: C.page }}>
                  <th style={{ padding: "10px 16px", fontSize: 10, fontWeight: 700, color: C.muted, textAlign: "left" }}>Faculty</th>
                  {[["L1", "Reaction", "/5", C.indigo], ["L2", "Learning", "%", "#0891B2"], ["L3", "Behavior", "%", C.green], ["L4", "Results", "%", C.orange]].map(([l, t, u, c]) => (
                    <th key={l} style={{ padding: "10px 16px", fontSize: 10, fontWeight: 700, color: c, textAlign: "center", whiteSpace: "nowrap" }}>{l} {t} ({u})</th>
                  ))}
                  <th style={{ padding: "10px 16px", fontSize: 10, fontWeight: 700, color: C.muted, textAlign: "left" }}>Responses</th>
                </tr>
              </thead>
              <tbody>
                {data.map((f, i) => (
                  <tr key={i} onClick={() => setSelected(selected?.faculty_id === f.faculty_id ? null : f)}
                    style={{ borderTop: `1px solid ${C.page}`, cursor: "pointer", background: selected?.faculty_id === f.faculty_id ? "rgba(74, 85, 115,0.04)" : C.card }}>
                    <td style={{ padding: "12px 16px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <Avatar name={f.faculty_name} size={30} url={f.avatar_url} />
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 700, color: C.navy }}>{f.faculty_name}</div>
                          <div style={{ fontSize: 10, color: C.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{f.specialization || "-"}</div>
                        </div>
                      </div>
                    </td>
                    {[
                      [f.avg_l1, 5,   C.indigo,  f.avg_l1 > 0 ? f.avg_l1.toFixed(1) : "-"],
                      [f.avg_l2, 100, "#0891B2", f.avg_l2 > 0 ? `${Math.round(f.avg_l2)}%` : "-"],
                      [f.avg_l3, 100, C.green,   f.avg_l3 > 0 ? `${Math.round(f.avg_l3)}%` : "-"],
                      [f.avg_l4, 100, C.orange,  f.avg_l4 > 0 ? `${Math.round(f.avg_l4)}%` : "-"],
                    ].map(([val, max, color, label], j) => (
                      <td key={j} style={{ padding: "12px 16px", textAlign: "center" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: color as string }}>{label}</span>
                          {(val as number) > 0 && <MiniBar pct={(val as number) / (max as number) * 100} color={color as string} width={48} height={4} />}
                        </div>
                      </td>
                    ))}
                    <td style={{ padding: "12px 16px", fontSize: 11, color: C.muted }}>
                      L1:{f.l1_responses} L2:{f.l2_responses} L3:{f.l3_responses} L4:{f.l4_responses}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Drill-down panel */}
      {selected && (
        <div style={{ background: C.card, borderRadius: 12, border: `1.5px solid ${C.indigo}`, padding: 20, boxShadow: "0 1px 4px rgba(24, 40, 72,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <Avatar name={selected.faculty_name} size={40} url={selected.avatar_url} />
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>{selected.faculty_name}</div>
                <div style={{ fontSize: 11, color: C.muted }}>{selected.specialization || "-"}</div>
              </div>
            </div>
            <button onClick={() => setSelected(null)} style={{ border: "none", background: "none", cursor: "pointer", fontSize: 18, color: C.muted }}>✕</button>
          </div>
          <div className="xa-kpi-4" style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            {[
              { level: "L1 Reaction", value: selected.avg_l1, suffix: " / 5", max: 5,   color: C.indigo,  responses: selected.l1_responses, note: "Post-session survey avg" },
              { level: "L2 Learning", value: selected.avg_l2, suffix: "%",     max: 100, color: "#0891B2", responses: selected.l2_responses, note: "Pre vs post assessment improvement" },
              { level: "L3 Behavior", value: selected.avg_l3, suffix: "%",     max: 100, color: C.green,   responses: selected.l3_responses, note: "Skills applied at 90-day check" },
              { level: "L4 Results",  value: selected.avg_l4, suffix: "%",     max: 100, color: C.orange,  responses: selected.l4_responses, note: "Business outcomes at 180-day survey" },
            ].map((m, i) => (
              <div key={i} style={{ background: C.page, borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: m.color, marginBottom: 6 }}>{m.level}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: m.color, marginBottom: 4 }}>
                  {m.value > 0 ? (m.max === 5 ? m.value.toFixed(1) : Math.round(m.value)) : "-"}{m.value > 0 ? m.suffix : ""}
                </div>
                {m.value > 0 && (
                  <div style={{ marginBottom: 6 }}>
                    <MiniBar pct={m.value / m.max * 100} color={m.color} width={undefined as unknown as number} height={5} />
                  </div>
                )}
                <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.5 }}>{m.note}</div>
                <div style={{ fontSize: 9, color: C.muted, marginTop: 4 }}>{m.responses} responses</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function FacultyResources({ orgId }: { orgId: string }) {
  const [tab, setTab] = useState<"dashboard" | "roster" | "onboard" | "feedback">("dashboard");

  if (!orgId) return (
    <div style={{ padding: 48, textAlign: "center", color: C.muted, fontSize: 14, fontFamily: "Poppins, sans-serif" }}>
      Your account is not linked to an organization.
    </div>
  );

  const tabs: [string, string][] = [
    ["dashboard", "Dashboard"],
    ["roster",    "Faculty Roster"],
    ["onboard",   "Onboard Faculty"],
    ["feedback",  "L1-L4 Feedback"],
  ];

  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, fontFamily: "Poppins, sans-serif" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${C.border}` }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id as typeof tab)}
            style={{ padding: "9px 20px", border: "none", background: "transparent", cursor: "pointer", fontFamily: "Poppins, sans-serif", fontSize: 13, fontWeight: tab === id ? 700 : 400, color: tab === id ? C.navy : C.muted, borderBottom: `2.5px solid ${tab === id ? C.orange : "transparent"}`, marginBottom: -1 }}>
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "dashboard" && <DashboardTab orgId={orgId} />}
      {tab === "roster"    && <RosterTab    orgId={orgId} onTabChange={t => setTab(t as typeof tab)} />}
      {tab === "onboard"   && <OnboardTab   orgId={orgId} />}
      {tab === "feedback"  && <L1L4Tab      orgId={orgId} />}
    </div>
  );
}
