// Shared design tokens, formatting helpers, and small UI atoms used by both
// the coach dashboard's own tabs (app/dashboard/coach/page.tsx) and the
// faculty-side "Coach Workspace" section that reuses the same tab content
// for a dual-role faculty+coach user. Extracted from coach/page.tsx so both
// places import one implementation instead of duplicating it.
import type { CoachSessionDTO, CoachingEngagementDTO } from "@/lib/coach-api";

// ── Design tokens (apps/CLAUDE.md) ────────────────────────────────
export const ff = { fontFamily: "Poppins, sans-serif" } as const;
export const NAVY = "#182848";
export const ORANGE = "#C8A860";
export const COACH = "#0891B2"; // coach persona accent (nav-config ROLE_COLOR.coach)
export const GREEN = "#22c55e";
export const CARD_BG = "#fff";
export const BORDER = "#E6DED0";
export const MUTED = "#4A5573";
export const TRACK = "#EFE9DC";
export const SHADOW = "0 1px 4px rgba(24, 40, 72,0.07)";

// ── Formatting helpers ────────────────────────────────────────────
export function monthDay(iso: string): { mon: string; day: string } {
  const d = new Date(iso);
  return {
    mon: d.toLocaleDateString(undefined, { month: "short" }).toUpperCase(),
    day: String(d.getDate()),
  };
}
export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
export function dueLabel(iso?: string): string {
  if (!iso) return "No due date";
  const d = new Date(iso + "T00:00:00");
  return "Due " + d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
export function platformOf(link?: string): string {
  if (!link) return "Virtual";
  const l = link.toLowerCase();
  if (l.includes("zoom")) return "Zoom";
  if (l.includes("teams")) return "Teams";
  if (l.includes("meet")) return "Meet";
  return "Virtual";
}
// A coaching session is labelled by who it's with: a 1:1 by its coachee, a
// group by its engagement/cohort. The session title becomes the topic line.
export function sessionParty(s: CoachSessionDTO): { primary: string; topic: string; tag: { label: string; color: string } } {
  const isGroup = s.engagement_type === "group" || s.session_type === "coaching_group";
  if (isGroup) {
    return {
      primary: s.engagement_name || s.cohort_name || "Group Session",
      topic: s.title,
      tag: { label: "GROUP", color: COACH },
    };
  }
  if (s.coachee_name) {
    return { primary: s.coachee_name, topic: s.title, tag: { label: "1:1", color: NAVY } };
  }
  // No engagement link — fall back to the session title itself.
  return { primary: s.title, topic: s.program_title, tag: { label: "SESSION", color: MUTED } };
}
export function pct(done: number, total: number): number {
  if (!total) return 0;
  return Math.round((done / total) * 100);
}
export function progressColor(p: number): string {
  if (p >= 67) return GREEN;
  if (p >= 34) return ORANGE;
  return COACH;
}
export function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
// The primary label a coach thinks of an engagement by: the individual coachee,
// or the engagement name for a group.
export function engagementLabel(e: CoachingEngagementDTO): string {
  if (e.assignment_type === "individual" && e.participants[0]) {
    return e.participants[0].name;
  }
  return e.name;
}
// The soonest upcoming session for an engagement, formatted like "May 8, 3:00 PM".
export function nextSessionLabel(engagementId: string, sessions: CoachSessionDTO[]): string | null {
  const up = sessions
    .filter((s) => s.engagement_id === engagementId)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());
  if (!up.length) return null;
  const d = new Date(up[0].scheduled_at);
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

export const ENG_FILTERS = ["All", "Individual (1:1)", "Group", "Active", "Scheduled", "Completed"] as const;

// ── Small UI atoms ────────────────────────────────────────────────
export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        background: CARD_BG,
        borderRadius: 12,
        border: `1px solid ${BORDER}`,
        boxShadow: SHADOW,
        padding: 20,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Pill({ text, color }: { text: string; color: string }) {
  return (
    <span
      style={{
        ...ff,
        background: `${color}14`,
        color,
        fontSize: 10,
        fontWeight: 700,
        borderRadius: 20,
        padding: "3px 9px",
        letterSpacing: 0.3,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ ...ff, fontSize: 15, fontWeight: 700, color: NAVY, marginBottom: 14 }}>{children}</div>;
}

export function EmptyRow({ text }: { text: string }) {
  return <div style={{ ...ff, fontSize: 13, color: MUTED, padding: "16px 0" }}>{text}</div>;
}

export function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: "#F7F5F0", borderRadius: 8, padding: "8px 10px" }}>
      <div style={{ ...ff, fontSize: 9, fontWeight: 700, color: MUTED, letterSpacing: 0.3, textTransform: "uppercase" }}>{label}</div>
      <div style={{ ...ff, fontSize: 14, fontWeight: 700, color: NAVY, marginTop: 2 }}>{value}</div>
    </div>
  );
}
