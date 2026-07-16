package coaching

import (
	"errors"
	"fmt"
	"io"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/audit"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	// Participant self-view — read-only, scoped to the caller's own coaching.
	// Separate permission so participants don't get the coach/PM read surface.
	self := v1.Group("/coaching", shared.RequireAuth(), shared.HybridPermission("coaching", "self_read", shared.RoleFaculty, shared.RoleCoach, shared.RoleParticipant))
	self.GET("/my", h.getMyCoaching)
	self.GET("/my/sessions", h.getMyCoachingSessions)

	g := v1.Group("/coaching", shared.RequireAuth(), shared.HybridPermission("coaching", "read", shared.RoleFaculty, shared.RoleCoach))

	// Notes (existing)
	g.POST("/notes", h.createNote, shared.HybridPermission("coaching", "write", shared.RoleFaculty, shared.RoleCoach))
	g.GET("/notes", h.listNotes)
	g.PATCH("/notes/:id", h.updateNote, shared.HybridPermission("coaching", "write", shared.RoleFaculty, shared.RoleCoach))
	g.GET("/notes/participant/:participantId", h.listByParticipant)

	// Coaching roster & KPIs
	g.GET("/participants", h.listParticipants)
	g.GET("/kpi", h.kpi)
	g.GET("/tracker", h.tracker)

	// Goals
	g.POST("/goals", h.createGoal, shared.HybridPermission("coaching", "write", shared.RoleFaculty, shared.RoleCoach))
	g.GET("/goals", h.listGoals)
	g.PATCH("/goals/:id", h.updateGoal, shared.HybridPermission("coaching", "write", shared.RoleFaculty, shared.RoleCoach))
	g.DELETE("/goals/:id", h.deleteGoal, shared.HybridPermission("coaching", "write", shared.RoleFaculty, shared.RoleCoach))

	// Development notes (private, per participant)
	g.POST("/dev-notes", h.createDevNote, shared.HybridPermission("coaching", "write", shared.RoleFaculty, shared.RoleCoach))
	g.GET("/dev-notes", h.listDevNotes)
	g.PATCH("/dev-notes/:id", h.updateDevNote, shared.HybridPermission("coaching", "write", shared.RoleFaculty, shared.RoleCoach))

	admin := g.Group("/admin", shared.HybridPermission("coaching", "manage", shared.RoleSuperAdmin, shared.RoleProgramManager))
	admin.GET("/options", h.adminOptions)
	admin.GET("/engagements", h.listAdminEngagements)
	admin.POST("/engagements", h.createAdminEngagement)
	admin.GET("/coaches", h.listOrgCoaches)

	// Coach dashboard — everything scoped to the logged-in coach (coach_id).
	// Inherits coaching:read from the parent group; coaches have that permission.
	coach := g.Group("/coach")
	coach.GET("/summary", h.coachSummary)
	coach.GET("/engagements", h.coachEngagements)
	coach.GET("/sessions/upcoming", h.coachUpcomingSessions)
	coach.GET("/calendar", h.coachCalendar)
	coach.GET("/actions/pending", h.coachPendingActions)
	coach.GET("/notes", h.coachNotes)
	coach.POST("/notes", h.coachCreateNote, shared.RequirePermission("coaching", "write"))
	coach.GET("/documents", h.coachDocuments)
	coach.GET("/documents/all", h.coachAllDocuments)
	coach.POST("/documents", h.coachCreateDocument, shared.RequirePermission("coaching", "write"))
	coach.GET("/documents/:id/file", h.coachDocumentFile)
	coach.GET("/blocks", h.coachBlocks)
	coach.POST("/blocks", h.coachCreateBlock, shared.RequirePermission("coaching", "write"))
	coach.DELETE("/blocks/:id", h.coachDeleteBlock, shared.RequirePermission("coaching", "write"))
	coach.POST("/sessions", h.coachCreateSession, shared.RequirePermission("coaching", "write"))
	coach.POST("/actions", h.coachCreateAction, shared.RequirePermission("coaching", "write"))
	coach.PATCH("/actions/:id", h.coachUpdateAction, shared.RequirePermission("coaching", "write"))
	// AI Coaching Pulse — one-line insight on the coach dashboard, on-demand
	// (LLM call), fetched on page load.
	coach.POST("/ai_pulse", h.coachAIPulse)
}

// -- Coach dashboard -----------------------------------------------
// All handlers scope to the logged-in coach via claims.UserID (= coach_id).

func (h *Handler) coachSummary(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	dto, err := getCoachSummaryService(claims.UserID)
	if err != nil {
		return shared.InternalError(c, "failed to load coach summary")
	}
	return shared.OK(c, dto)
}

// coachAIPulse generates the "Coaching Pulse" one-line insight for the coach
// dashboard — on demand (LLM call), fetched on page load.
func (h *Handler) coachAIPulse(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	insight, err := generateCoachingPulseService(c.Request().Context(), claims.UserID, claims.Role)
	if err != nil {
		return shared.BadRequest(c, "AI_PULSE_ERROR", err.Error(), "")
	}
	return shared.OK(c, map[string]string{"insight": insight})
}

func (h *Handler) coachEngagements(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	list, err := listCoachEngagementsService(claims.UserID)
	if err != nil {
		return shared.InternalError(c, "failed to list engagements")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) coachUpcomingSessions(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	list, err := listCoachUpcomingSessionsService(claims.UserID, limit)
	if err != nil {
		return shared.InternalError(c, "failed to list upcoming sessions")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) coachCalendar(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	list, err := listCoachCalendarService(claims.UserID, c.QueryParam("from"), c.QueryParam("to"))
	if err != nil {
		fmt.Printf("⚠️  coachCalendar: %v\n", err)
		return shared.InternalError(c, "failed to load calendar")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) coachPendingActions(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	limit, _ := strconv.Atoi(c.QueryParam("limit"))
	list, err := listCoachPendingActionsService(claims.UserID, limit)
	if err != nil {
		return shared.InternalError(c, "failed to list pending actions")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) coachNotes(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	list, err := listCoachNotesService(claims.UserID)
	if err != nil {
		return shared.InternalError(c, "failed to list session notes")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) coachBlocks(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	list, err := listCoachBlocksService(claims.UserID, c.QueryParam("from"), c.QueryParam("to"))
	if err != nil {
		return shared.InternalError(c, "failed to list blocks")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) coachCreateBlock(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	var req CreateCoachBlockRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	id, err := createCoachBlockService(claims.UserID, req)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, map[string]string{"id": id})
}

func (h *Handler) coachDeleteBlock(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	if err := deleteCoachBlockService(claims.UserID, c.Param("id")); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "block not found")
		}
		return shared.InternalError(c, "failed to delete block")
	}
	return shared.NoContent(c)
}

func (h *Handler) coachCreateSession(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	var req CreateCoachSessionRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	dto, err := createCoachSessionService(claims.UserID, req)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "engagement not found")
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, dto)
}

func (h *Handler) coachAllDocuments(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	list, err := listAllCoachDocumentsService(claims.UserID)
	if err != nil {
		return shared.InternalError(c, "failed to list documents")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) coachCreateDocument(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	var req CreateCoachDocumentRequest
	var fileData []byte
	var fileName, mimeType string
	if strings.Contains(c.Request().Header.Get("Content-Type"), "multipart/form-data") {
		req.ParticipantID = c.FormValue("participant_id")
		req.Title = c.FormValue("title")
		req.DocType = c.FormValue("doc_type")
		req.UploadedBy = c.FormValue("uploaded_by")
		req.URL = c.FormValue("url")
		req.IsShared = c.FormValue("is_shared") == "true"
		req.CoachSummary = c.FormValue("coach_summary")
		if fh, err := c.FormFile("file"); err == nil && fh != nil {
			f, err := fh.Open()
			if err != nil {
				return shared.BadRequest(c, "VALIDATION_ERROR", "failed to read file", "file")
			}
			defer f.Close()
			fileData, _ = io.ReadAll(f)
			fileName = fh.Filename
			mimeType = fh.Header.Get("Content-Type")
		}
	} else if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	id, err := createCoachDocumentService(claims.UserID, req, fileData, fileName, mimeType)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, map[string]string{"id": id})
}

func (h *Handler) coachDocumentFile(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	data, fileName, mimeType, err := getCoachDocumentFile(claims.UserID, c.Param("id"))
	if err != nil {
		return shared.InternalError(c, "failed to load file")
	}
	if len(data) == 0 {
		return shared.NotFound(c, "no file attached")
	}
	if mimeType == "" {
		mimeType = "application/octet-stream"
	}
	if fileName == "" {
		fileName = "document"
	}
	c.Response().Header().Set("Content-Disposition", `inline; filename="`+fileName+`"`)
	return c.Blob(200, mimeType, data)
}

func (h *Handler) coachCreateNote(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	var req CreateCoachNoteRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	id, err := createCoachNoteService(claims.UserID, req)
	if err != nil {
		if errors.Is(err, ErrForbidden) {
			return shared.Forbidden(c)
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, map[string]string{"id": id})
}

func (h *Handler) coachDocuments(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	participantID := c.QueryParam("participant_id")
	if participantID == "" {
		return shared.BadRequest(c, "MISSING_PARAM", "participant_id is required", "participant_id")
	}
	list, err := listCoachDocumentsService(claims.UserID, participantID)
	if err != nil {
		return shared.InternalError(c, "failed to list documents")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) coachCreateAction(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	var req CreateCoachActionRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	dto, err := createCoachActionService(claims.UserID, req)
	if err != nil {
		if errors.Is(err, ErrForbidden) {
			return shared.Forbidden(c)
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, dto)
}

func (h *Handler) coachUpdateAction(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	var req UpdateActionStatusRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	if err := updateCoachActionStatusService(c.Param("id"), claims.UserID, req.Status); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "action not found")
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.NoContent(c)
}

// getMyCoaching returns the calling participant's own read-only coaching view.
func (h *Handler) getMyCoaching(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	// ?program_id= scopes to the program the switcher is on (empty = fall back
	// to most-recent engagement). Malformed values are ignored.
	programID := c.QueryParam("program_id")
	if programID != "" {
		if _, perr := uuid.Parse(programID); perr != nil {
			programID = ""
		}
	}
	dto, err := getMyCoachingService(claims.UserID, programID)
	if err != nil {
		return shared.InternalError(c, "failed to load coaching")
	}
	return shared.OK(c, dto)
}

// getMyCoachingSessions returns the calling participant's own coaching
// sessions, independent of cohort (see listMyCoachingSessions doc comment).
func (h *Handler) getMyCoachingSessions(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	list, err := listMyCoachingSessionsService(claims.UserID)
	if err != nil {
		return shared.InternalError(c, "failed to load coaching sessions")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
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
	audit.Log(c, audit.Event{Category: "coaching", Action: "note.create", Severity: audit.SeveritySuccess, TargetType: "coaching_note", TargetID: note.ID})
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
	id := c.Param("id")
	note, err := updateNoteService(id, req, claims.UserID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "coaching note not found")
		}
		if errors.Is(err, ErrForbidden) {
			return shared.Forbidden(c)
		}
		return shared.InternalError(c, "failed to update note")
	}
	audit.Log(c, audit.Event{Category: "coaching", Action: "note.update", Severity: audit.SeveritySuccess, TargetType: "coaching_note", TargetID: id})
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
	audit.Log(c, audit.Event{Category: "coaching", Action: "goal.create", Severity: audit.SeveritySuccess, TargetType: "coaching_goal", TargetID: dto.ID, Detail: map[string]any{"title": dto.Title}})
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
	id := c.Param("id")
	dto, err := updateGoalService(id, req, claims.UserID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "goal not found")
		}
		if errors.Is(err, ErrForbidden) {
			return shared.Forbidden(c)
		}
		return shared.InternalError(c, "failed to update goal")
	}
	audit.Log(c, audit.Event{Category: "coaching", Action: "goal.update", Severity: audit.SeveritySuccess, TargetType: "coaching_goal", TargetID: id})
	return shared.OK(c, dto)
}

func (h *Handler) deleteGoal(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	id := c.Param("id")
	if err := deleteGoalService(id, claims.UserID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "goal not found")
		}
		if errors.Is(err, ErrForbidden) {
			return shared.Forbidden(c)
		}
		return shared.InternalError(c, "failed to delete goal")
	}
	audit.Log(c, audit.Event{Category: "coaching", Action: "goal.delete", Severity: audit.SeverityWarning, TargetType: "coaching_goal", TargetID: id})
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
	audit.Log(c, audit.Event{Category: "coaching", Action: "dev_note.create", Severity: audit.SeveritySuccess, TargetType: "dev_note", TargetID: dto.ID})
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
	id := c.Param("id")
	dto, err := updateDevNoteService(id, req, claims.UserID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "dev note not found")
		}
		if errors.Is(err, ErrForbidden) {
			return shared.Forbidden(c)
		}
		return shared.InternalError(c, "failed to update dev note")
	}
	audit.Log(c, audit.Event{Category: "coaching", Action: "dev_note.update", Severity: audit.SeveritySuccess, TargetType: "dev_note", TargetID: id})
	return shared.OK(c, dto)
}

// -- PM coaching admin ---------------------------------------------

// isSuperAdminCaller lets superadmin (primary + secondary) omit org_id to mean
// "all orgs" — every other org-scoped role must pass a concrete org_id.
func isSuperAdminCaller(c echo.Context) bool {
	claims := shared.ClaimsFrom(c)
	return claims != nil && (claims.Role == shared.RoleSuperAdmin || claims.Role == shared.RoleSuperAdminSecondary)
}

func (h *Handler) adminOptions(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	if orgID == "" && !isSuperAdminCaller(c) {
		return shared.BadRequest(c, "MISSING_PARAM", "org_id is required", "org_id")
	}
	dto, err := adminOptionsService(orgID)
	if err != nil {
		fmt.Printf("⚠️  adminOptions (org_id=%q): %v\n", orgID, err)
		return shared.InternalError(c, "failed to load coaching options")
	}
	return shared.OK(c, dto)
}

func (h *Handler) listOrgCoaches(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	if orgID == "" && !isSuperAdminCaller(c) {
		return shared.BadRequest(c, "MISSING_PARAM", "org_id is required", "org_id")
	}
	list, err := listOrgCoachesService(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to list coaches")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) listAdminEngagements(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	if orgID == "" && !isSuperAdminCaller(c) {
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
	audit.Log(c, audit.Event{
		Category: "coaching", Action: "engagement.create", Severity: audit.SeveritySuccess,
		TargetType: "coaching_engagement", TargetID: dto.ID, OrgID: dto.OrgID,
	})
	return shared.Created(c, dto)
}
