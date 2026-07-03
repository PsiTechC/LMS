package faculty_management

import (
	"github.com/labstack/echo/v4"
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
	p := v1.Group("/faculty_profiles", shared.RequireAuth(), shared.RequirePermission("faculty_mgmt", "read"))
	p.GET("", h.listProfiles)
	p.GET("/:user_id", h.getProfile)
	p.POST("", h.upsertProfile, shared.RequirePermission("faculty_mgmt", "manage"))

	// Onboarding invites
	o := v1.Group("/onboarding_invites", shared.RequireAuth(), shared.RequirePermission("faculty_mgmt", "read"))
	o.GET("", h.listInvites)
	o.POST("", h.createInvite, shared.RequirePermission("faculty_mgmt", "manage"))
	o.PATCH("/:id", h.updateInvite, shared.RequirePermission("faculty_mgmt", "manage"))

	// Program-level assignment attributes on activity_faculty
	a := v1.Group("/faculty_assignments", shared.RequireAuth(), shared.RequirePermission("faculty_mgmt", "manage"))
	a.PATCH("", h.updateAssignment)

	// Faculty roster + dashboard summary — superadmin-only reads.
	r := v1.Group("/faculty", shared.RequireAuth(), shared.RequirePermission("faculty_roster", "read"))
	r.GET("", h.roster)
	r.GET("/dashboard/summary", h.dashboardSummary)

	// 4-step Onboard Faculty flow — superadmin-only, single submit.
	f := v1.Group("/faculty", shared.RequireAuth(), shared.RequirePermission("faculty_onboard", "create"))
	f.POST("/onboard", h.onboardFaculty)
}

func (h *Handler) roster(c echo.Context) error {
	list, err := rosterService()
	if err != nil {
		return shared.InternalError(c, "failed to fetch faculty roster")
	}
	return shared.OK(c, list)
}

func (h *Handler) dashboardSummary(c echo.Context) error {
	dto, err := dashboardSummaryService()
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
	return shared.Created(c, dto)
}

func (h *Handler) updateInvite(c echo.Context) error {
	var req UpdateInviteRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	dto, err := updateInviteService(c.Param("id"), req)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.OK(c, dto)
}

// ── activity_faculty extension ───────────────────────────────────────────────

func (h *Handler) updateAssignment(c echo.Context) error {
	var req UpdateAssignmentRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	if err := updateAssignmentService(req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.NoContent(c)
}
