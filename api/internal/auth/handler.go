package auth

import (
	"errors"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/auth")
	g.POST("/login", h.login)
	g.GET("/me", h.me, shared.RequireAuth())
}

func (h *Handler) login(c echo.Context) error {
	var req LoginRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if req.Email == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "email is required", "email")
	}
	if req.Password == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "password is required", "password")
	}

	resp, err := loginService(req)
	if err != nil {
		switch {
		case errors.Is(err, ErrInvalidCredentials):
			return shared.Unauthorized(c, "invalid email or password")
		case errors.Is(err, ErrInactiveAccount):
			return shared.Unauthorized(c, "account is inactive")
		default:
			return shared.InternalError(c, "login failed")
		}
	}

	return shared.OK(c, resp)
}

func (h *Handler) me(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "not authenticated")
	}

	user, err := meService(claims.UserID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "user not found")
		}
		return shared.InternalError(c, "failed to fetch user")
	}

	return shared.OK(c, user)
}
