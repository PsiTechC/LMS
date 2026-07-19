package users

import (
	"errors"
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v4"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/audit"
	"github.com/xa-lms/api/internal/shared"
	"gorm.io/gorm"
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

	// Self-service avatar — multipart upload/delete, any authenticated user
	// updates their OWN avatar only (claims.UserID, never a path param).
	// Mirrors organizations' logo upload/delete/serve pattern exactly.
	me.POST("/avatar", h.uploadAvatar)
	me.DELETE("/avatar", h.deleteAvatar)
	// Avatar file serving — token-authenticated like organizations'
	// serveOrgLogo (Bearer header OR ?token= query param, validated manually
	// inside the handler), not the RequireAuth middleware, so a plain
	// <img src="...?token=..."> tag can load it without extra headers.
	v1.GET("/users/me/avatar/:avatarId/file", h.serveAvatar)

	// Secondary Super Admin management — Primary Super Admin ONLY
	// (superadmins:manage). Registered before the /users/:id admin group so the
	// literal "superadmins" segment isn't captured as an :id.
	sa := v1.Group("/users/superadmins", shared.RequireAuth(), shared.RequirePermission("superadmins", "manage"))
	sa.GET("", h.listSecondarySuperAdmins)
	sa.POST("", h.createSecondarySuperAdmin)

	// Admin user management — requires explicit permission.
	g := v1.Group("/users", shared.RequireAuth(), shared.HybridPermission("users", "read", shared.RoleSuperAdmin, shared.RoleProgramManager))
	g.GET("", h.list)
	g.GET("/:id", h.get)
	g.PATCH("/:id", h.update, shared.HybridPermission("users", "update", shared.RoleSuperAdmin, shared.RoleProgramManager))
	g.DELETE("/:id", h.deactivate, shared.HybridPermission("users", "delete", shared.RoleSuperAdmin))
}

func (h *Handler) createSecondarySuperAdmin(c echo.Context) error {
	var req CreateSecondarySuperAdminRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	resp, err := createSecondarySuperAdminService(req)
	if err != nil {
		if errors.Is(err, ErrEmailTaken) {
			return shared.Conflict(c, "a user with this email already exists")
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, resp)
}

func (h *Handler) listSecondarySuperAdmins(c echo.Context) error {
	list, err := listSecondarySuperAdminsService()
	if err != nil {
		return shared.InternalError(c, "failed to list secondary super admins")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
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

// uploadAvatar — multipart upload, self-service only (claims.UserID from the
// JWT, never a path param) — mirrors organizations.uploadOrgLogo.
func (h *Handler) uploadAvatar(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	file, err := c.FormFile("file")
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "file is required", "file")
	}
	resp, err := uploadAvatarService(claims.UserID, file)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	audit.Log(c, audit.Event{
		Category:   "users",
		Action:     "avatar.upload",
		Severity:   audit.SeveritySuccess,
		TargetType: "user",
		TargetID:   claims.UserID,
	})
	return shared.OK(c, resp)
}

// deleteAvatar clears the caller's own avatar entirely.
func (h *Handler) deleteAvatar(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if err := deleteAvatarService(claims.UserID); err != nil {
		return shared.InternalError(c, "failed to remove avatar")
	}
	audit.Log(c, audit.Event{
		Category:   "users",
		Action:     "avatar.delete",
		Severity:   audit.SeveritySuccess,
		TargetType: "user",
		TargetID:   claims.UserID,
	})
	return shared.NoContent(c)
}

// serveAvatar streams the caller's own avatar bytes. Token-authenticated
// (Bearer header or ?token= query param) exactly like organizations'
// serveOrgLogo/validateLogoFileToken, rather than the RequireAuth middleware,
// so a plain <img src="..."> tag can load it — and scoping the row lookup by
// the token's own userID means the URL alone can't be reused to fetch
// someone else's picture.
func (h *Handler) serveAvatar(c echo.Context) error {
	claims, err := validateAvatarFileToken(c)
	if err != nil {
		return shared.Unauthorized(c, "missing or invalid token")
	}
	avatarID := c.Param("avatarId")
	if _, err := uuid.Parse(avatarID); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid avatar id", "avatarId")
	}
	data, fileName, mimeType, err := getAvatarFileService(claims.UserID, avatarID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return shared.NotFound(c, "avatar not found")
		}
		return shared.InternalError(c, "failed to serve avatar")
	}
	c.Response().Header().Set("Content-Disposition", `inline; filename="`+fileName+`"`)
	return c.Blob(200, mimeType, data)
}

// validateAvatarFileToken mirrors organizations.validateLogoFileToken — small
// per-module duplication is the established pattern here rather than a
// cross-module export.
func validateAvatarFileToken(c echo.Context) (*shared.JWTClaims, error) {
	tokenStr := ""
	header := c.Request().Header.Get("Authorization")
	if strings.HasPrefix(header, "Bearer ") {
		tokenStr = strings.TrimPrefix(header, "Bearer ")
	} else if t := c.QueryParam("token"); t != "" {
		tokenStr = t
	}
	if tokenStr == "" {
		return nil, errors.New("missing token")
	}
	claims := &shared.JWTClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, echo.ErrUnauthorized
		}
		return []byte(os.Getenv("JWT_SECRET")), nil
	})
	if err != nil || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
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
