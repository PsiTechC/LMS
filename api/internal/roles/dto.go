package roles

// ── Custom Roles ──────────────────────────────────────────────────────────────

// CustomRoleDTO is the public representation of a custom role.
type CustomRoleDTO struct {
	ID          string   `json:"id"`
	OrgID       string   `json:"org_id,omitempty"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	BaseRole    string   `json:"base_role"`
	Permissions []string `json:"permissions"`           // explicit granular grants
	Effective   []string `json:"effective_permissions"` // base inheritance ∪ grants
	IsSystem    bool     `json:"is_system"`
	CreatedBy   string   `json:"created_by,omitempty"`
	CreatedAt   string   `json:"created_at"`
	UpdatedAt   string   `json:"updated_at"`
}

// CreateRoleRequest is the body for POST /roles.
type CreateRoleRequest struct {
	OrgID       string   `json:"org_id"`
	Name        string   `json:"name" validate:"required"`
	Description string   `json:"description"`
	BaseRole    string   `json:"base_role" validate:"required"`
	Permissions []string `json:"permissions"`
}

// UpdateRoleRequest is the body for PATCH /roles/:id. All fields optional.
type UpdateRoleRequest struct {
	Name        *string   `json:"name"`
	Description *string   `json:"description"`
	BaseRole    *string   `json:"base_role"`
	Permissions *[]string `json:"permissions"`
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
