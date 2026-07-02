package roles

import (
	"github.com/labstack/echo/v4"
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
	// Custom roles
	roles := v1.Group("/roles", shared.RequireAuth(), shared.RequirePermission("roles", "read"))
	roles.GET("", h.listRoles)
	roles.GET("/:id", h.getRole)
	roles.POST("", h.createRole, shared.RequirePermission("roles", "manage"))
	roles.PATCH("/:id", h.updateRole, shared.RequirePermission("roles", "manage"))
	roles.DELETE("/:id", h.deleteRole, shared.RequirePermission("roles", "manage"))

	// Scoped, time-bound role assignments
	asg := v1.Group("/role_assignments", shared.RequireAuth(), shared.RequirePermission("roles", "read"))
	asg.GET("", h.listAssignments)
	asg.GET("/effective", h.effectivePermissions)
	asg.POST("", h.createAssignment, shared.RequirePermission("roles", "manage"))
	asg.DELETE("/:id", h.deleteAssignment, shared.RequirePermission("roles", "manage"))

	// Per-org IP allowlist & geo-restriction rules
	acc := v1.Group("/org_access_rules", shared.RequireAuth(), shared.RequirePermission("org_access", "read"))
	acc.GET("", h.getAccessRule)
	acc.POST("", h.upsertAccessRule, shared.RequirePermission("org_access", "manage"))
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
	return shared.OK(c, dto)
}

func (h *Handler) deleteRole(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if err := deleteRoleService(c.Param("id"), claims.Role); err != nil {
		return svcError(c, err)
	}
	return shared.NoContent(c)
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
	return shared.Created(c, dto)
}

func (h *Handler) deleteAssignment(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if err := deleteAssignmentService(c.Param("id"), claims.Role); err != nil {
		return svcError(c, err)
	}
	return shared.NoContent(c)
}

// effectivePermissions resolves a user's active permission set. Scoped to the
// JWT-authenticated caller by default; a superadmin may pass ?user_id= to
// inspect another user.
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
	return shared.Created(c, dto)
}

// svcError maps service errors to the correct HTTP envelope.
func svcError(c echo.Context, err error) error {
	if err == errForbidden {
		return shared.Forbidden(c)
	}
	return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
}
