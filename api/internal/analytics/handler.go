package analytics

import (
	"github.com/google/uuid"
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
	g.GET("/program-overview", h.programOverview)
	g.GET("/cohort-progress", h.cohortProgress)
	g.GET("/activity-completion", h.activityCompletion)
	g.GET("/attendance-heatmap", h.attendanceHeatmap)
	g.GET("/submission-grades", h.submissionGrades)
	g.GET("/session-summary", h.sessionSummary)
	g.GET("/program-summary", h.programSummary)
	g.GET("/program-analytics-extra", h.programAnalyticsExtra)
	g.GET("/org-summary", h.orgSummary)
	g.GET("/org-analytics-extra", h.orgAnalyticsExtra)
	g.GET("/organization-rollup", h.organizationRollup, shared.HybridPermission("analytics", "admin", shared.RoleSuperAdmin))
	g.GET("/completion-rollup", h.completionRollup)
	g.GET("/engagement-summary", h.engagementSummary)
	g.GET("/assessment-performance", h.assessmentPerformance)
	g.GET("/at-risk", h.atRisk)
	g.GET("/roi", h.roi)
	g.GET("/overall-grade", h.overallGrade)

	// AI Cohort Intelligence Brief - on-demand (LLM call), not run on every
	// dashboard load.
	g.POST("/cohort-brief", h.cohortBrief)

	// AI Cohort Health Score - Program Manager-facing composite score +
	// narrative, on-demand (LLM call) per cohort drill-down.
	g.POST("/cohort-health-score", h.cohortHealthScore)

	// AI Insight - one-line card on the Analytics page (engagement/
	// completion/at-risk), on-demand (LLM call), fetched on page load.
	g.POST("/ai-insight", h.aiInsight)
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

// cohortBrief generates a real AI pre-session brief for a cohort - on
// demand (LLM call), triggered by the faculty dashboard's "AI Cohort
// Briefing" card rather than run automatically on every page load.
func (h *Handler) cohortBrief(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	cohortID := c.QueryParam("cohort_id")
	if cohortID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "cohort_id is required", "cohort_id")
	}
	uid, err := uuid.Parse(claims.UserID)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	brief, err := generateCohortBriefService(c.Request().Context(), uid, claims.Role, cohortID)
	if err != nil {
		return shared.BadRequest(c, "AI_BRIEF_ERROR", err.Error(), "")
	}
	return shared.OK(c, map[string]string{"brief": brief})
}

// cohortHealthScore generates the PM-facing Cohort Health Score - on demand
// (LLM call), triggered by drilling into a cohort on the Cohort Management
// page rather than run automatically for every cohort on page load.
func (h *Handler) cohortHealthScore(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	cohortID := c.QueryParam("cohort_id")
	if cohortID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "cohort_id is required", "cohort_id")
	}
	uid, err := uuid.Parse(claims.UserID)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	result, err := generateCohortHealthScoreService(c.Request().Context(), uid, claims.Role, cohortID)
	if err != nil {
		return shared.BadRequest(c, "AI_HEALTH_SCORE_ERROR", err.Error(), "")
	}
	return shared.OK(c, result)
}

// aiInsight generates the "AI Insight" one-line card on the Analytics page -
// on demand (LLM call), fetched on page load. org_id may be empty (Superadmin
// "All Orgs"); program_id may be empty ("All Programs").
func (h *Handler) aiInsight(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	orgID := c.QueryParam("org_id")
	programID := c.QueryParam("program_id")
	insight, err := generateAnalyticsInsightService(c.Request().Context(), claims.UserID, claims.Role, orgID, programID)
	if err != nil {
		return shared.BadRequest(c, "AI_PULSE_ERROR", err.Error(), "")
	}
	return shared.OK(c, map[string]string{"insight": insight})
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

// orgSummary / orgAnalyticsExtra are the "All Programs" scope for the
// Analytics page's program dropdown - same shape as their program-scoped
// counterparts, aggregated across every program in the org. An empty org_id
// aggregates platform-wide (every program in every org) - same as
// programOverview above, only Superadmin may omit org_id; a Program Manager
// always has a real org and must pass it.
func (h *Handler) orgSummary(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	orgID := c.QueryParam("org_id")
	isSuperAdmin := claims.Role == shared.RoleSuperAdmin || claims.Role == shared.RoleSuperAdminSecondary
	if orgID == "" && !isSuperAdmin {
		return shared.BadRequest(c, "VALIDATION_ERROR", "org_id is required", "org_id")
	}
	data, err := orgSummaryService(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch org summary")
	}
	return shared.OK(c, data)
}

func (h *Handler) orgAnalyticsExtra(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	orgID := c.QueryParam("org_id")
	isSuperAdmin := claims.Role == shared.RoleSuperAdmin || claims.Role == shared.RoleSuperAdminSecondary
	if orgID == "" && !isSuperAdmin {
		return shared.BadRequest(c, "VALIDATION_ERROR", "org_id is required", "org_id")
	}
	data, err := orgAnalyticsExtraService(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch org analytics")
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

// overallGrade returns a participant's simple-average grade across every
// graded assessment attempt, released capstone grade, and graded submission
// in one program - faculty/PM/superadmin only (same permission as every
// other endpoint in this group).
func (h *Handler) overallGrade(c echo.Context) error {
	participantID := c.QueryParam("participant_id")
	programID := c.QueryParam("program_id")
	if participantID == "" || programID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "participant_id and program_id are required", "")
	}
	if _, err := uuid.Parse(participantID); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "participant_id must be a valid uuid", "participant_id")
	}
	if _, err := uuid.Parse(programID); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "program_id must be a valid uuid", "program_id")
	}
	data, err := overallGradeService(participantID, programID)
	if err != nil {
		return shared.InternalError(c, "failed to compute overall grade")
	}
	return shared.OK(c, data)
}

func (h *Handler) organizationRollup(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil || (claims.Role != shared.RoleSuperAdmin && claims.Role != shared.RoleSuperAdminSecondary) {
		return shared.Forbidden(c)
	}
	data, err := organizationAnalyticsRollupService()
	if err != nil {
		return shared.InternalError(c, "failed to fetch organization analytics")
	}
	return shared.OK(c, data)
}
