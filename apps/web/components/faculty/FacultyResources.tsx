"use client";

import { useState, useEffect, useCallback } from "react";
import { programsApi, OrgFacultyMember, FacultyScheduleDay, FacultyAssignmentDTO, ProgramDTO, ActivityFacultyDTO, ConflictDTO } from "@/lib/programs-api";
import { cohortsApi, CohortDTO } from "@/lib/cohorts-api";
import { invitationsApi } from "@/lib/invitations-api";
import { sessionsApi } from "@/lib/faculty-api";

// ── Tokens ────────────────────────────────────────────────────────────────────
const C = { navy: "#1C2551", orange: "#EF4E24", indigo: "#6B73BF", green: "#22c55e", muted: "#8b90a7", border: "#EAECF4", page: "#F5F7FB", card: "#fff" };
const S = {
  primBtn: { padding: "9px 18px", background: C.indigo, border: "none", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700, color: "#fff", fontFamily: "Poppins, sans-serif" } as React.CSSProperties,
  secBtn:  { padding: "8px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, color: C.navy, fontFamily: "Poppins, sans-serif" } as React.CSSProperties,
  iconBtn: { padding: "5px 10px", background: C.page, border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", fontSize: 11, color: C.navy, fontFamily: "Poppins, sans-serif", fontWeight: 600 } as React.CSSProperties,
};

function initials(name: string) { return name.split(" ").slice(0,2).map(w=>w[0]?.toUpperCase()??"").join(""); }
function avatarBg(name: string) {
  const cols = [C.indigo, C.navy, C.orange, C.green, "#f59e0b"];
  let h = 0; for (let i = 0; i < name.length; i++) h = (h*31+name.charCodeAt(i)) % cols.length;
  return cols[h];
}

// ── Overlay shell ─────────────────────────────────────────────────────────────
function Overlay({ children, onClose, wide }: { children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <div onClick={e=>{if(e.target===e.currentTarget)onClose();}}
      style={{position:"fixed",inset:0,background:"rgba(28,37,81,0.45)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"Poppins, sans-serif"}}>
      <div style={{background:C.card,borderRadius:14,width:"100%",maxWidth:wide?680:460,overflow:"hidden",boxShadow:"0 24px 64px rgba(28,37,81,0.22)"}}>
        {children}
      </div>
    </div>
  );
}

// ── Invite Faculty Modal ──────────────────────────────────────────────────────
function InviteModal({ orgId, onClose, onDone }: { orgId: string; onClose: () => void; onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy]   = useState(false);
  const [err, setErr]     = useState("");
  const [done, setDone]   = useState(false);

  async function submit() {
    const t = email.trim().toLowerCase();
    if (!t || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) { setErr("Valid email required"); return; }
    setBusy(true); setErr("");
    try {
      await invitationsApi.sendFaculty({ email: t, org_id: orgId });
      setDone(true); onDone();
    } catch(e: unknown) { setErr((e as Error).message || "Failed"); }
    finally { setBusy(false); }
  }

  if (done) return (
    <Overlay onClose={onClose}>
      <div style={{padding:"36px 28px",textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:12}}>📧</div>
        <div style={{fontSize:15,fontWeight:700,color:C.navy,marginBottom:8}}>Invite Sent!</div>
        <div style={{fontSize:12,color:C.muted,lineHeight:1.6,marginBottom:20}}>
          <b style={{color:C.navy}}>{email}</b> will receive an invitation to join as Faculty.
        </div>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <button onClick={()=>{setEmail(""); setDone(false);}} style={S.secBtn}>Invite Another</button>
          <button onClick={onClose} style={S.primBtn}>Done</button>
        </div>
      </div>
    </Overlay>
  );

  return (
    <Overlay onClose={onClose}>
      <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:14,fontWeight:700,color:C.navy}}>+ Invite Faculty</div>
        <div style={{fontSize:12,color:C.muted,marginTop:2}}>They'll join the org with the <b style={{color:C.indigo}}>Faculty</b> role.</div>
      </div>
      <div style={{padding:"14px 18px",display:"flex",flexDirection:"column",gap:12}}>
        <div>
          <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:0.5,marginBottom:6}}>EMAIL ADDRESS *</div>
          <input autoFocus type="email" value={email} onChange={e=>{setEmail(e.target.value);setErr("");}}
            onKeyDown={e=>{if(e.key==="Enter")submit();}} placeholder="faculty@institution.com"
            style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",fontSize:13,fontFamily:"Poppins, sans-serif",color:C.navy,boxSizing:"border-box",outline:"none"}}/>
        </div>
        {err && <div style={{fontSize:12,color:C.orange,background:"rgba(239,78,36,0.06)",borderRadius:8,padding:"8px 12px"}}>{err}</div>}
      </div>
      <div style={{padding:"12px 18px",borderTop:`1px solid ${C.border}`,display:"flex",gap:10,justifyContent:"flex-end"}}>
        <button onClick={onClose} style={S.secBtn}>Cancel</button>
        <button onClick={submit} disabled={busy} style={{...S.primBtn,opacity:busy?0.6:1}}>{busy?"Sending…":"Send Invite"}</button>
      </div>
    </Overlay>
  );
}

// ── Assign to Session Modal ───────────────────────────────────────────────────
// Step 1: choose program → Step 2: choose cohort → Step 3: choose session → Step 4: choose role
const DELIVERY_ROLES = ["Lead", "Co-Facilitator", "Observer"];

function AssignModal({ faculty, orgId, onClose, onAssigned }: {
  faculty: OrgFacultyMember; orgId: string; onClose: () => void; onAssigned: () => void;
}) {
  const [programs, setPrograms]     = useState<ProgramDTO[]>([]);
  const [selProg, setSelProg]       = useState<ProgramDTO | null>(null);
  const [cohorts, setCohorts]       = useState<CohortDTO[]>([]);
  const [selCohortId, setSelCohortId] = useState("");
  const [activities, setActivities] = useState<Array<{id:string;title:string;type:string;phase:string;alreadyAssigned:boolean}>>([]);
  const [selActId, setSelActId]     = useState("");
  const [role, setRole]             = useState("Lead");
  const [loadingProg, setLoadingProg] = useState(false);
  const [busy, setBusy]             = useState(false);
  const [err, setErr]               = useState("");
  const [done, setDone]             = useState(false);
  const [conflicts, setConflicts]   = useState<ConflictDTO[]>([]);
  const [overrideNote, setOverrideNote] = useState("");
  const [showOverride, setShowOverride] = useState(false);

  useEffect(() => {
    programsApi.list(orgId).then(r => setPrograms((r.data ?? []).filter(p => p.status !== "archived"))).catch(() => {});
  }, [orgId]);

  async function onPickProgram(prog: ProgramDTO) {
    setSelProg(prog);
    setSelCohortId(""); setSelActId(""); setCohorts([]); setActivities([]);
    setLoadingProg(true);
    try {
      const [detailRes, cohortRes] = await Promise.all([
        programsApi.get(prog.id),
        cohortsApi.list(orgId, prog.id),
      ]);
      // Load cohorts for this program
      setCohorts(cohortRes.data ?? []);
      // Load live_session / coaching activities, marking ones where this faculty is already assigned
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
      if (data?.has_conflict) {
        setConflicts(data.conflicts ?? []);
        setShowOverride(true);
        setBusy(false);
        return;
      }
      setDone(true); onAssigned();
    } catch(e: unknown) {
      const err2 = e as { status?: number; data?: { conflicts?: ConflictDTO[] } };
      if (err2?.status === 409) { setConflicts(err2.data?.conflicts??[]); setShowOverride(true); }
      else setErr((e as Error).message || "Failed");
    } finally { setBusy(false); }
  }

  if (done) return (
    <Overlay onClose={onClose}>
      <div style={{padding:"36px 28px",textAlign:"center"}}>
        <div style={{fontSize:32,marginBottom:12}}>✅</div>
        <div style={{fontSize:15,fontWeight:700,color:C.navy,marginBottom:8}}>Assigned!</div>
        <div style={{fontSize:12,color:C.muted,lineHeight:1.6,marginBottom:20}}>
          <b>{faculty.name}</b> assigned as <b style={{color:C.indigo}}>{role}</b>
          {selCohortId && cohorts.find(c=>c.id===selCohortId) && <> to <b style={{color:C.navy}}>{cohorts.find(c=>c.id===selCohortId)!.name}</b></>}.
        </div>
        <button onClick={onClose} style={S.primBtn}>Done</button>
      </div>
    </Overlay>
  );

  if (showOverride) return (
    <Overlay onClose={onClose}>
      <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`,background:"rgba(239,78,36,0.04)"}}>
        <div style={{fontSize:14,fontWeight:700,color:C.navy}}>⚠ Scheduling Conflict</div>
        <div style={{fontSize:11,color:C.muted,marginTop:2}}>{faculty.name} is already assigned to {conflicts.length} overlapping session(s).</div>
      </div>
      <div style={{padding:"10px 18px",maxHeight:180,overflowY:"auto"}}>
        {conflicts.map((c,i)=>(
          <div key={i} style={{padding:"6px 0",borderBottom:i<conflicts.length-1?`1px solid ${C.border}`:"none"}}>
            <div style={{fontSize:12,fontWeight:600,color:C.navy}}>{c.activity_title}</div>
            <div style={{fontSize:11,color:C.muted}}>{c.program_title}{c.cohort_name?` · ${c.cohort_name}`:""}</div>
            <div style={{fontSize:10,color:C.orange}}>{c.start_date} → {c.end_date} · {c.role}</div>
          </div>
        ))}
      </div>
      <div style={{padding:"10px 18px",borderTop:`1px solid ${C.border}`}}>
        <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:0.5,marginBottom:5}}>OVERRIDE REASON *</div>
        <textarea value={overrideNote} onChange={e=>setOverrideNote(e.target.value)} rows={2}
          placeholder="e.g. Faculty confirmed availability for this slot"
          style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:7,padding:"7px 10px",fontSize:12,fontFamily:"Poppins, sans-serif",color:C.navy,resize:"none",boxSizing:"border-box",outline:"none"}}/>
      </div>
      <div style={{padding:"10px 18px",borderTop:`1px solid ${C.border}`,display:"flex",gap:8,justifyContent:"flex-end"}}>
        <button onClick={()=>setShowOverride(false)} style={S.secBtn}>Back</button>
        <button onClick={()=>{if(overrideNote.trim())assign(overrideNote.trim());}} disabled={!overrideNote.trim()||busy}
          style={{...S.primBtn,background:C.orange,opacity:overrideNote.trim()&&!busy?1:0.5}}>
          {busy?"Assigning…":"Override & Assign"}
        </button>
      </div>
    </Overlay>
  );

  return (
    <Overlay onClose={onClose} wide>
      <div style={{padding:"14px 18px",borderBottom:`1px solid ${C.border}`}}>
        <div style={{fontSize:14,fontWeight:700,color:C.navy}}>Assign to {faculty.name}</div>
        <div style={{fontSize:12,color:C.muted,marginTop:2}}>Program → Cohort → Session → Role</div>
      </div>
      <div style={{padding:"14px 18px",display:"flex",gap:14,minHeight:240,overflowX:"auto"}}>

        {/* Step 1 — Program */}
        <div style={{minWidth:150,flex:1,display:"flex",flexDirection:"column",gap:4}}>
          <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:0.5,marginBottom:4}}>1. PROGRAM</div>
          {programs.length===0 && <div style={{fontSize:12,color:C.muted}}>No programs found.</div>}
          {programs.map(p=>(
            <button key={p.id} onClick={()=>onPickProgram(p)} style={{textAlign:"left",padding:"7px 10px",borderRadius:7,border:`1.5px solid ${selProg?.id===p.id?p.color||C.indigo:C.border}`,background:selProg?.id===p.id?`${p.color||C.indigo}10`:C.card,cursor:"pointer",fontFamily:"Poppins, sans-serif",color:C.navy,fontSize:12}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                <div style={{width:7,height:7,borderRadius:"50%",background:p.color||C.indigo,flexShrink:0}}/>
                <span style={{fontWeight:selProg?.id===p.id?700:500}}>{p.title}</span>
              </div>
              <div style={{fontSize:10,color:C.muted,paddingLeft:13}}>{p.duration_weeks}w · {p.status}</div>
            </button>
          ))}
        </div>

        {/* Step 2 — Cohort */}
        <div style={{minWidth:140,flex:1,display:"flex",flexDirection:"column",gap:4}}>
          <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:0.5,marginBottom:4}}>2. COHORT <span style={{fontWeight:400,textTransform:"lowercase"}}>(optional)</span></div>
          {!selProg && <div style={{fontSize:12,color:C.muted}}>Select a program first.</div>}
          {selProg && loadingProg && <div style={{fontSize:12,color:C.muted}}>Loading…</div>}
          {selProg && !loadingProg && cohorts.length===0 && <div style={{fontSize:12,color:C.muted}}>No cohorts yet.</div>}
          {cohorts.map(co=>(
            <button key={co.id} onClick={()=>setSelCohortId(prev => prev===co.id ? "" : co.id)}
              style={{textAlign:"left",padding:"7px 10px",borderRadius:7,border:`1.5px solid ${selCohortId===co.id?C.navy:C.border}`,background:selCohortId===co.id?"rgba(28,37,81,0.07)":C.card,cursor:"pointer",fontFamily:"Poppins, sans-serif",color:C.navy,fontSize:12}}>
              <div style={{fontWeight:selCohortId===co.id?700:500}}>{co.name}</div>
              <div style={{fontSize:10,color:C.muted}}>{co.enrolled_count}/{co.max_seats} enrolled</div>
            </button>
          ))}
        </div>

        {/* Step 3 — Session */}
        <div style={{minWidth:160,flex:1.2,display:"flex",flexDirection:"column",gap:4}}>
          <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:0.5,marginBottom:4}}>3. SESSION *</div>
          {!selProg && <div style={{fontSize:12,color:C.muted}}>Select a program first.</div>}
          {selProg && loadingProg && <div style={{fontSize:12,color:C.muted}}>Loading…</div>}
          {selProg && !loadingProg && activities.length===0 && <div style={{fontSize:12,color:C.muted}}>No live sessions or coaching activities.</div>}
          {activities.map(a=>(
            <button key={a.id} onClick={()=>setSelActId(a.id)} style={{textAlign:"left",padding:"7px 10px",borderRadius:7,border:`1.5px solid ${selActId===a.id?C.indigo:a.alreadyAssigned?"rgba(34,197,94,0.4)":C.border}`,background:selActId===a.id?`${C.indigo}10`:a.alreadyAssigned?"rgba(34,197,94,0.05)":C.card,cursor:"pointer",fontFamily:"Poppins, sans-serif",color:C.navy,fontSize:12,fontWeight:selActId===a.id?700:400}}>
              <div style={{display:"flex",alignItems:"center",gap:5}}>
                <span style={{fontWeight:600,flex:1}}>{a.title}</span>
                {a.alreadyAssigned&&<span style={{fontSize:9,fontWeight:700,color:"#22c55e",background:"rgba(34,197,94,0.12)",borderRadius:20,padding:"2px 6px",flexShrink:0}}>Already assigned</span>}
              </div>
              <div style={{fontSize:10,color:C.muted,marginTop:1}}>{a.phase} · {a.type==="live_session"?"Live":"Coaching"}</div>
            </button>
          ))}
        </div>

        {/* Step 4 — Role */}
        <div style={{width:120,flexShrink:0,display:"flex",flexDirection:"column",gap:4}}>
          <div style={{fontSize:10,fontWeight:700,color:C.muted,letterSpacing:0.5,marginBottom:4}}>4. ROLE</div>
          {DELIVERY_ROLES.map(r=>(
            <button key={r} onClick={()=>setRole(r)} style={{padding:"7px 10px",borderRadius:7,border:`1.5px solid ${role===r?C.indigo:C.border}`,background:role===r?`${C.indigo}10`:C.card,cursor:"pointer",fontFamily:"Poppins, sans-serif",color:role===r?C.indigo:C.navy,fontSize:12,fontWeight:role===r?700:400}}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {err && <div style={{margin:"0 18px 10px",fontSize:12,color:C.orange,background:"rgba(239,78,36,0.06)",borderRadius:8,padding:"8px 12px"}}>{err}</div>}
      {selActId && activities.find(a=>a.id===selActId)?.alreadyAssigned && (
        <div style={{margin:"0 18px 10px",fontSize:12,color:"#22c55e",background:"rgba(34,197,94,0.07)",borderRadius:8,padding:"8px 12px"}}>
          {faculty.name} is already assigned to this activity. You can update their role below.
        </div>
      )}
      <div style={{padding:"12px 18px",borderTop:`1px solid ${C.border}`,display:"flex",gap:10,justifyContent:"flex-end",alignItems:"center"}}>
        {selCohortId && cohorts.find(c=>c.id===selCohortId) && (
          <span style={{fontSize:11,color:C.muted,marginRight:"auto"}}>
            Scoped to <b style={{color:C.navy}}>{cohorts.find(c=>c.id===selCohortId)!.name}</b>
          </span>
        )}
        <button onClick={onClose} style={S.secBtn}>Cancel</button>
        <button onClick={()=>assign()} disabled={!selActId||busy} style={{...S.primBtn,opacity:selActId&&!busy?1:0.5}}>
          {busy?"Saving…":activities.find(a=>a.id===selActId)?.alreadyAssigned?"Update Role":"Assign"}
        </button>
      </div>
    </Overlay>
  );
}

// ── Schedule Session Modal (PM creates a class_session for a faculty member) ──
function ScheduleSessionModal({ faculty, programId, programTitle, cohortId: initialCohortId, cohortName: initialCohortName, onClose, onCreated }: {
  faculty: OrgFacultyMember;
  programId: string;
  programTitle: string;
  cohortId: string;
  cohortName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle]         = useState("");
  const [sessionType, setType]    = useState("classroom");
  const [scheduledAt, setSched]   = useState("");
  const [durationMins, setDur]    = useState(60);
  const [virtualLink, setLink]    = useState("");
  const [busy, setBusy]           = useState(false);
  const [err, setErr]             = useState("");
  const [cohorts, setCohorts]     = useState<CohortDTO[]>([]);
  const [selCohortId, setSelCohortId] = useState(initialCohortId);

  useEffect(() => {
    if (!initialCohortId) {
      cohortsApi.list(undefined as unknown as string, programId).then(r => setCohorts(r.data ?? []));
    }
  }, [programId, initialCohortId]);

  async function submit() {
    if (!title.trim() || !scheduledAt) { setErr("Title and date/time are required."); return; }
    if (!selCohortId) { setErr("Please select a cohort."); return; }
    setBusy(true); setErr("");
    try {
      const isoAt = new Date(scheduledAt).toISOString();
      const res = await sessionsApi.create({
        program_id: programId,
        cohort_id: selCohortId,
        faculty_id: faculty.id,
        title: title.trim(),
        session_type: sessionType,
        scheduled_at: isoAt,
        duration_mins: durationMins,
        virtual_link: virtualLink.trim() || undefined,
      });
      if (res?.data) { onCreated(); onClose(); }
      else setErr("Failed to create session.");
    } catch { setErr("Failed to create session."); }
    finally { setBusy(false); }
  }

  const inp: React.CSSProperties = { border:`1px solid ${C.border}`,borderRadius:8,padding:"9px 12px",fontSize:13,color:C.navy,width:"100%",fontFamily:"Poppins, sans-serif",outline:"none",boxSizing:"border-box" };
  const lbl: React.CSSProperties = { fontSize:10,fontWeight:700,color:C.muted,letterSpacing:0.5,textTransform:"uppercase",display:"block",marginBottom:5 };

  return (
    <Overlay onClose={onClose}>
      <div style={{background:C.card,borderRadius:16,width:480,maxHeight:"88vh",overflow:"auto",boxShadow:"0 24px 64px rgba(28,37,81,0.22)"}}>
        <div style={{padding:"18px 24px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:15,fontWeight:700,color:C.navy}}>Schedule Session</div>
            <div style={{fontSize:11,color:C.muted,marginTop:2}}>
              For <b style={{color:C.indigo}}>{faculty.name}</b> · {programTitle}
              {initialCohortName && <> · {initialCohortName}</>}
            </div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:18,cursor:"pointer",color:C.muted}}>×</button>
        </div>
        <div style={{padding:24,display:"flex",flexDirection:"column",gap:16}}>
          {!initialCohortId && cohorts.length > 0 && (
            <div>
              <label style={lbl}>Cohort</label>
              <select style={{...inp}} value={selCohortId} onChange={e=>setSelCohortId(e.target.value)}>
                <option value="">Select cohort…</option>
                {cohorts.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={lbl}>Session Title</label>
            <input style={inp} placeholder="e.g. Leadership Masterclass – Week 3" value={title} onChange={e=>setTitle(e.target.value)} />
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div>
              <label style={lbl}>Session Type</label>
              <select style={{...inp}} value={sessionType} onChange={e=>setType(e.target.value)}>
                <option value="classroom">Classroom</option>
                <option value="coaching_group">Group Coaching</option>
                <option value="coaching_individual">1-on-1 Coaching</option>
                <option value="webinar">Webinar</option>
              </select>
            </div>
            <div>
              <label style={lbl}>Duration (minutes)</label>
              <input style={inp} type="number" min={15} max={480} value={durationMins} onChange={e=>setDur(Number(e.target.value))} />
            </div>
          </div>
          <div>
            <label style={lbl}>Date & Time</label>
            <input style={inp} type="datetime-local" value={scheduledAt} onChange={e=>setSched(e.target.value)} />
          </div>
          <div>
            <label style={lbl}>Virtual Link (optional)</label>
            <input style={inp} placeholder="https://zoom.us/j/..." value={virtualLink} onChange={e=>setLink(e.target.value)} />
          </div>
          {err && <div style={{fontSize:12,color:"#ef4444"}}>{err}</div>}
        </div>
        <div style={{padding:"16px 24px",borderTop:`1px solid ${C.border}`,display:"flex",justifyContent:"flex-end",gap:8}}>
          <button onClick={onClose} style={S.secBtn}>Cancel</button>
          <button onClick={submit} disabled={busy} style={{...S.primBtn,opacity:busy?0.6:1}}>
            {busy?"Scheduling…":"Schedule Session"}
          </button>
        </div>
      </div>
    </Overlay>
  );
}

// ── Faculty Calendar View ─────────────────────────────────────────────────────
function CalendarPopover({ faculty, anchorRect, onClose }: {
  faculty: OrgFacultyMember;
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
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const monthName = viewDate.toLocaleDateString("en-US", { month:"short", year:"numeric" });

  const cells: (number|null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  function pad2(n: number) { return String(n).padStart(2,"0"); }
  function cellKey(d: number) { return `${year}-${pad2(month+1)}-${pad2(d)}`; }

  // Position: appear below the button, aligned to its right edge, clamped to viewport
  const popW = 260;
  const popH = 310;
  let top = anchorRect.bottom + 6;
  let left = anchorRect.right - popW;
  if (left < 8) left = 8;
  if (top + popH > window.innerHeight - 8) top = anchorRect.top - popH - 6;

  return (
    <>
      {/* backdrop — click outside to close */}
      <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:1999}}/>
      <div style={{position:"fixed",top,left,width:popW,background:C.card,borderRadius:12,border:`1px solid ${C.border}`,boxShadow:"0 8px 32px rgba(28,37,81,0.18)",zIndex:2000,fontFamily:"Poppins, sans-serif",overflow:"hidden"}}>
        {/* Header */}
        <div style={{padding:"8px 12px",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center",gap:8}}>
          <div style={{width:24,height:24,borderRadius:"50%",background:avatarBg(faculty.name),color:"#fff",fontWeight:700,fontSize:10,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            {initials(faculty.name)}
          </div>
          <div style={{flex:1,fontSize:12,fontWeight:700,color:C.navy,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{faculty.name}</div>
          <button onClick={onClose} style={{border:"none",background:"transparent",color:C.muted,cursor:"pointer",fontSize:13,lineHeight:1,padding:2}}>✕</button>
        </div>

        {/* Month nav */}
        <div style={{padding:"6px 10px",display:"flex",alignItems:"center",gap:6}}>
          <button onClick={()=>setViewDate(new Date(year,month-1,1))} style={{...S.iconBtn,padding:"2px 7px",fontSize:12}}>‹</button>
          <div style={{flex:1,textAlign:"center",fontSize:11,fontWeight:700,color:C.navy}}>{monthName}</div>
          <button onClick={()=>setViewDate(new Date(year,month+1,1))} style={{...S.iconBtn,padding:"2px 7px",fontSize:12}}>›</button>
        </div>

        {/* Day headers */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",padding:"0 10px"}}>
          {["S","M","T","W","T","F","S"].map((d,i)=>(
            <div key={i} style={{textAlign:"center",fontSize:8,fontWeight:700,color:C.muted,padding:"1px 0"}}>{d}</div>
          ))}
        </div>

        {/* Grid */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:1,padding:"2px 10px 8px"}}>
          {loading ? (
            <div style={{gridColumn:"span 7",textAlign:"center",padding:12,fontSize:11,color:C.muted}}>Loading…</div>
          ) : cells.map((d, i) => {
            if (!d) return <div key={i}/>;
            const key = cellKey(d);
            const busy = busyMap.get(key);
            const today = new Date();
            const isToday = d===today.getDate()&&month===today.getMonth()&&year===today.getFullYear();
            return (
              <div key={i}
                title={busy ? `${busy.session_title ?? "Session"} · ${busy.role ?? ""}` : "Available"}
                style={{aspectRatio:"1",borderRadius:4,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:busy||isToday?700:400,color:busy?"#fff":isToday?C.indigo:C.navy,background:busy?C.indigo:isToday?`${C.indigo}18`:"transparent",border:isToday&&!busy?`1px solid ${C.indigo}`:"none",cursor:busy?"pointer":"default"}}>
                {d}
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div style={{padding:"6px 12px 8px",borderTop:`1px solid ${C.border}`,display:"flex",gap:10,fontSize:9,color:C.muted}}>
          <span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:8,height:8,borderRadius:2,background:C.indigo,display:"inline-block"}}/>Busy</span>
          <span style={{display:"flex",alignItems:"center",gap:3}}><span style={{width:8,height:8,borderRadius:2,border:`1px solid ${C.indigo}`,display:"inline-block"}}/>Today</span>
          <span style={{color:C.muted}}>{schedule.length} session{schedule.length!==1?"s":""} assigned</span>
        </div>
      </div>
    </>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function FacultyResources({ orgId }: { orgId: string }) {
  const [faculty, setFaculty]           = useState<OrgFacultyMember[]>([]);
  const [assignments, setAssignments]   = useState<Record<string, FacultyAssignmentDTO[]>>({});
  const [expanded, setExpanded]         = useState<string | null>(null);
  const [loading, setLoading]           = useState(true);
  const [showInvite, setShowInvite]     = useState(false);
  const [assignFor, setAssignFor]       = useState<OrgFacultyMember | null>(null);
  const [schedFor, setSchedFor]         = useState<{faculty: OrgFacultyMember; programId: string; programTitle: string; cohortId: string; cohortName: string} | null>(null);
  const [calFor, setCalFor]             = useState<OrgFacultyMember | null>(null);
  const [calAnchor, setCalAnchor]       = useState<DOMRect | null>(null);
  const [search, setSearch]             = useState("");

  const loadFaculty = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await programsApi.listOrgFaculty(orgId);
      const list = res.data ?? [];
      setFaculty(list);
      // Load assignments for all faculty in parallel
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

  useEffect(() => { loadFaculty(); }, [loadFaculty]);

  const filtered = faculty.filter(f =>
    f.name.toLowerCase().includes(search.toLowerCase()) ||
    f.email.toLowerCase().includes(search.toLowerCase())
  );

  if (!orgId) return (
    <div style={{padding:48,textAlign:"center",color:C.muted,fontSize:14,fontFamily:"Poppins, sans-serif"}}>
      Your account is not linked to an organization.
    </div>
  );

  return (
    <div style={{padding:24,display:"flex",flexDirection:"column",gap:16,fontFamily:"Poppins, sans-serif"}}>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <h2 style={{fontSize:20,fontWeight:700,color:C.navy,margin:0}}>Faculty & Resources</h2>
          <div style={{fontSize:13,color:C.muted,marginTop:4}}>All faculty in your organization</div>
        </div>
        <button onClick={()=>setShowInvite(true)} style={S.primBtn}>+ Invite Faculty</button>
      </div>

      {/* Search */}
      <div style={{maxWidth:320}}>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search faculty…"
          autoComplete="off" name="faculty-search"
          style={{width:"100%",border:`1px solid ${C.border}`,borderRadius:8,padding:"8px 12px",fontSize:13,fontFamily:"Poppins, sans-serif",color:C.navy,boxSizing:"border-box",outline:"none"}}/>
      </div>

      {/* Table */}
      <div style={{background:C.card,borderRadius:12,boxShadow:"0 1px 4px rgba(28,37,81,0.07)",border:`1px solid ${C.border}`,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead>
            <tr style={{background:C.page}}>
              {["Faculty Member","Email","Sessions Assigned","Actions"].map(h=>(
                <th key={h} style={{padding:"12px 16px",textAlign:"left",fontSize:11,fontWeight:700,color:C.muted,letterSpacing:0.5,fontFamily:"Poppins, sans-serif"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} style={{padding:40,textAlign:"center",fontSize:13,color:C.muted}}>Loading faculty…</td></tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={4} style={{padding:48,textAlign:"center"}}>
                  <div style={{fontSize:36,marginBottom:12}}>◇</div>
                  <div style={{fontSize:14,fontWeight:700,color:C.navy,marginBottom:6}}>No faculty yet</div>
                  <div style={{fontSize:13,color:C.muted,marginBottom:16}}>Invite faculty members to your organization.</div>
                  <button onClick={()=>setShowInvite(true)} style={S.primBtn}>+ Invite Faculty</button>
                </td>
              </tr>
            ) : (
              filtered.flatMap(f => {
                const fAssign = assignments[f.id] ?? [];
                const isExp = expanded === f.id;
                // Group by program
                const byProg = fAssign.reduce<Record<string,{title:string;color:string;acts:FacultyAssignmentDTO[]}>>((acc,a)=>{
                  if(!acc[a.program_id]) acc[a.program_id]={title:a.program_title,color:a.program_color,acts:[]};
                  acc[a.program_id].acts.push(a); return acc;
                },{});
                const progList = Object.values(byProg);
                return [
                  <tr key={f.id} style={{borderTop:`1px solid ${C.border}`,background:"transparent"}}
                    onMouseEnter={e=>(e.currentTarget.style.background="#FAFBFD")}
                    onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                    <td style={{padding:"12px 16px"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:34,height:34,borderRadius:"50%",background:avatarBg(f.name),color:"#fff",fontWeight:700,fontSize:12,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                          {f.avatar_url ? <img src={f.avatar_url} alt={f.name} style={{width:34,height:34,borderRadius:"50%",objectFit:"cover"}}/> : initials(f.name)}
                        </div>
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:6}}>
                            <span style={{fontSize:13,fontWeight:600,color:C.navy}}>{f.name}</span>
                            <span style={{fontSize:9,fontWeight:700,background:`${C.indigo}14`,color:C.indigo,borderRadius:20,padding:"1px 7px"}}>FACULTY</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{padding:"12px 16px",fontSize:12,color:C.muted}}>{f.email}</td>
                    <td style={{padding:"12px 16px"}}>
                      {fAssign.length > 0 ? (
                        <button onClick={()=>setExpanded(isExp?null:f.id)}
                          style={{border:"none",background:"transparent",cursor:"pointer",display:"flex",alignItems:"center",gap:4,fontFamily:"Poppins, sans-serif",padding:0}}>
                          <span style={{fontSize:12,fontWeight:700,color:C.indigo}}>{fAssign.length} session{fAssign.length!==1?"s":""}</span>
                          <span style={{fontSize:10,color:C.muted,transition:"transform .15s",display:"inline-block",transform:isExp?"rotate(180deg)":"none"}}>▾</span>
                        </button>
                      ) : <span style={{fontSize:12,color:C.muted}}>No sessions</span>}
                    </td>
                    <td style={{padding:"12px 16px"}}>
                      <div style={{display:"flex",gap:6}}>
                        <button onClick={e=>{setCalFor(f);setCalAnchor((e.currentTarget as HTMLButtonElement).getBoundingClientRect());}} style={S.iconBtn}>📅 Calendar</button>
                        <button onClick={()=>setAssignFor(f)} style={S.iconBtn}>+ Assign</button>
                      </div>
                    </td>
                  </tr>,
                  // Expanded assignments row
                  ...(isExp ? [
                    <tr key={`${f.id}-exp`} style={{borderTop:`1px solid ${C.border}`,background:`${C.indigo}05`}}>
                      <td colSpan={4} style={{padding:"0 16px 12px 58px"}}>
                        {progList.map(prog=>(
                          <div key={prog.title} style={{marginTop:10}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                              <div style={{width:8,height:8,borderRadius:2,background:prog.color||C.indigo,flexShrink:0}}/>
                              <span style={{fontSize:11,fontWeight:700,color:C.navy}}>{prog.title}</span>
                              <button
                                onClick={()=>setSchedFor({
                                  faculty: f,
                                  programId: prog.acts[0].program_id,
                                  programTitle: prog.title,
                                  cohortId: prog.acts.find(a=>a.cohort_id)?.cohort_id ?? "",
                                  cohortName: prog.acts.find(a=>a.cohort_name)?.cohort_name ?? "",
                                })}
                                style={{border:`1px solid ${C.indigo}`,background:`${C.indigo}10`,color:C.indigo,borderRadius:6,padding:"2px 8px",fontSize:10,fontWeight:700,cursor:"pointer",fontFamily:"Poppins, sans-serif"}}>
                                + Schedule Session
                              </button>
                            </div>
                            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                              {prog.acts.map(a=>(
                                <div key={a.activity_id} style={{display:"flex",alignItems:"center",gap:5,background:C.card,border:`1px solid ${C.border}`,borderRadius:6,padding:"4px 8px"}}>
                                  <span style={{fontSize:10,color:C.muted}}>{a.activity_type==="live_session"?"⬡":"◇"}</span>
                                  <span style={{fontSize:11,fontWeight:600,color:C.navy}}>{a.activity_title}</span>
                                  <span style={{fontSize:9,color:C.muted}}>{a.phase_name}</span>
                                  {(a as unknown as {cohort_name?:string}).cohort_name && (
                                    <span style={{fontSize:9,color:C.navy,background:"rgba(28,37,81,0.07)",borderRadius:20,padding:"1px 6px"}}>{(a as unknown as {cohort_name?:string}).cohort_name}</span>
                                  )}
                                  <span style={{fontSize:9,fontWeight:700,background:`${C.indigo}14`,color:C.indigo,borderRadius:20,padding:"1px 6px"}}>{a.role}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </td>
                    </tr>
                  ] : [])
                ];
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modals */}
      {showInvite && (
        <InviteModal orgId={orgId} onClose={()=>setShowInvite(false)} onDone={()=>loadFaculty()} />
      )}
      {assignFor && (
        <AssignModal faculty={assignFor} orgId={orgId} onClose={()=>setAssignFor(null)} onAssigned={()=>loadFaculty()} />
      )}
      {schedFor && (
        <ScheduleSessionModal
          faculty={schedFor.faculty}
          programId={schedFor.programId}
          programTitle={schedFor.programTitle}
          cohortId={schedFor.cohortId}
          cohortName={schedFor.cohortName}
          onClose={()=>setSchedFor(null)}
          onCreated={()=>loadFaculty()}
        />
      )}
      {calFor && calAnchor && (
        <CalendarPopover faculty={calFor} anchorRect={calAnchor} onClose={()=>{ setCalFor(null); setCalAnchor(null); }} />
      )}
    </div>
  );
}
