package faculty_management

import (
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/audit"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

// NewHandler initialises the module, creating its schema if needed.
func NewHandler() *Handler {
	fixSchema()
	return &Handler{}
}

// Register mounts the faculty-management routes.
func (h *Handler) Register(v1 *echo.Group) {
	// Faculty profiles
	p := v1.Group("/faculty_profiles", shared.RequireAuth(), shared.HybridPermission("faculty_mgmt", "read", shared.RoleSuperAdmin, shared.RoleProgramManager, shared.RoleFaculty))
	p.GET("", h.listProfiles)
	p.GET("/:user_id", h.getProfile)
	p.POST("", h.upsertProfile, shared.HybridPermission("faculty_mgmt", "manage", shared.RoleSuperAdmin, shared.RoleProgramManager))

	// Onboarding invites
	o := v1.Group("/onboarding_invites", shared.RequireAuth(), shared.HybridPermission("faculty_mgmt", "read", shared.RoleSuperAdmin, shared.RoleProgramManager, shared.RoleFaculty))
	o.GET("", h.listInvites)
	o.POST("", h.createInvite, shared.HybridPermission("faculty_mgmt", "manage", shared.RoleSuperAdmin, shared.RoleProgramManager))
	o.PATCH("/:id", h.updateInvite, shared.HybridPermission("faculty_mgmt", "manage", shared.RoleSuperAdmin, shared.RoleProgramManager))

	// Program-level assignment attributes on activity_faculty
	a := v1.Group("/faculty_assignments", shared.RequireAuth(), shared.HybridPermission("faculty_mgmt", "manage", shared.RoleSuperAdmin, shared.RoleProgramManager))
	a.PATCH("", h.updateAssignment)
	a.POST("/program", h.assignProgram)     // toggle a program ON for a faculty
	a.DELETE("/program", h.unassignProgram) // toggle a program OFF for a faculty

	// Faculty roster + dashboard summary - superadmin-only reads.
	r := v1.Group("/faculty", shared.RequireAuth(), shared.HybridPermission("faculty_roster", "read", shared.RoleSuperAdmin))
	r.GET("", h.roster)
	r.GET("/dashboard/summary", h.dashboardSummary)

	// 4-step Onboard Faculty flow - superadmin-only, single submit.
	f := v1.Group("/faculty", shared.RequireAuth(), shared.HybridPermission("faculty_onboard", "create", shared.RoleSuperAdmin))
	f.POST("/onboard", h.onboardFaculty)
}

func (h *Handler) roster(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	programID := c.QueryParam("program_id")
	list, err := rosterService(orgID, programID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch faculty roster")
	}
	return shared.OK(c, list)
}

func (h *Handler) dashboardSummary(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	dto, err := dashboardSummaryService(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to build faculty dashboard summary")
	}
	return shared.OK(c, dto)
}

func (h *Handler) onboardFaculty(c echo.Context) error {
	var req OnboardFacultyRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	claims := shared.ClaimsFrom(c)
	resp, err := onboardFacultyService(req, claims.UserID)
	if err != nil {
		if err == ErrEmailTaken {
			return shared.Conflict(c, err.Error())
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	audit.Log(c, audit.Event{
		Category: "faculty", Action: "faculty.onboard", Severity: audit.SeveritySuccess,
		TargetType: "user", TargetID: resp.UserID,
		Detail: map[string]any{"email": resp.Email, "access_level": resp.AccessLevel},
	})
	return shared.Created(c, resp)
}

// ── Faculty Profiles ─────────────────────────────────────────────────────────

func (h *Handler) listProfiles(c echo.Context) error {
	list, err := listProfilesService()
	if err != nil {
		return shared.InternalError(c, "failed to fetch faculty profiles")
	}
	return shared.OK(c, list)
}

func (h *Handler) getProfile(c echo.Context) error {
	dto, err := getProfileService(c.Param("user_id"))
	if err != nil {
		return shared.NotFound(c, "faculty profile not found")
	}
	return shared.OK(c, dto)
}

func (h *Handler) upsertProfile(c echo.Context) error {
	var req UpsertProfileRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	if req.UserID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "user_id is required", "user_id")
	}
	dto, err := upsertProfileService(req)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	audit.Log(c, audit.Event{
		Category: "faculty", Action: "faculty.profile.upsert", Severity: audit.SeveritySuccess,
		TargetType: "faculty_profile", TargetID: dto.ID,
	})
	return shared.OK(c, dto)
}

// ── Onboarding Invites ───────────────────────────────────────────────────────

func (h *Handler) listInvites(c echo.Context) error {
	list, err := listInvitesService(c.QueryParam("faculty_user_id"))
	if err != nil {
		return shared.InternalError(c, "failed to fetch onboarding invites")
	}
	return shared.OK(c, list)
}

func (h *Handler) createInvite(c echo.Context) error {
	var req CreateInviteRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	claims := shared.ClaimsFrom(c)
	dto, err := createInviteService(req, claims.UserID)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	audit.Log(c, audit.Event{
		Category:   "faculty",
		Action:     "faculty.invite.create",
		Severity:   audit.SeveritySuccess,
		TargetType: "onboarding_invite",
		TargetID:   dto.ID,
		Detail:     map[string]any{"faculty_user_id": dto.FacultyUserID, "access_level": dto.AccessLevel},
	})
	return shared.Created(c, dto)
}

func (h *Handler) updateInvite(c echo.Context) error {
	var req UpdateInviteRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	id := c.Param("id")
	dto, err := updateInviteService(id, req)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	audit.Log(c, audit.Event{
		Category: "faculty", Action: "faculty.invite.update", Severity: audit.SeveritySuccess,
		TargetType: "onboarding_invite", TargetID: id,
	})
	return shared.OK(c, dto)
}

// ── activity_faculty extension ───────────────────────────────────────────────

func (h *Handler) assignProgram(c echo.Context) error {
	var req AssignProgramRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	if err := assignProgramService(req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	audit.Log(c, audit.Event{
		Category: "faculty", Action: "faculty.program.assign", Severity: audit.SeveritySuccess,
		TargetType: "user", TargetID: req.FacultyUserID,
		Detail: map[string]any{"program_id": req.ProgramID},
	})
	return shared.NoContent(c)
}

func (h *Handler) unassignProgram(c echo.Context) error {
	facultyUserID := c.QueryParam("faculty_user_id")
	programID := c.QueryParam("program_id")
	if facultyUserID == "" || programID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "faculty_user_id and program_id are required", "")
	}
	if err := unassignProgramService(facultyUserID, programID); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	audit.Log(c, audit.Event{
		Category: "faculty", Action: "faculty.program.unassign", Severity: audit.SeverityWarning,
		TargetType: "user", TargetID: facultyUserID,
		Detail: map[string]any{"program_id": programID},
	})
	return shared.NoContent(c)
}

func (h *Handler) updateAssignment(c echo.Context) error {
	var req UpdateAssignmentRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	if err := updateAssignmentService(req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	audit.Log(c, audit.Event{
		Category: "faculty", Action: "faculty.assignment.update", Severity: audit.SeveritySuccess,
		TargetType: "user", TargetID: req.FacultyUserID,
		Detail: map[string]any{"activity_id": req.ActivityID},
	})
	return shared.NoContent(c)
}
