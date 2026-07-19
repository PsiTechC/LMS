package sessions

import (
	"errors"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/audit"
	"github.com/xa-lms/api/internal/shared"
	"github.com/xa-lms/api/pkg/database"
)

type Handler struct{}

func NewHandler() *Handler {
	fixSessionSchema()
	return &Handler{}
}

func fixSessionSchema() {
	// class_sessions columns added over time by migrations/*.sql that never
	// actually ran against the shared DB (per CLAUDE.md, only this Go code
	// applies schema at boot) — keep this idempotent and exhaustive so a
	// column missing on the live table doesn't surface one at a time as 400s.
	database.DB.Exec(`ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS activity_id UUID REFERENCES activities(id) ON DELETE SET NULL`)
	database.DB.Exec(`ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS whiteboard_url TEXT`)
	database.DB.Exec(`ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS notes TEXT`)
	database.DB.Exec(`ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ`)
	database.DB.Exec(`ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ`)
	database.DB.Exec(`ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS reminder_enabled BOOLEAN NOT NULL DEFAULT FALSE`)
	database.DB.Exec(`ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS engagement_id UUID REFERENCES coaching_engagements(id) ON DELETE SET NULL`)
	database.DB.Exec(`ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS meeting_provider VARCHAR(30)`)
	database.DB.Exec(`ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS provider_event_id TEXT`)
	database.DB.Exec(`ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS provider_web_link TEXT`)
	database.DB.Exec(`ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS meeting_organizer_email TEXT`)
	database.DB.Exec(`ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS meeting_status VARCHAR(30)`)
	database.DB.Exec(`ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS meeting_error TEXT`)
	database.DB.Exec(`CREATE INDEX IF NOT EXISTS idx_class_sessions_activity ON class_sessions(activity_id)`)
	database.DB.Exec(`CREATE INDEX IF NOT EXISTS idx_class_sessions_faculty ON class_sessions(faculty_id)`)
	// listSessions/listSessionsByFaculty filter heavily on these — missing
	// indexes meant every /v1/sessions?cohort_id=... call sequential-scanned
	// class_sessions (seen as 500-800ms "SLOW SQL" in the server log).
	database.DB.Exec(`CREATE INDEX IF NOT EXISTS idx_class_sessions_cohort ON class_sessions(cohort_id)`)
	database.DB.Exec(`CREATE INDEX IF NOT EXISTS idx_class_sessions_program ON class_sessions(program_id)`)
	database.DB.Exec(`CREATE INDEX IF NOT EXISTS idx_class_sessions_engagement ON class_sessions(engagement_id)`)
}

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/sessions", shared.RequireAuth(), shared.HybridPermission("sessions", "read", shared.RoleFaculty, shared.RoleCoach, shared.RoleParticipant))

	// Superadmin cross-org aggregate (registered before /:id so it never binds :id).
	g.GET("/admin", h.admin, shared.HybridPermission("sessions", "admin", shared.RoleSuperAdmin))

	// CRUD
	g.GET("", h.list)
	g.POST("", h.create, shared.HybridPermission("sessions", "create", shared.RoleFaculty))
	g.GET("/:id", h.get)
	g.PATCH("/:id", h.update, shared.HybridPermission("sessions", "update", shared.RoleFaculty))
	g.POST("/:id/teams-meeting", h.createTeamsMeeting, shared.HybridPermission("sessions", "update", shared.RoleSuperAdmin, shared.RoleProgramManager, shared.RoleFaculty, shared.RoleCoach))
	g.DELETE("/:id", h.delete, shared.HybridPermission("sessions", "delete", shared.RoleSuperAdmin, shared.RoleProgramManager, shared.RoleFaculty))

	// Lifecycle — coaches can also start/end their own sessions (fixed a real
	// gap: no live UI reached this for coaches before, and the ownership
	// check inside start/endSessionService now covers RoleCoach too).
	g.POST("/:id/start", h.startSession, shared.HybridPermission("sessions", "update", shared.RoleFaculty, shared.RoleCoach))
	g.POST("/:id/end", h.endSession, shared.HybridPermission("sessions", "update", shared.RoleFaculty, shared.RoleCoach))

	// Agenda + Notes
	g.PATCH("/:id/agenda", h.updateAgenda, shared.HybridPermission("sessions", "update", shared.RoleFaculty))
	g.PATCH("/:id/notes", h.updateNotes, shared.HybridPermission("sessions", "update", shared.RoleFaculty))

	// Materials
	g.POST("/:id/materials", h.addMaterial, shared.HybridPermission("sessions", "update", shared.RoleFaculty))
	g.GET("/:id/materials", h.listMaterials)
	g.DELETE("/:id/materials/:materialId", h.deleteMaterial, shared.HybridPermission("sessions", "update", shared.RoleFaculty))

	// Attendance
	g.POST("/:id/attendance", h.markAttendance, shared.HybridPermission("sessions", "update", shared.RoleFaculty))
	g.GET("/:id/attendance", h.getAttendance)

	// Polls
	g.GET("/:id/polls", h.listPolls)
	g.POST("/:id/polls", h.createPoll, shared.HybridPermission("sessions", "update", shared.RoleFaculty))
	g.POST("/:id/polls/:pollId/activate", h.activatePoll, shared.HybridPermission("sessions", "update", shared.RoleFaculty))
	g.POST("/:id/polls/:pollId/deactivate", h.deactivatePoll, shared.HybridPermission("sessions", "update", shared.RoleFaculty))
	g.GET("/:id/polls/:pollId/results", h.pollResults)
	g.POST("/:id/polls/:pollId/vote", h.vote)

	// Action items
	g.GET("/:id/action-items", h.listActionItems)
	g.POST("/:id/action-items", h.createActionItem, shared.HybridPermission("sessions", "update", shared.RoleFaculty))
	g.PATCH("/:id/action-items/:itemId", h.updateActionItem, shared.HybridPermission("sessions", "update", shared.RoleFaculty))

	// Reflections
	g.POST("/:id/reflections", h.createReflection)
	g.GET("/:id/reflections", h.listReflections)
	g.GET("/:id/reflections/mine", h.getMyReflection)
	g.POST("/:id/reflections/:reflectionId/comment", h.addReflectionComment, shared.HybridPermission("sessions", "update", shared.RoleFaculty))
}

// ── Session CRUD ───────────────────────────────────────────────────────────

// admin returns the cross-org Live Sessions aggregate (summary + sessions).
func (h *Handler) admin(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	if orgID != "" {
		if _, err := uuid.Parse(orgID); err != nil {
			return shared.BadRequest(c, "VALIDATION_ERROR", "invalid org_id", "org_id")
		}
	}
	resp, err := listAdminSessionsService(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to load sessions")
	}
	return shared.OK(c, resp)
}

func (h *Handler) list(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var q ListSessionsQuery
	if err := c.Bind(&q); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid query params", "")
	}
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 {
		q.Limit = 20
	}
	rows, total, err := listSessionsService(q, claims.UserID, claims.Role)
	if err != nil {
		return shared.InternalError(c, "failed to fetch sessions")
	}
	return shared.OKList(c, rows, shared.Meta{Page: q.Page, PerPage: q.Limit, Total: total})
}

func (h *Handler) get(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	id := c.Param("id")
	if err := checkSessionReadAccess(id, claims.UserID, claims.Role); err != nil {
		if errors.Is(err, ErrForbidden) {
			return shared.Forbidden(c)
		}
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "session not found")
		}
		return shared.InternalError(c, "access check failed")
	}
	s, err := getSessionService(id)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "session not found")
		}
		return shared.InternalError(c, "failed to fetch session")
	}
	return shared.OK(c, s)
}

func (h *Handler) create(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req CreateSessionRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	s, err := createSessionService(req, claims.UserID, claims.Role)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	audit.Log(c, audit.Event{
		Category:   "sessions",
		Action:     "session.create",
		Severity:   audit.SeveritySuccess,
		TargetType: "session",
		TargetID:   s.ID,
		Detail:     map[string]any{"title": s.Title, "cohort_id": s.CohortID, "scheduled_at": s.ScheduledAt},
	})
	return shared.Created(c, s)
}

func (h *Handler) update(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req UpdateSessionRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	s, err := updateSessionService(c.Param("id"), req, claims.UserID, claims.Role)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "session not found")
		}
		if err.Error() == "forbidden" {
			return shared.Forbidden(c)
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.OK(c, s)
}

func (h *Handler) delete(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if err := cancelSessionService(c.Param("id"), claims.UserID, claims.Role); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "session not found")
		}
		if err.Error() == "forbidden" {
			return shared.Forbidden(c)
		}
		return shared.InternalError(c, "failed to cancel session")
	}
	return shared.NoContent(c)
}

// ── Lifecycle ──────────────────────────────────────────────────────────────

func (h *Handler) startSession(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	s, err := startSessionService(c.Param("id"), claims.UserID, claims.Role)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "session not found")
		}
		if err.Error() == "forbidden" {
			return shared.Forbidden(c)
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.OK(c, s)
}

func (h *Handler) endSession(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	s, err := endSessionService(c.Param("id"), claims.UserID, claims.Role)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "session not found")
		}
		if err.Error() == "forbidden" {
			return shared.Forbidden(c)
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.OK(c, s)
}

// ── Agenda + Notes ─────────────────────────────────────────────────────────

func (h *Handler) updateAgenda(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req UpdateAgendaRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if err := updateAgendaService(c.Param("id"), req.Items, claims.UserID, claims.Role); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "session not found")
		}
		if err.Error() == "forbidden" {
			return shared.Forbidden(c)
		}
		return shared.InternalError(c, "failed to update agenda")
	}
	return shared.NoContent(c)
}

func (h *Handler) updateNotes(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req UpdateNotesRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if err := updateNotesService(c.Param("id"), req.Notes, claims.UserID, claims.Role); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "session not found")
		}
		if err.Error() == "forbidden" {
			return shared.Forbidden(c)
		}
		return shared.InternalError(c, "failed to update notes")
	}
	return shared.NoContent(c)
}

// ── Materials ──────────────────────────────────────────────────────────────

func (h *Handler) addMaterial(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	id := c.Param("id")
	if err := checkSessionReadAccess(id, claims.UserID, claims.Role); err != nil {
		if errors.Is(err, ErrForbidden) {
			return shared.Forbidden(c)
		}
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "session not found")
		}
		return shared.InternalError(c, "access check failed")
	}
	var req AddMaterialRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	m, err := addMaterialService(id, claims.UserID, req)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, m)
}

func (h *Handler) listMaterials(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	id := c.Param("id")
	if err := checkSessionReadAccess(id, claims.UserID, claims.Role); err != nil {
		if errors.Is(err, ErrForbidden) {
			return shared.Forbidden(c)
		}
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "session not found")
		}
		return shared.InternalError(c, "access check failed")
	}
	rows, err := listMaterialsService(id)
	if err != nil {
		return shared.InternalError(c, "failed to fetch materials")
	}
	return shared.OK(c, rows)
}

func (h *Handler) deleteMaterial(c echo.Context) error {
	id := c.Param("id")
	materialId := c.Param("materialId")
	if err := deleteMaterialService(id, materialId); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "material not found")
		}
		return shared.InternalError(c, "failed to delete material")
	}
	return shared.NoContent(c)
}

// ── Attendance ─────────────────────────────────────────────────────────────

func (h *Handler) markAttendance(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	id := c.Param("id")
	if err := checkSessionReadAccess(id, claims.UserID, claims.Role); err != nil {
		if errors.Is(err, ErrForbidden) {
			return shared.Forbidden(c)
		}
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "session not found")
		}
		return shared.InternalError(c, "access check failed")
	}
	var req MarkAttendanceRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if err := markAttendanceService(id, req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.NoContent(c)
}

func (h *Handler) getAttendance(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	id := c.Param("id")
	if err := checkSessionReadAccess(id, claims.UserID, claims.Role); err != nil {
		if errors.Is(err, ErrForbidden) {
			return shared.Forbidden(c)
		}
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "session not found")
		}
		return shared.InternalError(c, "access check failed")
	}
	rows, err := getAttendanceService(id)
	if err != nil {
		return shared.InternalError(c, "failed to fetch attendance")
	}
	return shared.OK(c, rows)
}

// ── Polls ──────────────────────────────────────────────────────────────────

func (h *Handler) listPolls(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	id := c.Param("id")
	if err := checkSessionReadAccess(id, claims.UserID, claims.Role); err != nil {
		if errors.Is(err, ErrForbidden) {
			return shared.Forbidden(c)
		}
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "session not found")
		}
		return shared.InternalError(c, "access check failed")
	}
	rows, err := listPollsService(id)
	if err != nil {
		return shared.InternalError(c, "failed to fetch polls")
	}
	return shared.OK(c, rows)
}

func (h *Handler) createPoll(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req CreatePollRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	p, err := createPollService(c.Param("id"), claims.UserID, req)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, p)
}

func (h *Handler) activatePoll(c echo.Context) error {
	if err := activatePollService(c.Param("id"), c.Param("pollId")); err != nil {
		return shared.InternalError(c, "failed to activate poll")
	}
	return shared.NoContent(c)
}

func (h *Handler) deactivatePoll(c echo.Context) error {
	if err := deactivatePollService(c.Param("pollId")); err != nil {
		return shared.InternalError(c, "failed to deactivate poll")
	}
	return shared.NoContent(c)
}

func (h *Handler) pollResults(c echo.Context) error {
	r, err := getPollResultsService(c.Param("pollId"))
	if err != nil {
		return shared.InternalError(c, "failed to fetch poll results")
	}
	return shared.OK(c, r)
}

func (h *Handler) vote(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req SubmitVoteRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if err := submitVoteService(c.Param("pollId"), claims.UserID, req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.NoContent(c)
}

// ── Action Items ───────────────────────────────────────────────────────────

func (h *Handler) listActionItems(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	id := c.Param("id")
	if err := checkSessionReadAccess(id, claims.UserID, claims.Role); err != nil {
		if errors.Is(err, ErrForbidden) {
			return shared.Forbidden(c)
		}
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "session not found")
		}
		return shared.InternalError(c, "access check failed")
	}
	rows, err := listActionItemsService(id)
	if err != nil {
		return shared.InternalError(c, "failed to fetch action items")
	}
	return shared.OK(c, rows)
}

func (h *Handler) createActionItem(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req CreateActionItemRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	a, err := createActionItemService(c.Param("id"), claims.UserID, req)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, a)
}

func (h *Handler) updateActionItem(c echo.Context) error {
	var req UpdateActionItemRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if err := updateActionItemService(c.Param("itemId"), req); err != nil {
		return shared.InternalError(c, "failed to update action item")
	}
	return shared.NoContent(c)
}

// ── Reflections ────────────────────────────────────────────────────────────

func (h *Handler) createReflection(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req CreateReflectionRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	r, err := createReflectionService(c.Param("id"), claims.UserID, req)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, r)
}

func (h *Handler) listReflections(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	id := c.Param("id")
	if err := checkSessionReadAccess(id, claims.UserID, claims.Role); err != nil {
		if errors.Is(err, ErrForbidden) {
			return shared.Forbidden(c)
		}
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "session not found")
		}
		return shared.InternalError(c, "access check failed")
	}
	agendaItemID := c.QueryParam("agenda_item_id")
	rows, err := listReflectionsService(id, agendaItemID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch reflections")
	}
	return shared.OK(c, rows)
}

func (h *Handler) getMyReflection(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	agendaItemID := c.QueryParam("agenda_item_id")
	if agendaItemID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "agenda_item_id is required", "agenda_item_id")
	}
	r, err := getMyReflectionService(c.Param("id"), agendaItemID, claims.UserID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch reflection")
	}
	if r == nil {
		return shared.OK(c, nil)
	}
	return shared.OK(c, r)
}

func (h *Handler) addReflectionComment(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req AddReflectionCommentRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if err := addReflectionCommentService(c.Param("reflectionId"), claims.UserID, req); err != nil {
		if err.Error() == "reflection not found" {
			return shared.NotFound(c, "reflection not found")
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.NoContent(c)
}

func (h *Handler) createTeamsMeeting(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	session, err := createTeamsMeetingService(c.Request().Context(), c.Param("id"), claims.UserID, claims.Role)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "session not found")
		}
		if err.Error() == "forbidden" {
			return shared.Forbidden(c)
		}
		return c.JSON(502, map[string]any{
			"data": nil,
			"error": shared.ErrorDetail{
				Code:    "MICROSOFT_TEAMS_UNAVAILABLE",
				Message: "Microsoft Teams could not create the meeting",
			},
		})
	}
	return shared.OK(c, session)
}
