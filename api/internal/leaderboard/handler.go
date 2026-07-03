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
	g.PATCH("/visibility", h.setVisibility, shared.RequirePermission("leaderboard", "write"))
}

func (h *Handler) getMy(c echo.Context) error {
	uid, err := userID(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	dto, err := getMyLeaderboardService(uid)
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
	dto, serr := setVisibilityService(uid, req.ShowOnLeaderboard)
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
