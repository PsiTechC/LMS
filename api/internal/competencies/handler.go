package competencies

import (
	"errors"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/audit"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/competencies", shared.RequireAuth(), shared.HybridPermission("competencies", "read", shared.RoleSuperAdmin, shared.RoleProgramManager, shared.RoleFaculty))

	// Competency CRUD
	g.GET("", h.list)
	g.POST("", h.create, shared.HybridPermission("competencies", "create", shared.RoleSuperAdmin, shared.RoleProgramManager, shared.RoleFaculty))
	g.PATCH("/:id", h.update, shared.HybridPermission("competencies", "update", shared.RoleSuperAdmin, shared.RoleProgramManager, shared.RoleFaculty))
	g.DELETE("/:id", h.del, shared.HybridPermission("competencies", "delete", shared.RoleSuperAdmin, shared.RoleProgramManager))

	// Behavior statements (competency framework detail for the 360 Configure wizard)
	g.GET("/:id/behaviors", h.listBehaviors)
	g.POST("/:id/behaviors", h.createBehavior, shared.RequirePermission("competencies", "update"))
	g.PATCH("/behaviors/:behaviorId", h.updateBehavior, shared.RequirePermission("competencies", "update"))
	g.DELETE("/behaviors/:behaviorId", h.deleteBehavior, shared.RequirePermission("competencies", "update"))

	// Activity ↔ competency mapping
	g.GET("/activity/:activityId", h.listForActivity)
	g.POST("/activity/:activityId", h.mapToActivity, shared.HybridPermission("competencies", "update", shared.RoleSuperAdmin, shared.RoleProgramManager, shared.RoleFaculty))
	g.DELETE("/activity/:activityId/:competencyId", h.unmapFromActivity, shared.HybridPermission("competencies", "update", shared.RoleSuperAdmin, shared.RoleProgramManager, shared.RoleFaculty))

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
	audit.Log(c, audit.Event{
		Category: "competencies", Action: "competency.create", Severity: audit.SeveritySuccess,
		TargetType: "competency", TargetID: out.ID, OrgID: out.OrgID,
		Detail: map[string]any{"title": out.Title, "category": out.Category},
	})
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
	audit.Log(c, audit.Event{
		Category: "competencies", Action: "competency.update", Severity: audit.SeveritySuccess,
		TargetType: "competency", TargetID: out.ID, OrgID: out.OrgID,
		Detail: map[string]any{"title": out.Title},
	})
	return shared.OK(c, out)
}

func (h *Handler) del(c echo.Context) error {
	id := c.Param("id")
	if err := deleteCompetencyService(id); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "competency not found")
		}
		return shared.InternalError(c, "failed to delete competency")
	}
	audit.Log(c, audit.Event{
		Category: "competencies", Action: "competency.delete", Severity: audit.SeverityWarning,
		TargetType: "competency", TargetID: id,
	})
	return shared.NoContent(c)
}

// ── Behavior statements ─────────────────────────────────────────────

func (h *Handler) listBehaviors(c echo.Context) error {
	rows, err := listBehaviorsService(c.Param("id"))
	if err != nil {
		return shared.InternalError(c, "failed to fetch behaviors")
	}
	return shared.OK(c, rows)
}

func (h *Handler) createBehavior(c echo.Context) error {
	var req CreateBehaviorRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if req.Statement == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "statement is required", "statement")
	}
	out, err := createBehaviorService(c.Param("id"), req)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "competency not found")
		}
		return shared.InternalError(c, "failed to create behavior")
	}
	return shared.Created(c, out)
}

func (h *Handler) updateBehavior(c echo.Context) error {
	var req UpdateBehaviorRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	out, err := updateBehaviorService(c.Param("behaviorId"), req)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "behavior not found")
		}
		return shared.InternalError(c, "failed to update behavior")
	}
	return shared.OK(c, out)
}

func (h *Handler) deleteBehavior(c echo.Context) error {
	if err := deleteBehaviorService(c.Param("behaviorId")); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "behavior not found")
		}
		return shared.InternalError(c, "failed to delete behavior")
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
