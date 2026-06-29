package analytics

import (
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/analytics", shared.RequireAuth(), shared.RequirePermission("analytics", "read"))

	// GET /analytics/engagement?cohort_id=X
	g.GET("/engagement", h.engagement)

	// GET  /analytics/competencies?cohort_id=X
	// POST /analytics/competencies
	// DELETE /analytics/competencies/:id
	g.GET("/competencies", h.competencies)
	g.POST("/competencies", h.upsertCompetency, shared.RequirePermission("analytics", "write"))
	g.DELETE("/competencies/:id", h.deleteCompetency, shared.RequirePermission("analytics", "write"))
}

func (h *Handler) engagement(c echo.Context) error {
	cohortID := c.QueryParam("cohort_id")
	if cohortID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "cohort_id is required", "cohort_id")
	}
	rows, err := engagementService(cohortID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch engagement data")
	}
	return shared.OK(c, rows)
}

func (h *Handler) competencies(c echo.Context) error {
	cohortID := c.QueryParam("cohort_id")
	if cohortID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "cohort_id is required", "cohort_id")
	}
	rows, err := competencyScoresService(cohortID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch competency scores")
	}
	return shared.OK(c, rows)
}

func (h *Handler) upsertCompetency(c echo.Context) error {
	var req UpsertCompetencyScoreRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if req.CohortID == "" || req.CompetencyID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "cohort_id and competency_id are required", "")
	}
	if err := upsertCompetencyScoreService(req); err != nil {
		return shared.InternalError(c, "failed to save competency score")
	}
	return shared.NoContent(c)
}

func (h *Handler) deleteCompetency(c echo.Context) error {
	if err := deleteCompetencyScoreService(c.Param("id")); err != nil {
		return shared.NotFound(c, "score not found")
	}
	return shared.NoContent(c)
}
