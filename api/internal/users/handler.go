package users

import (
	"errors"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/users", shared.RequireAuth(), shared.RequirePermission("users", "read"))
	g.GET("", h.list)
	g.GET("/:id", h.get)
	g.PATCH("/:id", h.update, shared.RequirePermission("users", "update"))
	g.DELETE("/:id", h.deactivate, shared.RequirePermission("users", "delete"))
}

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
	return shared.OK(c, u)
}

func (h *Handler) deactivate(c echo.Context) error {
	isActive := false
	_, err := updateUserService(c.Param("id"), UpdateUserRequest{IsActive: &isActive}, shared.RoleSuperAdmin)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "user not found")
		}
		return shared.InternalError(c, "failed to deactivate user")
	}
	return shared.NoContent(c)
}
