package competencies

import (
	"errors"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/competencies", shared.RequireAuth(), shared.RequirePermission("competencies", "read"))

	// Competency CRUD
	g.GET("", h.list)
	g.POST("", h.create, shared.RequirePermission("competencies", "create"))
	g.PATCH("/:id", h.update, shared.RequirePermission("competencies", "update"))
	g.DELETE("/:id", h.del, shared.RequirePermission("competencies", "delete"))

	// Activity ↔ competency mapping
	g.GET("/activity/:activityId", h.listForActivity)
	g.POST("/activity/:activityId", h.mapToActivity, shared.RequirePermission("competencies", "update"))
	g.DELETE("/activity/:activityId/:competencyId", h.unmapFromActivity, shared.RequirePermission("competencies", "update"))

	// Template library
	g.GET("/templates", h.listTemplates)
}

func (h *Handler) list(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	if orgID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "org_id is required", "org_id")
	}
	rows, err := listCompetenciesService(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch competencies")
	}
	return shared.OK(c, rows)
}

func (h *Handler) create(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	if orgID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "org_id is required", "org_id")
	}
	var req CreateCompetencyRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if req.Title == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "title is required", "title")
	}
	if req.Category == "" {
		req.Category = "leadership"
	}
	out, err := createCompetencyService(req, orgID)
	if err != nil {
		return shared.InternalError(c, "failed to create competency")
	}
	return shared.Created(c, out)
}

func (h *Handler) update(c echo.Context) error {
	var req UpdateCompetencyRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	out, err := updateCompetencyService(c.Param("id"), req)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "competency not found")
		}
		return shared.InternalError(c, "failed to update competency")
	}
	return shared.OK(c, out)
}

func (h *Handler) del(c echo.Context) error {
	if err := deleteCompetencyService(c.Param("id")); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "competency not found")
		}
		return shared.InternalError(c, "failed to delete competency")
	}
	return shared.NoContent(c)
}

func (h *Handler) listForActivity(c echo.Context) error {
	rows, err := listActivityCompetenciesService(c.Param("activityId"))
	if err != nil {
		return shared.InternalError(c, "failed to fetch competencies")
	}
	return shared.OK(c, rows)
}

func (h *Handler) mapToActivity(c echo.Context) error {
	var req MapCompetencyRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if req.CompetencyID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "competency_id is required", "competency_id")
	}
	if err := mapCompetencyService(c.Param("activityId"), req); err != nil {
		return shared.InternalError(c, "failed to map competency")
	}
	return shared.NoContent(c)
}

func (h *Handler) unmapFromActivity(c echo.Context) error {
	if err := unmapCompetencyService(c.Param("activityId"), c.Param("competencyId")); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "mapping not found")
		}
		return shared.InternalError(c, "failed to unmap competency")
	}
	return shared.NoContent(c)
}

func (h *Handler) listTemplates(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	rows, err := listTemplatesService(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch templates")
	}
	return shared.OK(c, rows)
}
