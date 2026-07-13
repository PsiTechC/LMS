"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { coachApi, type CoachSessionDTO, type CoachBlockDTO } from "@/lib/coach-api";
import type { CoachingEngagementDTO } from "@/lib/coaching-admin-api";
// Same call the faculty flow uses (Phase 5) — no coach-specific start
// function. The backend decides Zoom-vs-no-op from the session's own
// meeting_type; this component doesn't need to branch on it before calling.
import { sessionsApi } from "@/lib/faculty-api";
import { resolveJoinLink } from "@/lib/session-link";

// ── Design tokens (apps/CLAUDE.md) ────────────────────────────────
const ff = { fontFamily: "Poppins, sans-serif" } as const;
const NAVY = "#1C2551";
const ORANGE = "#EF4E24";
const COACH = "#0891B2";
const INDIGO = "#6B73BF";
const GREEN = "#22c55e";
const CARD = "#fff";
const BORDER = "#EAECF4";
const PAGE = "#F5F7FB";
const MUTED = "#8b90a7";
const ALT = "#F0F1F7";

const DAY_HEADERS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// ── Event-type styling by session_type ────────────────────────────
type EventStyle = { label: string; color: string; bg: string };
function eventStyle(s: CoachSessionDTO): EventStyle {
  if (s.session_type === "coaching_group") return { label: "Group Coaching", color: INDIGO, bg: "#6B73BF14" };
  if (s.session_type === "coaching_individual") return { label: "1:1 Coaching", color: COACH, bg: "#0891B214" };
  return { label: "Session", color: ORANGE, bg: "#EF4E2414" };
}
function typeTag(s: CoachSessionDTO): { label: string; color: string } {
  if (s.session_type === "coaching_group" || s.engagement_type === "group") return { label: "GROUP", color: INDIGO };
  if (s.session_type === "coaching_individual" || s.engagement_type === "individual") return { label: "1:1", color: COACH };
  return { label: "SESSION", color: MUTED };
}

// ── Date helpers (all local time) ─────────────────────────────────
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
function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" });
}
function platformOf(link?: string): string {
  if (!link) return "Virtual";
  const l = link.toLowerCase();
  if (l.includes("zoom")) return "Zoom";
  if (l.includes("teams")) return "Teams";
  if (l.includes("meet")) return "Meet";
  return "Virtual";
}
function coacheeLabel(s: CoachSessionDTO): string {
  if (s.engagement_type === "group") return s.engagement_name || s.cohort_name || "Group";
  return s.coachee_name || s.title;
}
function rangeLabel(a: Date, b: Date): string {
  const mon = MONTHS[a.getMonth()].slice(0, 3).toUpperCase();
  if (a.getMonth() === b.getMonth()) return `${mon} ${a.getDate()}–${b.getDate()}`;
  return `${mon} ${a.getDate()} – ${MONTHS[b.getMonth()].slice(0, 3).toUpperCase()} ${b.getDate()}`;
}

// Build the 42-cell month grid, Monday-first.
function buildGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // days since Monday
  const start = new Date(year, month, 1 - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

interface Props {
  today?: Date; // injectable for testing; defaults to now on the client
}

export default function CoachCalendar({ today: todayProp }: Props) {
  const [today] = useState(() => todayProp ?? new Date());
  const [view, setView] = useState<"list" | "month">("list");
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selected, setSelected] = useState<Date>(today);
  const [events, setEvents] = useState<CoachSessionDTO[]>([]);
  const [blocks, setBlocks] = useState<CoachBlockDTO[]>([]);
  const [active, setActive] = useState<{ ev: CoachSessionDTO; x: number; y: number } | null>(null);

  // Block-time modal
  const [blockOpen, setBlockOpen] = useState(false);
  const [blockDate, setBlockDate] = useState(toYMD(today));
  const [blockTime, setBlockTime] = useState("09:00");
  const [blockDuration, setBlockDuration] = useState(60);
  const [blockLabel, setBlockLabel] = useState("");
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockError, setBlockError] = useState("");

  // Schedule Session modal
  const [scheduleOpen, setScheduleOpen] = useState(false);

  async function reloadCalendar() {
    let from: string, to: string;
    if (view === "month") {
      from = toYMD(grid[0]);
      to = toYMD(grid[grid.length - 1]);
    } else {
      const a = new Date(today); a.setDate(a.getDate() - 90);
      const b = new Date(today); b.setDate(b.getDate() + 120);
      from = toYMD(a); to = toYMD(b);
    }
    try {
      const res = await coachApi.calendar(from, to);
      setEvents(res.data ?? []);
    } catch {
      setEvents([]);
    }
  }

  const grid = useMemo(() => buildGrid(year, month), [year, month]);

  async function reloadBlocks() {
    const a = new Date(today); a.setDate(a.getDate() - 120);
    const b = new Date(today); b.setDate(b.getDate() + 120);
    try {
      const r = await coachApi.blocks(toYMD(a), toYMD(b));
      setBlocks(r.data ?? []);
    } catch {
      setBlocks([]);
    }
  }

  async function submitBlock() {
    setBlockBusy(true);
    setBlockError("");
    try {
      const blockedAt = new Date(`${blockDate}T${blockTime}:00`).toISOString();
      await coachApi.createBlock({ blocked_at: blockedAt, duration_mins: blockDuration, label: blockLabel.trim() });
      await reloadBlocks();
      setBlockOpen(false);
      setBlockLabel("");
    } catch (e: unknown) {
      setBlockError(e instanceof Error ? e.message : "Failed to block time");
    } finally {
      setBlockBusy(false);
    }
  }

  async function removeBlock(id: string) {
    setBlocks((bs) => bs.filter((b) => b.id !== id)); // optimistic
    try {
      await coachApi.deleteBlock(id);
    } catch {
      reloadBlocks();
    }
  }

  useEffect(() => { reloadBlocks(); }, [today]);

  // Fetch sessions: the visible grid in month view, a wide window in list view.
  useEffect(() => {
    let alive = true;
    let from: string, to: string;
    if (view === "month") {
      from = toYMD(grid[0]);
      to = toYMD(grid[grid.length - 1]);
    } else {
      const a = new Date(today); a.setDate(a.getDate() - 90);
      const b = new Date(today); b.setDate(b.getDate() + 120);
      from = toYMD(a); to = toYMD(b);
    }
    coachApi.calendar(from, to)
      .then((res) => { if (alive) setEvents(res.data ?? []); })
      .catch(() => { if (alive) setEvents([]); });
    return () => { alive = false; };
  }, [view, grid, today]);

  function openEvent(ev: CoachSessionDTO, e: React.MouseEvent) {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let x = r.left, y = r.bottom + 6;
    if (x + 320 > vw - 12) x = vw - 332;
    if (y + 380 > vh - 12) y = Math.max(12, r.top - 386);
    setActive({ ev, x: Math.max(12, x), y });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: PAGE }}>
      {/* ── Controls ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 0", gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", background: ALT, borderRadius: 8, padding: 3, gap: 2 }}>
          {(["list", "month"] as const).map((v) => {
            const activeV = view === v;
            return (
              <button key={v} onClick={() => setView(v)}
                style={{ ...ff, padding: "7px 18px", borderRadius: 6, fontSize: 12, fontWeight: activeV ? 700 : 500,
                  border: "none", background: activeV ? COACH : "transparent", color: activeV ? "#fff" : MUTED,
                  cursor: "pointer", boxShadow: activeV ? "0 1px 3px rgba(0,0,0,.12)" : "none" }}>
                {v === "list" ? "List View" : "Month View"}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={() => { setBlockDate(toYMD(today)); setBlockError(""); setBlockOpen(true); }}
            style={{ ...ff, display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12, fontWeight: 600, color: NAVY, cursor: "pointer" }}>
            ◉ Block Time
          </button>
          <button onClick={() => setScheduleOpen(true)}
            style={{ ...ff, background: COACH, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
            + Schedule Session
          </button>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, overflowY: "auto", padding: 24 }}>
        {view === "list" ? (
          <ListView events={events} blocks={blocks} today={today} onOpen={openEvent} onRemoveBlock={removeBlock} />
        ) : (
          <MonthGrid grid={grid} year={year} month={month} today={today} selected={selected} events={events}
            onSelect={setSelected} onOpen={openEvent}
            onPrev={() => { setMonth((m) => (m === 0 ? 11 : m - 1)); setYear((y) => (month === 0 ? y - 1 : y)); }}
            onNext={() => { setMonth((m) => (m === 11 ? 0 : m + 1)); setYear((y) => (month === 11 ? y + 1 : y)); }}
            onToday={() => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelected(today); }} />
        )}
      </div>

      {/* ── Event popover (portaled) ── */}
      {active && typeof document !== "undefined" &&
        createPortal(
          <>
            <div onClick={() => setActive(null)} style={{ position: "fixed", inset: 0, zIndex: 2000 }} />
            <EventPopover ev={active.ev} x={active.x} y={active.y} onClose={() => setActive(null)}
              onStarted={updated => {
                setActive(a => a ? { ...a, ev: updated } : a);
                setEvents(evs => evs.map(e => e.id === updated.id ? updated : e));
              }} />
          </>,
          document.body,
        )}

      {/* ── Block Time modal (portaled) ── */}
      {blockOpen && typeof document !== "undefined" &&
        createPortal(
          <div onClick={() => setBlockOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ ...ff, background: CARD, borderRadius: 16, width: 480, maxWidth: "100%", boxShadow: "0 24px 64px rgba(28,37,81,0.22)", overflow: "hidden" }}>
              <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${BORDER}` }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>Block Calendar Time</div>
                <button onClick={() => setBlockOpen(false)} style={{ ...ff, background: "none", border: "none", fontSize: 18, color: MUTED, cursor: "pointer" }}>✕</button>
              </div>
              <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
                <div>
                  <label style={blkLabel}>Date</label>
                  <input type="date" value={blockDate} onChange={(e) => setBlockDate(e.target.value)} style={blkInput} />
                </div>
                <div>
                  <label style={blkLabel}>Time</label>
                  <input type="time" value={blockTime} onChange={(e) => setBlockTime(e.target.value)} style={blkInput} />
                </div>
                <div>
                  <label style={blkLabel}>Duration</label>
                  <select value={blockDuration} onChange={(e) => setBlockDuration(Number(e.target.value))} style={blkInput}>
                    <option value={30}>30 minutes</option>
                    <option value={60}>1 hour</option>
                    <option value={90}>1.5 hours</option>
                    <option value={120}>2 hours</option>
                  </select>
                </div>
                <div>
                  <label style={blkLabel}>Label (optional)</label>
                  <input value={blockLabel} onChange={(e) => setBlockLabel(e.target.value)} placeholder="e.g. Preparation time, Personal" style={blkInput} />
                </div>
                {blockError && (
                  <div style={{ ...ff, fontSize: 12, color: "#ef4444", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "9px 12px" }}>{blockError}</div>
                )}
              </div>
              <div style={{ padding: "14px 24px", borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "flex-end", gap: 10 }}>
                <button onClick={() => setBlockOpen(false)} style={{ ...ff, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 18px", fontSize: 12, fontWeight: 600, color: NAVY, cursor: "pointer" }}>Cancel</button>
                <button onClick={submitBlock} disabled={blockBusy}
                  style={{ ...ff, background: COACH, color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 12, fontWeight: 700, cursor: blockBusy ? "not-allowed" : "pointer", opacity: blockBusy ? 0.7 : 1 }}>
                  {blockBusy ? "Blocking…" : "Block Time"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* ── Schedule Session modal (portaled) ── */}
      {scheduleOpen && typeof document !== "undefined" &&
        createPortal(
          <ScheduleSessionModal today={today} onClose={() => setScheduleOpen(false)} onScheduled={() => { setScheduleOpen(false); reloadCalendar(); }} />,
          document.body,
        )}
    </div>
  );
}

// ── Schedule Session modal ─────────────────────────────────────────
// Step 1: pick which engagement (coachee / group) this session is for.
// Step 2: pick a date from a compact calendar + time, duration.
// Step 3: virtual (auto join-link) or in-person (venue text).
function ScheduleSessionModal({ today, onClose, onScheduled }: {
  today: Date; onClose: () => void; onScheduled: () => void;
}) {
  const [engagements, setEngagements] = useState<CoachingEngagementDTO[]>([]);
  const [loadingEng, setLoadingEng] = useState(true);
  const [step, setStep] = useState(1);
  const [engagementId, setEngagementId] = useState("");
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth());
  const [date, setDate] = useState(toYMD(today));
  const [time, setTime] = useState("10:00");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(60);
  const [sessionType, setSessionType] = useState<"virtual" | "in_person">("virtual");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    coachApi.engagements()
      .then((r) => setEngagements((r.data ?? []).filter((e) => e.status === "active" || e.status === "scheduled")))
      .catch(() => setEngagements([]))
      .finally(() => setLoadingEng(false));
  }, []);

  const engagement = engagements.find((e) => e.id === engagementId) || null;
  const grid = useMemo(() => buildGrid(calYear, calMonth), [calYear, calMonth]);

  function engagementLabel(e: CoachingEngagementDTO): string {
    if (e.assignment_type === "group") return e.name || e.cohort_name || "Group Coaching";
    return e.participants[0]?.name || e.name || "Individual Coaching";
  }

  async function submit() {
    if (!engagement) return;
    setSaving(true);
    setError("");
    try {
      const scheduledAt = new Date(`${date}T${time}:00`).toISOString();
      await coachApi.createSession({
        engagement_id: engagement.id,
        title: title.trim() || engagementLabel(engagement),
        scheduled_at: scheduledAt,
        duration_mins: duration,
        session_type: sessionType,
        location: sessionType === "in_person" ? location.trim() : undefined,
      });
      onScheduled();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to schedule session");
      setSaving(false);
    }
  }

  const canNext1 = !!engagementId;
  const canSubmit = !!date && !!time && (sessionType === "virtual" || location.trim().length > 0);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(28,37,81,0.5)", zIndex: 2500, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ ...ff, background: CARD, borderRadius: 16, width: 480, maxWidth: "100%", boxShadow: "0 24px 64px rgba(28,37,81,0.22)", overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${BORDER}` }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: NAVY }}>Schedule Session</div>
          <button onClick={onClose} style={{ ...ff, background: "none", border: "none", fontSize: 18, color: MUTED, cursor: "pointer" }}>✕</button>
        </div>

        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16, maxHeight: "70vh", overflowY: "auto" }}>
          {step === 1 && (
            <>
              <label style={blkLabel}>Coachee / Group</label>
              {loadingEng ? (
                <div style={{ ...ff, fontSize: 12, color: MUTED, padding: "12px 0" }}>Loading your engagements…</div>
              ) : engagements.length === 0 ? (
                <div style={{ ...ff, fontSize: 12, color: MUTED, padding: "12px 0" }}>No active engagements yet — you'll be able to schedule once a coachee is assigned to you.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {engagements.map((e) => {
                    const active = engagementId === e.id;
                    return (
                      <button key={e.id} onClick={() => setEngagementId(e.id)}
                        style={{ ...ff, textAlign: "left", padding: "10px 14px", borderRadius: 8, cursor: "pointer",
                          border: `1.5px solid ${active ? COACH : BORDER}`, background: active ? `${COACH}0D` : "#fff" }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>{engagementLabel(e)}</div>
                        <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>
                          {e.assignment_type === "group" ? `Group · ${e.participants.length} coachees` : "1:1 Individual"} · {e.program_title}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <label style={blkLabel}>Session Title (optional)</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={engagement ? engagementLabel(engagement) : "Session title"} style={blkInput} />

              <label style={blkLabel}>Date</label>
              <div style={{ border: `1px solid ${BORDER}`, borderRadius: 10, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", background: PAGE }}>
                  <NavBtn onClick={() => { setCalMonth((m) => (m === 0 ? 11 : m - 1)); setCalYear((y) => (calMonth === 0 ? y - 1 : y)); }}>‹</NavBtn>
                  <span style={{ ...ff, fontSize: 12, fontWeight: 700, color: NAVY }}>{MONTHS[calMonth]} {calYear}</span>
                  <NavBtn onClick={() => { setCalMonth((m) => (m === 11 ? 0 : m + 1)); setCalYear((y) => (calMonth === 11 ? y + 1 : y)); }}>›</NavBtn>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "6px 6px 2px" }}>
                  {DAY_HEADERS.map((d) => <div key={d} style={{ ...ff, fontSize: 9, fontWeight: 700, color: MUTED, textAlign: "center", padding: "2px 0" }}>{d[0]}</div>)}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", padding: "0 6px 8px" }}>
                  {grid.map((d, i) => {
                    const isOther = d.getMonth() !== calMonth;
                    const isSel = toYMD(d) === date;
                    const isPast = startOfDay(d) < startOfDay(today);
                    return (
                      <button key={i} disabled={isPast} onClick={() => setDate(toYMD(d))}
                        style={{ ...ff, aspectRatio: "1", margin: 1, border: "none", borderRadius: 6, fontSize: 11,
                          cursor: isPast ? "not-allowed" : "pointer",
                          color: isSel ? "#fff" : isPast ? "#D0D3E0" : isOther ? "#C8CDD8" : NAVY,
                          background: isSel ? COACH : "transparent", fontWeight: isSel ? 700 : 400 }}>
                        {d.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={blkLabel}>Time</label>
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={blkInput} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={blkLabel}>Duration</label>
                  <select value={duration} onChange={(e) => setDuration(Number(e.target.value))} style={blkInput}>
                    <option value={30}>30 minutes</option>
                    <option value={45}>45 minutes</option>
                    <option value={60}>1 hour</option>
                    <option value={90}>1.5 hours</option>
                  </select>
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <label style={blkLabel}>Format</label>
              <div style={{ display: "flex", gap: 8 }}>
                {(["virtual", "in_person"] as const).map((t) => {
                  const active = sessionType === t;
                  return (
                    <button key={t} onClick={() => setSessionType(t)}
                      style={{ ...ff, flex: 1, padding: "10px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 700,
                        border: `1.5px solid ${active ? COACH : BORDER}`, background: active ? `${COACH}0D` : "#fff", color: active ? COACH : MUTED }}>
                      {t === "virtual" ? "🎥 Virtual" : "🏛 In-Person"}
                    </button>
                  );
                })}
              </div>
              {sessionType === "virtual" ? (
                <div style={{ ...ff, fontSize: 11, color: MUTED, background: PAGE, borderRadius: 8, padding: "10px 12px" }}>
                  🔗 A meeting link will be generated automatically and shown to your coachee(s) from their Coaching tab.
                </div>
              ) : (
                <div>
                  <label style={blkLabel}>Location</label>
                  <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Conference Room 3B, HQ" style={blkInput} />
                </div>
              )}
              {error && (
                <div style={{ ...ff, fontSize: 12, color: "#ef4444", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "9px 12px" }}>{error}</div>
              )}
            </>
          )}
        </div>

        <div style={{ padding: "14px 24px", borderTop: `1px solid ${BORDER}`, display: "flex", justifyContent: "space-between", gap: 10 }}>
          <button onClick={() => (step === 1 ? onClose() : setStep((s) => s - 1))} disabled={saving}
            style={{ ...ff, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 18px", fontSize: 12, fontWeight: 600, color: NAVY, cursor: "pointer" }}>
            {step === 1 ? "Cancel" : "Back"}
          </button>
          {step < 3 ? (
            <button onClick={() => setStep((s) => s + 1)} disabled={step === 1 && !canNext1}
              style={{ ...ff, background: COACH, color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 12, fontWeight: 700, cursor: (step === 1 && !canNext1) ? "not-allowed" : "pointer", opacity: (step === 1 && !canNext1) ? 0.5 : 1 }}>
              Next
            </button>
          ) : (
            <button onClick={submit} disabled={saving || !canSubmit}
              style={{ ...ff, background: COACH, color: "#fff", border: "none", borderRadius: 8, padding: "9px 20px", fontSize: 12, fontWeight: 700, cursor: (saving || !canSubmit) ? "not-allowed" : "pointer", opacity: (saving || !canSubmit) ? 0.6 : 1 }}>
              {saving ? "Scheduling…" : "Schedule Session"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const blkLabel: React.CSSProperties = { ...ff, fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6, display: "block" };
const blkInput: React.CSSProperties = { ...ff, width: "100%", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "9px 12px", fontSize: 13, color: NAVY, outline: "none", boxSizing: "border-box", background: CARD };

// ── List View ─────────────────────────────────────────────────────
type ListItem = { date: Date; session?: CoachSessionDTO; block?: CoachBlockDTO };

function ListView({ events, blocks, today, onOpen, onRemoveBlock }: {
  events: CoachSessionDTO[]; blocks: CoachBlockDTO[]; today: Date;
  onOpen: (ev: CoachSessionDTO, e: React.MouseEvent) => void; onRemoveBlock: (id: string) => void;
}) {
  const groups = useMemo(() => {
    const t0 = startOfDay(today);
    const dow = t0.getDay(); // 0 Sun..6 Sat
    const daysToSun = (7 - dow) % 7;
    const endThisWeek = new Date(t0); endThisWeek.setDate(t0.getDate() + daysToSun); endThisWeek.setHours(23, 59, 59, 999);
    const startNextWeek = new Date(endThisWeek); startNextWeek.setDate(endThisWeek.getDate() + 1); startNextWeek.setHours(0, 0, 0, 0);
    const endNextWeek = new Date(startNextWeek); endNextWeek.setDate(startNextWeek.getDate() + 6); endNextWeek.setHours(23, 59, 59, 999);

    const items: ListItem[] = [
      ...events.map((s) => ({ date: new Date(s.scheduled_at), session: s })),
      ...blocks.map((b) => ({ date: new Date(b.blocked_at), block: b })),
    ];
    const thisWeek: ListItem[] = [], nextWeek: ListItem[] = [], later: ListItem[] = [], past: ListItem[] = [];
    for (const it of items) {
      if (it.date < t0) past.push(it);
      else if (it.date <= endThisWeek) thisWeek.push(it);
      else if (it.date <= endNextWeek) nextWeek.push(it);
      else later.push(it);
    }
    const asc = (a: ListItem, b: ListItem) => a.date.getTime() - b.date.getTime();
    thisWeek.sort(asc); nextWeek.sort(asc); later.sort(asc);
    past.sort((a, b) => b.date.getTime() - a.date.getTime());
    return {
      thisWeek, nextWeek, later, past,
      thisWeekLabel: `THIS WEEK — ${rangeLabel(t0, endThisWeek)}`,
      nextWeekLabel: `NEXT WEEK — ${rangeLabel(startNextWeek, endNextWeek)}`,
    };
  }, [events, blocks, today]);

  const total = groups.thisWeek.length + groups.nextWeek.length + groups.later.length + groups.past.length;
  const t0 = startOfDay(today);
  const renderItem = (it: ListItem, last: boolean) => {
    if (it.block) return <BlockRow key={it.block.id} b={it.block} onRemove={onRemoveBlock} />;
    if (it.session) {
      return it.date < t0
        ? <PastRow key={it.session.id} s={it.session} last={last} />
        : <UpcomingRow key={it.session.id} s={it.session} last={last} onOpen={onOpen} />;
    }
    return null;
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 1100 }}>
      {total === 0 && (
        <div style={{ ...ff, fontSize: 13, color: MUTED, padding: 24, textAlign: "center", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12 }}>
          No sessions scheduled.
        </div>
      )}
      <Group label={groups.thisWeekLabel} items={groups.thisWeek} render={renderItem} />
      <Group label={groups.nextWeekLabel} items={groups.nextWeek} render={renderItem} />
      <Group label="LATER" items={groups.later} render={renderItem} />
      <Group label="PAST SESSIONS" items={groups.past} render={renderItem} />
    </div>
  );
}

function Group({ label, items, render }: { label: string; items: ListItem[]; render: (it: ListItem, last: boolean) => React.ReactNode }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div style={{ ...ff, fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 0.5, margin: "0 0 10px 4px" }}>{label}</div>
      <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, boxShadow: "0 1px 4px rgba(28,37,81,0.07)", overflow: "hidden", padding: "0 0 2px" }}>
        {items.map((it, i) => render(it, i === items.length - 1))}
      </div>
    </div>
  );
}

function BlockRow({ b, onRemove }: { b: CoachBlockDTO; onRemove: (id: string) => void }) {
  const d = new Date(b.blocked_at);
  const dur = b.duration_mins >= 60 ? `${b.duration_mins / 60} hour${b.duration_mins >= 120 ? "s" : ""}` : `${b.duration_mins} min`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 16px", margin: "8px 12px", border: `1px dashed ${ORANGE}`, borderRadius: 8, background: `${ORANGE}08` }}>
      <div style={{ width: 84, minWidth: 84, textAlign: "center", flexShrink: 0 }}>
        <div style={{ ...ff, fontSize: 10, fontWeight: 700, color: ORANGE, letterSpacing: 0.5 }}>BLOCKED</div>
        <div style={{ ...ff, fontSize: 13, fontWeight: 800, color: ORANGE, marginTop: 2 }}>{d.toLocaleDateString([], { month: "short", day: "numeric" })}</div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...ff, fontSize: 15, fontWeight: 700, color: ORANGE }}>{b.label || "Blocked Time"}</div>
        <div style={{ ...ff, fontSize: 12, color: MUTED, marginTop: 2 }}>{clockTime(b.blocked_at)} · {dur}</div>
      </div>
      <button onClick={() => onRemove(b.id)}
        style={{ ...ff, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 16px", fontSize: 12, fontWeight: 600, color: NAVY, cursor: "pointer", flexShrink: 0 }}>
        Remove
      </button>
    </div>
  );
}

function DateBlock({ iso, muted }: { iso: string; muted?: boolean }) {
  const d = new Date(iso);
  return (
    <div style={{ width: 88, minWidth: 88, textAlign: "center", flexShrink: 0 }}>
      <div style={{ ...ff, fontSize: 12, fontWeight: 700, color: muted ? MUTED : COACH }}>{d.toLocaleDateString([], { month: "short", day: "numeric" })}</div>
      <div style={{ ...ff, fontSize: 13, fontWeight: 800, color: muted ? MUTED : NAVY, marginTop: 2 }}>{clockTime(iso)}</div>
    </div>
  );
}

function UpcomingRow({ s, last, onOpen }: { s: CoachSessionDTO; last: boolean; onOpen: (ev: CoachSessionDTO, e: React.MouseEvent) => void }) {
  const tag = typeTag(s);
  const joinLink = resolveJoinLink(s.meeting_type, s.join_url, s.virtual_link);
  const inviteHref = `mailto:?subject=${encodeURIComponent(`Coaching Session: ${s.title}`)}&body=${encodeURIComponent(`${coacheeLabel(s)} — ${s.title}\n${shortDate(s.scheduled_at)} ${clockTime(s.scheduled_at)} · ${s.duration_mins}min\n${joinLink ?? ""}`)}`;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 18px", borderBottom: last ? "none" : `1px solid ${ALT}` }}>
      <DateBlock iso={s.scheduled_at} />
      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={(e) => onOpen(s, e)}>
        <div style={{ ...ff, fontSize: 15, fontWeight: 700, color: NAVY }}>{coacheeLabel(s)}</div>
        <div style={{ ...ff, fontSize: 13, color: MUTED, marginTop: 1 }}>{s.title}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
          <span style={{ ...ff, fontSize: 10, fontWeight: 700, color: tag.color, background: `${tag.color}14`, borderRadius: 20, padding: "2px 8px" }}>{tag.label}</span>
          <span style={{ ...ff, fontSize: 11, color: MUTED }}>{s.duration_mins}min · {platformOf(s.virtual_link)}</span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, flexShrink: 0 }}>
        <a href={inviteHref} style={{ ...ff, textDecoration: "none", display: "flex", alignItems: "center", gap: 5, padding: "8px 16px", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12, fontWeight: 600, color: NAVY, cursor: "pointer" }}>✉ Invite</a>
        {joinLink ? (
          <a href={joinLink} target="_blank" rel="noreferrer" style={{ ...ff, textDecoration: "none", padding: "8px 20px", background: COACH, color: "#fff", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Join</a>
        ) : (
          <button style={{ ...ff, padding: "8px 20px", background: COACH, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Join</button>
        )}
      </div>
    </div>
  );
}

function PastRow({ s, last }: { s: CoachSessionDTO; last: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "16px 18px", borderBottom: last ? "none" : `1px solid ${ALT}`, background: "#FCFCFD" }}>
      <DateBlock iso={s.scheduled_at} muted />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...ff, fontSize: 14, fontWeight: 700, color: "#6b7189" }}>{coacheeLabel(s)} — {s.title}</div>
        {s.notes && <div style={{ ...ff, fontSize: 12, color: MUTED, marginTop: 2 }}>{s.notes}</div>}
      </div>
      <span style={{ ...ff, fontSize: 10, fontWeight: 700, color: GREEN, background: `${GREEN}14`, borderRadius: 20, padding: "3px 10px", flexShrink: 0 }}>DONE</span>
    </div>
  );
}

// ── Month grid (full-width) ───────────────────────────────────────
function MonthGrid({ grid, year, month, today, selected, events, onSelect, onOpen, onPrev, onNext, onToday }: {
  grid: Date[]; year: number; month: number; today: Date; selected: Date; events: CoachSessionDTO[];
  onSelect: (d: Date) => void; onOpen: (ev: CoachSessionDTO, e: React.MouseEvent) => void;
  onPrev: () => void; onNext: () => void; onToday: () => void;
}) {
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginBottom: 14 }}>
        <NavBtn onClick={onPrev}>‹</NavBtn>
        <h2 style={{ ...ff, fontSize: 17, fontWeight: 700, color: NAVY, minWidth: 150, textAlign: "center" }}>{MONTHS[month]} {year}</h2>
        <NavBtn onClick={onNext}>›</NavBtn>
        <button onClick={onToday} style={{ ...ff, padding: "6px 14px", background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12, fontWeight: 600, color: NAVY, cursor: "pointer" }}>Today</button>
      </div>
      <MonthCells grid={grid} month={month} today={today} selected={selected} events={events} onSelect={onSelect} onOpen={onOpen} />
    </div>
  );
}

function MonthCells({ grid, month, today, selected, events, onSelect, onOpen }: {
  grid: Date[]; month: number; today: Date; selected: Date; events: CoachSessionDTO[];
  onSelect: (d: Date) => void; onOpen: (ev: CoachSessionDTO, e: React.MouseEvent) => void;
}) {
  const byDay = useMemo(() => {
    const map = new Map<string, CoachSessionDTO[]>();
    for (const e of events) {
      const key = toYMD(new Date(e.scheduled_at));
      const arr = map.get(key) ?? [];
      arr.push(e);
      map.set(key, arr);
    }
    return map;
  }, [events]);

  return (
    <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 1px 4px rgba(28,37,81,0.07)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: `1px solid ${BORDER}`, background: PAGE }}>
        {DAY_HEADERS.map((d) => (
          <div key={d} style={{ ...ff, padding: "10px 0", textAlign: "center", fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase" }}>{d}</div>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)" }}>
        {grid.map((d, i) => {
          const isToday = sameDay(d, today);
          const isSel = sameDay(d, selected);
          const isOther = d.getMonth() !== month;
          const dayEvents = byDay.get(toYMD(d)) ?? [];
          return (
            <div key={i} onClick={() => onSelect(d)}
              style={{ minHeight: 116, padding: 8, borderRight: `1px solid ${ALT}`, borderBottom: `1px solid ${ALT}`, cursor: "pointer",
                background: isOther ? "#FAFBFC" : CARD, outline: isSel ? `2px solid ${COACH}` : "none", outlineOffset: -2 }}>
              <div style={{ marginBottom: 4 }}>
                <span style={{ ...ff, width: 24, height: 24, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: "50%",
                  fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? "#fff" : isOther ? "#C8CDD8" : NAVY, background: isToday ? COACH : "transparent" }}>
                  {d.getDate()}
                </span>
              </div>
              {dayEvents.slice(0, 3).map((ev) => {
                const st = eventStyle(ev);
                return (
                  <div key={ev.id} onClick={(e) => onOpen(ev, e)}
                    style={{ marginBottom: 3, padding: "3px 6px", borderRadius: 4, background: st.bg, borderLeft: `2px solid ${st.color}`, cursor: "pointer" }}>
                    <div style={{ ...ff, fontSize: 10, fontWeight: 600, color: st.color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{coacheeLabel(ev)}</div>
                  </div>
                );
              })}
              {dayEvents.length > 3 && <div style={{ ...ff, fontSize: 10, color: MUTED, fontWeight: 600 }}>+{dayEvents.length - 3} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NavBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ ...ff, width: 32, height: 32, background: CARD, border: `1px solid ${BORDER}`, borderRadius: 8, cursor: "pointer", fontSize: 15, color: NAVY, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {children}
    </button>
  );
}

// ── Event popover ─────────────────────────────────────────────────
function EventPopover({ ev, x, y, onClose, onStarted }: {
  ev: CoachSessionDTO; x: number; y: number; onClose: () => void;
  onStarted: (updated: CoachSessionDTO) => void;
}) {
  const st = eventStyle(ev);
  const d = new Date(ev.scheduled_at);
  const dateLabel = d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
  const [starting, setStarting] = useState(false);
  const [startErr, setStartErr] = useState("");

  async function startSession() {
    setStarting(true); setStartErr("");
    try {
      const r = await sessionsApi.start(ev.id);
      if (r.data) {
        onStarted({ ...ev, status: r.data.status, meeting_type: r.data.meeting_type, join_url: r.data.join_url });
        if (r.data.join_url) window.open(r.data.join_url, "_blank");
      }
    } catch (e) {
      setStartErr(e instanceof Error ? e.message : "Could not start session. Try again.");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div style={{ position: "fixed", zIndex: 2001, top: y, left: x, width: 320, background: CARD, borderRadius: 14, boxShadow: "0 8px 32px rgba(28,37,81,.16), 0 2px 8px rgba(28,37,81,.08)", overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "12px 12px 6px" }}>
        <button onClick={onClose} style={{ ...ff, width: 30, height: 30, border: `1.5px solid ${NAVY}`, borderRadius: "50%", background: "transparent", cursor: "pointer", fontSize: 13, color: NAVY }}>✕</button>
      </div>
      <div style={{ padding: "0 20px 16px", display: "flex", gap: 12 }}>
        <div style={{ width: 14, height: 14, borderRadius: 3, background: st.color, flexShrink: 0, marginTop: 4 }} />
        <div>
          <div style={{ ...ff, fontSize: 17, fontWeight: 700, color: NAVY, lineHeight: 1.2 }}>{coacheeLabel(ev)}</div>
          <div style={{ ...ff, fontSize: 13, color: MUTED, marginTop: 2 }}>{dateLabel}</div>
        </div>
      </div>
      <div style={{ height: 1, background: ALT }} />
      <div style={{ padding: "14px 20px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        <PopRow icon="≡" title={st.label} sub={ev.title} />
        <PopRow icon="⏰" title={`${clockTime(ev.scheduled_at)} · ${ev.duration_mins} min`} />
        <PopRow icon="🎥" title={platformOf(ev.virtual_link)} />
        <PopRow icon="▤" title={ev.program_title} />
      </div>
      {ev.status === "scheduled" && (
        <div style={{ padding: "0 20px 4px" }}>
          {startErr && <div style={{ ...ff, fontSize: 11, color: "#ef4444", marginBottom: 8 }}>{startErr}</div>}
          <button onClick={startSession} disabled={starting}
            style={{ ...ff, width: "100%", padding: 9, background: starting ? MUTED : ORANGE, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: starting ? "not-allowed" : "pointer" }}>
            {starting ? "Starting…" : "Start Session"}
          </button>
        </div>
      )}
      <div style={{ padding: "10px 20px 16px", borderTop: `1px solid ${ALT}`, display: "flex", gap: 8 }}>
        {resolveJoinLink(ev.meeting_type, ev.join_url, ev.virtual_link) ? (
          <a href={resolveJoinLink(ev.meeting_type, ev.join_url, ev.virtual_link)} target="_blank" rel="noreferrer" style={{ ...ff, flex: 1, textAlign: "center", padding: 9, background: ORANGE, color: "#fff", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", textDecoration: "none" }}>Join Session</a>
        ) : (
          <button style={{ ...ff, flex: 1, padding: 9, background: ORANGE, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Open Session</button>
        )}
        <button style={{ ...ff, flex: 1, padding: 9, background: PAGE, color: NAVY, border: `1px solid ${BORDER}`, borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Details</button>
      </div>
    </div>
  );
}

function PopRow({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span style={{ fontSize: 15, color: MUTED, flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div>
        <div style={{ ...ff, fontSize: 13, fontWeight: 500, color: NAVY }}>{title}</div>
        {sub && <div style={{ ...ff, fontSize: 11.5, color: MUTED, marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  );
}
