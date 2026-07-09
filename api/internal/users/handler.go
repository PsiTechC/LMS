package users

import (
	"errors"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/audit"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler {
	fixSchema()
	return &Handler{}
}

func (h *Handler) Register(v1 *echo.Group) {
	// Self-service profile & settings — any authenticated user.
	// MUST be registered before the admin group so Echo matches /users/me
	// before it tries to parse "me" as a /:id parameter.
	me := v1.Group("/users/me", shared.RequireAuth())
	me.GET("", h.getMe)
	me.PATCH("", h.updateMe)
	me.POST("/change-password", h.changePassword)
	me.GET("/prefs", h.getPrefs)
	me.PATCH("/prefs/notifications", h.updateNotifPrefs)
	me.PATCH("/prefs/appearance", h.updateAppearancePrefs)

	// Admin user management — requires explicit permission.
	g := v1.Group("/users", shared.RequireAuth(), shared.HybridPermission("users", "read", shared.RoleSuperAdmin, shared.RoleProgramManager))
	g.GET("", h.list)
	g.GET("/:id", h.get)
	g.PATCH("/:id", h.update, shared.HybridPermission("users", "update", shared.RoleSuperAdmin, shared.RoleProgramManager))
	g.DELETE("/:id", h.deactivate, shared.HybridPermission("users", "delete", shared.RoleSuperAdmin))
}

// ---------------------------------------------------------------------------
// Existing admin handlers (unchanged)
// ---------------------------------------------------------------------------

func (h *Handler) list(c echo.Context) error {
	claims := shared.ClaimsFrom(c)

	var q ListUsersQuery
	if err := c.Bind(&q); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid query params", "")
	}
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 {
		q.Limit = 20
	}

	users, total, err := listUsersService(claims.Role, claims.UserID, q.Role, q.OrgID, q.Page, q.Limit)
	if err != nil {
		return shared.InternalError(c, "failed to fetch users")
	}
	return shared.OKList(c, users, shared.Meta{Page: q.Page, PerPage: q.Limit, Total: total})
}

func (h *Handler) get(c echo.Context) error {
	u, err := getUserService(c.Param("id"))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "user not found")
		}
		return shared.InternalError(c, "failed to fetch user")
	}
	return shared.OK(c, u)
}

func (h *Handler) update(c echo.Context) error {
	claims := shared.ClaimsFrom(c)

	var req UpdateUserRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}

	u, err := updateUserService(c.Param("id"), req, claims.Role)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "user not found")
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	audit.Log(c, audit.Event{
		Category:   "users",
		Action:     "user.update",
		Severity:   audit.SeveritySuccess,
		TargetType: "user",
		TargetID:   c.Param("id"),
	})
	return shared.OK(c, u)
}

func (h *Handler) deactivate(c echo.Context) error {
	id := c.Param("id")
	isActive := false
	_, err := updateUserService(id, UpdateUserRequest{IsActive: &isActive}, shared.RoleSuperAdmin)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "user not found")
		}
		return shared.InternalError(c, "failed to deactivate user")
	}
	audit.Log(c, audit.Event{
		Category:   "users",
		Action:     "user.deactivate",
		Severity:   audit.SeverityWarning,
		TargetType: "user",
		TargetID:   id,
	})
	return shared.NoContent(c)
}

// ---------------------------------------------------------------------------
// Self-service profile handlers
// ---------------------------------------------------------------------------

func (h *Handler) getMe(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	profile, err := getMeService(claims.UserID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "user not found")
		}
		return shared.InternalError(c, "failed to fetch profile")
	}
	return shared.OK(c, profile)
}

func (h *Handler) updateMe(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req UpdateProfileRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	profile, err := updateProfileService(claims.UserID, req)
	if err != nil {
		return shared.InternalError(c, err.Error())
	}
	return shared.OK(c, profile)
}

func (h *Handler) changePassword(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req ChangePasswordRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	if err := changePasswordService(claims.UserID, req.CurrentPassword, req.NewPassword); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.OK(c, map[string]string{"message": "password updated"})
}

func (h *Handler) getPrefs(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	notif, appear, err := getPrefsService(claims.UserID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch preferences")
	}
	return shared.OK(c, map[string]any{"notifications": notif, "appearance": appear})
}

func (h *Handler) updateNotifPrefs(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req NotificationPrefs
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	if err := updateNotificationPrefs(claims.UserID, req); err != nil {
		return shared.InternalError(c, "failed to update notification preferences")
	}
	return shared.OK(c, req)
}

func (h *Handler) updateAppearancePrefs(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req AppearancePrefs
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	if err := updateAppearancePrefs(claims.UserID, req); err != nil {
		return shared.InternalError(c, "failed to update appearance preferences")
	}
	return shared.OK(c, req)
}
