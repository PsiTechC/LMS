package cohorts

import (
	"errors"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/cohorts", shared.RequireAuth())

	// Cohorts CRUD
	g.GET("", h.list)
	g.POST("", h.create, shared.RequirePermission("cohorts", "create"))
	g.GET("/:id", h.get)
	g.PATCH("/:id", h.update, shared.RequirePermission("cohorts", "update"))

	// Participants within a cohort
	g.GET("/:id/participants", h.listParticipants)
	g.POST("/:id/participants", h.enroll, shared.RequirePermission("cohorts", "update"))
	g.PATCH("/:id/participants/:enrollId", h.updateEnrollment, shared.RequirePermission("cohorts", "update"))
	g.POST("/:id/participants/:enrollId/nudge", h.nudge, shared.RequirePermission("cohorts", "update"))
}

// ── Cohorts ───────────────────────────────────────────────────────

func (h *Handler) list(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	programID := c.QueryParam("program_id")

	claims := shared.ClaimsFrom(c)
	if claims.Role != shared.RoleSuperAdmin && orgID == "" {
		return shared.BadRequest(c, "MISSING_PARAM", "org_id is required", "org_id")
	}

	list, err := listCohortsService(orgID, programID)
	if err != nil {
		return shared.InternalError(c, "failed to list cohorts")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) get(c echo.Context) error {
	cohort, err := getCohortService(c.Param("id"))
	if errors.Is(err, ErrNotFound) {
		return shared.NotFound(c, "cohort not found")
	}
	if err != nil {
		return shared.InternalError(c, "failed to get cohort")
	}
	return shared.OK(c, cohort)
}

func (h *Handler) create(c echo.Context) error {
	var req CreateCohortRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}

	orgID := c.QueryParam("org_id")
	if orgID == "" {
		return shared.BadRequest(c, "MISSING_PARAM", "org_id is required", "org_id")
	}

	cohort, err := createCohortService(req, orgID)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, cohort)
}

func (h *Handler) update(c echo.Context) error {
	var req UpdateCohortRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}

	cohort, err := updateCohortService(c.Param("id"), req)
	if errors.Is(err, ErrNotFound) {
		return shared.NotFound(c, "cohort not found")
	}
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.OK(c, cohort)
}

// ── Participants ──────────────────────────────────────────────────

func (h *Handler) listParticipants(c echo.Context) error {
	participants, err := listParticipantsService(c.Param("id"))
	if err != nil {
		return shared.InternalError(c, "failed to list participants")
	}
	return shared.OKList(c, participants, shared.Meta{Total: int64(len(participants))})
}

func (h *Handler) enroll(c echo.Context) error {
	var req EnrollParticipantRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}

	p, err := enrollParticipantService(c.Param("id"), req)
	if errors.Is(err, ErrAlreadyEnrolled) {
		return shared.Conflict(c, "user is already enrolled in this cohort")
	}
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, p)
}

func (h *Handler) updateEnrollment(c echo.Context) error {
	var req UpdateEnrollmentRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}

	p, err := updateEnrollmentService(c.Param("enrollId"), req)
	if errors.Is(err, ErrNotFound) {
		return shared.NotFound(c, "enrollment not found")
	}
	if err != nil {
		return shared.InternalError(c, "failed to update enrollment")
	}
	return shared.OK(c, p)
}

func (h *Handler) nudge(c echo.Context) error {
	if err := nudgeParticipantService(c.Param("enrollId")); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "enrollment not found")
		}
		return shared.InternalError(c, "failed to send nudge")
	}
	return shared.NoContent(c)
}
