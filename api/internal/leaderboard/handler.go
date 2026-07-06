package leaderboard

import (
	"errors"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/leaderboard", shared.RequireAuth(), shared.RequirePermission("leaderboard", "read"))
	g.GET("/my", h.getMy)
	// Cross-org rankings for the superadmin Leaderboard view (superadmin-only).
	g.GET("/admin", h.admin, shared.RequirePermission("leaderboard", "admin"))
	g.PATCH("/visibility", h.setVisibility, shared.RequirePermission("leaderboard", "write"))
}

// admin returns cross-cohort/cross-org rankings (participants + org aggregate).
func (h *Handler) admin(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	if orgID != "" {
		if _, err := uuid.Parse(orgID); err != nil {
			return shared.BadRequest(c, "VALIDATION_ERROR", "invalid org_id", "org_id")
		}
	}
	dto, err := listAdminLeaderboardService(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to load leaderboard")
	}
	return shared.OK(c, dto)
}

func (h *Handler) getMy(c echo.Context) error {
	uid, err := userID(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	dto, err := getMyLeaderboardService(uid, optionalProgramID(c))
	if err != nil {
		return shared.InternalError(c, "failed to load leaderboard")
	}
	return shared.OK(c, dto)
}

func (h *Handler) setVisibility(c echo.Context) error {
	uid, err := userID(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	var req SetVisibilityRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	dto, serr := setVisibilityService(uid, optionalProgramID(c), req.ShowOnLeaderboard)
	if serr != nil {
		if errors.Is(serr, ErrNotFound) {
			return shared.NotFound(c, "not enrolled in a cohort")
		}
		return shared.InternalError(c, "failed to update visibility")
	}
	return shared.OK(c, dto)
}

func userID(c echo.Context) (uuid.UUID, error) {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return uuid.Nil, echo.ErrUnauthorized
	}
	return uuid.Parse(claims.UserID)
}

// optionalProgramID parses ?program_id= (the program the switcher is on). Nil
// when absent or malformed — the service then falls back to most-recent cohort.
func optionalProgramID(c echo.Context) *uuid.UUID {
	raw := c.QueryParam("program_id")
	if raw == "" {
		return nil
	}
	pid, err := uuid.Parse(raw)
	if err != nil {
		return nil
	}
	return &pid
}
