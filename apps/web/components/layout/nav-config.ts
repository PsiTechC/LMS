export type Role = "superadmin" | "program_manager" | "faculty" | "participant" | "coach";

export interface NavItem {
  id: string;
  icon: string;
  label: string;
  // Optional permission key gating this tab. When set, the tab is hidden if the
  // user's effective permissions (GET /me/permissions) lack this key — used to
  // restrict e.g. "Participant Retail". Items without perm always show.
  perm?: string;
}

export interface NavConfig {
  label: string;
  items: NavItem[];
}

export const NAV_CONFIG: Record<Role, NavConfig> = {
  superadmin: {
    label: "Super Admin",
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
      { id: "prework",     icon: "▤", label: "Pre-Work & Learning", perm: "content:read" },
      { id: "sessions",    icon: "⬡", label: "Live Sessions",       perm: "sessions:read" },
      { id: "assessments", icon: "✦", label: "Assessments",         perm: "submissions:read" },
      { id: "feedback360", icon: "◎", label: "360° Feedback",       perm: "feedback_360:read" },
      { id: "coaching",    icon: "◇", label: "Coaching",            perm: "coaching:self_read" },
      { id: "capstone",    icon: "▲", label: "Capstone",            perm: "capstone:read" },
      { id: "leaderboard", icon: "◆", label: "Leaderboard",         perm: "leaderboard:read" },
      { id: "surveys",     icon: "≡", label: "Surveys",             perm: "surveys:read" },
      { id: "discussions", icon: "≡", label: "Discussions",         perm: "discussions:read" },
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
    ],
  },
};

export const ROLE_COLOR: Record<Role, string> = {
  superadmin:      "#22c55e",
  program_manager: "#1C2551",
  faculty:         "#6B73BF",
  participant:     "#EF4E24",
  coach:           "#0891B2",
};
