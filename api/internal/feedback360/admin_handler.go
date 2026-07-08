package feedback360

import (
	"errors"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

// RegisterAdmin wires the admin-initiated 360° routes (Superadmin / Program
// Manager). Configure surface = feedback_360:configure; Assign = feedback_360:assign.
func (h *Handler) RegisterAdmin(v1 *echo.Group) {
	g := v1.Group("/feedback_360/admin", shared.RequireAuth())

	// Filter options (org programs + a program's cohorts) — used by both surfaces.
	g.GET("/programs", h.adminPrograms, shared.RequirePermission("feedback_360", "assign"))
	g.GET("/programs/:programId/cohorts", h.adminCohorts, shared.RequirePermission("feedback_360", "assign"))
	g.GET("/quorum_default", h.adminQuorumDefault, shared.RequirePermission("feedback_360", "configure"))

	// Cycle dashboard + config.
	g.GET("/cycles", h.adminListCycles, shared.RequirePermission("feedback_360", "assign"))
	g.POST("/cycles", h.adminCreateCycle, shared.RequirePermission("feedback_360", "configure"))
	g.GET("/cycles/:id", h.adminGetCycle, shared.RequirePermission("feedback_360", "assign"))
	g.PATCH("/cycles/:id", h.adminUpdateCycle, shared.RequirePermission("feedback_360", "configure"))
	g.PATCH("/cycles/:id/quorum", h.adminSaveQuorum, shared.RequirePermission("feedback_360", "configure"))
	g.POST("/cycles/:id/lock", h.adminLockCycle, shared.RequirePermission("feedback_360", "configure"))

	// Assign + tracking.
	g.GET("/cycles/:id/assignable", h.adminAssignable, shared.RequirePermission("feedback_360", "assign"))
	g.GET("/cycles/:id/participants", h.adminListParticipants, shared.RequirePermission("feedback_360", "assign"))
	g.POST("/cycles/:id/assign", h.adminAssign, shared.RequirePermission("feedback_360", "assign"))
	g.POST("/cycles/:id/invite", h.adminInvite, shared.RequirePermission("feedback_360", "assign"))
	g.POST("/cycles/:id/remind", h.adminRemind, shared.RequirePermission("feedback_360", "assign"))
}

// ── Org resolution ────────────────────────────────────────────────

// adminOrgID resolves the org the caller is acting on. Superadmin (and Secondary)
// must pass ?org_id= (selected at the top of Configure/Assign). Program Manager is
// auto-scoped to their own org from JWT identity → org_members. No tiering.
func adminOrgID(c echo.Context) (uuid.UUID, error) {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return uuid.Nil, ErrForbidden
	}
	switch claims.Role {
	case shared.RoleSuperAdmin, shared.RoleSuperAdminSecondary:
		raw := c.QueryParam("org_id")
		if raw == "" {
			return uuid.Nil, ErrValidation
		}
		return uuid.Parse(raw)
	default:
		uid, err := uuid.Parse(claims.UserID)
		if err != nil {
			return uuid.Nil, ErrForbidden
		}
		return orgIDForUser(uid)
	}
}

func adminActor(c echo.Context) (uuid.UUID, string, error) {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return uuid.Nil, "", ErrForbidden
	}
	uid, err := uuid.Parse(claims.UserID)
	if err != nil {
		return uuid.Nil, "", ErrForbidden
	}
	role := "program_manager"
	if claims.Role == shared.RoleSuperAdmin || claims.Role == shared.RoleSuperAdminSecondary {
		role = "superadmin"
	}
	return uid, role, nil
}

// ── Filter options ────────────────────────────────────────────────

func (h *Handler) adminPrograms(c echo.Context) error {
	orgID, err := adminOrgID(c)
	if err != nil {
		return orgErr(c, err)
	}
	rows, err := listProgramOptionsService(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to load programs")
	}
	return shared.OK(c, rows)
}

func (h *Handler) adminCohorts(c echo.Context) error {
	orgID, err := adminOrgID(c)
	if err != nil {
		return orgErr(c, err)
	}
	rows, err := listCohortOptionsService(orgID, c.Param("programId"))
	if err != nil {
		return shared.InternalError(c, "failed to load cohorts")
	}
	return shared.OK(c, rows)
}

func (h *Handler) adminQuorumDefault(c echo.Context) error {
	orgID, err := adminOrgID(c)
	if err != nil {
		return orgErr(c, err)
	}
	return shared.OK(c, orgQuorumDefaultService(orgID))
}

// ── Cycles ────────────────────────────────────────────────────────

func (h *Handler) adminListCycles(c echo.Context) error {
	orgID, err := adminOrgID(c)
	if err != nil {
		return orgErr(c, err)
	}
	rows, err := listAdminCyclesSummaryService(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to load cycles")
	}
	return shared.OK(c, rows)
}

func (h *Handler) adminCreateCycle(c echo.Context) error {
	actorID, role, aerr := adminActor(c)
	if aerr != nil {
		return shared.Forbidden(c)
	}
	orgID, err := adminOrgID(c)
	if err != nil {
		return orgErr(c, err)
	}
	var req CreateAdminCycleRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	dto, serr := createAdminCycleService(orgID, actorID, role, req.Name)
	if serr != nil {
		return adminServiceErr(c, serr)
	}
	return shared.Created(c, dto)
}

func (h *Handler) adminGetCycle(c echo.Context) error {
	orgID, cycleID, err := orgAndCycle(c)
	if err != nil {
		return err
	}
	dto, serr := getAdminCycleDetailService(orgID, cycleID)
	if serr != nil {
		return adminServiceErr(c, serr)
	}
	return shared.OK(c, dto)
}

func (h *Handler) adminUpdateCycle(c echo.Context) error {
	orgID, cycleID, err := orgAndCycle(c)
	if err != nil {
		return err
	}
	var req UpdateAdminCycleRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	dto, serr := updateAdminCycleService(orgID, cycleID, req)
	if serr != nil {
		return adminServiceErr(c, serr)
	}
	return shared.OK(c, dto)
}

func (h *Handler) adminSaveQuorum(c echo.Context) error {
	orgID, cycleID, err := orgAndCycle(c)
	if err != nil {
		return err
	}
	var req QuorumConfigDTO
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	dto, serr := saveQuorumService(orgID, cycleID, req)
	if serr != nil {
		return adminServiceErr(c, serr)
	}
	return shared.OK(c, dto)
}

func (h *Handler) adminLockCycle(c echo.Context) error {
	orgID, cycleID, err := orgAndCycle(c)
	if err != nil {
		return err
	}
	var req LockCycleRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	dto, serr := lockCycleService(orgID, cycleID, req)
	if serr != nil {
		return adminServiceErr(c, serr)
	}
	return shared.OK(c, dto)
}

// ── Assign + tracking ─────────────────────────────────────────────

func (h *Handler) adminAssignable(c echo.Context) error {
	orgID, cycleID, err := orgAndCycle(c)
	if err != nil {
		return err
	}
	rows, serr := listAssignableService(
		orgID, cycleID,
		c.QueryParam("program_id"), c.QueryParam("cohort_id"),
		c.QueryParam("enrollment_status"), c.QueryParam("search"),
	)
	if serr != nil {
		return shared.InternalError(c, "failed to load participants")
	}
	return shared.OK(c, rows)
}

func (h *Handler) adminListParticipants(c echo.Context) error {
	orgID, cycleID, err := orgAndCycle(c)
	if err != nil {
		return err
	}
	rows, serr := listCycleParticipantsService(orgID, cycleID)
	if serr != nil {
		return adminServiceErr(c, serr)
	}
	return shared.OK(c, rows)
}

func (h *Handler) adminAssign(c echo.Context) error {
	orgID, cycleID, err := orgAndCycle(c)
	if err != nil {
		return err
	}
	var req AssignRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	n, serr := assignParticipantsService(orgID, cycleID, req)
	if serr != nil {
		return adminServiceErr(c, serr)
	}
	return shared.OK(c, map[string]int{"assigned": n})
}

func (h *Handler) adminInvite(c echo.Context) error {
	orgID, cycleID, err := orgAndCycle(c)
	if err != nil {
		return err
	}
	var req RemindRequest // reuse: participant_ids / all
	_ = c.Bind(&req)
	n, serr := inviteParticipantsService(orgID, cycleID, req.ParticipantIDs)
	if serr != nil {
		return adminServiceErr(c, serr)
	}
	return shared.OK(c, map[string]int{"invited": n})
}

func (h *Handler) adminRemind(c echo.Context) error {
	orgID, cycleID, err := orgAndCycle(c)
	if err != nil {
		return err
	}
	var req RemindRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	n, serr := remindParticipantsService(orgID, cycleID, req)
	if serr != nil {
		return adminServiceErr(c, serr)
	}
	return shared.OK(c, map[string]int{"reminded": n})
}

// ── helpers ───────────────────────────────────────────────────────

func orgAndCycle(c echo.Context) (uuid.UUID, uuid.UUID, error) {
	orgID, err := adminOrgID(c)
	if err != nil {
		return uuid.Nil, uuid.Nil, orgErr(c, err)
	}
	cycleID, perr := uuid.Parse(c.Param("id"))
	if perr != nil {
		return uuid.Nil, uuid.Nil, shared.BadRequest(c, "VALIDATION_ERROR", "invalid cycle id", "id")
	}
	return orgID, cycleID, nil
}

func orgErr(c echo.Context, err error) error {
	if errors.Is(err, ErrValidation) {
		return shared.BadRequest(c, "VALIDATION_ERROR", "org_id is required", "org_id")
	}
	if errors.Is(err, ErrForbidden) {
		return shared.Forbidden(c)
	}
	return shared.BadRequest(c, "VALIDATION_ERROR", "could not resolve organization", "org_id")
}

func adminServiceErr(c echo.Context, err error) error {
	switch {
	case errors.Is(err, ErrNotFound):
		return shared.NotFound(c, "cycle not found")
	case errors.Is(err, ErrForbidden):
		return shared.Forbidden(c)
	case errors.Is(err, ErrValidation):
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	default:
		return shared.InternalError(c, "operation failed")
	}
}
