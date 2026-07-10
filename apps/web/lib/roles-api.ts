import { api, ApiResponse } from "./api";

// ── Types ──────────────────────────────────────────────────────────────────

export type BaseRole = "superadmin" | "program_manager" | "faculty" | "participant";

export interface CustomRoleDTO {
  id: string;
  org_id?: string;
  name: string;
  description: string;
  base_role: string;                // one of the 4 personas or "none"
  color: string;
  permissions: string[];            // explicit granular grants
  effective_permissions: string[];  // base inheritance ∪ grants
  permission_grid: Record<string, Record<string, boolean>>;
  user_count: number;
  is_system: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface RolesSummaryDTO {
  total_roles: number;
  custom_roles: number;
  total_users_assigned: number;
  permissions_defined: number;
}

export interface RoleUserDTO {
  id: string;
  name: string;
  email: string;
  assignment_id?: string;
  // The user's organization, for grouping the Users view by org. Empty when
  // the user has no org membership (rendered as an "unassigned" bucket).
  org_id?: string;
  org_name?: string;
}

export interface RoleAssignmentDTO {
  id: string;
  user_id: string;
  role_id?: string;
  role_name?: string;
  base_role?: BaseRole;
  org_id?: string;
  program_id?: string;
  valid_from?: string;
  valid_until?: string;
  active: boolean;
  assigned_by?: string;
  created_at: string;
}

export interface EffectivePermissionsDTO {
  user_id: string;
  base_role: BaseRole;
  roles: string[];
  permissions: string[];
}

// One built-in org-level persona with its per-org user count. Excludes
// superadmin and Super Admin (Secondary) — those are platform-level, not
// scoped to a single org.
export interface OrgScopedRoleDTO {
  role: string;
  label: string;
  color: string;
  user_count: number;
}

// A user belonging to an org, with their currently resolved effective role.
export interface OrgMemberDTO {
  user_id: string;
  name: string;
  email: string;
  // Display label — a custom role's own name when the member is on one
  // (e.g. "Secondary PM"), else the base persona. For showing in a table.
  effective_role: string;
  // The underlying persona this account actually runs on
  // (program_manager/faculty/coach/participant/superadmin) — a custom
  // role's own base_role when the member is on one, else same as
  // effective_role. Use this to decide persona-driven behavior (e.g.
  // whether per-account permission editing is available), NOT
  // effective_role, since a custom-role member's effective_role is a
  // display name that will never match a persona string.
  base_role: string;
  // Single source of truth (role_assignments.is_primary_pm) for "is this
  // account the org's Primary PM" — use this for the Primary/Secondary tag,
  // never a name comparison like `effective_role === "Secondary PM"` (that
  // comparison is exactly what broke when a Primary PM later got a
  // personal per-account role with its own display name).
  is_primary_pm: boolean;
}

export interface OrgAccessRuleDTO {
  id: string;
  org_id: string;
  ip_allowlist: string[];
  allowed_countries: string[];
  blocked_countries: string[];
  enforce: boolean;
  updated_by?: string;
  updated_at: string;
}

// ── Request bodies ─────────────────────────────────────────────────────────

export interface CreateRoleBody {
  org_id?: string;
  name: string;
  description?: string;
  base_role: string;   // persona or "none"
  color?: string;
  permissions: string[];
}

export interface UpdateRoleBody {
  name?: string;
  description?: string;
  base_role?: string;
  color?: string;
  permissions?: string[];
}

export interface CreateAssignmentBody {
  user_id: string;
  role_id?: string;
  base_role?: BaseRole;
  org_id?: string;
  program_id?: string;
  valid_from?: string;  // RFC3339
  valid_until?: string; // RFC3339
}

// Body for PATCH /orgs/:id/members/:userId/role. Exactly one of role_id or
// base_role — same contract as CreateAssignmentBody.
export interface AssignMemberRoleBody {
  role_id?: string;
  base_role?: string;
}

// One account's CURRENT effective permission set (via rbac.Resolve — not the
// raw shared-role definition, since they may already be on a personal custom
// role from a prior per-account edit).
export interface MemberPermissionsDTO {
  user_id: string;
  full: boolean;
  permissions: string[];
}

export interface UpsertAccessRuleBody {
  org_id: string;
  ip_allowlist: string[];
  allowed_countries: string[];
  blocked_countries: string[];
  enforce: boolean;
}

// ── API ────────────────────────────────────────────────────────────────────

export const rolesApi = {
  // Custom roles
  listRoles: (orgId?: string) =>
    api.get<ApiResponse<CustomRoleDTO[]>>(`/roles${orgId ? "?org_id=" + orgId : ""}`),
  listBaseRoles: () => api.get<ApiResponse<CustomRoleDTO[]>>(`/roles/base`),
  summary: () => api.get<ApiResponse<RolesSummaryDTO>>(`/roles/summary`),
  roleUsers: (id: string) => api.get<ApiResponse<RoleUserDTO[]>>(`/roles/${id}/users`),
  getRole: (id: string) => api.get<ApiResponse<CustomRoleDTO>>(`/roles/${id}`),
  createRole: (body: CreateRoleBody) => api.post<ApiResponse<CustomRoleDTO>>("/roles", body),
  updateRole: (id: string, body: UpdateRoleBody) =>
    api.patch<ApiResponse<CustomRoleDTO>>(`/roles/${id}`, body),
  deleteRole: (id: string) => api.delete<ApiResponse<null>>(`/roles/${id}`),

  // Role assignments
  listAssignments: (params?: { user_id?: string; org_id?: string; program_id?: string }) => {
    const q = new URLSearchParams(
      Object.entries(params ?? {}).filter(([, v]) => !!v) as [string, string][],
    ).toString();
    return api.get<ApiResponse<RoleAssignmentDTO[]>>(`/role_assignments${q ? "?" + q : ""}`);
  },
  createAssignment: (body: CreateAssignmentBody) =>
    api.post<ApiResponse<RoleAssignmentDTO>>("/role_assignments", body),
  deleteAssignment: (id: string) => api.delete<ApiResponse<null>>(`/role_assignments/${id}`),
  effectivePermissions: (userId?: string) =>
    api.get<ApiResponse<EffectivePermissionsDTO>>(
      `/role_assignments/effective${userId ? "?user_id=" + userId : ""}`,
    ),

  // Org-scoped role view + membership (new, additive — does not change
  // listRoles()'s existing "All Orgs" behavior).
  rolesByOrg: (orgId: string) =>
    api.get<ApiResponse<OrgScopedRoleDTO[]>>(`/roles/by-org?org_id=${orgId}`),
  orgMembers: (orgId: string) =>
    api.get<ApiResponse<OrgMemberDTO[]>>(`/orgs/${orgId}/members`),
  assignMemberRole: (orgId: string, userId: string, body: AssignMemberRoleBody) =>
    api.patch<ApiResponse<RoleAssignmentDTO>>(`/orgs/${orgId}/members/${userId}/role`, body),

  // Per-account permission editing (Members tab) — separate from role
  // reassignment above. Reads/writes ONE account's own permission set;
  // never edits a shared custom role or affects any other user.
  getMemberPermissions: (orgId: string, userId: string) =>
    api.get<ApiResponse<MemberPermissionsDTO>>(`/orgs/${orgId}/members/${userId}/permissions`),
  updateMemberPermissions: (orgId: string, userId: string, permissions: string[]) =>
    api.patch<ApiResponse<MemberPermissionsDTO>>(`/orgs/${orgId}/members/${userId}/permissions`, { permissions }),

  // Org access rules
  getAccessRule: (orgId: string) =>
    api.get<ApiResponse<OrgAccessRuleDTO>>(`/org_access_rules?org_id=${orgId}`),
  upsertAccessRule: (body: UpsertAccessRuleBody) =>
    api.post<ApiResponse<OrgAccessRuleDTO>>("/org_access_rules", body),
};

// ── Primary PM's org-scoped role management ─────────────────────────────────
// Same shapes as the superadmin Members-tab calls above (OrgMemberDTO,
// MemberPermissionsDTO) — these just hit the /pm/* routes instead, which
// derive org_id from the caller's own Primary PM assignment server-side.
// There is no org_id parameter here at all: it's never accepted from the
// client on this API, by design.
export const pmRolesApi = {
  listMembers: () => api.get<ApiResponse<OrgMemberDTO[]>>(`/pm/members`),
  getMemberPermissions: (userId: string) =>
    api.get<ApiResponse<MemberPermissionsDTO>>(`/pm/members/${userId}/permissions`),
  updateMemberPermissions: (userId: string, permissions: string[]) =>
    api.patch<ApiResponse<MemberPermissionsDTO>>(`/pm/members/${userId}/permissions`, { permissions }),
};

// ── Permission catalog — grouped by module, mirrors the backend RBAC matrix ──

export interface PermissionModule {
  key: string;
  label: string;
  actions: string[];
}

export const PERMISSION_CATALOG: PermissionModule[] = [
  { key: "organizations", label: "Organizations", actions: ["read", "create", "update", "delete"] },
  { key: "users",         label: "Users",         actions: ["read", "create", "update", "delete"] },
  { key: "programs",      label: "Programs",      actions: ["read", "create", "update", "delete"] },
  { key: "cohorts",       label: "Cohorts",       actions: ["read", "create", "update", "delete"] },
  { key: "sessions",      label: "Live Sessions", actions: ["read", "create", "update", "delete"] },
  { key: "submissions",   label: "Submissions",   actions: ["read", "create", "grade"] },
  { key: "coaching",      label: "Coaching",      actions: ["read", "write", "manage"] },
  { key: "competencies",  label: "Competencies",  actions: ["read", "create", "update", "delete"] },
  { key: "analytics",     label: "Analytics",     actions: ["read", "write"] },
  { key: "discussions",   label: "Discussions",   actions: ["read", "create", "manage", "announce"] },
  { key: "audit",         label: "Audit Log",     actions: ["read"] },
  { key: "communications",label: "Communications",actions: ["read", "manage", "send"] },
  { key: "notifications", label: "Notifications", actions: ["read"] },
  { key: "compliance",    label: "Compliance",    actions: ["read", "manage"] },
  { key: "content",       label: "Content Library", actions: ["read", "create", "update", "delete"] },
  { key: "roles",         label: "Role Management", actions: ["read", "manage"] },
  { key: "org_access",    label: "Org Access Rules", actions: ["read", "manage"] },
];

export const BASE_ROLES: BaseRole[] = ["superadmin", "program_manager", "faculty", "participant"];

export const BASE_ROLE_LABELS: Record<string, string> = {
  superadmin:      "Super Admin",
  program_manager: "Program Manager",
  faculty:         "Faculty",
  participant:     "Participant",
  none:            "No Inheritance",
};

// Wizard "Inherit Permissions From" options → backend base_role value.
export const INHERIT_OPTIONS: { value: string; label: string }[] = [
  { value: "none",            label: "None" },
  { value: "program_manager", label: "Program Manager (Business Admin)" },
  { value: "faculty",         label: "Faculty" },
  { value: "participant",     label: "Observer" },
];

// Role color swatches offered in the wizard.
export const ROLE_COLORS = ["#EF4E24", "#1C2551", "#6B73BF", "#22c55e", "#8b90a7", "#f59e0b"];

// ── Permission grid — real sidebar tabs mapped to their real RBAC resource(s) ──
// Replaces the old 10-module mock grid (Dashboard/Programs & Content/
// Participants/Assessments/.../Platform Config/User Management), which didn't
// correspond to anything actually enforced. Every row here is a REAL sidebar
// tab; `resource` is the exact resource string checked by
// shared.RequirePermission()/HybridPermission() in the Go backend, and
// `actions` lists only the actions that resource actually grants (action sets
// vary per resource — there is no fixed 5-column layout). A row with
// `resource: ""` (Billing, Integrations) has no backend permission key yet —
// rendered disabled with "Not yet enforced".
export interface PermissionGridAction { key: string; label: string; }
export interface PermissionGridRow {
  key: string;               // unique row id (== resource, or resource+suffix for split rows)
  label: string;              // sidebar tab label (module label repeated for split rows)
  resource: string;            // real backend resource key ("" = not yet enforced)
  actions: PermissionGridAction[];
}

const ACTION_LABELS: Record<string, string> = {
  read: "View", write: "Edit", create: "Create", update: "Update", delete: "Delete",
  grade: "Grade", manage: "Manage", admin: "Admin", send: "Send", announce: "Announce",
  self_read: "View Own",
};
function actions(...keys: string[]): PermissionGridAction[] {
  return keys.map((k) => ({ key: k, label: ACTION_LABELS[k] ?? k }));
}

export const SIDEBAR_PERMISSION_MODULES: PermissionGridRow[] = [
  { key: "organizations",    label: "Organizations",          resource: "organizations", actions: actions("read", "create", "update", "delete") },
  { key: "programs",         label: "Program Design Studio",  resource: "programs",       actions: actions("read", "create", "update", "delete") },
  { key: "cohorts",          label: "Cohort Management",      resource: "cohorts",        actions: actions("read", "create", "update", "delete") },
  { key: "analytics",        label: "Analytics",              resource: "analytics",      actions: actions("read", "write") },
  { key: "sessions",         label: "Live Sessions",          resource: "sessions",       actions: actions("read", "create", "update", "delete", "admin") },
  { key: "submissions",      label: "Grading & Capstone",     resource: "submissions",    actions: actions("read", "create", "grade") },
  { key: "capstone",         label: "Grading & Capstone",     resource: "capstone",       actions: actions("read", "write") },
  { key: "feedback_360",     label: "360° & Psychometrics",   resource: "feedback_360",   actions: actions("read", "write", "admin") },
  { key: "surveys",          label: "Surveys",                resource: "surveys",        actions: actions("read", "write", "manage", "admin") },
  { key: "discussions",      label: "Discussions",            resource: "discussions",    actions: actions("read", "create", "manage", "announce", "admin") },
  { key: "leaderboard",      label: "Leaderboard",            resource: "leaderboard",    actions: actions("read", "write", "admin") },
  { key: "communications",   label: "Nudge & Comms",          resource: "communications", actions: actions("read", "manage", "send") },
  { key: "coaching",         label: "Coaching Overview",      resource: "coaching",       actions: actions("read", "write", "self_read") },
  { key: "activity_progress",label: "Open Programs",          resource: "activity_progress", actions: actions("read", "write") },
  { key: "roles",            label: "Role Management",        resource: "roles",          actions: actions("read", "manage") },
  { key: "billing",          label: "Billing",                resource: "",               actions: [] },
  { key: "system",           label: "System Health",          resource: "system",         actions: actions("read") },
  { key: "integrations",     label: "Integrations",           resource: "",               actions: [] },
  { key: "audit",            label: "Audit Log",              resource: "audit",          actions: actions("read", "admin") },
  { key: "content",          label: "Content Library",        resource: "content",        actions: actions("read", "create", "update", "delete") },
  { key: "coaching_admin",   label: "Coaching Admin",         resource: "coaching",       actions: actions("manage") },
  { key: "faculty_mgmt",     label: "Faculty Management",     resource: "faculty_mgmt",   actions: actions("read", "manage") },
  { key: "faculty_onboard",  label: "Faculty Management",     resource: "faculty_onboard",actions: actions("create") },
  { key: "faculty_roster",   label: "Faculty Management",     resource: "faculty_roster", actions: actions("read") },
];

// ── Primary/elevated action derivation ───────────────────────────────────────
// Every row's "View" checkbox must read/write its real base-access action, not
// a hardcoded "read" assumption — most rows use "read", but a row whose only
// real action is something else (Coaching Admin: "manage" only; Faculty
// Onboarding: "create" only) has THAT action as its base access instead.
// This is derived once from the catalog data itself, so the sidebar's lock
// check and the permission grid's checkbox hierarchy always agree on which
// key gates a given row — there is exactly one definition of "primary" per
// row, used everywhere.
export function primaryActionFor(row: PermissionGridRow): PermissionGridAction {
  return row.actions.find((a) => a.key === "read") ?? row.actions[0];
}

const CRUD_ACTION_KEYS = new Set(["create", "update", "write", "delete"]);

// Actions that are neither the row's primary (View) action nor a standard
// CRUD verb — manage/admin/send/announce/grade/self_read. These don't map to
// any of the 4 core columns, so the grid represents them separately rather
// than silently dropping or misattributing them to the wrong key.
export function elevatedActionsFor(row: PermissionGridRow): PermissionGridAction[] {
  const primary = primaryActionFor(row);
  return row.actions.filter((a) => a.key !== primary.key && !CRUD_ACTION_KEYS.has(a.key));
}
