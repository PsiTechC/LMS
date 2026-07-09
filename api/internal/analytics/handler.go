package analytics

import (
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/analytics", shared.RequireAuth(), shared.HybridPermission("analytics", "read", shared.RoleFaculty))

	g.GET("/engagement", h.engagement)
	g.GET("/competencies", h.competencies)
	g.POST("/competencies", h.upsertCompetency, shared.HybridPermission("analytics", "write", shared.RoleFaculty))
	g.DELETE("/competencies/:id", h.deleteCompetency, shared.HybridPermission("analytics", "write", shared.RoleFaculty))

	// New endpoints
	g.GET("/program-overview",     h.programOverview)
	g.GET("/cohort-progress",      h.cohortProgress)
	g.GET("/activity-completion",  h.activityCompletion)
	g.GET("/attendance-heatmap",   h.attendanceHeatmap)
	g.GET("/submission-grades",    h.submissionGrades)
	g.GET("/session-summary",      h.sessionSummary)
	g.GET("/program-summary",      h.programSummary)
	g.GET("/program-analytics-extra", h.programAnalyticsExtra)
	g.GET("/completion-rollup",    h.completionRollup)
	g.GET("/engagement-summary",   h.engagementSummary)
	g.GET("/assessment-performance", h.assessmentPerformance)
	g.GET("/at-risk",              h.atRisk)
	g.GET("/roi",                  h.roi)
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

func (h *Handler) programOverview(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	orgID := c.QueryParam("org_id")
	isSuperAdmin := claims.Role == shared.RoleSuperAdmin || claims.Role == shared.RoleSuperAdminSecondary
	if orgID == "" && !isSuperAdmin {
		return shared.BadRequest(c, "VALIDATION_ERROR", "org_id is required", "org_id")
	}
	data, err := programOverviewService(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch program overview")
	}
	return shared.OK(c, data)
}

func (h *Handler) cohortProgress(c echo.Context) error {
	cohortID := c.QueryParam("cohort_id")
	if cohortID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "cohort_id is required", "cohort_id")
	}
	data, err := cohortProgressService(cohortID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch cohort progress")
	}
	return shared.OK(c, data)
}

func (h *Handler) activityCompletion(c echo.Context) error {
	cohortID := c.QueryParam("cohort_id")
	if cohortID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "cohort_id is required", "cohort_id")
	}
	data, err := activityCompletionService(cohortID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch activity completion")
	}
	return shared.OK(c, data)
}

func (h *Handler) attendanceHeatmap(c echo.Context) error {
	cohortID := c.QueryParam("cohort_id")
	if cohortID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "cohort_id is required", "cohort_id")
	}
	data, err := attendanceHeatmapService(cohortID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch attendance heatmap")
	}
	return shared.OK(c, data)
}

func (h *Handler) submissionGrades(c echo.Context) error {
	cohortID := c.QueryParam("cohort_id")
	if cohortID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "cohort_id is required", "cohort_id")
	}
	data, err := submissionGradesService(cohortID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch submission grades")
	}
	return shared.OK(c, data)
}

func (h *Handler) sessionSummary(c echo.Context) error {
	cohortID := c.QueryParam("cohort_id")
	if cohortID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "cohort_id is required", "cohort_id")
	}
	data, err := sessionSummaryService(cohortID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch session summary")
	}
	return shared.OK(c, data)
}

func (h *Handler) completionRollup(c echo.Context) error {
	cohortID := c.QueryParam("cohort_id")
	if cohortID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "cohort_id is required", "cohort_id")
	}
	data, err := completionRollupService(cohortID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch completion rollup")
	}
	return shared.OK(c, data)
}

func (h *Handler) engagementSummary(c echo.Context) error {
	cohortID := c.QueryParam("cohort_id")
	if cohortID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "cohort_id is required", "cohort_id")
	}
	data, err := engagementSummaryService(cohortID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch engagement summary")
	}
	return shared.OK(c, data)
}

func (h *Handler) assessmentPerformance(c echo.Context) error {
	cohortID := c.QueryParam("cohort_id")
	if cohortID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "cohort_id is required", "cohort_id")
	}
	data, err := assessmentPerformanceService(cohortID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch assessment performance")
	}
	return shared.OK(c, data)
}

func (h *Handler) atRisk(c echo.Context) error {
	cohortID := c.QueryParam("cohort_id")
	if cohortID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "cohort_id is required", "cohort_id")
	}
	data, err := atRiskService(cohortID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch at-risk data")
	}
	return shared.OK(c, data)
}

func (h *Handler) programSummary(c echo.Context) error {
	programID := c.QueryParam("program_id")
	if programID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "program_id is required", "program_id")
	}
	data, err := programSummaryService(programID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch program summary")
	}
	return shared.OK(c, data)
}

func (h *Handler) programAnalyticsExtra(c echo.Context) error {
	programID := c.QueryParam("program_id")
	if programID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "program_id is required", "program_id")
	}
	data, err := programAnalyticsExtraService(programID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch program analytics")
	}
	return shared.OK(c, data)
}

func (h *Handler) roi(c echo.Context) error {
	cohortID := c.QueryParam("cohort_id")
	if cohortID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "cohort_id is required", "cohort_id")
	}
	data, err := roiService(cohortID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch ROI data")
	}
	return shared.OK(c, data)
}
