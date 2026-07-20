package roles

// ── Custom Roles ──────────────────────────────────────────────────────────────

// CustomRoleDTO is the public representation of a custom role.
type CustomRoleDTO struct {
	ID          string   `json:"id"`
	OrgID       string   `json:"org_id,omitempty"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	BaseRole    string   `json:"base_role"`
	Color       string   `json:"color"`
	Permissions []string `json:"permissions"`           // explicit granular grants
	Effective   []string `json:"effective_permissions"` // base inheritance ∪ grants
	// PermissionGrid[module][action] = granted? Powers the detail-view grid.
	PermissionGrid map[string]map[string]bool `json:"permission_grid"`
	UserCount      int                        `json:"user_count"`
	IsSystem       bool                       `json:"is_system"`
	CreatedBy      string                     `json:"created_by,omitempty"`
	CreatedAt      string                     `json:"created_at"`
	UpdatedAt      string                     `json:"updated_at"`
}

// CreateRoleRequest is the body for POST /roles.
type CreateRoleRequest struct {
	OrgID       string   `json:"org_id"`
	Name        string   `json:"name" validate:"required"`
	Description string   `json:"description"`
	BaseRole    string   `json:"base_role" validate:"required"`
	Color       string   `json:"color"`
	Permissions []string `json:"permissions"`
}

// UpdateRoleRequest is the body for PATCH /roles/:id. All fields optional.
type UpdateRoleRequest struct {
	Name        *string   `json:"name"`
	Description *string   `json:"description"`
	BaseRole    *string   `json:"base_role"`
	Color       *string   `json:"color"`
	Permissions *[]string `json:"permissions"`
}

// RolesSummaryDTO powers the four summary cards on the Role Management page.
type RolesSummaryDTO struct {
	TotalRoles         int `json:"total_roles"`
	CustomRoles        int `json:"custom_roles"`
	TotalUsersAssigned int `json:"total_users_assigned"`
	PermissionsDefined int `json:"permissions_defined"`
}

// RoleUserDTO is a user shown in a role's Users tab.
type RoleUserDTO struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Email        string `json:"email"`
	AssignmentID string `json:"assignment_id,omitempty"` // present for custom-role assignments (enables Remove)
	// OrgID/OrgName are the user's organization, for grouping the Users view
	// by org. Empty when the user has no org membership (shown as an
	// "unassigned" bucket) - e.g. a platform-scoped role assignment.
	OrgID   string `json:"org_id,omitempty"`
	OrgName string `json:"org_name,omitempty"`
}

// ── Role Assignments ──────────────────────────────────────────────────────────

// RoleAssignmentDTO is the public representation of a scoped role assignment.
type RoleAssignmentDTO struct {
	ID         string `json:"id"`
	UserID     string `json:"user_id"`
	RoleID     string `json:"role_id,omitempty"`
	RoleName   string `json:"role_name,omitempty"`
	BaseRole   string `json:"base_role,omitempty"`
	OrgID      string `json:"org_id,omitempty"`
	ProgramID  string `json:"program_id,omitempty"`
	ValidFrom  string `json:"valid_from,omitempty"`
	ValidUntil string `json:"valid_until,omitempty"`
	Active     bool   `json:"active"` // currently within [valid_from, valid_until]
	AssignedBy string `json:"assigned_by,omitempty"`
	CreatedAt  string `json:"created_at"`
}

// CreateAssignmentRequest is the body for POST /role_assignments.
// Exactly one of role_id or base_role must be supplied.
type CreateAssignmentRequest struct {
	UserID     string `json:"user_id" validate:"required"`
	RoleID     string `json:"role_id"`
	BaseRole   string `json:"base_role"`
	OrgID      string `json:"org_id"`
	ProgramID  string `json:"program_id"`
	ValidFrom  string `json:"valid_from"`  // RFC3339, optional
	ValidUntil string `json:"valid_until"` // RFC3339, optional
}

// EffectivePermissionsDTO resolves a user's active permission set at request time.
type EffectivePermissionsDTO struct {
	UserID      string   `json:"user_id"`
	BaseRole    string   `json:"base_role"`
	Roles       []string `json:"roles"`       // names of active custom roles applied
	Permissions []string `json:"permissions"` // final effective "resource:action" set
}

// ── Organization Access Rules ─────────────────────────────────────────────────

// OrgAccessRuleDTO is the public representation of an org's access rules.
type OrgAccessRuleDTO struct {
	ID               string   `json:"id"`
	OrgID            string   `json:"org_id"`
	IPAllowlist      []string `json:"ip_allowlist"`
	AllowedCountries []string `json:"allowed_countries"`
	BlockedCountries []string `json:"blocked_countries"`
	Enforce          bool     `json:"enforce"`
	UpdatedBy        string   `json:"updated_by,omitempty"`
	UpdatedAt        string   `json:"updated_at"`
}

// UpsertAccessRuleRequest is the body for POST /org_access_rules (upsert per org).
type UpsertAccessRuleRequest struct {
	OrgID            string   `json:"org_id" validate:"required"`
	IPAllowlist      []string `json:"ip_allowlist"`
	AllowedCountries []string `json:"allowed_countries"`
	BlockedCountries []string `json:"blocked_countries"`
	Enforce          *bool    `json:"enforce"`
}

// MyPermissionsDTO is the caller's own resolved permission set (resolver
// semantic + matrix fallback), used by the frontend to gate nav tabs. Full=true
// means unrestricted (bootstrap superadmin); Permissions is empty in that case.
type MyPermissionsDTO struct {
	Full        bool     `json:"full"`
	Permissions []string `json:"permissions"`
	// IsPrimaryPM mirrors role_assignments.is_primary_pm for the CALLER -
	// gates the "Role Management" nav tab for program_manager accounts.
	// This is an identity flag (who provisioned this account), not a
	// permission grant, so it can't be expressed as a "resource:action" key
	// in Permissions - a Secondary PM shares the same base persona and many
	// of the same permission keys as a Primary PM, but must never see this
	// tab, which is exactly why this needs its own field.
	IsPrimaryPM bool `json:"is_primary_pm"`
}

// ── Org-scoped role view (GET /roles/by-org) ─────────────────────────────────

// OrgScopedRoleDTO is one built-in persona's per-org user count, for the
// Role Management "by org" view. Deliberately excludes superadmin and
// Super Admin (Secondary) - those are platform-level, not org-level.
type OrgScopedRoleDTO struct {
	Role      string `json:"role"`
	Label     string `json:"label"`
	Color     string `json:"color"`
	UserCount int    `json:"user_count"`
}

// ── Org members (GET /orgs/:id/members) ──────────────────────────────────────

// OrgMemberDTO is one user belonging to an org, with their currently
// resolved effective role, for a "Members" list.
type OrgMemberDTO struct {
	UserID string `json:"user_id"`
	Name   string `json:"name"`
	Email  string `json:"email"`
	// EffectiveRole is the DISPLAY label - a custom role's own name when the
	// member is on one (e.g. "Secondary PM"), else the base persona. Good
	// for showing "what this person is called" in a table, but NOT for
	// deciding what kind of account they are underneath.
	EffectiveRole string `json:"effective_role"`
	// BaseRole is the underlying persona this account actually runs on
	// (program_manager/faculty/coach/participant/superadmin) - a custom
	// role's own base_role when the member is on one, else the same value
	// as EffectiveRole. Use THIS to decide behavior that should apply to
	// every account built on a given persona regardless of which specific
	// custom role (if any) narrows their grants - e.g. "is this a PM-tier
	// account, so per-account permission editing should be available."
	BaseRole string `json:"base_role"`
	// IsPrimaryPM is the single source of truth (role_assignments.is_primary_pm,
	// api/migrations/000041) for "is this account the org's Primary PM" - use
	// this for the Primary/Secondary UI tag, not a name comparison against
	// "Secondary PM" or any other derived check.
	IsPrimaryPM bool `json:"is_primary_pm"`
}

// AssignMemberRoleRequest is the body for PATCH /orgs/:id/members/:userId/role.
// Exactly one of role_id or base_role must be supplied (same contract as
// CreateAssignmentRequest). org_id and user_id come from the URL path, not
// the body. Superadmin-tier roles (base_role="superadmin", including custom
// roles built on it such as "Super Admin (Secondary)") are rejected.
type AssignMemberRoleRequest struct {
	RoleID   string `json:"role_id"`
	BaseRole string `json:"base_role"`
}

// ── Per-account permission editing (Members tab) ─────────────────────────────

// MemberPermissionsDTO is the CURRENT effective permission set for one
// specific account (via rbac.Resolve, not the raw shared-role definition -
// they may already be on a personal custom role from a prior edit). Full=true
// means unrestricted (bootstrap superadmin bypass); Permissions is empty then.
type MemberPermissionsDTO struct {
	UserID      string   `json:"user_id"`
	Full        bool     `json:"full"`
	Permissions []string `json:"permissions"`
}

// UpdateMemberPermissionsRequest is the body for
// PATCH /orgs/:id/members/:userId/permissions - the full desired
// "resource:action" permission set for THIS ACCOUNT ONLY.
type UpdateMemberPermissionsRequest struct {
	Permissions []string `json:"permissions"`
}
