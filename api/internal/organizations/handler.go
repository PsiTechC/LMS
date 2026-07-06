package organizations

import (
	"errors"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/audit"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/organizations", shared.RequireAuth(), shared.RequirePermission("organizations", "read"))
	g.GET("", h.list)
	g.POST("", h.create, shared.RequirePermission("organizations", "create"))
	g.GET("/:id", h.get)
	g.PATCH("/:id", h.update, shared.RequirePermission("organizations", "update"))

	b := v1.Group("/branding", shared.RequireAuth())
	b.GET("/current", h.currentBrandKit, shared.HybridPermission("branding", "read", shared.RoleParticipant))
	b.GET("/:orgId", h.getBrandKit, shared.HybridPermission("branding", "read", shared.RoleParticipant))
	b.PATCH("/:orgId", h.updateBrandKit, shared.RequirePermission("branding", "manage"))
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

func (h *Handler) update(c echo.Context) error {
	var req UpdateOrgRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	org, err := updateOrgService(c.Param("id"), req)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "organization not found")
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	// Org config change (plan/status/seats/etc.) — log the fields that changed.
	audit.Log(c, audit.Event{
		Category:   "organization",
		Action:     "config.update",
		Severity:   audit.SeveritySuccess,
		TargetType: "organization",
		TargetID:   org.ID,
		OrgID:      org.ID,
		Detail:     req,
	})
	return shared.OK(c, org)
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

	audit.Log(c, audit.Event{
		Category:   "organization",
		Action:     "create",
		Severity:   audit.SeveritySuccess,
		TargetType: "organization",
		TargetID:   resp.Organization.ID,
		OrgID:      resp.Organization.ID,
		Detail: map[string]any{
			"name": resp.Organization.Name,
			"slug": resp.Organization.Slug,
			"plan": resp.Organization.Plan,
		},
	})

	return shared.Created(c, resp)
}

func (h *Handler) currentBrandKit(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	brand, err := getCurrentBrandKitService(claims.UserID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch brand kit")
	}
	return shared.OK(c, brand)
}

func (h *Handler) getBrandKit(c echo.Context) error {
	brand, err := getBrandKitService(c.Param("orgId"))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "organization not found")
		}
		return shared.InternalError(c, "failed to fetch brand kit")
	}
	return shared.OK(c, brand)
}

func (h *Handler) updateBrandKit(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	orgID := c.Param("orgId")
	ownOrgID, err := getOrgIDForUser(claims.UserID)
	if err != nil || ownOrgID != orgID {
		return shared.Forbidden(c)
	}
	var req UpdateBrandKitRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	brand, err := updateBrandKitService(orgID, req)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "organization not found")
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.OK(c, brand)
}
