package organizations

import (
	"errors"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/organizations", shared.RequireAuth(), shared.RequirePermission("organizations", "read"))
	g.GET("", h.list)
	g.POST("", h.create, shared.RequirePermission("organizations", "create"))
	g.GET("/:id", h.get)
}

func (h *Handler) list(c echo.Context) error {
	orgs, err := listOrgsService()
	if err != nil {
		return shared.InternalError(c, "failed to fetch organizations")
	}
	return shared.OKList(c, orgs, shared.Meta{Total: int64(len(orgs))})
}

func (h *Handler) get(c echo.Context) error {
	org, err := getOrgByID(c.Param("id"))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "organization not found")
		}
		return shared.InternalError(c, "failed to fetch organization")
	}
	return shared.OK(c, orgToDTO(*org))
}

func (h *Handler) create(c echo.Context) error {
	var req CreateOrgRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}

	resp, err := createOrgService(req)
	if err != nil {
		switch {
		case errors.Is(err, ErrSlugTaken):
			return shared.Conflict(c, "slug is already in use")
		case err.Error() != "":
			return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
		default:
			return shared.InternalError(c, "failed to create organization")
		}
	}

	return shared.Created(c, resp)
}
