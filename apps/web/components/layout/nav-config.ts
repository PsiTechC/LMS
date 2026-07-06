export type Role = "superadmin" | "program_manager" | "faculty" | "participant" | "coach" | "participant_retailer" | "superadmin_secondary";

export interface NavItem {
  id: string;
  icon: string;
  label: string;
  locked?: boolean; // shown greyed with a LOCKED badge, not clickable
}

export interface NavConfig {
  label: string;
  items: NavItem[];
}

export const NAV_CONFIG: Record<Role, NavConfig> = {
  superadmin: {
    label: "Super Admin (Primary)",
    items: [
      { id: "sa-orgs",           icon: "⬡", label: "Organizations" },
      { id: "sa-program-design", icon: "▤", label: "Program Design Studio" },
      { id: "sa-cohorts",        icon: "◈", label: "Cohort Management" },
      { id: "sa-analytics",      icon: "◎", label: "Analytics" },
      { id: "sa-sessions",       icon: "▦", label: "Live Sessions" },
      { id: "sa-grading",        icon: "✦", label: "Grading & Capstone" },
      { id: "sa-psychometrics",  icon: "◐", label: "360° & Psychometrics" },
      { id: "sa-surveys",        icon: "≣", label: "Surveys" },
      { id: "sa-discussions",    icon: "≡", label: "Discussions" },
      { id: "sa-leaderboard",    icon: "◆", label: "Leaderboard" },
      { id: "sa-nudge",          icon: "✧", label: "Nudge & Comms" },
      { id: "sa-coaching",       icon: "○", label: "Coaching Overview" },
      { id: "sa-programs",       icon: "▤", label: "Open Programs" },
      { id: "sa-roles",          icon: "◇", label: "Role Management" },
      { id: "sa-billing",        icon: "◆", label: "Billing" },
      { id: "sa-health",         icon: "◎", label: "System Health" },
      { id: "sa-integrations",   icon: "✦", label: "Integrations" },
      { id: "sa-audit",          icon: "≡", label: "Audit Log" },
      { id: "sa-content",        icon: "◇", label: "Content Library" },
      { id: "sa-coaching-admin", icon: "○", label: "Coaching Admin" },
      { id: "sa-faculty",        icon: "◇", label: "Faculty Management" },
    ],
  },
  program_manager: {
    label: "Program Manager",
    items: [
      { id: "pm-dashboard",  icon: "◈", label: "Dashboard" },
      { id: "pm-design",     icon: "▤", label: "Program Design" },
      { id: "pm-cohort",     icon: "⬡", label: "Cohort Management" },
      { id: "pm-analytics",  icon: "◎", label: "Analytics" },
      { id: "pm-faculty",    icon: "◇", label: "Faculty & Resources" },
      { id: "pm-library",    icon: "▦", label: "Content Library" },
      { id: "pm-coaching",   icon: "○", label: "Coaching Admin" },
      { id: "pm-discussions", icon: "≡", label: "Discussions" },
    ],
  },
  faculty: {
    label: "Faculty",
    items: [
      { id: "fac-dashboard",      icon: "◈", label: "Dashboard" },
      { id: "fac-program-design", icon: "▤", label: "Program Design" },
      { id: "fac-sessions",       icon: "⬡", label: "Session Management" },
      { id: "fac-cohort",         icon: "◇", label: "Cohort Management" },
      { id: "fac-content",        icon: "◇", label: "Content Library" },
      { id: "fac-grading",        icon: "✦", label: "Grading Queue" },
      { id: "fac-coaching",       icon: "◎", label: "Coaching" },
      { id: "fac-discussions",    icon: "≡", label: "Discussions" },
    ],
  },
  participant: {
    label: "Participant",
    items: [
      { id: "dashboard",   icon: "◈", label: "My Journey" },
      { id: "prework",     icon: "▤", label: "Pre-Work & Learning" },
      { id: "sessions",    icon: "⬡", label: "Live Sessions" },
      { id: "assessments", icon: "✦", label: "Assessments" },
      { id: "feedback360", icon: "◎", label: "360° Feedback" },
      { id: "coaching",    icon: "◇", label: "Coaching" },
      { id: "capstone",    icon: "▲", label: "Capstone" },
      { id: "leaderboard", icon: "◆", label: "Leaderboard" },
      { id: "surveys",     icon: "≡", label: "Surveys" },
      { id: "discussions", icon: "≡", label: "Discussions" },
    ],
  },
  coach: {
    label: "Coach",
    items: [
      { id: "coach-dashboard",    icon: "◈", label: "Dashboard" },
      { id: "coach-engagements",  icon: "◇", label: "My Engagements" },
      { id: "coach-calendar",     icon: "⬡", label: "Calendar & Sessions" },
      { id: "coach-notes",        icon: "≡", label: "Session Notes" },
      { id: "coach-outline",      icon: "▤", label: "Program Outline" },
      { id: "coach-docs",         icon: "▦", label: "Documents & Reports" },
      { id: "coach-initiate",     icon: "✦", label: "Initiate Assignment" },
    ],
  },
  // Participant Retailer — same workspace as Participant but only Assessments,
  // 360° Feedback, and Coaching are unlocked; the rest render LOCKED.
  participant_retailer: {
    label: "Participant Retailer",
    items: [
      { id: "dashboard",   icon: "◈", label: "My Journey",          locked: true },
      { id: "prework",     icon: "▤", label: "Pre-Work & Learning", locked: true },
      { id: "sessions",    icon: "⬡", label: "Live Sessions",       locked: true },
      { id: "assessments", icon: "✦", label: "Assessments" },
      { id: "feedback360", icon: "◎", label: "360° Feedback" },
      { id: "coaching",    icon: "◇", label: "Coaching" },
      { id: "capstone",    icon: "▲", label: "Capstone",            locked: true },
      { id: "leaderboard", icon: "◆", label: "Leaderboard",         locked: true },
      { id: "surveys",     icon: "≡", label: "Surveys",             locked: true },
      { id: "discussions", icon: "≡", label: "Discussions",         locked: true },
    ],
  },
  // Super Admin (Secondary) — full Super Admin workspace except Billing, System
  // Health, Integrations, and Audit Log, which render LOCKED.
  superadmin_secondary: {
    label: "Super Admin (Secondary)",
    items: [
      { id: "sa-orgs",           icon: "⬡", label: "Organizations" },
      { id: "sa-program-design", icon: "▤", label: "Program Design Studio" },
      { id: "sa-cohorts",        icon: "◈", label: "Cohort Management" },
      { id: "sa-analytics",      icon: "◎", label: "Analytics" },
      { id: "sa-sessions",       icon: "▦", label: "Live Sessions" },
      { id: "sa-grading",        icon: "✦", label: "Grading & Capstone" },
      { id: "sa-psychometrics",  icon: "◐", label: "360° & Psychometrics" },
      { id: "sa-surveys",        icon: "≣", label: "Surveys" },
      { id: "sa-discussions",    icon: "≡", label: "Discussions" },
      { id: "sa-leaderboard",    icon: "◆", label: "Leaderboard" },
      { id: "sa-nudge",          icon: "✧", label: "Nudge & Comms" },
      { id: "sa-coaching",       icon: "○", label: "Coaching Overview" },
      { id: "sa-programs",       icon: "▤", label: "Open Programs" },
      { id: "sa-roles",          icon: "◇", label: "Role Management" },
      { id: "sa-billing",        icon: "◆", label: "Billing",         locked: true },
      { id: "sa-health",         icon: "◎", label: "System Health",   locked: true },
      { id: "sa-integrations",   icon: "✦", label: "Integrations",    locked: true },
      { id: "sa-audit",          icon: "≡", label: "Audit Log",       locked: true },
      { id: "sa-content",        icon: "◇", label: "Content Library" },
      { id: "sa-coaching-admin", icon: "○", label: "Coaching Admin" },
      { id: "sa-faculty",        icon: "◇", label: "Faculty Management" },
    ],
  },
};

export const ROLE_COLOR: Record<Role, string> = {
  superadmin:           "#22c55e",
  program_manager:      "#1C2551",
  faculty:              "#6B73BF",
  participant:          "#EF4E24",
  coach:                "#0891B2",
  participant_retailer: "#EF4E24",
  superadmin_secondary: "#22c55e",
};
