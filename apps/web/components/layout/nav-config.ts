export type Role = "superadmin" | "program_manager" | "faculty" | "participant" | "coach" | "participant_retailer" | "superadmin_secondary";

export interface NavItem {
  id: string;
  icon: string;
  label: string;
  // Optional permission key gating this tab. When set, the tab is hidden if the
  // user's effective permissions (GET /me/permissions) lack this key — used to
  // restrict e.g. "Participant Retail". Items without perm always show.
  perm?: string;
  locked?: boolean; // shown greyed with a LOCKED badge, not clickable
  // Gates on IDENTITY (role_assignments.is_primary_pm via GET /me/permissions),
  // not a permission grant — a Secondary PM shares the program_manager base
  // persona and many of the same permission keys as a Primary PM, so `perm`
  // can't express this distinction. Unlike `perm` (which still shows a
  // locked tab), an item with this set is fully OMITTED from the sidebar
  // when the caller isn't the org's Primary PM — "must never see this tab",
  // not "sees it greyed out".
  requiresPrimaryPM?: boolean;
  // Optional sub-items — when set, this entry renders as an expandable group
  // header in the sidebar instead of a navigable tab (its own `id` is never
  // a real page). Only one level deep; children behave exactly like normal
  // top-level items (perm/locked/requiresPrimaryPM all still apply to them).
  children?: NavItem[];
}

export interface NavConfig {
  label: string;
  items: NavItem[];
}

export const NAV_CONFIG: Record<Role, NavConfig> = {
  superadmin: {
    label: "Super Admin (Primary)",
    items: [
      { id: "sa-orgs", icon: "⬡", label: "Organizations" },
      {
        id: "sa-group-design-content", icon: "▤", label: "Program Design & Content",
        children: [
          { id: "sa-program-design", icon: "▤", label: "Program Design Studio" },
          { id: "sa-content",        icon: "◇", label: "Content Library" },
        ],
      },
      {
        id: "sa-group-management", icon: "◫", label: "Management",
        children: [
          { id: "sa-program-mgmt",   icon: "◫", label: "Program Management" },
          { id: "sa-cohorts",        icon: "◈", label: "Cohort Management" },
          { id: "sa-faculty",        icon: "◇", label: "Faculty Management" },
          { id: "sa-coaching-admin", icon: "○", label: "Coaching Admin" },
          { id: "sa-roles",          icon: "◇", label: "Role Management" },
        ],
      },
      {
        id: "sa-group-engagement", icon: "✧", label: "Engagement & Communication",
        children: [
          { id: "sa-sessions",    icon: "▦", label: "Live Sessions" },
          { id: "sa-discussions", icon: "≡", label: "Discussions" },
          { id: "sa-leaderboard", icon: "◆", label: "Leaderboard" },
          { id: "sa-nudge",       icon: "✧", label: "Nudge & Comms" },
        ],
      },
      {
        id: "sa-group-assessment", icon: "✦", label: "Assessment & Feedback",
        children: [
          { id: "sa-grading",       icon: "✦", label: "Grading & Capstone" },
          { id: "sa-capstone",      icon: "▲", label: "Capstone Projects" },
          { id: "sa-surveys",       icon: "≣", label: "Surveys" },
          { id: "sa-360-manage",    icon: "◎", label: "360° Feedback" },
          { id: "sa-psychometrics", icon: "◐", label: "360° & Psychometrics" },
        ],
      },
      {
        id: "sa-group-insights", icon: "◎", label: "Insights",
        children: [
          { id: "sa-analytics", icon: "◎", label: "Analytics" },
          { id: "sa-audit",     icon: "≡", label: "Audit Log" },
        ],
      },
      {
        id: "sa-group-platform", icon: "◆", label: "Platform Settings",
        children: [
          { id: "sa-billing",      icon: "◆", label: "Billing" },
          { id: "sa-health",       icon: "◎", label: "System Health" },
          { id: "sa-integrations", icon: "✦", label: "Integrations" },
        ],
      },
    ],
  },
  // Every tab below (except the dashboard landing page) is mapped to its real
  // backend resource:action via `perm` — driven by this SPECIFIC logged-in
  // account's live GET /me/permissions (rbac.Resolve), not by the
  // "program_manager" persona label. A base program_manager account holds
  // every one of these keys and sees every tab unlocked, exactly as before.
  // A restricted custom role built on this persona (e.g. "Secondary PM",
  // or any future one) will see exactly the tabs its actual grants cover —
  // this mapping needs no per-role code, it's the same generic `perm`
  // mechanism already used by the participant persona below.
  //
  // Each `perm` here is that tab's PRIMARY action (roles-api.ts →
  // primaryActionFor) — "read" for every row except Coaching Admin, whose
  // only real action is "manage" (no "read" exists for that row at all).
  // This must always match primaryActionFor's output for the corresponding
  // SIDEBAR_PERMISSION_MODULES row, so "View unchecked" in the permission
  // grid and "tab locked" in this sidebar are always the same underlying
  // key and never drift apart.
  program_manager: {
    label: "Program Manager",
    items: [
      { id: "pm-dashboard",  icon: "◈", label: "Dashboard" },
      { id: "pm-design",     icon: "▤", label: "Program Design",     perm: "programs:read" },
      { id: "pm-management", icon: "◫", label: "Program Management", perm: "programs:read" },
      { id: "pm-cohort",     icon: "⬡", label: "Cohort Management",  perm: "cohorts:read" },
      { id: "pm-analytics",  icon: "◎", label: "Analytics",          perm: "analytics:read" },
      { id: "pm-faculty",    icon: "◇", label: "Faculty & Resources", perm: "faculty_mgmt:read" },
      { id: "pm-library",    icon: "▦", label: "Content Library",    perm: "content:read" },
      { id: "pm-coaching",   icon: "○", label: "Coaching Admin",     perm: "coaching:manage" },
      { id: "pm-360",        icon: "◎", label: "360° Feedback",      perm: "feedback_360:read" },
      { id: "pm-discussions", icon: "≡", label: "Discussions",       perm: "discussions:read" },
      // Primary-PM-only — Secondary PM never sees this, regardless of
      // which permission keys it happens to hold (see requiresPrimaryPM
      // on the NavItem type above).
      { id: "pm-roles",       icon: "◇", label: "Role Management",  requiresPrimaryPM: true },
    ],
  },
  faculty: {
    label: "Faculty",
    items: [
      { id: "fac-dashboard",      icon: "◈", label: "Dashboard" },
      { id: "fac-program-design", icon: "▤", label: "Program Design" },
      { id: "fac-management",     icon: "◫", label: "Program Management" },
      { id: "fac-sessions",       icon: "⬡", label: "Program Session" },
      { id: "fac-cohort",         icon: "◇", label: "Cohort Management" },
      { id: "fac-content",        icon: "◇", label: "Content Library" },
      { id: "fac-grading",        icon: "✦", label: "Grading Queue" },
      { id: "fac-capstone",       icon: "▲", label: "Capstone Projects" },
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
      { id: "my-cohorts",  icon: "▦", label: "My Cohorts" },
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
      { id: "my-cohorts",  icon: "▦", label: "My Cohorts",          locked: true },
      { id: "capstone",    icon: "▲", label: "Capstone",            locked: true },
      { id: "leaderboard", icon: "◆", label: "Leaderboard",         locked: true },
      { id: "surveys",     icon: "≡", label: "Surveys",             locked: true },
      { id: "discussions", icon: "≡", label: "Discussions",         locked: true },
    ],
  },
  // Super Admin (Secondary) — a delegated superadmin whose ACTUAL access is
  // whatever the "Super Admin (Secondary)" custom role in Role Management
  // grants, not a fixed persona shape. Every tab below (except Billing/
  // Integrations, which have no backend resource at all yet — genuinely
  // "not yet enforced", not permission-gated) is mapped via `perm` to its
  // real primary action, same generic mechanism as program_manager above —
  // so deselecting a permission for THIS role in Role Management locks the
  // matching tab immediately, for this account and any other account on
  // this same role, without any per-role code here.
  superadmin_secondary: {
    label: "Super Admin (Secondary)",
    items: [
      { id: "sa-orgs",           icon: "⬡", label: "Organizations",         perm: "organizations:read" },
      { id: "sa-program-design", icon: "▤", label: "Program Design Studio", perm: "programs:read" },
      { id: "sa-content",        icon: "◇", label: "Content Library",       perm: "content:read" },
      { id: "sa-program-mgmt",   icon: "◫", label: "Program Management",   perm: "programs:read" },
      { id: "sa-cohorts",        icon: "◈", label: "Cohort Management",    perm: "cohorts:read" },
      { id: "sa-analytics",      icon: "◎", label: "Analytics",            perm: "analytics:read" },
      { id: "sa-sessions",       icon: "▦", label: "Live Sessions",        perm: "sessions:read" },
      { id: "sa-grading",        icon: "✦", label: "Grading & Capstone",   perm: "submissions:read" },
      { id: "sa-capstone",       icon: "▲", label: "Capstone Projects",    perm: "capstone:read" },
      { id: "sa-360-manage",     icon: "◎", label: "360° Feedback",        perm: "feedback_360:read" },
      { id: "sa-psychometrics",  icon: "◐", label: "360° & Psychometrics", perm: "feedback_360:read" },
      { id: "sa-surveys",        icon: "≣", label: "Surveys",              perm: "surveys:read" },
      { id: "sa-discussions",    icon: "≡", label: "Discussions",          perm: "discussions:read" },
      { id: "sa-leaderboard",    icon: "◆", label: "Leaderboard",          perm: "leaderboard:read" },
      { id: "sa-nudge",          icon: "✧", label: "Nudge & Comms",        perm: "communications:read" },
      { id: "sa-roles",          icon: "◇", label: "Role Management",      perm: "roles:read" },
      { id: "sa-billing",        icon: "◆", label: "Billing",              locked: true },
      { id: "sa-health",         icon: "◎", label: "System Health",        perm: "system:read" },
      { id: "sa-integrations",   icon: "✦", label: "Integrations",         locked: true },
      { id: "sa-audit",          icon: "≡", label: "Audit Log",            perm: "audit:read" },
      { id: "sa-coaching-admin", icon: "○", label: "Coaching Admin",       perm: "coaching:manage" },
      { id: "sa-faculty",        icon: "◇", label: "Faculty Management",   perm: "faculty_mgmt:read" },
    ],
  },
};

export const ROLE_COLOR: Record<Role, string> = {
  superadmin:           "#22c55e",
  program_manager:      "#182848",
  faculty:              "#4A5573",
  participant:          "#C8A860",
  coach:                "#0891B2",
  participant_retailer: "#C8A860",
  superadmin_secondary: "#22c55e",
};
