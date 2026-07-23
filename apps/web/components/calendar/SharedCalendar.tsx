"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { calendarApi, type CalendarEvent } from "@/lib/calendar-api";
import { resolveJoinLink } from "@/lib/session-link";
import { programsApi, type ProgramDTO } from "@/lib/programs-api";

const ff = { fontFamily: "Poppins, sans-serif" } as const;
const NAVY = "var(--xa-navy)";
const ORANGE = "var(--xa-primary)";
const COACH = "#0891B2";
const INDIGO = "var(--xa-muted)";
const GREEN = "#22c55e";
const CARD = "#fff";
const BORDER = "#E6DED0";
const PAGE = "var(--xa-bg)";
const MUTED = "var(--xa-muted)";
const ALT = "#EFE9DC";

const DAY_HEADERS = ["M", "T", "W", "T", "F", "S", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December",
];

type EventStyle = { label: string; color: string; bg: string };
function eventStyle(s: CalendarEvent): EventStyle {
  if (s.type === "coaching") {
    if (s.session_type === "coaching_group") return { label: "Group Coaching", color: INDIGO, bg: "#4A557314" };
    return { label: "1:1 Coaching", color: COACH, bg: "#0891B214" };
  }
  return { label: "Session", color: ORANGE, bg: "#C8A86014" };
}

function typeTag(s: CalendarEvent): { label: string; color: string } {
  if (s.type === "coaching") {
    if (s.session_type === "coaching_group") return { label: "GROUP", color: INDIGO };
    return { label: "1:1", color: COACH };
  }
  return { label: "SESSION", color: ORANGE };
}

function toYMD(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function platformOf(link?: string): string {
  if (!link) return "Virtual";
  const l = link.toLowerCase();
  if (l.includes("zoom")) return "Zoom";
  if (l.includes("teams")) return "Teams";
  if (l.includes("meet")) return "Meet";
  return "Virtual";
}

function buildGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export type CalendarRole = "superadmin" | "superadmin_secondary" | "program_manager" | "faculty";

interface Props {
  role: CalendarRole;
  orgs?: { id: string; name: string }[];
  today?: Date;
}

export default function SharedCalendar({ role, orgs, today: todayProp }: Props) {
  const [today] = useState(() => todayProp ?? new Date());
  
  // Selected date filter
  const [selected, setSelected] = useState<Date | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [active, setActive] = useState<{ ev: CalendarEvent; x: number; y: number } | null>(null);

  // Filters
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [selectedProgramId, setSelectedProgramId] = useState<string>("");
  const [filterType, setFilterType] = useState<"all" | "session" | "coaching">("all");
  
  const [programs, setPrograms] = useState<ProgramDTO[]>([]);

  useEffect(() => {
    if (role === "superadmin" || role === "superadmin_secondary" || role === "program_manager") {
      programsApi.list(selectedOrgId || undefined)
        .then(r => setPrograms(r.data ?? []))
        .catch(() => setPrograms([]));
    }
  }, [role, selectedOrgId]);

  const displayPrograms = useMemo(() => {
    if (role === "faculty") {
      const map = new Map<string, ProgramDTO>();
      for (const e of events) {
        if (!map.has(e.program_id)) {
          map.set(e.program_id, { id: e.program_id, title: e.program_title } as ProgramDTO);
        }
      }
      return Array.from(map.values());
    }
    return programs;
  }, [role, programs, events]);

  useEffect(() => {
    let alive = true;
    const a = new Date(today); a.setDate(a.getDate() - 90);
    const b = new Date(today); b.setDate(b.getDate() + 120);
    
    calendarApi.getEvents({
      from: toYMD(a), to: toYMD(b),
      orgId: selectedOrgId || undefined,
      programId: selectedProgramId || undefined,
      type: filterType,
    })
      .then((res) => { if (alive) setEvents(res.data ?? []); })
      .catch(() => { if (alive) setEvents([]); });
      
    return () => { alive = false; };
  }, [today, selectedOrgId, selectedProgramId, filterType]);

  function openEvent(ev: CalendarEvent, e: React.MouseEvent) {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let x = r.left, y = r.bottom + 6;
    if (x + 320 > vw - 12) x = vw - 332;
    if (y + 380 > vh - 12) y = Math.max(12, r.top - 386);
    setActive({ ev, x: Math.max(12, x), y });
  }

  const showOrgSwitcher = (role === "superadmin" || role === "superadmin_secondary") && orgs && orgs.length > 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: PAGE }}>
      {/* ── Controls ── Org/Program pickers only - the event-type filter
          ("All Events") moved into the Upcoming Sessions panel's own header
          (see EventList below), since it was the only control left in this
          bar for roles with no org/program picker, making it look like a
          single button stretched across the whole row. */}
      {(showOrgSwitcher || displayPrograms.length > 0) && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", padding: "20px 24px", gap: 12, flexWrap: "wrap", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ display: "flex", gap: 8 }}>
            {showOrgSwitcher && (
              <select value={selectedOrgId} onChange={e => { setSelectedOrgId(e.target.value); setSelectedProgramId(""); }}
                style={{ ...ff, fontSize: 13, color: NAVY, padding: "8px 12px", borderRadius: 8, border: `1px solid ${BORDER}`, background: CARD, outline: "none", cursor: "pointer" }}>
                <option value="">All Organizations</option>
                {orgs!.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            )}

            {displayPrograms.length > 0 && (
              <select value={selectedProgramId} onChange={e => setSelectedProgramId(e.target.value)}
                style={{ ...ff, fontSize: 13, color: NAVY, padding: "8px 12px", borderRadius: 8, border: `1px solid ${BORDER}`, background: CARD, outline: "none", cursor: "pointer", maxWidth: 200 }}>
                <option value="">All Programs</option>
                {displayPrograms.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            )}
          </div>
        </div>
      )}

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "340px minmax(0,1fr)", gap: 16, alignItems: "start", maxWidth: 1200, margin: "0 auto" }}>

          <div style={{ background: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, padding: 20, boxShadow: "0 1px 4px rgba(24, 40, 72,0.04)" }}>
            <MiniCalendar events={events} selected={selected} onSelect={setSelected} today={today} />
          </div>

          <div style={{ background: CARD, borderRadius: 12, border: `1px solid ${BORDER}`, boxShadow: "0 1px 4px rgba(24, 40, 72,0.04)", overflow: "hidden" }}>
             <EventList events={events} selected={selected} onClear={() => setSelected(null)} today={today} onOpen={openEvent} filterType={filterType} onFilterTypeChange={setFilterType} />
          </div>

        </div>
      </div>

      {/* ── Event popover ── */}
      {active && typeof document !== "undefined" &&
        createPortal(
          <>
            <div onClick={() => setActive(null)} style={{ position: "fixed", inset: 0, zIndex: 2000 }} />
            <EventPopover ev={active.ev} x={active.x} y={active.y} onClose={() => setActive(null)} />
          </>,
          document.body,
        )}
    </div>
  );
}

// ── Mini Calendar ──────────────────────────────────────────────────
function MiniCalendar({ events, selected, onSelect, today }: { events: CalendarEvent[]; selected: Date | null; onSelect: (d: Date) => void; today: Date }) {
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const grid = useMemo(() => buildGrid(year, month), [year, month]);

  const byDay = useMemo(() => {
    const map = new Set<string>();
    for (const e of events) map.add(toYMD(new Date(e.scheduled_at)));
    return map;
  }, [events]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <button onClick={() => setCursor(new Date(year, month - 1, 1))} style={{ background: "none", border: "none", cursor: "pointer", color: NAVY, padding: "4px 8px" }}>‹</button>
        <div style={{ ...ff, fontSize: 14, fontWeight: 700, color: NAVY }}>{MONTHS[month]} {year}</div>
        <button onClick={() => setCursor(new Date(year, month + 1, 1))} style={{ background: "none", border: "none", cursor: "pointer", color: NAVY, padding: "4px 8px" }}>›</button>
      </div>
      
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: "4px 0", textAlign: "center" }}>
        {DAY_HEADERS.map((d, i) => (
          <div key={i} style={{ ...ff, fontSize: 11, fontWeight: 700, color: MUTED, marginBottom: 8 }}>{d}</div>
        ))}
        {grid.map((d, i) => {
          const isToday = sameDay(d, today);
          const isSel = selected ? sameDay(d, selected) : false;
          const isOther = d.getMonth() !== month;
          const hasEvent = byDay.has(toYMD(d));
          
          return (
            <div key={i} onClick={() => onSelect(d)}
              style={{
                height: 36, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer",
                background: isSel ? NAVY : "transparent", color: isSel ? "#fff" : isOther ? "#C8CDD8" : NAVY, borderRadius: 8,
                fontWeight: isSel || isToday ? 700 : 500, position: "relative"
              }}>
              <span style={{ fontSize: 13 }}>{d.getDate()}</span>
              {hasEvent && <div style={{ width: 4, height: 4, borderRadius: "50%", background: isSel ? "#fff" : ORANGE, marginTop: 2 }} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Event List ─────────────────────────────────────────────────────
function EventList({ events, selected, onClear, today, onOpen, filterType, onFilterTypeChange }: { events: CalendarEvent[]; selected: Date | null; onClear: () => void; today: Date; onOpen: (ev: CalendarEvent, e: React.MouseEvent) => void; filterType: "all" | "session" | "coaching"; onFilterTypeChange: (t: "all" | "session" | "coaching") => void }) {
  const upcomingOrLive = useMemo(() => {
    return events
      .filter((s) => s.status === "live" || new Date(s.scheduled_at) >= startOfDay(today))
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [events, today]);

  const listed = useMemo(() => {
    if (!selected) return upcomingOrLive;
    return events
      .filter(s => sameDay(new Date(s.scheduled_at), selected))
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  }, [selected, events, upcomingOrLive]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <div style={{ padding: "16px 20px", borderBottom: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FAFBFC" }}>
        <div>
          <h3 style={{ ...ff, fontSize: 15, fontWeight: 700, color: NAVY, margin: 0 }}>
            {selected ? new Date(selected).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }) : "Upcoming & Live Sessions"}
          </h3>
          <div style={{ ...ff, fontSize: 12, color: MUTED, marginTop: 2 }}>
            {listed.length} session{listed.length === 1 ? "" : "s"}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <select value={filterType} onChange={e => onFilterTypeChange(e.target.value as any)}
            style={{ ...ff, fontSize: 12, color: NAVY, padding: "6px 10px", borderRadius: 6, border: `1px solid ${BORDER}`, background: CARD, outline: "none", cursor: "pointer" }}>
            <option value="all">All Events</option>
            <option value="session">Live Sessions</option>
            <option value="coaching">Coaching Sessions</option>
          </select>
          {selected && (
            <button onClick={onClear} style={{ ...ff, fontSize: 12, fontWeight: 600, color: NAVY, background: CARD, border: `1px solid ${BORDER}`, padding: "6px 12px", borderRadius: 6, cursor: "pointer" }}>
              ‹ Back to all upcoming
            </button>
          )}
        </div>
      </div>
      
      <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
        {listed.length > 0 ? (
          listed.map((ev, i) => <EventRow key={ev.id} ev={ev} last={i === listed.length - 1} onOpen={onOpen} />)
        ) : (
          <div style={{ padding: 40, textAlign: "center", ...ff, fontSize: 13, color: MUTED }}>
            {selected ? "No sessions on this day." : "No upcoming or live sessions."}
          </div>
        )}
      </div>
    </div>
  );
}

function EventRow({ ev, last, onOpen }: { ev: CalendarEvent; last: boolean; onOpen: (ev: CalendarEvent, e: React.MouseEvent) => void }) {
  const tag = typeTag(ev);
  const joinLink = resolveJoinLink(ev.meeting_type, ev.join_url, ev.virtual_link);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 20px", borderBottom: last ? "none" : `1px solid ${ALT}`, cursor: "pointer" }} onClick={(e) => onOpen(ev, e)}>
      <div style={{ width: 60, minWidth: 60, textAlign: "center", flexShrink: 0 }}>
        <div style={{ ...ff, fontSize: 11, fontWeight: 700, color: ORANGE }}>{new Date(ev.scheduled_at).toLocaleDateString([], { month: "short", day: "numeric" })}</div>
        <div style={{ ...ff, fontSize: 12, fontWeight: 800, color: NAVY, marginTop: 2 }}>{clockTime(ev.scheduled_at)}</div>
      </div>
      
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...ff, fontSize: 14, fontWeight: 700, color: NAVY }}>{ev.title}</div>
        <div style={{ ...ff, fontSize: 12, color: MUTED, marginTop: 1 }}>{ev.program_title} {ev.cohort_name ? `· ${ev.cohort_name}` : ""}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <span style={{ ...ff, fontSize: 9, fontWeight: 700, color: tag.color, background: `${tag.color}14`, borderRadius: 20, padding: "2px 6px" }}>{tag.label}</span>
          <span style={{ ...ff, fontSize: 11, color: MUTED }}>{ev.duration_mins}min · {platformOf(ev.virtual_link)}</span>
        </div>
      </div>
      
      <div style={{ flexShrink: 0 }}>
        {ev.status === "live_now" && joinLink ? (
          <a href={joinLink} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ ...ff, textDecoration: "none", padding: "8px 16px", background: ORANGE, color: "#fff", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Join</a>
        ) : (
          <button disabled title={ev.status === "live_now" ? undefined : "Starts when live"}
            style={{ ...ff, padding: "8px 16px", background: MUTED, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "not-allowed", opacity: 0.6 }}>Join</button>
        )}
      </div>
    </div>
  );
}

// ── Popover ───────────────────────────────────────────────────────
function EventPopover({ ev, x, y, onClose }: { ev: CalendarEvent; x: number; y: number; onClose: () => void }) {
  const d = new Date(ev.scheduled_at);
  const dateStr = d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
  const joinLink = resolveJoinLink(ev.meeting_type, ev.join_url, ev.virtual_link);
  
  return (
    <div onClick={e => e.stopPropagation()}
      style={{ position: "fixed", left: x, top: y, width: 320, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12,
        boxShadow: "0 12px 32px rgba(24, 40, 72,0.12)", overflow: "hidden", zIndex: 2001, animation: "pop .15s cubic-bezier(0,0,.2,1)" }}>
      <div style={{ borderLeft: `4px solid ${ev.program_color}`, padding: "18px 20px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div style={{ ...ff, fontSize: 11, fontWeight: 700, color: ev.program_color, letterSpacing: 0.5, textTransform: "uppercase" }}>{typeTag(ev).label}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 16, color: MUTED, cursor: "pointer", padding: 0, lineHeight: 1 }}>✕</button>
        </div>
        
        <div style={{ ...ff, fontSize: 16, fontWeight: 700, color: NAVY, lineHeight: 1.3, marginBottom: 4 }}>{ev.title}</div>
        <div style={{ ...ff, fontSize: 13, color: MUTED }}>{dateStr} · {clockTime(ev.scheduled_at)}</div>
        
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: `1px solid ${ALT}`, display: "flex", flexDirection: "column", gap: 10 }}>
          <MetaRow label="Program" val={ev.program_title} />
          {ev.cohort_name && <MetaRow label="Cohort" val={ev.cohort_name} />}
          {ev.faculty_name && <MetaRow label="Faculty" val={ev.faculty_name} />}
          {ev.coach_name && <MetaRow label="Coach" val={ev.coach_name} />}
          <MetaRow label="Org" val={ev.org_name} />
          <MetaRow label="Enrolled" val={`${ev.participant_count} learners`} />
        </div>
        
        {ev.status === "live_now" && joinLink && (
          <div style={{ marginTop: 20 }}>
            <a href={joinLink} target="_blank" rel="noreferrer" style={{ ...ff, textDecoration: "none", display: "block", textAlign: "center", padding: "10px 0", background: ORANGE, color: "#fff", borderRadius: 8, fontSize: 13, fontWeight: 700 }}>
              Join Live Meeting
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function MetaRow({ label, val }: { label: string; val: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <div style={{ ...ff, fontSize: 12, color: MUTED, width: 64, flexShrink: 0 }}>{label}</div>
      <div style={{ ...ff, fontSize: 12, color: NAVY, fontWeight: 500, flex: 1 }}>{val}</div>
    </div>
  );
}
