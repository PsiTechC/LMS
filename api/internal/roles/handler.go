package roles

import (
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/audit"
	"github.com/xa-lms/api/internal/shared"
)

// Handler holds the role-management HTTP handlers.
type Handler struct{}

// NewHandler initialises the roles module, creating its schema if needed.
func NewHandler() *Handler {
	fixSchema()
	return &Handler{}
}

// Register mounts all role-management routes under /api/v1.
// Every route is superadmin-gated via the RBAC matrix (roles:*, org_access:*),
// and each service call re-checks the caller role as defense-in-depth.
func (h *Handler) Register(v1 *echo.Group) {
	// Self-serve: the CALLER's own effective permissions (any authenticated role).
	// Used by the frontend to gate nav tabs. NOT superadmin-gated.
	me := v1.Group("/me", shared.RequireAuth())
	me.GET("/permissions", h.myPermissions)

	// Custom roles
	roles := v1.Group("/roles", shared.RequireAuth(), shared.HybridPermission("roles", "read", shared.RoleSuperAdmin))
	roles.GET("", h.listRoles)
	roles.GET("/base", h.listBasePersonas)
	roles.GET("/summary", h.rolesSummary)
	// New, additive: built-in personas scoped to one org (opt-in via ?org_id=,
	// separate path from GET /roles — the existing "all orgs" query is untouched).
	roles.GET("/by-org", h.rolesByOrg)
	roles.GET("/:id", h.getRole)
	roles.GET("/:id/users", h.roleUsers)
	roles.POST("", h.createRole, shared.HybridPermission("roles", "manage", shared.RoleSuperAdmin))
	roles.PATCH("/:id", h.updateRole, shared.HybridPermission("roles", "manage", shared.RoleSuperAdmin))
	roles.DELETE("/:id", h.deleteRole, shared.HybridPermission("roles", "manage", shared.RoleSuperAdmin))

	// New, additive: org membership list with each user's effective role, and
	// a UI convenience to assign a member's role for that org (mutating, so
	// gated by "manage" like every other write action in this module).
	orgs := v1.Group("/orgs", shared.RequireAuth(), shared.HybridPermission("roles", "read", shared.RoleSuperAdmin))
	orgs.GET("/:id/members", h.orgMembers)
	orgs.PATCH("/:id/members/:userId/role", h.assignMemberRole, shared.HybridPermission("roles", "manage", shared.RoleSuperAdmin))
	// Per-account permission editing — separate from the shared custom-role
	// edit flow above. Creates/updates a PERSONAL role scoped to exactly one
	// account; never touches a shared custom role or another user.
	orgs.GET("/:id/members/:userId/permissions", h.memberPermissions)
	orgs.PATCH("/:id/members/:userId/permissions", h.updateMemberPermissions, shared.HybridPermission("roles", "manage", shared.RoleSuperAdmin))

	// Primary PM's org-scoped role management — a cut-down equivalent of the
	// superadmin Members tab, for the CALLER'S OWN org only. Gated at
	// RequireAuth() only (any authenticated role can attempt the route);
	// the real authorization — "is this caller their org's Primary PM" — is
	// enforced in the service layer (primaryPMOwnOrgID / errForbidden →
	// shared.Forbidden via svcError), because that's an identity check
	// (role_assignments.is_primary_pm), not a permission-key grant that
	// HybridPermission could express. org_id is NEVER taken from the
	// request — every handler below derives it from the caller's own
	// Primary PM assignment.
	pm := v1.Group("/pm", shared.RequireAuth())
	pm.GET("/members", h.pmOrgMembers)
	pm.GET("/members/:userId/permissions", h.pmMemberPermissions)
	pm.PATCH("/members/:userId/permissions", h.pmUpdateMemberPermissions)
	pm.POST("/members/:userId/grant-coach-role", h.pmGrantCoachRole)

	// Scoped, time-bound role assignments
	asg := v1.Group("/role_assignments", shared.RequireAuth(), shared.HybridPermission("roles", "read", shared.RoleSuperAdmin))
	asg.GET("", h.listAssignments)
	asg.GET("/effective", h.effectivePermissions)
	asg.POST("", h.createAssignment, shared.HybridPermission("roles", "manage", shared.RoleSuperAdmin))
	asg.DELETE("/:id", h.deleteAssignment, shared.HybridPermission("roles", "manage", shared.RoleSuperAdmin))

	// Per-org IP allowlist & geo-restriction rules
	acc := v1.Group("/org_access_rules", shared.RequireAuth(), shared.HybridPermission("org_access", "read", shared.RoleSuperAdmin))
	acc.GET("", h.getAccessRule)
	acc.POST("", h.upsertAccessRule, shared.HybridPermission("org_access", "manage", shared.RoleSuperAdmin))
}

// ── Custom Roles ──────────────────────────────────────────────────────────────

func (h *Handler) listRoles(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	list, err := listRolesService(c.QueryParam("org_id"), claims.Role)
	if err != nil {
		return svcError(c, err)
	}
	return shared.OK(c, list)
}

func (h *Handler) listBasePersonas(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	list, err := listBasePersonasService(claims.Role)
	if err != nil {
		return svcError(c, err)
	}
	return shared.OK(c, list)
}

func (h *Handler) rolesSummary(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	dto, err := rolesSummaryService(claims.Role)
	if err != nil {
		return svcError(c, err)
	}
	return shared.OK(c, dto)
}

func (h *Handler) roleUsers(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	list, err := roleUsersService(c.Param("id"), claims.Role)
	if err != nil {
		return svcError(c, err)
	}
	return shared.OK(c, list)
}

// rolesByOrg returns the built-in org-level personas (program_manager,
// faculty, coach, participant) scoped to ?org_id=, with per-org user counts.
// New, additive endpoint — does not alter GET /roles' existing behavior.
func (h *Handler) rolesByOrg(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	orgID := c.QueryParam("org_id")
	if orgID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "org_id is required", "org_id")
	}
	list, err := rolesByOrgService(orgID, claims.Role)
	if err != nil {
		return svcError(c, err)
	}
	return shared.OK(c, list)
}

func (h *Handler) getRole(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	dto, err := getRoleService(c.Param("id"), claims.Role)
	if err != nil {
		return shared.NotFound(c, "role not found")
	}
	return shared.OK(c, dto)
}

func (h *Handler) createRole(c echo.Context) error {
	var req CreateRoleRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	claims := shared.ClaimsFrom(c)
	dto, err := createRoleService(req, claims.Role, claims.UserID)
	if err != nil {
		return svcError(c, err)
	}
	audit.Log(c, audit.Event{
		Category:   "roles",
		Action:     "role.create",
		Severity:   audit.SeveritySuccess,
		TargetType: "custom_role",
		TargetID:   dto.ID,
		OrgID:      dto.OrgID,
		Detail:     map[string]any{"name": dto.Name, "base_role": dto.BaseRole},
	})
	return shared.Created(c, dto)
}

func (h *Handler) updateRole(c echo.Context) error {
	var req UpdateRoleRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	claims := shared.ClaimsFrom(c)
	dto, err := updateRoleService(c.Param("id"), req, claims.Role)
	if err != nil {
		return svcError(c, err)
	}
	audit.Log(c, audit.Event{
		Category:   "roles",
		Action:     "role.update",
		Severity:   audit.SeveritySuccess,
		TargetType: "custom_role",
		TargetID:   dto.ID,
		OrgID:      dto.OrgID,
		Detail:     map[string]any{"name": dto.Name, "base_role": dto.BaseRole},
	})
	return shared.OK(c, dto)
}

func (h *Handler) deleteRole(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	id := c.Param("id")
	if err := deleteRoleService(id, claims.Role); err != nil {
		return svcError(c, err)
	}
	audit.Log(c, audit.Event{
		Category:   "roles",
		Action:     "role.delete",
		Severity:   audit.SeverityWarning,
		TargetType: "custom_role",
		TargetID:   id,
	})
	return shared.NoContent(c)
}

// orgMembers returns every user belonging to the org (via org_members), each
// with their currently resolved effective role, for a "Members" list.
func (h *Handler) orgMembers(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	list, err := orgMembersService(c.Param("id"), claims.Role)
	if err != nil {
		return svcError(c, err)
	}
	return shared.OK(c, list)
}

// assignMemberRole assigns a role (built-in or custom, scoped to this org)
// to a member, replacing their existing role_assignment for that org.
// Superadmin-tier roles are rejected — see errSuperadminNotAssignable.
func (h *Handler) assignMemberRole(c echo.Context) error {
	var req AssignMemberRoleRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	claims := shared.ClaimsFrom(c)
	dto, err := assignOrgMemberRoleService(c.Param("id"), c.Param("userId"), req, claims.Role, claims.UserID)
	if err != nil {
		return svcError(c, err)
	}
	audit.Log(c, audit.Event{
		Category:   "roles",
		Action:     "role.assign",
		Severity:   audit.SeveritySuccess,
		TargetType: "user",
		TargetID:   dto.UserID,
		OrgID:      dto.OrgID,
		Detail: map[string]any{
			"role_id":   dto.RoleID,
			"role_name": dto.RoleName,
			"base_role": dto.BaseRole,
			"source":    "org_member_view",
		},
	})
	return shared.OK(c, dto)
}

// memberPermissions returns one account's CURRENT effective permission set
// (via rbac.Resolve), for pre-checking the permission grid in the Members-tab
// "Edit Permissions" view.
func (h *Handler) memberPermissions(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	dto, err := memberPermissionsService(c.Param("userId"), claims.Role)
	if err != nil {
		return svcError(c, err)
	}
	return shared.OK(c, dto)
}

// updateMemberPermissions sets one account's permission set by creating or
// updating a PERSONAL custom role scoped to exactly that account (never a
// shared role, never affecting any other user) and reassigning only that
// account to it.
func (h *Handler) updateMemberPermissions(c echo.Context) error {
	var req UpdateMemberPermissionsRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	claims := shared.ClaimsFrom(c)
	dto, err := updateMemberPermissionsService(c.Param("id"), c.Param("userId"), req.Permissions, claims.Role, claims.UserID)
	if err != nil {
		return svcError(c, err)
	}
	return shared.OK(c, dto)
}

// ── Primary PM-scoped org role management ────────────────────────────────────
// org_id is NEVER read from the request here — every service call below
// derives it from claims.UserID's own is_primary_pm=true role_assignments
// row. A non-Primary-PM caller (Secondary PM, faculty, coach, participant)
// gets errForbidden → 403 from the service layer, same as every other
// caller-role check in this module.

func (h *Handler) pmOrgMembers(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	list, err := pmOrgMembersService(claims.UserID)
	if err != nil {
		return svcError(c, err)
	}
	return shared.OK(c, list)
}

func (h *Handler) pmMemberPermissions(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	dto, err := pmMemberPermissionsService(claims.UserID, c.Param("userId"))
	if err != nil {
		return svcError(c, err)
	}
	return shared.OK(c, dto)
}

// pmGrantCoachRole additively grants the "coach" persona to one of the
// caller's own faculty members — see pmGrantCoachRoleService for the full
// authorization contract. Unlike PATCH /orgs/:id/members/:userId/role, this
// never touches the member's existing faculty role_assignments row.
func (h *Handler) pmGrantCoachRole(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	dto, err := pmGrantCoachRoleService(claims.UserID, c.Param("userId"))
	if err != nil {
		return svcError(c, err)
	}
	audit.Log(c, audit.Event{
		Category:   "roles",
		Action:     "role.grant_coach",
		Severity:   audit.SeveritySuccess,
		TargetType: "user",
		TargetID:   dto.UserID,
		OrgID:      dto.OrgID,
		Detail: map[string]any{
			"base_role": dto.BaseRole,
		},
	})
	return shared.Created(c, dto)
}

func (h *Handler) pmUpdateMemberPermissions(c echo.Context) error {
	var req UpdateMemberPermissionsRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	claims := shared.ClaimsFrom(c)
	dto, err := pmUpdateMemberPermissionsService(claims.UserID, c.Param("userId"), req.Permissions)
	if err != nil {
		return svcError(c, err)
	}
	return shared.OK(c, dto)
}

// ── Role Assignments ──────────────────────────────────────────────────────────

func (h *Handler) listAssignments(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	list, err := listAssignmentsService(
		c.QueryParam("user_id"), c.QueryParam("org_id"), c.QueryParam("program_id"), claims.Role,
	)
	if err != nil {
		return svcError(c, err)
	}
	return shared.OK(c, list)
}

func (h *Handler) createAssignment(c echo.Context) error {
	var req CreateAssignmentRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	claims := shared.ClaimsFrom(c)
	dto, err := createAssignmentService(req, claims.Role, claims.UserID)
	if err != nil {
		return svcError(c, err)
	}
	audit.Log(c, audit.Event{
		Category:   "roles",
		Action:     "role.assign",
		Severity:   audit.SeveritySuccess,
		TargetType: "user",
		TargetID:   dto.UserID,
		OrgID:      dto.OrgID,
		Detail: map[string]any{
			"role_id":     dto.RoleID,
			"role_name":   dto.RoleName,
			"base_role":   dto.BaseRole,
			"program_id":  dto.ProgramID,
			"valid_from":  dto.ValidFrom,
			"valid_until": dto.ValidUntil,
		},
	})
	return shared.Created(c, dto)
}

func (h *Handler) deleteAssignment(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	id := c.Param("id")
	if err := deleteAssignmentService(id, claims.Role); err != nil {
		return svcError(c, err)
	}
	audit.Log(c, audit.Event{
		Category:   "roles",
		Action:     "role.revoke",
		Severity:   audit.SeverityWarning,
		TargetType: "role_assignment",
		TargetID:   id,
	})
	return shared.NoContent(c)
}

// effectivePermissions resolves a user's active permission set. Scoped to the
// JWT-authenticated caller by default; a superadmin may pass ?user_id= to
// inspect another user.
// myPermissions returns the caller's own resolved permission set (resolver
// semantic + matrix fallback) for frontend nav gating.
func (h *Handler) myPermissions(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	full, perms := myEffectivePermissionsService(claims.Role, claims.UserID)
	// Non-fatal: an error or "not a Primary PM" both just mean false —
	// never blocks the rest of the response over this one flag.
	_, isPrimary, _ := primaryPMOwnOrgID(claims.UserID)
	return shared.OK(c, MyPermissionsDTO{Full: full, Permissions: perms, IsPrimaryPM: isPrimary})
}

func (h *Handler) effectivePermissions(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	userID := c.QueryParam("user_id")
	if userID == "" {
		userID = claims.UserID
	}
	dto, err := effectivePermissionsService(userID, claims.Role)
	if err != nil {
		return svcError(c, err)
	}
	return shared.OK(c, dto)
}

// ── Organization Access Rules ─────────────────────────────────────────────────

func (h *Handler) getAccessRule(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	if orgID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "org_id is required", "org_id")
	}
	claims := shared.ClaimsFrom(c)
	dto, err := getAccessRuleService(orgID, claims.Role)
	if err != nil {
		return shared.NotFound(c, "access rule not found")
	}
	return shared.OK(c, dto)
}

func (h *Handler) upsertAccessRule(c echo.Context) error {
	var req UpsertAccessRuleRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	claims := shared.ClaimsFrom(c)
	dto, err := upsertAccessRuleService(req, claims.Role, claims.UserID)
	if err != nil {
		return svcError(c, err)
	}
	// Security config change — IP allowlist / geo-restriction for an org.
	audit.Log(c, audit.Event{
		Category:   "security",
		Action:     "access_rules.update",
		Severity:   audit.SeveritySuccess,
		TargetType: "organization",
		TargetID:   dto.OrgID,
		OrgID:      dto.OrgID,
		Detail: map[string]any{
			"ip_allowlist":      dto.IPAllowlist,
			"allowed_countries": dto.AllowedCountries,
			"blocked_countries": dto.BlockedCountries,
			"enforce":           dto.Enforce,
		},
	})
	return shared.Created(c, dto)
}

// svcError maps service errors to the correct HTTP envelope.
func svcError(c echo.Context, err error) error {
	if err == errForbidden {
		return shared.Forbidden(c)
	}
	return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
}
