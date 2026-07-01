package coaching

import (
	"errors"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/coaching", shared.RequireAuth(), shared.RequirePermission("coaching", "read"))

	// Notes (existing)
	g.POST("/notes", h.createNote, shared.RequirePermission("coaching", "write"))
	g.GET("/notes", h.listNotes)
	g.PATCH("/notes/:id", h.updateNote, shared.RequirePermission("coaching", "write"))
	g.GET("/notes/participant/:participantId", h.listByParticipant)

	// Coaching roster & KPIs
	g.GET("/participants", h.listParticipants)
	g.GET("/kpi", h.kpi)
	g.GET("/tracker", h.tracker)

	// Goals
	g.POST("/goals", h.createGoal, shared.RequirePermission("coaching", "write"))
	g.GET("/goals", h.listGoals)
	g.PATCH("/goals/:id", h.updateGoal, shared.RequirePermission("coaching", "write"))
	g.DELETE("/goals/:id", h.deleteGoal, shared.RequirePermission("coaching", "write"))

	// Development notes (private, per participant)
	g.POST("/dev-notes", h.createDevNote, shared.RequirePermission("coaching", "write"))
	g.GET("/dev-notes", h.listDevNotes)
	g.PATCH("/dev-notes/:id", h.updateDevNote, shared.RequirePermission("coaching", "write"))

	admin := g.Group("/admin", shared.RequirePermission("coaching", "manage"))
	admin.GET("/options", h.adminOptions)
	admin.GET("/engagements", h.listAdminEngagements)
	admin.POST("/engagements", h.createAdminEngagement)
}

func (h *Handler) createNote(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req CreateNoteRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	note, err := createNoteService(req, claims.UserID)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, note)
}

func (h *Handler) listNotes(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var q ListNotesQuery
	if err := c.Bind(&q); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid query params", "")
	}
	if q.SessionID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "session_id is required", "session_id")
	}
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 {
		q.Limit = 20
	}
	rows, total, err := listBySessionService(q, claims.Role)
	if err != nil {
		return shared.InternalError(c, "failed to fetch coaching notes")
	}
	return shared.OKList(c, rows, shared.Meta{Page: q.Page, PerPage: q.Limit, Total: total})
}

func (h *Handler) updateNote(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req UpdateNoteRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	note, err := updateNoteService(c.Param("id"), req, claims.UserID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "coaching note not found")
		}
		if errors.Is(err, ErrForbidden) {
			return shared.Forbidden(c)
		}
		return shared.InternalError(c, "failed to update note")
	}
	return shared.OK(c, note)
}

func (h *Handler) listByParticipant(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var q ListNotesQuery
	if err := c.Bind(&q); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid query params", "")
	}
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 {
		q.Limit = 20
	}
	rows, total, err := listByParticipantService(c.Param("participantId"), q, claims.Role)
	if err != nil {
		return shared.InternalError(c, "failed to fetch coaching notes")
	}
	return shared.OKList(c, rows, shared.Meta{Page: q.Page, PerPage: q.Limit, Total: total})
}

// ── Participants & KPI ────────────────────────────────────────────

func (h *Handler) listParticipants(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	cohortID := c.QueryParam("cohort_id")
	list, err := listCoachingParticipantsService(claims.UserID, cohortID)
	if err != nil {
		return shared.InternalError(c, "failed to list participants")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) kpi(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	cohortID := c.QueryParam("cohort_id")
	kpi, err := getCoachingKPIService(claims.UserID, cohortID)
	if err != nil {
		return shared.InternalError(c, "failed to compute KPIs")
	}
	return shared.OK(c, kpi)
}

func (h *Handler) tracker(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	participantID := c.QueryParam("participant_id")
	if participantID == "" {
		return shared.BadRequest(c, "MISSING_PARAM", "participant_id is required", "participant_id")
	}
	dto, err := getTrackerService(participantID, claims.UserID)
	if err != nil {
		return shared.InternalError(c, "failed to get tracker")
	}
	return shared.OK(c, dto)
}

// ── Goals ─────────────────────────────────────────────────────────

func (h *Handler) createGoal(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req CreateGoalRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	dto, err := createGoalService(req, claims.UserID)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, dto)
}

func (h *Handler) listGoals(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	participantID := c.QueryParam("participant_id")
	if participantID == "" {
		return shared.BadRequest(c, "MISSING_PARAM", "participant_id is required", "participant_id")
	}
	list, err := listGoalsService(participantID, claims.UserID)
	if err != nil {
		return shared.InternalError(c, "failed to list goals")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) updateGoal(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req UpdateGoalRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	dto, err := updateGoalService(c.Param("id"), req, claims.UserID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "goal not found")
		}
		if errors.Is(err, ErrForbidden) {
			return shared.Forbidden(c)
		}
		return shared.InternalError(c, "failed to update goal")
	}
	return shared.OK(c, dto)
}

func (h *Handler) deleteGoal(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if err := deleteGoalService(c.Param("id"), claims.UserID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "goal not found")
		}
		if errors.Is(err, ErrForbidden) {
			return shared.Forbidden(c)
		}
		return shared.InternalError(c, "failed to delete goal")
	}
	return shared.NoContent(c)
}

// ── Dev Notes ─────────────────────────────────────────────────────

func (h *Handler) createDevNote(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req CreateDevNoteRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	dto, err := createDevNoteService(req, claims.UserID)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, dto)
}

func (h *Handler) listDevNotes(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	participantID := c.QueryParam("participant_id")
	facultyID := c.QueryParam("faculty_id")
	if participantID == "" {
		return shared.BadRequest(c, "MISSING_PARAM", "participant_id is required", "participant_id")
	}
	if claims.Role == shared.RoleFaculty {
		facultyID = claims.UserID
	}
	if facultyID == "" {
		return shared.BadRequest(c, "MISSING_PARAM", "faculty_id is required for program managers", "faculty_id")
	}
	list, err := listDevNotesService(participantID, facultyID, claims.Role)
	if err != nil {
		if errors.Is(err, ErrForbidden) {
			return shared.Forbidden(c)
		}
		return shared.InternalError(c, "failed to list dev notes")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) updateDevNote(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req UpdateDevNoteRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	dto, err := updateDevNoteService(c.Param("id"), req, claims.UserID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "dev note not found")
		}
		if errors.Is(err, ErrForbidden) {
			return shared.Forbidden(c)
		}
		return shared.InternalError(c, "failed to update dev note")
	}
	return shared.OK(c, dto)
}

// -- PM coaching admin ---------------------------------------------

func (h *Handler) adminOptions(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	if orgID == "" {
		return shared.BadRequest(c, "MISSING_PARAM", "org_id is required", "org_id")
	}
	dto, err := adminOptionsService(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to load coaching options")
	}
	return shared.OK(c, dto)
}

func (h *Handler) listAdminEngagements(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	if orgID == "" {
		return shared.BadRequest(c, "MISSING_PARAM", "org_id is required", "org_id")
	}
	list, err := listAdminEngagementsService(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to list coaching engagements")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) createAdminEngagement(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req CreateCoachingEngagementRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	dto, err := createAdminEngagementService(req, claims.UserID)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, dto)
}
