export type Role = "superadmin" | "program_manager" | "faculty" | "participant";

export interface NavItem {
  id: string;
  icon: string;
  label: string;
}

export interface NavConfig {
  label: string;
  items: NavItem[];
}

export const NAV_CONFIG: Record<Role, NavConfig> = {
  superadmin: {
    label: "Super Admin",
    items: [
      { id: "sa-orgs",         icon: "⬡", label: "Organizations" },
      { id: "sa-programs",     icon: "▤", label: "Programs" },
      { id: "sa-config",       icon: "◈", label: "Platform Config" },
      { id: "sa-roles",        icon: "◇", label: "Role Management" },
      { id: "sa-billing",      icon: "◆", label: "Billing" },
      { id: "sa-health",       icon: "◎", label: "System Health" },
      { id: "sa-integrations", icon: "✦", label: "Integrations" },
      { id: "sa-audit",        icon: "≡", label: "Audit Log" },
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
      { id: "pm-comms",      icon: "✉", label: "Communications" },
      { id: "pm-roi",        icon: "◆", label: "ROI Dashboard" },
      { id: "pm-compliance", icon: "≡", label: "Compliance" },
    ],
  },
  faculty: {
    label: "Faculty",
    items: [
      { id: "fac-dashboard",   icon: "◈", label: "Dashboard" },
      { id: "fac-cohorts",     icon: "⬡", label: "My Cohorts" },
      { id: "fac-sessions",    icon: "▤", label: "My Sessions" },
      { id: "fac-content",     icon: "▤", label: "Content Library" },
      { id: "fac-grading",     icon: "✦", label: "Grading Queue" },
      { id: "fac-coaching",    icon: "◇", label: "Coaching" },
      { id: "fac-discussions", icon: "≡", label: "Discussions" },
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
    ],
  },
};

export const ROLE_COLOR: Record<Role, string> = {
  superadmin:     "#22c55e",
  program_manager: "#1C2551",
  faculty:        "#6B73BF",
  participant:    "#EF4E24",
};
