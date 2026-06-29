"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { programsApi, ProgramDetailDTO, ActivityFacultyDTO, OrgFacultyMember, ConflictDTO } from "@/lib/programs-api";

// ─── Design tokens ────────────────────────────────────────────────────────────
const C = {
  navy:"#1C2551", orange:"#EF4E24", indigo:"#6B73BF",
  green:"#22c55e", page:"#F5F7FB", card:"#FFFFFF",
  border:"#EAECF4", muted:"#8b90a7", inactive:"#D0D3E0",
};
const PALETTE = ["#6B73BF","#EF4E24","#22c55e","#f59e0b","#0ea5e9","#d946ef","#1C2551","#f97316"];

const ACT_TYPES = [
  { id:"video",        label:"Video",        icon:"▶", color:"#EF4E24" },
  { id:"pdf",          label:"PDF",          icon:"📄",color:"#1C2551" },
  { id:"case_study",   label:"Case Study",   icon:"📋",color:"#6B73BF" },
  { id:"assessment",   label:"Assessment",   icon:"✦", color:"#EF4E24" },
  { id:"survey",       label:"Survey",       icon:"≡", color:"#8b90a7" },
  { id:"live_session", label:"Live Session", icon:"⬡", color:"#1C2551" },
  { id:"coaching",     label:"Coaching",     icon:"◇", color:"#6B73BF" },
  { id:"journal",      label:"Reflection",   icon:"◎", color:"#EF4E24" },
  { id:"assignment",   label:"Assignment",   icon:"◈", color:"#1C2551" },
  { id:"peer_review",  label:"Peer Review",  icon:"◆", color:"#22c55e" },
] as const;
type AId = typeof ACT_TYPES[number]["id"];
const aDef = (id: AId) => ACT_TYPES.find(a => a.id === id)!;

const PH_TPLS = [
  { id:"pre_enrolment",  label:"Pre-Enrolment",  icon:"⟡", color:PALETTE[0], days:14, acts:["survey","pdf","video"]                as AId[] },
  { id:"orientation",    label:"Orientation",    icon:"◎", color:PALETTE[1], days: 7, acts:["live_session","video","survey"]         as AId[] },
  { id:"pre_work",       label:"Pre-Work",       icon:"◈", color:PALETTE[2], days:21, acts:["video","pdf","assessment"]              as AId[] },
  { id:"classroom",      label:"Classroom",      icon:"⬡", color:PALETTE[3], days:14, acts:["live_session","case_study","assessment"] as AId[] },
  { id:"post_classroom", label:"Post Classroom", icon:"◆", color:PALETTE[4], days:21, acts:["assignment","peer_review","journal"]    as AId[] },
  { id:"coaching_grp",   label:"Group Coaching", icon:"◇", color:PALETTE[5], days:28, acts:["coaching","live_session","journal"]     as AId[] },
  { id:"application",    label:"Application",    icon:"◉", color:PALETTE[6], days:21, acts:["assignment","coaching","peer_review"]   as AId[] },
  { id:"capstone",       label:"Capstone",       icon:"★", color:PALETTE[7], days:14, acts:["assessment","live_session","survey"]    as AId[] },
];

// ─── Data model ───────────────────────────────────────────────────────────────
// ALL days are 1-based, inclusive on both ends.
// Activity at startDay with durationDays covers [startDay, startDay+durationDays-1].
// Two activities overlap iff their ranges share at least one day.
// Touching at a boundary (A ends day 5, B starts day 6) → NOT overlap → same column.
interface Act { id:string; type:AId; title:string; startDay:number; durationDays:number; durationMins:number; notes:string; faculty?: ActivityFacultyDTO[]; }
interface Ph  { id:string; label:string; color:string; icon:string; startDay:number; endDay:number; acts:Act[]; }

const uid = () => Math.random().toString(36).slice(2,9);

// Evenly partition phase days across n activities — sequential, no gaps, no overlaps.
function mkActs(tplId:string, sd:number, ed:number): Act[] {
  const t = PH_TPLS.find(p=>p.id===tplId); if(!t) return [];
  const n = t.acts.length;
  const total = ed - sd + 1; // inclusive day count
  const base = Math.max(1, Math.floor(total/n));
  const rem  = total % n;
  let cur = sd;
  return t.acts.map((type,i) => {
    const dur = Math.max(1, Math.min(i<rem?base+1:base, ed-cur+1));
    const a:Act = { id:uid(), type, title:aDef(type).label, startDay:cur, durationDays:dur, durationMins:30, notes:"" };
    cur += dur;
    return a;
  });
}

// ─── Layout ───────────────────────────────────────────────────────────────────
// ONE simple rule: day d (1-based) occupies the pixel row starting at dayToY(d).
// Week header row sits ABOVE day 1 of each week — it does NOT shift day offsets.
// dayToY(d) = (week index) * ROW_H  +  WEEK_H  +  (day-of-week index) * DAY_H
// This means: dayToY(1)=WEEK_H, dayToY(8)=ROW_H+WEEK_H, etc.
const DAY_H  = 28;   // px per day row
const WEEK_H = 24;   // px for the week header strip
const ROW_H  = WEEK_H + 7*DAY_H;  // total height per week block = 220px
const GUT_W  = 88;   // ruler width
const PH_W   = 172;  // phase block width
const A_W    = 140;  // activity block width
const A_GAP  = 5;    // gap between activity columns
const PH_GAP = 5;    // gap between phase and first activity column
const DAY_NAMES = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

// day (1-based) → top pixel of that day's row in the canvas
function d2y(day:number): number {
  const z  = Math.max(0, day-1);         // 0-based
  const wk = Math.floor(z/7);            // which week block
  const wd = z%7;                        // day within week (0=Mon, 6=Sun)
  return wk*ROW_H + WEEK_H + wd*DAY_H;
}

// pixel Y → fractional 1-based day (mid-row = .5)
function y2frac(y:number): number {
  const cy = Math.max(0,y);
  const wk = Math.floor(cy/ROW_H);
  const within = cy - wk*ROW_H;
  if(within < WEEK_H) return wk*7+1; // inside week header → snap to first day of week
  return wk*7 + (within-WEEK_H)/DAY_H + 1;
}

// Snap a top-pixel fractional day to integer day (floor = the row you're in).
// y2frac already adds 1, so frac=1.0 means top of D1, frac=1.99 means bottom of D1.
// floor(frac) correctly gives D1 for anything within D1's row.
function snap(frac:number, total:number): number {
  return Math.max(1, Math.min(total, Math.floor(frac)));
}

// For bottom-edge resize: pixel Y at the bottom of a block → last day covered.
// Rule: bottom anywhere in [d2y(D), d2y(D+1)) → endDay = D.
// d2y(D+1) = d2y(D) + DAY_H, so: endDay = ceil(y2frac(botY)) - 1
// Edge case: botY exactly on d2y(D) (the boundary line) → still means "end of D-1".
// Minimum endDay = 1 (block can't shrink below 1 day).
function yToEnd(botY:number, total:number): number {
  // Subtract a half-pixel so the exact boundary line (top of D+1) maps to D, not D+1.
  const frac = y2frac(Math.max(WEEK_H + 0.5, botY - 0.5));
  return Math.max(1, Math.min(total, Math.ceil(frac) - 1));
}

// Activities always render in a single column beside their phase.
// Overlapping activities stack visually (later ones drawn on top).
// There are NO side columns — the user controls placement explicitly.
function colMap(acts:Act[]): Map<string,number> {
  const map = new Map<string,number>();
  acts.forEach(a => map.set(a.id, 0)); // every activity → column 0
  return map;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────
function parseDate(s?:string|null): Date|null {
  if(!s) return null; const d=new Date(s); return isNaN(d.getTime())?null:d;
}
function addDays(d:Date,n:number): Date { const r=new Date(d); r.setUTCDate(r.getUTCDate()+n); return r; }
function fmt(d:Date): string { return d.toLocaleDateString("en-GB",{day:"numeric",month:"short",timeZone:"UTC"}); }

// ─── Component ────────────────────────────────────────────────────────────────
interface Props { program:ProgramDetailDTO; orgId?:string; onProgramUpdated:(p:ProgramDetailDTO)=>void; onBack:()=>void; }
type Sel = {kind:"phase";pid:string} | {kind:"act";pid:string;aid:string} | null;

export default function PMDesignStudio({program,orgId,onProgramUpdated,onBack}:Props) {
  const [startDt, setStartDt] = useState(program.start_date?new Date(program.start_date).toISOString().slice(0,10):"");
  const [endDt,   setEndDt]   = useState(program.end_date  ?new Date(program.end_date  ).toISOString().slice(0,10):"");
  const [showDates, setShowDates] = useState(false);

  const startDate = parseDate(startDt||program.start_date);
  const endDate   = parseDate(endDt  ||program.end_date);
  const totalDays = startDate&&endDate
    ? Math.max(7, Math.round((endDate.getTime()-startDate.getTime())/86400000)+1)
    : Math.max(56,(program.duration_weeks||16)*7);
  const totalWeeks = Math.ceil(totalDays/7);

  // Label for a day on the ruler
  const dayLabel = (absDay:number) => startDate ? fmt(addDays(startDate,absDay-1)) : `D${absDay}`;

  // ── State ─────────────────────────────────────────────────────────────────
  const [phases, setPhases] = useState<Ph[]>(() => {
    if(program.phases?.length) {
      let cur=1;
      return program.phases.map((p,i)=>{
        const tpl = PH_TPLS.find(t=>t.label.toLowerCase()===p.title.toLowerCase());
        const span = p.end_day>p.start_day ? p.end_day-p.start_day+1 : (tpl?.days??14);
        const sd = p.start_day>0 ? p.start_day : cur;
        const ed = p.end_day>0   ? p.end_day   : Math.min(totalDays, sd+span-1);
        cur = ed+1;
        return {
          id:p.id, label:p.title, color:p.color||PALETTE[i%8], icon:PH_TPLS[i%8]?.icon||"◉",
          startDay:sd, endDay:ed,
          acts: p.activities.length ? p.activities.map((a,j)=>({
            id:a.id, type:a.type as AId, title:a.title,
            startDay:     a.start_day>0     ? a.start_day     : sd+j*2,
            durationDays: a.duration_days>0 ? a.duration_days : 2,
            durationMins:a.duration_mins, notes:a.description||"",
            faculty: a.faculty ?? [],
          })) : (tpl ? mkActs(tpl.id,sd,ed) : []),
        };
      });
    }
    return [];
  });

  const [sel,  setSel]  = useState<Sel>(null);
  const [saving,setSaving] = useState(false);
  const [saveMsg,setSaveMsg] = useState("");

  // Tracks IDs that are confirmed saved on the server — used by handleSave to avoid re-creating.
  // Initialised from the program prop; updated synchronously after each save.
  const savedPhaseIds = useRef<Set<string>>(new Set(program.phases?.map(p=>p.id)??[]));
  const savedActIds   = useRef<Set<string>>(new Set(program.phases?.flatMap(p=>p.activities.map(a=>a.id))??[]));

  // Re-seed refs when program prop changes (e.g. after onProgramUpdated from parent)
  useEffect(()=>{
    savedPhaseIds.current = new Set(program.phases?.map(p=>p.id)??[]);
    savedActIds.current   = new Set(program.phases?.flatMap(p=>p.activities.map(a=>a.id))??[]);
  },[program.id]); // only on program switch, not every render

  // ── Faculty state ─────────────────────────────────────────────────
  const [orgFaculty, setOrgFaculty] = useState<OrgFacultyMember[]>([]);
  const [conflictModal, setConflictModal] = useState<{
    actId:string; pid:string; faculty:OrgFacultyMember; role:string; conflicts:ConflictDTO[];
  }|null>(null);

  useEffect(()=>{
    if(!orgId) return;
    programsApi.listOrgFaculty(orgId).then(r=>setOrgFaculty(r.data??[])).catch(()=>{});
  },[orgId]);

  const dragFacultyKind = useRef<{faculty:OrgFacultyMember}|null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef<Map<string,HTMLDivElement>>(new Map());
  // drag state — all pixel math lives here, React state only updated on mouseup
  const drag = useRef<{
    kind:"ph-move"|"ph-top"|"ph-bot"|"a-move"|"a-top"|"a-bot";
    pid:string; aid?:string;
    origSd:number; origEd:number;   // original startDay / endDay (inclusive)
    startY:number; curY:number;
    origTopPx:number; origBotPx:number; // pixel coords at drag start
    el:HTMLDivElement|null;
    gTop:HTMLDivElement|null; gBot:HTMLDivElement|null;
    raf:number|null;
    moved:boolean;
  }|null>(null);

  useEffect(()=>()=>{ if(drag.current?.raf) cancelAnimationFrame(drag.current.raf); },[]);

  const selPh  = sel ? phases.find(p=>p.id===sel.pid)||null : null;
  const selAct = sel?.kind==="act"&&selPh ? selPh.acts.find(a=>a.id===sel.aid)||null : null;

  // ── Phase column layout (overlapping phases → side by side) ──────────────
  const phWithCol = (() => {
    const cols: [number,number][][] = [];
    return phases.map(ph=>{
      let ci=0;
      while(true){
        const ok=!(cols[ci]||[]).some(([s,e])=>ph.startDay<=e&&s<=ph.endDay);
        if(ok){ (cols[ci]=cols[ci]||[]).push([ph.startDay,ph.endDay]); return {...ph,col:ci}; }
        ci++;
      }
    });
  })();

  const nPhCols = phWithCol.length ? Math.max(...phWithCol.map(p=>p.col))+1 : 1;
  const COL_W   = PH_W + PH_GAP + A_W + A_GAP; // one activity column per phase column
  const canvasW = GUT_W + nPhCols*COL_W + 40;
  const phLeft  = (col:number) => GUT_W + col*COL_W;
  // Activities always in column 0 (single column), ac param kept for future use
  const aLeft   = (phCol:number, _ac:number) => phLeft(phCol)+PH_W+PH_GAP;

  // ── Drag ──────────────────────────────────────────────────────────────────
  function beginDrag(
    e:React.MouseEvent,
    kind:NonNullable<typeof drag.current>["kind"],
    pid:string, aid?:string
  ) {
    e.stopPropagation(); e.preventDefault();
    const ph = phases.find(p=>p.id===pid)!;
    let origSd:number, origEd:number, el:HTMLDivElement|null;
    if(aid) {
      const a = ph.acts.find(x=>x.id===aid)!;
      origSd=a.startDay; origEd=a.startDay+a.durationDays-1;
      el=blockRefs.current.get(aid)||null;
    } else {
      origSd=ph.startDay; origEd=ph.endDay;
      el=blockRefs.current.get(pid)||null;
    }
    const origTopPx = d2y(origSd);
    const origBotPx = d2y(origEd)+DAY_H; // one row below last day

    const mkG=(clr:string)=>{ const g=document.createElement("div"); g.style.cssText=`position:absolute;left:0;right:0;height:2px;background:${clr};opacity:0.8;pointer-events:none;z-index:300;display:none`; canvasRef.current?.appendChild(g); return g; };
    const clr = aid ? aDef(ph.acts.find(a=>a.id===aid)!.type).color : ph.color;
    const gTop=(kind!=="ph-bot"&&kind!=="a-bot")?mkG(clr):null;
    const gBot=(kind!=="ph-top"&&kind!=="a-top")?mkG(clr):null;

    drag.current={kind,pid,aid,origSd,origEd,startY:e.clientY,curY:e.clientY,origTopPx,origBotPx,el,gTop,gBot,raf:null,moved:false};

    function tick() {
      const d=drag.current; if(!d||!d.el) return;
      const dy=d.curY-d.startY;
      if(!d.moved && Math.abs(dy)<3) { d.raf=requestAnimationFrame(tick); return; }
      d.moved=true;

      const span=d.origEd-d.origSd; // day span (0 = 1 day)

      if(d.kind==="ph-move"||d.kind==="a-move") {
        d.el.style.transform=`translateY(${dy}px)`;
        const sd=snap(y2frac(d.origTopPx+dy),totalDays);
        if(d.gTop){d.gTop.style.display="block";d.gTop.style.top=`${d2y(sd)}px`;}
        if(d.gBot){d.gBot.style.display="block";d.gBot.style.top=`${d2y(Math.min(totalDays,sd+span))+DAY_H}px`;}
      } else if(d.kind==="ph-top"||d.kind==="a-top") {
        const newTopPx=d.origTopPx+dy;
        const clampedTopPx=Math.max(0,Math.min(d.origBotPx-DAY_H,newTopPx));
        d.el.style.top=`${clampedTopPx}px`;
        d.el.style.height=`${d.origBotPx-clampedTopPx}px`;
        const sd=snap(y2frac(clampedTopPx),totalDays);
        if(d.gTop){d.gTop.style.display="block";d.gTop.style.top=`${d2y(sd)}px`;}
      } else { // bot
        const newBotPx=Math.max(d.origTopPx+DAY_H,d.origBotPx+dy);
        d.el.style.height=`${newBotPx-d.origTopPx}px`;
        const ed=yToEnd(newBotPx,totalDays);
        if(d.gBot){d.gBot.style.display="block";d.gBot.style.top=`${d2y(ed)+DAY_H}px`;}
      }
      d.raf=requestAnimationFrame(tick);
    }
    drag.current.raf=requestAnimationFrame(tick);

    function onMove(ev:MouseEvent){ if(drag.current) drag.current.curY=ev.clientY; }
    function onUp(){
      const d=drag.current; if(!d) return;
      if(d.raf) cancelAnimationFrame(d.raf);
      d.gTop?.remove(); d.gBot?.remove();

      const dy=d.curY-d.startY;
      const span=d.origEd-d.origSd;

      // Compute final state FIRST, then set inline styles to match BEFORE React re-renders.
      // This prevents the "jumps to top" flash: clearing style.top="" makes position:absolute
      // default to top:auto which browsers render as top:0 for one frame before React paints.
      // Instead we pre-paint the final pixel position synchronously, then let React confirm it.

      if(!d.moved) {
        // Plain click — no position change, just clear transform (was never set)
        if(d.el) d.el.style.transform="";
        drag.current=null;
        window.removeEventListener("mousemove",onMove);
        window.removeEventListener("mouseup",onUp);
        return;
      }

      // ── Compute final days ────────────────────────────────────────────────
      let finalSd=d.origSd, finalEd=d.origEd;

      if(d.kind==="ph-move"||d.kind==="a-move") {
        finalSd=Math.max(1,Math.min(totalDays-span,snap(y2frac(d.origTopPx+dy),totalDays)));
        finalEd=finalSd+span;
      } else if(d.kind==="ph-top"||d.kind==="a-top") {
        const newTopPx=Math.max(0,d.origTopPx+dy);
        const rawSd=snap(y2frac(newTopPx),totalDays);
        finalSd=Math.max(1,Math.min(d.origEd,rawSd));
        finalEd=d.origEd;
      } else { // ph-bot / a-bot
        const newBotPx=Math.max(d.origTopPx+DAY_H,d.origBotPx+dy);
        finalSd=d.origSd;
        finalEd=yToEnd(newBotPx,totalDays);
      }

      // ── Pre-paint final position synchronously ────────────────────────────
      if(d.el) {
        const finalTopPx=d2y(finalSd);
        const finalBotPx=d2y(finalEd)+DAY_H;
        d.el.style.transform="";
        d.el.style.top=`${finalTopPx}px`;
        d.el.style.height=`${finalBotPx-finalTopPx}px`;
      }

      // ── Commit to React state ─────────────────────────────────────────────
      setPhases(prev=>prev.map(ph=>{
        if(ph.id!==d.pid) return ph;

        if(d.kind==="ph-move") {
          const sd=Math.max(1,Math.min(totalDays-span,finalSd));
          const ed=sd+span;
          const delta=sd-d.origSd;
          return {...ph,startDay:sd,endDay:ed,acts:ph.acts.map(a=>({
            ...a,
            startDay:Math.max(sd,Math.min(ed,a.startDay+delta)),
          }))};
        }
        if(d.kind==="ph-top") {
          const sd=Math.max(1,Math.min(ph.endDay,finalSd));
          return {...ph,startDay:sd,acts:ph.acts.map(a=>({...a,startDay:Math.max(sd,a.startDay)}))};
        }
        if(d.kind==="ph-bot") {
          const ed=Math.max(ph.startDay,Math.min(totalDays,finalEd));
          return {...ph,endDay:ed,acts:ph.acts.map(a=>{
            const as2=Math.min(a.startDay,ed);
            return {...a,startDay:as2,durationDays:Math.max(1,Math.min(a.durationDays,ed-as2+1))};
          })};
        }
        if(d.kind==="a-move") {
          const sd=Math.max(ph.startDay,Math.min(ph.endDay-span,finalSd));
          return {...ph,acts:ph.acts.map(a=>a.id!==d.aid?a:{...a,startDay:sd})};
        }
        if(d.kind==="a-top") {
          return {...ph,acts:ph.acts.map(a=>{
            if(a.id!==d.aid) return a;
            const origEd2=a.startDay+a.durationDays-1;
            const newSd=Math.max(ph.startDay,Math.min(origEd2,finalSd));
            return {...a,startDay:newSd,durationDays:Math.max(1,origEd2-newSd+1)};
          })};
        }
        // a-bot
        return {...ph,acts:ph.acts.map(a=>{
          if(a.id!==d.aid) return a;
          const ned=Math.max(a.startDay,Math.min(ph.endDay,finalEd));
          return {...a,durationDays:Math.max(1,ned-a.startDay+1)};
        })};
      }));

      drag.current=null;
      window.removeEventListener("mousemove",onMove);
      window.removeEventListener("mouseup",onUp);
    }
    window.addEventListener("mousemove",onMove);
    window.addEventListener("mouseup",onUp);
  }

  // ── Mutations ─────────────────────────────────────────────────────────────
  function addPhase(tplId?:string) {
    const tpl=tplId?PH_TPLS.find(t=>t.id===tplId):PH_TPLS[0]; if(!tpl) return;
    const lastEnd=phases.length?Math.max(...phases.map(p=>p.endDay)):0;
    const sd=Math.min(totalDays-1,lastEnd+1);
    const ed=Math.min(totalDays,sd+tpl.days-1);
    const np:Ph={id:uid(),label:tpl.label,color:tpl.color,icon:tpl.icon,startDay:sd,endDay:ed,acts:mkActs(tpl.id,sd,ed)};
    setPhases(prev=>[...prev,np]); setSel({kind:"phase",pid:np.id});
  }
  function addAct(pid:string,type:AId) {
    const ph=phases.find(p=>p.id===pid)!;
    const lastEnd=ph.acts.length?Math.max(...ph.acts.map(a=>a.startDay+a.durationDays-1)):ph.startDay-1;
    const sd=Math.min(ph.endDay,lastEnd+1);
    const dur=Math.max(1,ph.endDay-sd+1);
    const na:Act={id:uid(),type,title:aDef(type).label,startDay:sd,durationDays:Math.min(3,dur),durationMins:30,notes:""};
    setPhases(prev=>prev.map(p=>p.id!==pid?p:{...p,acts:[...p.acts,na]}));
    setSel({kind:"act",pid,aid:na.id});
  }
  const delPhase=(id:string)=>{ setPhases(prev=>prev.filter(p=>p.id!==id)); if(sel?.pid===id) setSel(null); };
  const delAct=(pid:string,aid:string)=>{ setPhases(prev=>prev.map(p=>p.id!==pid?p:{...p,acts:p.acts.filter(a=>a.id!==aid)})); if(sel?.kind==="act"&&sel.aid===aid) setSel(null); };
  const updPh=(id:string,patch:Partial<Ph>)=>setPhases(prev=>prev.map(p=>p.id!==id?p:{...p,...patch}));
  const updAct=(pid:string,aid:string,patch:Partial<Act>)=>setPhases(prev=>prev.map(p=>p.id!==pid?p:{...p,acts:p.acts.map(a=>a.id!==aid?a:{...a,...patch})}));

  // Assign faculty to a live_session/coaching activity (called from drag-drop or right panel)
  async function assignFacultyToAct(pid:string, aid:string, faculty:OrgFacultyMember, role="Lead", overrideNote?:string) {
    // Activity must be saved first — skip if it's an unsaved local activity (id is a uid, not uuid)
    const ph = phases.find(p=>p.id===pid); if(!ph) return;
    const act = ph.acts.find(a=>a.id===aid); if(!act) return;
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(!uuidRe.test(aid)) { setSaveMsg("Save the program first before assigning faculty."); setTimeout(()=>setSaveMsg(""),3000); return; }

    try {
      const res = await programsApi.assignFaculty(program.id, aid, {
        faculty_user_id: faculty.id, role, ...(overrideNote?{override_note:overrideNote}:{})
      });
      if((res as {status?:number}).status===409 || (res.data as {has_conflict?:boolean})?.has_conflict) {
        // Show conflict modal
        const conflictData = res.data as {conflicts?:ConflictDTO[]};
        setConflictModal({ actId:aid, pid, faculty, role, conflicts: conflictData.conflicts??[] });
        return;
      }
      // Success — update local faculty list on the activity
      const newEntry = res.data as ActivityFacultyDTO;
      if(newEntry?.faculty_user_id) {
        updAct(pid, aid, { faculty: [...(act.faculty??[]).filter(f=>f.faculty_user_id!==faculty.id), newEntry] });
      }
    } catch(e:unknown) {
      const err = e as {status?:number; data?:{conflicts?:ConflictDTO[]}};
      if(err?.status===409) {
        setConflictModal({ actId:aid, pid, faculty, role, conflicts: err.data?.conflicts??[] });
      }
    }
  }

  async function removeFacultyFromAct(pid:string, aid:string, facultyUserId:string) {
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(!uuidRe.test(aid)) return;
    await programsApi.removeFaculty(program.id, aid, facultyUserId).catch(()=>{});
    updAct(pid, aid, { faculty: (phases.find(p=>p.id===pid)?.acts.find(a=>a.id===aid)?.faculty??[]).filter(f=>f.faculty_user_id!==facultyUserId) });
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = useCallback(async(publish=false)=>{
    if(saving) return; // prevent double-fire
    setSaving(true); setSaveMsg("Saving…");
    try {
      await programsApi.update(program.id,{
        duration_weeks:totalWeeks,
        ...(startDt&&{start_date:startDt}),
        ...(endDt&&{end_date:endDt}),
      });

      // Snapshot of previous server IDs — used for delete detection
      const prevPhaseIds = new Set(savedPhaseIds.current);
      const prevActIds   = new Set(savedActIds.current);

      for(let i=0;i<phases.length;i++){
        const ph=phases[i];
        const isNew=!savedPhaseIds.current.has(ph.id);
        let phId=ph.id;
        if(isNew){
          const r=await programsApi.createPhase(program.id,{title:ph.label,color:ph.color,phase_number:i,start_day:ph.startDay,end_day:ph.endDay});
          phId=r.data.id;
          savedPhaseIds.current.add(phId);
          for(const a of ph.acts){
            const ar=await programsApi.createActivity(program.id,{phase_id:phId,title:a.title,type:a.type,duration_mins:a.durationMins,start_day:a.startDay,duration_days:a.durationDays,due_day_offset:a.startDay-ph.startDay});
            savedActIds.current.add(ar.data.id);
          }
        } else {
          await programsApi.updatePhase(program.id,ph.id,{title:ph.label,color:ph.color,phase_number:i,start_day:ph.startDay,end_day:ph.endDay});
          for(const a of ph.acts){
            const isNewA=!savedActIds.current.has(a.id);
            if(isNewA){
              const ar=await programsApi.createActivity(program.id,{phase_id:ph.id,title:a.title,type:a.type,duration_mins:a.durationMins,start_day:a.startDay,duration_days:a.durationDays,due_day_offset:a.startDay-ph.startDay});
              savedActIds.current.add(ar.data.id);
            } else {
              await programsApi.updateActivity(program.id,a.id,{title:a.title,duration_mins:a.durationMins,start_day:a.startDay,duration_days:a.durationDays,due_day_offset:a.startDay-ph.startDay,description:a.notes||undefined});
            }
          }
          // Delete activities removed from this phase
          const currentActIds=new Set(ph.acts.map(a=>a.id));
          for(const prevId of prevActIds){
            if(!currentActIds.has(prevId)){
              // Only delete if it belonged to this phase (check via phases snapshot)
              const phaseHadIt=program.phases?.find(p=>p.id===ph.id)?.activities.some(a=>a.id===prevId);
              if(phaseHadIt){ await programsApi.deleteActivity(program.id,prevId).catch(()=>{}); savedActIds.current.delete(prevId); }
            }
          }
        }
      }

      // Delete phases removed from canvas
      for(const prevId of prevPhaseIds){
        if(!phases.some(p=>p.id===prevId)){
          await programsApi.deletePhase(program.id,prevId).catch(()=>{});
          savedPhaseIds.current.delete(prevId);
        }
      }

      if(publish) await programsApi.publish(program.id);

      // Reload from server and resync local state so all IDs are real UUIDs
      const r=await programsApi.get(program.id);
      onProgramUpdated(r.data);

      // Update savedIds refs from fresh server data
      savedPhaseIds.current = new Set(r.data.phases?.map(p=>p.id)??[]);
      savedActIds.current   = new Set(r.data.phases?.flatMap(p=>p.activities.map(a=>a.id))??[]);

      let cur2=1;
      setPhases(r.data.phases?.map((p,i)=>{
        const tpl=PH_TPLS.find(t=>t.label.toLowerCase()===p.title.toLowerCase());
        const span=p.end_day>p.start_day?p.end_day-p.start_day+1:(tpl?.days??14);
        const sd=p.start_day>0?p.start_day:cur2;
        const ed=p.end_day>0?p.end_day:Math.min(totalDays,sd+span-1);
        cur2=ed+1;
        return {
          id:p.id,label:p.title,color:p.color||PALETTE[i%8],icon:PH_TPLS[i%8]?.icon||"◉",
          startDay:sd,endDay:ed,
          acts:p.activities.map((a,j)=>({
            id:a.id,type:a.type as AId,title:a.title,
            startDay:a.start_day>0?a.start_day:sd+j*2,
            durationDays:a.duration_days>0?a.duration_days:2,
            durationMins:a.duration_mins,notes:a.description||"",
            faculty:a.faculty??[],
          })),
        };
      })??[]);
      setSaveMsg("✓ Saved");
    } catch { setSaveMsg("✗ Error"); }
    finally { setSaving(false); setTimeout(()=>setSaveMsg(""),2500); }
  },[phases,program,startDt,endDt,totalWeeks,onProgramUpdated,saving]);

  // ── PDF Export ────────────────────────────────────────────────────────────
  function exportPDF() {
    const el=document.getElementById("pm-print"); if(!el) return;
    const w=window.open("","_blank","width=900,height=700"); if(!w) return;
    w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${program.title} – Schedule</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;600;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}body{font-family:'Poppins',sans-serif;background:#fff;color:#1C2551;padding:36px;}
.hdr{display:flex;align-items:center;gap:12px;margin-bottom:28px;padding-bottom:14px;border-bottom:2px solid #1C2551;}
.dot{width:38px;height:38px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:16px;color:#fff;font-weight:800;}
h1{font-size:20px;font-weight:800;}.sub{font-size:11px;color:#8b90a7;margin-top:2px;}
.ph{margin-bottom:18px;page-break-inside:avoid;}.ph-hdr{display:flex;align-items:center;gap:8px;padding:9px 13px;border-radius:7px 7px 0 0;color:#fff;}
.ph-hdr h2{font-size:13px;font-weight:700;}.ph-hdr .dt{font-size:10px;opacity:.8;margin-left:auto;}
.acts{border:1.5px solid #EAECF4;border-top:none;border-radius:0 0 7px 7px;}
.act{display:flex;align-items:center;gap:9px;padding:8px 13px;border-bottom:1px solid #EAECF4;background:#fff;}
.act:last-child{border-bottom:none;}.ico{width:26px;height:26px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff;flex-shrink:0;}
.nm{flex:1;font-size:11px;font-weight:600;}.mt{font-size:9px;color:#8b90a7;text-align:right;}
.ft{margin-top:28px;font-size:9px;color:#8b90a7;text-align:center;}
@media print{body{padding:20px;}@page{margin:18mm;size:A4 portrait;}}</style></head><body>
${el.innerHTML}<div class="ft">Generated by XA-LMS · ${new Date().toLocaleDateString("en-GB",{day:"numeric",month:"long",year:"numeric"})}</div>
</body></html>`);
    w.document.close(); w.focus(); setTimeout(()=>w.print(),350);
  }

  // ── Drag-and-drop from sidebar ─────────────────────────────────────────────
  const dragKind=useRef<{kind:"phase";tplId:string}|{kind:"act";type:AId;pid:string}|null>(null);
  function onDrop(e:React.DragEvent){
    e.preventDefault(); const item=dragKind.current; if(!item||!canvasRef.current) return;
    const rect=canvasRef.current.getBoundingClientRect();
    const y=e.clientY-rect.top+(canvasRef.current.parentElement?.scrollTop||0);
    if(item.kind==="phase"){
      const tpl=PH_TPLS.find(t=>t.id===item.tplId)!;
      const sd=snap(y2frac(y),totalDays);
      const ed=Math.min(totalDays,sd+tpl.days-1);
      const np:Ph={id:uid(),label:tpl.label,color:tpl.color,icon:tpl.icon,startDay:sd,endDay:ed,acts:mkActs(tpl.id,sd,ed)};
      setPhases(prev=>[...prev,np]); setSel({kind:"phase",pid:np.id});
    } else {
      const ph=phases.find(p=>p.id===item.pid); if(!ph) return;
      const sd=Math.max(ph.startDay,Math.min(ph.endDay,snap(y2frac(y),totalDays)));
      const na:Act={id:uid(),type:item.type,title:aDef(item.type).label,startDay:sd,durationDays:Math.min(3,ph.endDay-sd+1),durationMins:30,notes:""};
      setPhases(prev=>prev.map(p=>p.id!==item.pid?p:{...p,acts:[...p.acts,na]}));
      setSel({kind:"act",pid:item.pid,aid:na.id});
    }
    dragKind.current=null;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const canvasH = totalWeeks*ROW_H+120;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%",fontFamily:"Poppins,sans-serif",background:C.page,overflow:"hidden"}}>

      {/* TOP BAR */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"0 16px",height:52,background:C.card,borderBottom:`1px solid ${C.border}`,flexShrink:0}}>
        <button onClick={onBack} style={gBtn}>← Programs</button>
        <div style={{width:1,height:18,background:C.border}}/>
        <div style={{width:26,height:26,borderRadius:7,background:program.color||C.orange,display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontWeight:800,fontSize:10}}>{(program.title?.[0]||"P").toUpperCase()}</div>
        <span style={{fontWeight:700,fontSize:13,color:C.navy}}>{program.title}</span>
        <Pill status={program.status}/>
        <button onClick={()=>setShowDates(s=>!s)} style={{...gBtn,display:"flex",alignItems:"center",gap:4,background:showDates?"#f0f1f7":"transparent",border:`1px solid ${showDates?C.border:"transparent"}`,borderRadius:7}}>
          <span>📅</span>
          <span style={{fontSize:11,color:C.navy,fontWeight:600}}>{startDt&&endDt?`${startDt} → ${endDt}`:"Set Dates"}</span>
        </button>
        {showDates&&(
          <div style={{display:"flex",alignItems:"center",gap:6,padding:"4px 10px",background:"#f0f1f7",borderRadius:8,border:`1px solid ${C.border}`}}>
            <span style={{fontSize:9,color:C.muted,fontWeight:700}}>FROM</span>
            <input type="date" value={startDt} onChange={e=>setStartDt(e.target.value)} style={dateInSt}/>
            <span style={{fontSize:9,color:C.muted,fontWeight:700}}>TO</span>
            <input type="date" value={endDt}   onChange={e=>setEndDt(e.target.value)}   style={dateInSt}/>
          </div>
        )}
        <div style={{flex:1}}/>
        {saveMsg&&<span style={{fontSize:10,fontWeight:600,color:saveMsg.startsWith("✓")?C.green:saveMsg.startsWith("✗")?"#ef4444":C.muted}}>{saveMsg}</span>}
        <span style={{fontSize:10,color:C.muted}}>{phases.length}ph · {phases.reduce((s,p)=>s+p.acts.length,0)}act · {totalWeeks}w</span>
        <button onClick={exportPDF} style={sBtn}>⬇ PDF</button>
        <button onClick={()=>handleSave(false)} disabled={saving} style={sBtn}>{saving?"…":"Save"}</button>
        <button onClick={()=>handleSave(true)} disabled={saving||program.status!=="draft"} style={{...pBtn,opacity:program.status!=="draft"?0.5:1}}>{program.status!=="draft"?"Published":"Publish"}</button>
      </div>

      {/* BODY */}
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>

        {/* SIDEBAR */}
        <div style={{width:208,flexShrink:0,background:C.card,borderRight:`1px solid ${C.border}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{flex:1,overflowY:"auto",padding:"8px 8px 12px",display:"flex",flexDirection:"column",gap:0}}>

            {/* ── SECTION 1: PHASES ── */}
            <SideSection label="PHASES" color={C.orange}>
              <button onClick={()=>addPhase()} style={{width:"100%",display:"flex",alignItems:"center",gap:6,padding:"7px 10px",background:C.orange+"12",border:`1.5px dashed ${C.orange}`,borderRadius:8,cursor:"pointer",fontFamily:"Poppins,sans-serif",color:C.orange,fontWeight:700,fontSize:11}}>
                <span style={{fontSize:15,lineHeight:1}}>+</span> Add Blank Phase
              </button>
            </SideSection>

            {/* ── SECTION 2: PHASE TEMPLATES ── */}
            <SideSection label="PHASE TEMPLATES" color={C.indigo}>
              {PH_TPLS.map(t=>(
                <SChip key={t.id} icon={t.icon} color={t.color} label={t.label} sub={`${Math.ceil(t.days/7)}w`}
                  onDragStart={()=>{dragKind.current={kind:"phase",tplId:t.id};}}
                  onClick={()=>addPhase(t.id)}/>
              ))}
            </SideSection>

            {/* ── SECTION 3: ACTIVITIES ── */}
            <SideSection label="ACTIVITIES" color={C.green}
              note={!selPh ? "Select a phase first" : undefined}>
              {selPh&&(
                <button onClick={()=>{
                  // pick first activity type not yet in phase, or default to "video"
                  const used=new Set(selPh.acts.map(a=>a.type));
                  const next=(ACT_TYPES.find(a=>!used.has(a.id))??ACT_TYPES[0]).id;
                  addAct(selPh.id,next);
                }} style={{width:"100%",display:"flex",alignItems:"center",gap:6,padding:"7px 10px",background:C.green+"12",border:`1.5px dashed ${C.green}`,borderRadius:8,cursor:"pointer",fontFamily:"Poppins,sans-serif",color:C.green,fontWeight:700,fontSize:11}}>
                  <span style={{fontSize:15,lineHeight:1}}>+</span> Add Activity
                </button>
              )}
            </SideSection>

            {/* ── SECTION 4: ACTIVITY TEMPLATES ── */}
            <SideSection label="ACTIVITY TEMPLATES" color="#8b90a7"
              note={!selPh ? "Select a phase first" : undefined}>
              {ACT_TYPES.map(a=>(
                <SChip key={a.id} icon={a.icon} color={a.color} label={a.label}
                  disabled={!selPh}
                  onDragStart={selPh?()=>{dragKind.current={kind:"act",type:a.id,pid:selPh.id};}:undefined}
                  onClick={selPh?()=>addAct(selPh.id,a.id):undefined}/>
              ))}
            </SideSection>

            {/* ── SECTION 5: FACULTY ── */}
            <SideSection label="FACULTY" color={C.indigo}
              note={orgFaculty.length===0 ? "No faculty in org yet" : "Drag onto a Live Session or Coaching activity"}>
              {orgFaculty.map(f=>(
                <div key={f.id} draggable
                  onDragStart={e=>{e.dataTransfer.setData("text/plain",f.id);e.dataTransfer.effectAllowed="copy";dragFacultyKind.current={faculty:f};}}
                  onDragEnd={()=>{dragFacultyKind.current=null;}}
                  style={{display:"flex",alignItems:"center",gap:6,padding:"4px 7px",borderRadius:6,cursor:"grab",border:`1px solid ${C.border}`,background:C.card,userSelect:"none"}}
                  onMouseEnter={e=>{(e.currentTarget as HTMLDivElement).style.borderColor=C.indigo;(e.currentTarget as HTMLDivElement).style.background=C.indigo+"0a";}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.borderColor=C.border;(e.currentTarget as HTMLDivElement).style.background=C.card;}}>
                  <div style={{width:18,height:18,borderRadius:"50%",background:C.indigo+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:C.indigo,fontWeight:700,flexShrink:0}}>
                    {f.name[0]?.toUpperCase()}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:10,fontWeight:600,color:C.navy,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{f.name}</div>
                    <div style={{fontSize:8,color:C.muted,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{f.email}</div>
                  </div>
                  <span style={{color:C.inactive,fontSize:10}}>⠿</span>
                </div>
              ))}
            </SideSection>

          </div>
        </div>

        {/* CANVAS SCROLL WRAPPER */}
        <div style={{flex:1,overflowY:"auto",overflowX:"auto",background:C.page,position:"relative"}}>
          {phases.length===0&&(
            <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,pointerEvents:"none"}}>
              <div style={{fontSize:28,color:C.orange}}>⟡</div>
              <div style={{fontSize:13,fontWeight:700,color:C.navy}}>Click "+ Add Phase" or drag a template</div>
            </div>
          )}
          <div ref={canvasRef} onDragOver={e=>e.preventDefault()} onDrop={onDrop}
            onClick={()=>setSel(null)}
            style={{position:"relative",height:canvasH,minWidth:canvasW,userSelect:"none"}}>

            {/* WEEK + DAY ROWS */}
            {Array.from({length:totalWeeks},(_,wi)=>(
              <div key={wi} style={{position:"absolute",top:wi*ROW_H,left:0,right:0,height:ROW_H}}>
                {/* Week header — 2px top border separates weeks */}
                <div style={{position:"absolute",top:0,left:0,right:0,height:WEEK_H,background:C.card,borderTop:wi>0?`2px solid ${C.indigo}33`:"none",borderBottom:`1px solid ${C.border}`,display:"flex",alignItems:"center"}}>
                  <div style={{width:GUT_W,height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",borderRight:`2px solid #c8cbda`}}>
                    <span style={{fontSize:8,fontWeight:800,color:C.indigo}}>W{wi+1}</span>
                    {startDate&&<span style={{fontSize:7,color:C.muted}}>{fmt(addDays(startDate,wi*7))}</span>}
                  </div>
                </div>
                {/* 7 day rows */}
                {Array.from({length:7},(_,di)=>{
                  const absDay=wi*7+di+1;
                  if(absDay>totalDays) return null;
                  const isWe=di>=5;
                  return (
                    <div key={di} style={{position:"absolute",top:WEEK_H+di*DAY_H,left:0,right:0,height:DAY_H,background:isWe?"rgba(107,115,191,0.04)":"rgba(255,255,255,0.55)",borderBottom:`1px solid ${C.border}`}}>
                      <div style={{width:GUT_W,height:"100%",position:"absolute",left:0,display:"flex",alignItems:"center",justifyContent:"center",gap:3,borderRight:`1px solid ${C.border}`}}>
                        <span style={{fontSize:8,fontWeight:600,color:isWe?C.indigo:C.muted}}>{DAY_NAMES[di]}</span>
                        <span style={{fontSize:7,color:C.inactive}}>{dayLabel(absDay)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* PHASES + ACTIVITIES */}
            {phWithCol.map(ph=>{
              const pTop=d2y(ph.startDay);
              const pH=d2y(ph.endDay)+DAY_H-pTop;
              const pL=phLeft(ph.col);
              const isSelPh=sel?.kind==="phase"&&sel.pid===ph.id;
              const related=sel?.kind==="act"&&sel.pid===ph.id;
              const acols=colMap(ph.acts);

              return (
                <div key={ph.id}>
                  {/* Phase block */}
                  <div
                    ref={el=>{if(el)blockRefs.current.set(ph.id,el);else blockRefs.current.delete(ph.id);}}
                    onClick={e=>{e.stopPropagation();setSel(s=>s?.kind==="phase"&&s.pid===ph.id?null:{kind:"phase",pid:ph.id});}}
                    style={{position:"absolute",top:pTop,left:pL,width:PH_W-2,height:pH,borderRadius:10,background:isSelPh||related?ph.color+"18":ph.color+"0c",border:`1.5px solid ${isSelPh||related?ph.color:ph.color+"50"}`,boxShadow:isSelPh?`0 0 0 3px ${ph.color}20,0 4px 14px ${ph.color}20`:"none",zIndex:isSelPh?40:10,overflow:"hidden",cursor:"pointer",transition:"border-color .12s,box-shadow .12s"}}>
                    <Grip onMouseDown={e=>beginDrag(e,"ph-top",ph.id)} color={ph.color} pos="top"/>
                    <div onMouseDown={e=>beginDrag(e,"ph-move",ph.id)} style={{padding:"7px 8px 3px",cursor:"grab",display:"flex",alignItems:"center",gap:5}}>
                      <div style={{width:22,height:22,borderRadius:6,background:ph.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,color:"#fff",flexShrink:0}}>{ph.icon}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:11,fontWeight:700,color:C.navy,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ph.label}</div>
                        <div style={{fontSize:8,color:C.muted}}>
                          {startDate?`${fmt(addDays(startDate,ph.startDay-1))}–${fmt(addDays(startDate,ph.endDay-1))}`:`D${ph.startDay}–D${ph.endDay}`}
                        </div>
                      </div>
                      <button onClick={e=>{e.stopPropagation();delPhase(ph.id);}} style={{border:"none",background:"transparent",color:C.muted,cursor:"pointer",fontSize:9,padding:2}}>✕</button>
                    </div>
                    {/* Day ticks */}
                    <div style={{overflow:"hidden"}}>
                      {Array.from({length:Math.min(ph.endDay-ph.startDay+1,200)},(_,i)=>{
                        const isWe=(((ph.startDay-1+i)%7)>=5);
                        return <div key={i} style={{height:DAY_H,borderBottom:`1px dashed ${ph.color}15`,background:isWe?"rgba(107,115,191,0.025)":"transparent",display:"flex",alignItems:"center",paddingLeft:10}}><div style={{width:3,height:3,borderRadius:"50%",background:ph.color+"40"}}/></div>;
                      })}
                    </div>
                    <Grip onMouseDown={e=>beginDrag(e,"ph-bot",ph.id)} color={ph.color} pos="bottom"/>
                  </div>

                  {/* Activity blocks */}
                  {ph.acts.map(act=>{
                    const def=aDef(act.type);
                    const ac=acols.get(act.id)??0;
                    const aT=d2y(act.startDay);
                    const aH=Math.max(DAY_H,act.durationDays*DAY_H);
                    const aL=aLeft(ph.col,ac);
                    const isSel=sel?.kind==="act"&&sel.aid===act.id;
                    const endDay=act.startDay+act.durationDays-1;
                    const label=act.durationDays===1
                      ?(startDate?fmt(addDays(startDate,act.startDay-1)):`D${act.startDay}`)
                      :(startDate?`${fmt(addDays(startDate,act.startDay-1))}·${act.durationDays}d`:`D${act.startDay}–D${endDay}`);
                    const isFacultyTarget = act.type==="live_session"||act.type==="coaching";
                    return (
                      <div key={act.id}
                        ref={el=>{if(el)blockRefs.current.set(act.id,el);else blockRefs.current.delete(act.id);}}
                        onClick={e=>{e.stopPropagation();setSel({kind:"act",pid:ph.id,aid:act.id});}}
                        onDragOver={e=>{if(dragFacultyKind.current){e.preventDefault();e.stopPropagation();if(isFacultyTarget)(e.currentTarget as HTMLDivElement).style.outline=`2px dashed rgba(255,255,255,0.8)`;}}}
                        onDragLeave={e=>{(e.currentTarget as HTMLDivElement).style.outline="";}}
                        onDrop={e=>{
                          e.preventDefault();e.stopPropagation();
                          (e.currentTarget as HTMLDivElement).style.outline="";
                          const f=dragFacultyKind.current;
                          if(!f) return;
                          dragFacultyKind.current=null;
                          if(isFacultyTarget) assignFacultyToAct(ph.id,act.id,f.faculty);
                        }}
                        style={{position:"absolute",top:aT,left:aL,width:A_W,height:aH,borderRadius:8,background:def.color,border:`1.5px solid ${isSel?"rgba(0,0,0,0.2)":def.color}`,boxShadow:isSel?`0 0 0 3px ${def.color}33,0 3px 12px ${def.color}44`:"0 1px 4px rgba(0,0,0,0.12)",zIndex:isSel?50:20,overflow:"hidden",cursor:"pointer",display:"flex",flexDirection:"column",transition:"box-shadow .12s"}}>
                        <Grip onMouseDown={e=>beginDrag(e,"a-top",ph.id,act.id)} color="rgba(255,255,255,0.45)" pos="top"/>
                        <div onMouseDown={e=>beginDrag(e,"a-move",ph.id,act.id)} style={{flex:1,padding:"4px 7px 3px",cursor:"grab",display:"flex",flexDirection:"column",gap:1,overflow:"hidden"}}>
                          <div style={{display:"flex",alignItems:"center",gap:4}}>
                            <span style={{fontSize:9,color:"rgba(255,255,255,0.8)",flexShrink:0}}>{def.icon}</span>
                            <span style={{fontSize:10,fontWeight:700,color:"#fff",flex:1,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",lineHeight:1.2}}>{act.title}</span>
                            <button onClick={e=>{e.stopPropagation();delAct(ph.id,act.id);}} style={{border:"none",background:"rgba(0,0,0,0.15)",color:"rgba(255,255,255,0.9)",cursor:"pointer",fontSize:8,padding:"1px 3px",borderRadius:3,flexShrink:0,fontFamily:"Poppins,sans-serif"}}>✕</button>
                          </div>
                          <span style={{fontSize:7,color:"rgba(255,255,255,0.7)",fontWeight:600,paddingLeft:13}}>{label}</span>
                          {/* Faculty avatars on block */}
                          {isFacultyTarget&&(act.faculty??[]).length>0&&(
                            <div style={{display:"flex",gap:2,paddingLeft:13,marginTop:2,flexWrap:"wrap"}}>
                              {(act.faculty??[]).map(f=>(
                                <div key={f.faculty_user_id} title={`${f.name} · ${f.role}`}
                                  style={{width:14,height:14,borderRadius:"50%",background:"rgba(255,255,255,0.25)",border:"1.5px solid rgba(255,255,255,0.6)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:7,color:"#fff",fontWeight:700,cursor:"default",flexShrink:0}}>
                                  {f.name[0]?.toUpperCase()}
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Drop hint for empty faculty slots */}
                          {isFacultyTarget&&(act.faculty??[]).length===0&&aH>36&&(
                            <div style={{fontSize:7,color:"rgba(255,255,255,0.5)",paddingLeft:13,marginTop:1}}>Drop faculty here</div>
                          )}
                        </div>
                        <Grip onMouseDown={e=>beginDrag(e,"a-bot",ph.id,act.id)} color="rgba(255,255,255,0.45)" pos="bottom"/>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        {/* CONFLICT MODAL */}
        {conflictModal&&(
          <ConflictOverlay
            faculty={conflictModal.faculty}
            conflicts={conflictModal.conflicts}
            onCancel={()=>setConflictModal(null)}
            onOverride={(note)=>{
              const m=conflictModal; setConflictModal(null);
              assignFacultyToAct(m.pid,m.actId,m.faculty,m.role,note);
            }}/>
        )}

        {/* RIGHT CONFIG PANEL */}
        {sel&&selPh?(
          <RPanel ph={selPh} act={selAct} total={totalDays} sd={startDate}
            orgFaculty={orgFaculty}
            onClose={()=>setSel(null)}
            onUpdPh={p=>updPh(selPh.id,p)}
            onUpdAct={p=>{if(selAct)updAct(selPh.id,selAct.id,p);}}
            onAddAct={t=>addAct(selPh.id,t)}
            onAssignFaculty={(f,role)=>{if(selAct)assignFacultyToAct(selPh.id,selAct.id,f,role);}}
            onRemoveFaculty={(fid)=>{if(selAct)removeFacultyFromAct(selPh.id,selAct.id,fid);}}/>
        ):(
          <div style={{width:240,flexShrink:0,borderLeft:`1px solid ${C.border}`,background:C.card,display:"flex",alignItems:"center",justifyContent:"center"}}>
            <div style={{textAlign:"center",padding:20}}>
              <div style={{fontSize:24,color:C.inactive,marginBottom:6}}>◉</div>
              <div style={{fontSize:11,fontWeight:600,color:C.navy,marginBottom:4}}>Nothing selected</div>
              <div style={{fontSize:10,color:C.muted,lineHeight:1.7}}>Click a phase or activity to configure it.</div>
            </div>
          </div>
        )}
      </div>

      {/* Hidden print content */}
      <div id="pm-print" style={{display:"none"}}>
        <div className="hdr">
          <div className="dot" style={{background:program.color||C.orange}}>{(program.title?.[0]||"P").toUpperCase()}</div>
          <div><h1>{program.title}</h1><p className="sub">{startDt&&endDt?`${startDt} → ${endDt} · `:"" }{totalWeeks}w · {phases.length} phases · {phases.reduce((s,p)=>s+p.acts.length,0)} activities</p></div>
        </div>
        {[...phases].sort((a,b)=>a.startDay-b.startDay).map(ph=>(
          <div key={ph.id} className="ph">
            <div className="ph-hdr" style={{background:ph.color}}>
              <span>{ph.icon}</span><h2>{ph.label}</h2>
              <span className="dt">{startDate?`${fmt(addDays(startDate,ph.startDay-1))}–${fmt(addDays(startDate,ph.endDay-1))}`:`D${ph.startDay}–D${ph.endDay}`}</span>
            </div>
            {ph.acts.length>0&&<div className="acts">{[...ph.acts].sort((a,b)=>a.startDay-b.startDay).map(act=>{
              const d=aDef(act.type);
              const ed=act.startDay+act.durationDays-1;
              return (<div key={act.id} className="act">
                <div className="ico" style={{background:d.color}}>{d.icon}</div>
                <span className="nm">{act.title}</span>
                <span className="mt">{startDate?`${fmt(addDays(startDate,act.startDay-1))}–${fmt(addDays(startDate,ed))}`:`D${act.startDay}–D${ed}`}<br/>{act.durationMins}min</span>
              </div>);
            })}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Resize Grip ──────────────────────────────────────────────────────────────
function Grip({onMouseDown,color,pos}:{onMouseDown:(e:React.MouseEvent)=>void;color:string;pos:"top"|"bottom"}) {
  return (
    <div onMouseDown={onMouseDown} onClick={e=>e.stopPropagation()}
      style={{position:"absolute",[pos]:-1,left:"50%",transform:"translateX(-50%)",width:34,height:6,cursor:"ns-resize",zIndex:6,borderRadius:pos==="top"?"3px 3px 0 0":"0 0 3px 3px",background:color,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{width:12,height:2,borderRadius:2,background:"rgba(255,255,255,0.5)"}}/>
    </div>
  );
}

const DELIVERY_ROLES = ["Lead","Co-Facilitator","Observer"];

// ─── Conflict override modal ──────────────────────────────────────────────────
function ConflictOverlay({faculty,conflicts,onCancel,onOverride}:{
  faculty:OrgFacultyMember;
  conflicts:ConflictDTO[];
  onCancel:()=>void;
  onOverride:(note:string)=>void;
}) {
  const [note,setNote]=useState("");
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(28,37,81,0.55)",zIndex:2000,display:"flex",alignItems:"center",justifyContent:"center",padding:24,fontFamily:"Poppins,sans-serif"}}>
      <div style={{background:"#fff",borderRadius:14,width:"100%",maxWidth:440,boxShadow:"0 24px 64px rgba(28,37,81,0.22)",overflow:"hidden"}}>
        <div style={{padding:"14px 18px",borderBottom:"1px solid #EAECF4",background:"rgba(239,78,36,0.05)"}}>
          <div style={{fontSize:14,fontWeight:700,color:"#1C2551"}}>⚠ Scheduling Conflict</div>
          <div style={{fontSize:11,color:"#8b90a7",marginTop:2}}><b style={{color:"#1C2551"}}>{faculty.name}</b> is already assigned to {conflicts.length} other session{conflicts.length>1?"s":""} that overlap.</div>
        </div>
        <div style={{padding:"10px 18px",maxHeight:200,overflowY:"auto"}}>
          {conflicts.map((c,i)=>(
            <div key={i} style={{padding:"7px 0",borderBottom:i<conflicts.length-1?"1px solid #F4F5F8":"none"}}>
              <div style={{fontSize:12,fontWeight:600,color:"#1C2551"}}>{c.activity_title}</div>
              <div style={{fontSize:11,color:"#8b90a7"}}>{c.program_title}{c.cohort_name?` · ${c.cohort_name}`:""}</div>
              <div style={{fontSize:10,color:"#EF4E24"}}>{c.start_date} → {c.end_date} · {c.role}</div>
            </div>
          ))}
        </div>
        <div style={{padding:"10px 18px",borderTop:"1px solid #EAECF4"}}>
          <div style={{fontSize:10,fontWeight:700,color:"#8b90a7",letterSpacing:0.5,marginBottom:5}}>OVERRIDE REASON (REQUIRED)</div>
          <textarea value={note} onChange={e=>setNote(e.target.value)} rows={2} placeholder="e.g. Faculty confirmed availability for this slot"
            style={{width:"100%",border:"1px solid #EAECF4",borderRadius:7,padding:"7px 10px",fontSize:12,fontFamily:"Poppins,sans-serif",color:"#1C2551",resize:"none",boxSizing:"border-box",outline:"none"}}/>
        </div>
        <div style={{padding:"10px 18px",borderTop:"1px solid #EAECF4",display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button onClick={onCancel} style={{padding:"7px 14px",background:"#fff",border:"1px solid #EAECF4",borderRadius:7,cursor:"pointer",fontSize:12,fontWeight:600,color:"#1C2551",fontFamily:"Poppins,sans-serif"}}>Cancel</button>
          <button onClick={()=>{if(note.trim())onOverride(note.trim());}} disabled={!note.trim()} style={{padding:"7px 14px",background:"#EF4E24",border:"none",borderRadius:7,cursor:note.trim()?"pointer":"not-allowed",fontSize:12,fontWeight:700,color:"#fff",fontFamily:"Poppins,sans-serif",opacity:note.trim()?1:0.5}}>
            Override &amp; Assign
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Right config panel ───────────────────────────────────────────────────────
function RPanel({ph,act,total,sd,orgFaculty,onClose,onUpdPh,onUpdAct,onAddAct,onAssignFaculty,onRemoveFaculty}:{
  ph:Ph;act:Act|null;total:number;sd:Date|null;
  orgFaculty:OrgFacultyMember[];
  onClose:()=>void;onUpdPh:(p:Partial<Ph>)=>void;
  onUpdAct:(p:Partial<Act>)=>void;onAddAct:(t:AId)=>void;
  onAssignFaculty:(f:OrgFacultyMember,role:string)=>void;
  onRemoveFaculty:(facultyUserId:string)=>void;
}) {
  const [phName,setPhName]=useState(ph.label);
  const [aTitle,setATitle]=useState(act?.title||"");
  const [facPick,setFacPick]=useState(false);
  const [selFacId,setSelFacId]=useState("");
  const [selRole,setSelRole]=useState("Lead");
  useEffect(()=>setPhName(ph.label),[ph.id]);
  useEffect(()=>{setATitle(act?.title||"");setFacPick(false);},[act?.id]);
  const col=act?aDef(act.type).color:ph.color;

  return (
    <div style={{width:240,flexShrink:0,background:C.card,borderLeft:`1px solid ${C.border}`,display:"flex",flexDirection:"column",overflow:"hidden"}}>
      <div style={{display:"flex",alignItems:"center",gap:7,padding:"9px 12px",borderBottom:`1px solid ${C.border}`,flexShrink:0,background:col+"0a"}}>
        <div style={{width:22,height:22,borderRadius:5,background:col,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:"#fff"}}>{act?aDef(act.type).icon:ph.icon}</div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:8,fontWeight:700,color:C.muted,letterSpacing:0.5}}>{act?"ACTIVITY":"PHASE"}</div>
          <div style={{fontSize:11,fontWeight:700,color:C.navy,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{act?act.title:ph.label}</div>
        </div>
        <button onClick={onClose} style={{border:"none",background:"transparent",color:C.muted,cursor:"pointer",fontSize:12}}>✕</button>
      </div>
      <div style={{flex:1,overflow:"auto",padding:"11px 12px",display:"flex",flexDirection:"column",gap:11}}>
        {act?(<>
          <FG label="TITLE"><input value={aTitle} onChange={e=>setATitle(e.target.value)} onBlur={()=>onUpdAct({title:aTitle})} onKeyDown={e=>e.key==="Enter"&&onUpdAct({title:aTitle})} style={inSt}/></FG>
          {sd&&<InfoBox>{fmt(addDays(sd,act.startDay-1))} → {fmt(addDays(sd,act.startDay+act.durationDays-2))}</InfoBox>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
            <FG label="START DAY"><input type="number" min={ph.startDay} max={ph.endDay} value={act.startDay} onChange={e=>onUpdAct({startDay:Math.max(ph.startDay,Math.min(ph.endDay,+e.target.value))})} style={inSt}/></FG>
            <FG label="DURATION (d)"><input type="number" min={1} max={ph.endDay-act.startDay+1} value={act.durationDays} onChange={e=>onUpdAct({durationDays:Math.max(1,Math.min(ph.endDay-act.startDay+1,+e.target.value))})} style={inSt}/></FG>
          </div>
          <FG label="MINS"><input type="number" min={5} max={480} step={5} value={act.durationMins} onChange={e=>onUpdAct({durationMins:Math.max(5,+e.target.value)})} style={inSt}/></FG>
          <FG label="NOTES"><textarea value={act.notes} onChange={e=>onUpdAct({notes:e.target.value})} rows={3} style={{...inSt,resize:"none"}}/></FG>

          {/* Faculty assignment — only for live_session and coaching */}
          {(act.type==="live_session"||act.type==="coaching")&&(
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:8}}>
              <div style={{fontSize:8,fontWeight:700,color:C.muted,letterSpacing:0.5,marginBottom:5}}>ASSIGNED FACULTY</div>
              {(act.faculty??[]).length===0&&<div style={{fontSize:9,color:C.muted,marginBottom:5}}>No faculty assigned yet.</div>}
              {(act.faculty??[]).map(f=>(
                <div key={f.faculty_user_id} style={{display:"flex",alignItems:"center",gap:5,padding:"3px 0",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{width:16,height:16,borderRadius:"50%",background:C.indigo+"22",display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:C.indigo,fontWeight:700,flexShrink:0}}>{f.name[0]?.toUpperCase()}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:10,fontWeight:600,color:C.navy,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{f.name}</div>
                    <div style={{fontSize:8,color:C.indigo}}>{f.role}</div>
                  </div>
                  <button onClick={()=>onRemoveFaculty(f.faculty_user_id)} style={{border:"none",background:"transparent",color:C.muted,cursor:"pointer",fontSize:9,padding:2}}>✕</button>
                </div>
              ))}
              {!facPick&&(
                <button onClick={()=>setFacPick(true)} style={{marginTop:5,width:"100%",display:"flex",alignItems:"center",gap:4,padding:"5px 8px",background:C.indigo+"10",border:`1px dashed ${C.indigo}`,borderRadius:6,cursor:"pointer",fontFamily:"Poppins,sans-serif",color:C.indigo,fontWeight:700,fontSize:10}}>
                  <span>+</span> Assign Faculty
                </button>
              )}
              {facPick&&orgFaculty.length>0&&(
                <div style={{marginTop:5,display:"flex",flexDirection:"column",gap:4}}>
                  <select value={selFacId} onChange={e=>setSelFacId(e.target.value)} style={{...inSt,fontSize:10}}>
                    <option value="">— Pick faculty —</option>
                    {orgFaculty.filter(f=>!(act.faculty??[]).some(af=>af.faculty_user_id===f.id)).map(f=>(
                      <option key={f.id} value={f.id}>{f.name} ({f.email})</option>
                    ))}
                  </select>
                  <select value={selRole} onChange={e=>setSelRole(e.target.value)} style={{...inSt,fontSize:10}}>
                    {DELIVERY_ROLES.map(r=><option key={r} value={r}>{r}</option>)}
                  </select>
                  <div style={{display:"flex",gap:4}}>
                    <button onClick={()=>{
                      if(!selFacId) return;
                      const f=orgFaculty.find(x=>x.id===selFacId); if(!f) return;
                      onAssignFaculty(f,selRole);
                      setFacPick(false); setSelFacId(""); setSelRole("Lead");
                    }} disabled={!selFacId} style={{flex:1,padding:"5px 8px",background:C.indigo,border:"none",borderRadius:6,cursor:selFacId?"pointer":"not-allowed",fontFamily:"Poppins,sans-serif",color:"#fff",fontWeight:700,fontSize:10,opacity:selFacId?1:0.5}}>
                      Assign
                    </button>
                    <button onClick={()=>setFacPick(false)} style={{flex:1,padding:"5px 8px",background:"transparent",border:`1px solid ${C.border}`,borderRadius:6,cursor:"pointer",fontFamily:"Poppins,sans-serif",color:C.muted,fontSize:10}}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              {facPick&&orgFaculty.length===0&&<div style={{fontSize:9,color:C.muted,marginTop:4}}>No org faculty available. Invite faculty first.</div>}
            </div>
          )}

          <div style={{fontSize:8,color:C.muted,borderTop:`1px solid ${C.border}`,paddingTop:4}}>In <b>{ph.label}</b></div>
        </>):(<>
          <FG label="PHASE NAME"><input value={phName} onChange={e=>setPhName(e.target.value)} onBlur={()=>onUpdPh({label:phName})} onKeyDown={e=>e.key==="Enter"&&onUpdPh({label:phName})} style={inSt}/></FG>
          {sd&&<InfoBox>{fmt(addDays(sd,ph.startDay-1))} → {fmt(addDays(sd,ph.endDay-1))} · {ph.endDay-ph.startDay+1}d</InfoBox>}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:7}}>
            <FG label="START DAY"><input type="number" min={1} max={ph.endDay-1} value={ph.startDay} onChange={e=>onUpdPh({startDay:Math.max(1,Math.min(ph.endDay-1,+e.target.value))})} style={inSt}/></FG>
            <FG label="END DAY"><input type="number" min={ph.startDay+1} max={total} value={ph.endDay} onChange={e=>onUpdPh({endDay:Math.max(ph.startDay+1,Math.min(total,+e.target.value))})} style={inSt}/></FG>
          </div>
          <FG label="COLOUR">
            <div style={{display:"flex",gap:4,flexWrap:"wrap",paddingTop:2}}>
              {PALETTE.map(c=><div key={c} onClick={()=>onUpdPh({color:c})} style={{width:20,height:20,borderRadius:5,background:c,cursor:"pointer",border:ph.color===c?`2.5px solid ${C.navy}`:"2px solid transparent",boxSizing:"border-box",transition:"transform .1s"}} onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.transform="scale(1.2)"} onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.transform="scale(1)"}/>)}
            </div>
          </FG>
          <div>
            <div style={{fontSize:8,fontWeight:700,color:C.muted,letterSpacing:0.5,marginBottom:5}}>ADD ACTIVITY</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:3}}>
              {ACT_TYPES.map(a=>(
                <button key={a.id} onClick={()=>onAddAct(a.id)} style={{display:"flex",alignItems:"center",gap:4,padding:"4px 6px",border:`1px solid ${C.border}`,borderRadius:5,background:C.card,cursor:"pointer",fontFamily:"Poppins,sans-serif",textAlign:"left",transition:"border-color .1s"}}
                  onMouseEnter={e=>(e.currentTarget as HTMLButtonElement).style.borderColor=a.color}
                  onMouseLeave={e=>(e.currentTarget as HTMLButtonElement).style.borderColor=C.border}>
                  <span style={{fontSize:9,color:a.color,width:12,textAlign:"center"}}>{a.icon}</span>
                  <span style={{fontSize:9,fontWeight:500,color:C.navy,lineHeight:1.2}}>{a.label}</span>
                </button>
              ))}
            </div>
          </div>
          {ph.acts.length>0&&(
            <div style={{borderTop:`1px solid ${C.border}`,paddingTop:7}}>
              <div style={{fontSize:8,fontWeight:700,color:C.muted,letterSpacing:0.5,marginBottom:5}}>ACTIVITIES ({ph.acts.length})</div>
              {[...ph.acts].sort((a,b)=>a.startDay-b.startDay).map(a=>{
                const d=aDef(a.type);
                return (<div key={a.id} style={{display:"flex",alignItems:"center",gap:5,padding:"3px 0",borderBottom:`1px solid ${C.border}`}}>
                  <div style={{width:15,height:15,borderRadius:3,background:d.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,color:"#fff"}}>{d.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:10,fontWeight:600,color:C.navy,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.title}</div>
                    <div style={{fontSize:8,color:C.muted}}>{sd?fmt(addDays(sd,a.startDay-1)):`D${a.startDay}`} · {a.durationDays}d</div>
                  </div>
                </div>);
              })}
            </div>
          )}
        </>)}
      </div>
    </div>
  );
}

// ─── Sidebar chip ─────────────────────────────────────────────────────────────
function SChip({icon,color,label,sub,disabled,onDragStart,onClick}:{icon:string;color:string;label:string;sub?:string;disabled?:boolean;onDragStart?:()=>void;onClick?:()=>void}) {
  const activeColor = disabled ? C.inactive : color;
  return (
    <div draggable={!disabled&&!!onDragStart} onDragStart={disabled?undefined:onDragStart} onClick={disabled?undefined:onClick}
      style={{display:"flex",alignItems:"center",gap:6,padding:"4px 7px",borderRadius:6,cursor:disabled?"not-allowed":"pointer",border:`1px solid ${C.border}`,background:C.card,transition:"border-color .1s,background .1s",userSelect:"none",opacity:disabled?0.4:1}}
      onMouseEnter={e=>{if(!disabled){(e.currentTarget as HTMLDivElement).style.borderColor=color;(e.currentTarget as HTMLDivElement).style.background=color+"0a";}}}
      onMouseLeave={e=>{(e.currentTarget as HTMLDivElement).style.borderColor=C.border;(e.currentTarget as HTMLDivElement).style.background=C.card;}}>
      <div style={{width:18,height:18,borderRadius:4,background:activeColor+"18",display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,color:activeColor,flexShrink:0}}>{icon}</div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:10,fontWeight:600,color:disabled?C.muted:C.navy,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{label}</div>
        {sub&&<div style={{fontSize:8,color:C.muted}}>{sub}</div>}
      </div>
      {!disabled&&onDragStart&&<span style={{color:C.inactive,fontSize:10}}>⠿</span>}
    </div>
  );
}

function SideSection({label,color,note,children}:{label:string;color:string;note?:string;children?:React.ReactNode}) {
  return (
    <div style={{marginBottom:4}}>
      {/* Section header */}
      <div style={{display:"flex",alignItems:"center",gap:6,padding:"8px 4px 4px",marginBottom:2}}>
        <div style={{width:3,height:12,borderRadius:99,background:color,flexShrink:0}}/>
        <span style={{fontSize:8,fontWeight:800,color:C.muted,letterSpacing:0.8,flex:1}}>{label}</span>
      </div>
      {/* Note (e.g. "Select a phase first") */}
      {note&&(
        <div style={{fontSize:9,color:C.muted,padding:"2px 8px 6px",fontStyle:"italic"}}>{note}</div>
      )}
      {/* Children (button + chips) */}
      <div style={{display:"flex",flexDirection:"column",gap:2}}>
        {children}
      </div>
      {/* Divider */}
      <div style={{height:1,background:C.border,marginTop:6}}/>
    </div>
  );
}

function Pill({status}:{status:string}) {
  const m:{[k:string]:{bg:string;color:string}}={draft:{bg:"rgba(139,144,167,0.12)",color:C.muted},active:{bg:"rgba(34,197,94,0.12)",color:C.green},upcoming:{bg:"rgba(239,78,36,0.1)",color:C.orange},delivered:{bg:"rgba(107,115,191,0.12)",color:C.indigo},archived:{bg:"rgba(208,211,224,0.2)",color:C.inactive}};
  const s=m[status]||m.draft;
  return <span style={{background:s.bg,color:s.color,borderRadius:20,padding:"2px 8px",fontSize:9,fontWeight:700,letterSpacing:0.5}}>{status.toUpperCase()}</span>;
}
function FG({label,children}:{label:string;children:React.ReactNode}) {
  return <div style={{display:"flex",flexDirection:"column",gap:3}}><div style={{fontSize:8,fontWeight:700,color:C.muted,letterSpacing:0.5}}>{label}</div>{children}</div>;
}
function InfoBox({children}:{children:React.ReactNode}) {
  return <div style={{fontSize:10,color:C.muted,background:"#f0f1f7",borderRadius:6,padding:"5px 7px",lineHeight:1.6,fontWeight:600}}>{children}</div>;
}

const pBtn:React.CSSProperties={padding:"6px 14px",background:C.orange,border:"none",borderRadius:7,color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer",fontFamily:"Poppins,sans-serif"};
const sBtn:React.CSSProperties={padding:"5px 12px",background:C.card,border:`1px solid ${C.border}`,borderRadius:7,color:C.navy,fontWeight:600,fontSize:11,cursor:"pointer",fontFamily:"Poppins,sans-serif"};
const gBtn:React.CSSProperties={padding:"4px 9px",background:"transparent",border:"none",borderRadius:6,color:C.muted,fontWeight:600,fontSize:11,cursor:"pointer",fontFamily:"Poppins,sans-serif"};
const inSt:React.CSSProperties={width:"100%",border:`1px solid ${C.border}`,borderRadius:5,padding:"4px 7px",fontSize:11,fontFamily:"Poppins,sans-serif",color:C.navy,outline:"none",boxSizing:"border-box",background:C.card};
const dateInSt:React.CSSProperties={border:`1px solid ${C.border}`,borderRadius:5,padding:"3px 6px",fontSize:11,fontFamily:"Poppins,sans-serif",color:C.navy,background:C.card};
