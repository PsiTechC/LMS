package programs

import (
	"errors"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/audit"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	// Public route — no auth needed for landing page
	v1.GET("/programs/public", h.listPublic)

	g := v1.Group("/programs", shared.RequireAuth())

	// Self-enroll into an Open Program (marketplace). Any authenticated user may
	// enroll into a program flagged is_open; lands them in the default XA-LMS org.
	g.POST("/:id/enroll", h.enrollPublic)

	// Programs CRUD
	g.GET("", h.list)
	g.POST("", h.create, shared.HybridPermission("programs", "create", shared.RoleProgramManager, shared.RoleFaculty))
	g.GET("/:id", h.get)
	g.PATCH("/:id", h.update, shared.HybridPermission("programs", "update", shared.RoleProgramManager, shared.RoleFaculty))
	g.DELETE("/:id", h.delete, shared.HybridPermission("programs", "delete", shared.RoleProgramManager, shared.RoleFaculty))
	g.POST("/:id/publish", h.publish, shared.HybridPermission("programs", "update", shared.RoleProgramManager, shared.RoleFaculty))
	g.POST("/:id/duplicate", h.duplicate, shared.HybridPermission("programs", "create", shared.RoleProgramManager, shared.RoleFaculty))

	// Phases (nested under a program)
	g.POST("/:id/phases", h.createPhase, shared.HybridPermission("programs", "update", shared.RoleProgramManager, shared.RoleFaculty))
	g.PATCH("/:id/phases/:phaseId", h.updatePhase, shared.HybridPermission("programs", "update", shared.RoleProgramManager, shared.RoleFaculty))
	g.DELETE("/:id/phases/:phaseId", h.deletePhase, shared.HybridPermission("programs", "update", shared.RoleProgramManager, shared.RoleFaculty))
	g.POST("/:id/phases/reorder", h.reorderPhases, shared.HybridPermission("programs", "update", shared.RoleProgramManager, shared.RoleFaculty))

	// Modules (nested under a phase — group activities into PRE-WORK/POST-WORK slots)
	g.POST("/:id/phases/:phaseId/modules", h.createModule, shared.HybridPermission("programs", "update", shared.RoleProgramManager, shared.RoleFaculty))
	g.PATCH("/:id/phases/:phaseId/modules/:moduleId", h.updateModule, shared.HybridPermission("programs", "update", shared.RoleProgramManager, shared.RoleFaculty))
	g.DELETE("/:id/phases/:phaseId/modules/:moduleId", h.deleteModule, shared.HybridPermission("programs", "update", shared.RoleProgramManager, shared.RoleFaculty))

	// Activities (nested under program for auth scoping)
	g.POST("/:id/activities", h.createActivity, shared.HybridPermission("programs", "update", shared.RoleProgramManager, shared.RoleFaculty))
	g.PATCH("/:id/activities/:actId", h.updateActivity, shared.HybridPermission("programs", "update", shared.RoleProgramManager, shared.RoleFaculty))
	g.DELETE("/:id/activities/:actId", h.deleteActivity, shared.HybridPermission("programs", "update", shared.RoleProgramManager, shared.RoleFaculty))

	// Activity Faculty assignment
	g.GET("/:id/activities/:actId/faculty", h.listActivityFaculty, shared.HybridPermission("programs", "read", shared.RoleProgramManager, shared.RoleFaculty, shared.RoleCoach))
	g.POST("/:id/activities/:actId/faculty", h.assignFaculty, shared.HybridPermission("programs", "update", shared.RoleProgramManager, shared.RoleFaculty))
	g.DELETE("/:id/activities/:actId/faculty/:facultyId", h.removeFaculty, shared.HybridPermission("programs", "update", shared.RoleProgramManager, shared.RoleFaculty))

	// PM schedules a class_session for a specific live_session/coaching activity
	g.GET("/:id/activities/:actId/sessions", h.listActivitySessions, shared.HybridPermission("programs", "read", shared.RoleProgramManager, shared.RoleFaculty, shared.RoleCoach))
	g.POST("/:id/activities/:actId/sessions", h.scheduleSession, shared.HybridPermission("programs", "update", shared.RoleProgramManager, shared.RoleFaculty))

	// Org faculty list (for PM to pick from — simple id/name/email map)
	g.GET("/faculty", h.listOrgFaculty, shared.HybridPermission("programs", "read", shared.RoleProgramManager, shared.RoleFaculty, shared.RoleCoach))

	// Org faculty with full profiles (Roster tab)
	g.GET("/faculty/profiles", h.listOrgFacultyProfiles, shared.HybridPermission("programs", "read", shared.RoleProgramManager, shared.RoleFaculty, shared.RoleCoach))

	// Faculty dashboard overview
	g.GET("/faculty/dashboard", h.facultyDashboard, shared.HybridPermission("programs", "read", shared.RoleProgramManager, shared.RoleFaculty, shared.RoleCoach))

	// Faculty L1-L4 summary table
	g.GET("/faculty/l1l4", h.facultyL1L4Summary, shared.HybridPermission("programs", "read", shared.RoleProgramManager, shared.RoleFaculty, shared.RoleCoach))

	// Faculty schedule / calendar
	g.GET("/faculty/:facultyId/schedule", h.facultySchedule, shared.HybridPermission("programs", "read", shared.RoleProgramManager, shared.RoleFaculty, shared.RoleCoach))

	// Faculty assignments — all sessions/programs a faculty member is assigned to
	g.GET("/faculty/:facultyId/assignments", h.facultyAssignments, shared.HybridPermission("programs", "read", shared.RoleProgramManager, shared.RoleFaculty, shared.RoleCoach))

	// Update faculty profile fields
	g.PATCH("/faculty/:facultyId/profile", h.updateFacultyProfile, shared.HybridPermission("programs", "update", shared.RoleProgramManager, shared.RoleFaculty))

	// Program-level materials (not tied to a session)
	g.GET("/:id/materials", h.listMaterials, shared.HybridPermission("programs", "read", shared.RoleProgramManager, shared.RoleFaculty, shared.RoleCoach))
	g.POST("/:id/materials", h.addMaterial, shared.HybridPermission("programs", "update", shared.RoleProgramManager, shared.RoleFaculty))
	g.DELETE("/:id/materials/:materialId", h.deleteMaterial, shared.HybridPermission("programs", "update", shared.RoleProgramManager, shared.RoleFaculty))
}

// ── Programs ──────────────────────────────────────────────────────

func (h *Handler) listPublic(c echo.Context) error {
	list, err := listPublicProgramsService()
	if err != nil {
		return shared.InternalError(c, "failed to list programs")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) enrollPublic(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	programID := c.Param("id")

	enrolledID, err := enrollPublicProgramService(programID, claims.UserID)
	if err != nil {
		switch {
		case errors.Is(err, ErrNotFound):
			return shared.NotFound(c, "program not found")
		case errors.Is(err, ErrNotOpen):
			return shared.BadRequest(c, "NOT_OPEN", "this program is not open for enrollment", "")
		default:
			return shared.InternalError(c, "failed to enroll")
		}
	}
	return shared.OK(c, map[string]string{"program_id": enrolledID, "status": "enrolled"})
}

func (h *Handler) list(c echo.Context) error {
	claims := shared.ClaimsFrom(c)

	orgID := ""
	// Superadmin (primary + secondary) may omit org_id to mean "all orgs" —
	// every other org-scoped role must pass a concrete org_id.
	if claims.Role != shared.RoleFaculty && claims.Role != shared.RoleSuperAdmin && claims.Role != shared.RoleSuperAdminSecondary {
		orgID = c.QueryParam("org_id")
		if orgID == "" {
			return shared.BadRequest(c, "MISSING_PARAM", "org_id is required", "org_id")
		}
	} else if claims.Role == shared.RoleSuperAdmin || claims.Role == shared.RoleSuperAdminSecondary {
		orgID = c.QueryParam("org_id")
	}

	list, err := listProgramsService(orgID, claims.Role, claims.UserID)
	if err != nil {
		return shared.InternalError(c, "failed to list programs")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) get(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	id := c.Param("id")
	if err := checkFacultyAccess(id, claims.Role, claims.UserID); errors.Is(err, ErrForbidden) {
		return shared.Forbidden(c)
	} else if err != nil {
		return shared.InternalError(c, "access check failed")
	}
	detail, err := getProgramService(id)
	if errors.Is(err, ErrNotFound) {
		return shared.NotFound(c, "program not found")
	}
	if err != nil {
		return shared.InternalError(c, "failed to get program")
	}
	return shared.OK(c, detail)
}

func (h *Handler) create(c echo.Context) error {
	var req CreateProgramRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}

	claims := shared.ClaimsFrom(c)
	orgID := c.QueryParam("org_id")
	if orgID == "" {
		return shared.BadRequest(c, "MISSING_PARAM", "org_id is required", "org_id")
	}

	p, err := createProgramService(req, orgID, claims.UserID)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	audit.Log(c, audit.Event{
		Category:   "programs",
		Action:     "program.create",
		Severity:   audit.SeveritySuccess,
		TargetType: "program",
		TargetID:   p.ID,
		OrgID:      p.OrgID,
		Detail:     map[string]any{"title": p.Title, "status": p.Status},
	})
	return shared.Created(c, p)
}

func (h *Handler) update(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	id := c.Param("id")
	if err := checkFacultyAccess(id, claims.Role, claims.UserID); errors.Is(err, ErrForbidden) {
		return shared.Forbidden(c)
	} else if err != nil {
		return shared.InternalError(c, "access check failed")
	}
	var req UpdateProgramRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}

	p, err := updateProgramService(id, req)
	if errors.Is(err, ErrNotFound) {
		return shared.NotFound(c, "program not found")
	}
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.OK(c, p)
}

func (h *Handler) publish(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	id := c.Param("id")
	if err := checkFacultyAccess(id, claims.Role, claims.UserID); errors.Is(err, ErrForbidden) {
		return shared.Forbidden(c)
	} else if err != nil {
		return shared.InternalError(c, "access check failed")
	}
	p, err := publishProgramService(id)
	if errors.Is(err, ErrNotFound) {
		return shared.NotFound(c, "program not found")
	}
	if err != nil {
		return shared.InternalError(c, "failed to publish program")
	}
	return shared.OK(c, p)
}

func (h *Handler) duplicate(c echo.Context) error {
	id := c.Param("id")
	claims := shared.ClaimsFrom(c)
	p, err := duplicateProgramService(id, claims.UserID)
	if errors.Is(err, ErrNotFound) {
		return shared.NotFound(c, "program not found")
	}
	if err != nil {
		return shared.InternalError(c, "failed to duplicate program")
	}
	return shared.Created(c, p)
}

func (h *Handler) delete(c echo.Context) error {
	id := c.Param("id")
	if err := deleteProgramService(id); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "program not found")
		}
		return shared.InternalError(c, "failed to delete program")
	}
	return shared.NoContent(c)
}

// ── Phases ────────────────────────────────────────────────────────

func (h *Handler) createPhase(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	programID := c.Param("id")
	if err := checkFacultyAccess(programID, claims.Role, claims.UserID); errors.Is(err, ErrForbidden) {
		return shared.Forbidden(c)
	} else if err != nil {
		return shared.InternalError(c, "access check failed")
	}
	var req UpsertPhaseRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}

	ph, err := upsertPhaseService(programID, nil, req)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, ph)
}

func (h *Handler) updatePhase(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	programID := c.Param("id")
	if err := checkFacultyAccess(programID, claims.Role, claims.UserID); errors.Is(err, ErrForbidden) {
		return shared.Forbidden(c)
	} else if err != nil {
		return shared.InternalError(c, "access check failed")
	}
	phaseID := c.Param("phaseId")
	var req UpsertPhaseRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}

	ph, err := upsertPhaseService(programID, &phaseID, req)
	if errors.Is(err, ErrNotFound) {
		return shared.NotFound(c, "phase not found")
	}
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.OK(c, ph)
}

func (h *Handler) deletePhase(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	programID := c.Param("id")
	if err := checkFacultyAccess(programID, claims.Role, claims.UserID); errors.Is(err, ErrForbidden) {
		return shared.Forbidden(c)
	} else if err != nil {
		return shared.InternalError(c, "access check failed")
	}
	phaseID := c.Param("phaseId")
	if err := deletePhaseService(phaseID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "phase not found")
		}
		return shared.InternalError(c, "failed to delete phase")
	}
	return shared.NoContent(c)
}

func (h *Handler) reorderPhases(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	programID := c.Param("id")
	if err := checkFacultyAccess(programID, claims.Role, claims.UserID); errors.Is(err, ErrForbidden) {
		return shared.Forbidden(c)
	} else if err != nil {
		return shared.InternalError(c, "access check failed")
	}
	var req ReorderPhasesRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	if err := reorderPhasesService(programID, req); err != nil {
		return shared.InternalError(c, "failed to reorder phases")
	}
	return shared.NoContent(c)
}

// ── Modules ───────────────────────────────────────────────────────

func (h *Handler) createModule(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	programID := c.Param("id")
	if err := checkFacultyAccess(programID, claims.Role, claims.UserID); errors.Is(err, ErrForbidden) {
		return shared.Forbidden(c)
	} else if err != nil {
		return shared.InternalError(c, "access check failed")
	}
	phaseID := c.Param("phaseId")
	var req UpsertModuleRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	m, err := createModuleService(phaseID, req)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, m)
}

func (h *Handler) updateModule(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	programID := c.Param("id")
	if err := checkFacultyAccess(programID, claims.Role, claims.UserID); errors.Is(err, ErrForbidden) {
		return shared.Forbidden(c)
	} else if err != nil {
		return shared.InternalError(c, "access check failed")
	}
	moduleID := c.Param("moduleId")
	var req UpsertModuleRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	m, err := updateModuleService(moduleID, req)
	if errors.Is(err, ErrNotFound) {
		return shared.NotFound(c, "module not found")
	}
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.OK(c, m)
}

func (h *Handler) deleteModule(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	programID := c.Param("id")
	if err := checkFacultyAccess(programID, claims.Role, claims.UserID); errors.Is(err, ErrForbidden) {
		return shared.Forbidden(c)
	} else if err != nil {
		return shared.InternalError(c, "access check failed")
	}
	moduleID := c.Param("moduleId")
	if err := deleteModuleService(moduleID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "module not found")
		}
		return shared.InternalError(c, "failed to delete module")
	}
	return shared.NoContent(c)
}

// ── Activities ────────────────────────────────────────────────────

func (h *Handler) createActivity(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	programID := c.Param("id")
	if err := checkFacultyAccess(programID, claims.Role, claims.UserID); errors.Is(err, ErrForbidden) {
		return shared.Forbidden(c)
	} else if err != nil {
		return shared.InternalError(c, "access check failed")
	}
	var req CreateActivityRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}

	a, err := createActivityService(req)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, a)
}

func (h *Handler) updateActivity(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	programID := c.Param("id")
	if err := checkFacultyAccess(programID, claims.Role, claims.UserID); errors.Is(err, ErrForbidden) {
		return shared.Forbidden(c)
	} else if err != nil {
		return shared.InternalError(c, "access check failed")
	}
	actID := c.Param("actId")
	var req UpdateActivityRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}

	a, err := updateActivityService(actID, req)
	if errors.Is(err, ErrNotFound) {
		return shared.NotFound(c, "activity not found")
	}
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.OK(c, a)
}

func (h *Handler) deleteActivity(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	programID := c.Param("id")
	if err := checkFacultyAccess(programID, claims.Role, claims.UserID); errors.Is(err, ErrForbidden) {
		return shared.Forbidden(c)
	} else if err != nil {
		return shared.InternalError(c, "access check failed")
	}
	actID := c.Param("actId")
	if err := deleteActivityService(actID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "activity not found")
		}
		return shared.InternalError(c, "failed to delete activity")
	}
	return shared.NoContent(c)
}

// ── Activity Faculty ──────────────────────────────────────────────

func (h *Handler) listActivityFaculty(c echo.Context) error {
	actID := c.Param("actId")
	list, err := listActivityFacultyService(actID)
	if err != nil {
		return shared.InternalError(c, "failed to list faculty")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) assignFaculty(c echo.Context) error {
	actID := c.Param("actId")
	var req AssignFacultyRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}

	conflict, dto, err := assignFacultyService(actID, req)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}

	// Conflict detected — return 409 with conflict info so client can show warning
	if conflict != nil && conflict.HasConflict {
		return c.JSON(409, map[string]interface{}{
			"data":  conflict,
			"error": map[string]string{"code": "SCHEDULE_CONFLICT", "message": "Faculty has a scheduling conflict"},
		})
	}

	return shared.Created(c, dto)
}

func (h *Handler) removeFaculty(c echo.Context) error {
	actID := c.Param("actId")
	facultyID := c.Param("facultyId")
	if err := removeFacultyService(actID, facultyID); err != nil {
		return shared.InternalError(c, "failed to remove faculty")
	}
	return shared.NoContent(c)
}

// ── Activity Sessions (PM scheduling) ────────────────────────────────────────

// listActivitySessions returns class_sessions linked to a specific activity.
func (h *Handler) listActivitySessions(c echo.Context) error {
	actID := c.Param("actId")
	list, err := listSessionsByActivityService(actID)
	if err != nil {
		return shared.InternalError(c, "failed to list sessions")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

// scheduleSession creates a class_session row for a live_session/coaching activity.
// The PM sets the date/time, cohort, faculty, and duration. This is the canonical
// way sessions are created — faculty just read these rows on their dashboard.
func (h *Handler) scheduleSession(c echo.Context) error {
	actID := c.Param("actId")
	var req ScheduleSessionRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	req.ActivityID = actID
	s, err := scheduleSessionService(req)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, s)
}

func (h *Handler) listOrgFaculty(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	if orgID == "" {
		return shared.BadRequest(c, "MISSING_PARAM", "org_id is required", "org_id")
	}
	list, err := listOrgFacultyService(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to list faculty")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) facultySchedule(c echo.Context) error {
	facultyID := c.Param("facultyId")
	schedule, err := getFacultyScheduleService(facultyID)
	if err != nil {
		return shared.InternalError(c, "failed to get schedule")
	}
	return shared.OKList(c, schedule, shared.Meta{Total: int64(len(schedule))})
}

func (h *Handler) facultyAssignments(c echo.Context) error {
	facultyID := c.Param("facultyId")
	list, err := listFacultyAssignmentsService(facultyID)
	if err != nil {
		return shared.InternalError(c, "failed to get assignments")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) listOrgFacultyProfiles(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	if orgID == "" {
		return shared.BadRequest(c, "MISSING_PARAM", "org_id is required", "org_id")
	}
	list, err := listOrgFacultyProfilesService(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to list faculty profiles")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) facultyDashboard(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	if orgID == "" {
		return shared.BadRequest(c, "MISSING_PARAM", "org_id is required", "org_id")
	}
	data, err := getFacultyDashboardService(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to get faculty dashboard")
	}
	return shared.OK(c, data)
}

func (h *Handler) facultyL1L4Summary(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	if orgID == "" {
		return shared.BadRequest(c, "MISSING_PARAM", "org_id is required", "org_id")
	}
	list, err := getFacultyL1L4SummaryService(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to get L1-L4 summary")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) updateFacultyProfile(c echo.Context) error {
	facultyID := c.Param("facultyId")
	var req UpdateFacultyProfileRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if err := updateFacultyProfileService(facultyID, req); err != nil {
		return shared.InternalError(c, "failed to update profile")
	}
	return shared.NoContent(c)
}

// ── Program Materials ─────────────────────────────────────────────

func (h *Handler) listMaterials(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	programID := c.Param("id")
	if err := checkFacultyAccess(programID, claims.Role, claims.UserID); errors.Is(err, ErrForbidden) {
		return shared.Forbidden(c)
	} else if err != nil {
		return shared.InternalError(c, "access check failed")
	}
	list, err := listProgramMaterialsService(programID)
	if err != nil {
		return shared.InternalError(c, "failed to list materials")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) addMaterial(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	programID := c.Param("id")
	if err := checkFacultyAccess(programID, claims.Role, claims.UserID); errors.Is(err, ErrForbidden) {
		return shared.Forbidden(c)
	} else if err != nil {
		return shared.InternalError(c, "access check failed")
	}
	var req AddProgramMaterialRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	dto, err := addProgramMaterialService(programID, claims.UserID, req)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	audit.Log(c, audit.Event{
		Category: "content", Action: "content.material.add", Severity: audit.SeveritySuccess,
		TargetType: "program_material", TargetID: dto.ID,
		Detail: map[string]any{"program_id": programID, "title": dto.Title, "type": dto.Type},
	})
	return shared.Created(c, dto)
}

func (h *Handler) deleteMaterial(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	programID := c.Param("id")
	if err := checkFacultyAccess(programID, claims.Role, claims.UserID); errors.Is(err, ErrForbidden) {
		return shared.Forbidden(c)
	} else if err != nil {
		return shared.InternalError(c, "access check failed")
	}
	materialID := c.Param("materialId")
	if err := deleteProgramMaterialService(materialID, programID); err != nil {
		return shared.InternalError(c, "failed to delete material")
	}
	audit.Log(c, audit.Event{
		Category: "content", Action: "content.material.delete", Severity: audit.SeverityWarning,
		TargetType: "program_material", TargetID: materialID,
		Detail: map[string]any{"program_id": programID},
	})
	return shared.NoContent(c)
}
