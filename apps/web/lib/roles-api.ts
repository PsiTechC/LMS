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

  // Org access rules
  getAccessRule: (orgId: string) =>
    api.get<ApiResponse<OrgAccessRuleDTO>>(`/org_access_rules?org_id=${orgId}`),
  upsertAccessRule: (body: UpsertAccessRuleBody) =>
    api.post<ApiResponse<OrgAccessRuleDTO>>("/org_access_rules", body),
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

// Product-facing permission grid: modules × action columns. Each checkbox maps
// to a backend "resource:action" permission string.
export const WIZARD_MODULES: { key: string; label: string }[] = [
  { key: "dashboard",       label: "Dashboard" },
  { key: "programs",        label: "Programs & Content" },
  { key: "participants",    label: "Participants" },
  { key: "assessments",     label: "Assessments" },
  { key: "coaching",        label: "Coaching" },
  { key: "analytics",       label: "Analytics" },
  { key: "communications",  label: "Communications" },
  { key: "billing",         label: "Billing" },
  { key: "platform_config", label: "Platform Config" },
  { key: "users",           label: "User Management" },
];

export const WIZARD_ACTIONS: { key: string; label: string }[] = [
  { key: "read",   label: "View" },
  { key: "create", label: "Create" },
  { key: "update", label: "Edit" },
  { key: "delete", label: "Delete" },
  { key: "admin",  label: "Admin" },
];
