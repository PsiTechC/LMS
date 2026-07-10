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

	// The org's single 360° configuration. GET creates an empty draft on first
	// open, so there is nothing to create, name, list, or delete.
	g.GET("/config", h.adminGetConfig, shared.RequirePermission("feedback_360", "assign"))
	g.PATCH("/config/quorum", h.adminSaveQuorum, shared.RequirePermission("feedback_360", "configure"))
	g.PATCH("/config/open_questions", h.adminSaveOpenQuestions, shared.RequirePermission("feedback_360", "configure"))
	g.POST("/config/lock", h.adminLockCycle, shared.RequirePermission("feedback_360", "configure"))
	// Reopen a locked configuration for editing — Superadmin & Program Manager alike.
	g.POST("/config/reopen", h.adminReopenCycle, shared.RequirePermission("feedback_360", "configure"))

	// Assign + tracking, all scoped to the org's single configuration.
	g.GET("/assignable", h.adminAssignable, shared.RequirePermission("feedback_360", "assign"))
	g.GET("/participants", h.adminListParticipants, shared.RequirePermission("feedback_360", "assign"))
	g.POST("/assign", h.adminAssign, shared.RequirePermission("feedback_360", "assign"))
	g.POST("/invite", h.adminInvite, shared.RequirePermission("feedback_360", "assign"))
	g.POST("/remind", h.adminRemind, shared.RequirePermission("feedback_360", "assign"))
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

// ── Org configuration ─────────────────────────────────────────────

// adminGetConfig returns the org's single 360° configuration, creating an empty
// draft the first time it's opened.
func (h *Handler) adminGetConfig(c echo.Context) error {
	actorID, role, aerr := adminActor(c)
	if aerr != nil {
		return shared.Forbidden(c)
	}
	orgID, err := adminOrgID(c)
	if err != nil {
		return orgErr(c, err)
	}
	dto, serr := getOrCreateOrgConfigService(orgID, actorID, role)
	if serr != nil {
		return adminServiceErr(c, serr)
	}
	return shared.OK(c, dto)
}

func (h *Handler) adminSaveQuorum(c echo.Context) error {
	orgID, err := adminOrgID(c)
	if err != nil {
		return orgErr(c, err)
	}
	var req QuorumConfigDTO
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	dto, serr := saveQuorumService(orgID, req)
	if serr != nil {
		return adminServiceErr(c, serr)
	}
	return shared.OK(c, dto)
}

func (h *Handler) adminSaveOpenQuestions(c echo.Context) error {
	orgID, err := adminOrgID(c)
	if err != nil {
		return orgErr(c, err)
	}
	var req SaveOpenQuestionsRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	dto, serr := saveOpenQuestionsService(orgID, req.OpenQuestions)
	if serr != nil {
		return adminServiceErr(c, serr)
	}
	return shared.OK(c, dto)
}

func (h *Handler) adminLockCycle(c echo.Context) error {
	orgID, err := adminOrgID(c)
	if err != nil {
		return orgErr(c, err)
	}
	var req LockCycleRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	dto, serr := lockCycleService(orgID, req)
	if serr != nil {
		return adminServiceErr(c, serr)
	}
	return shared.OK(c, dto)
}

// adminReopenCycle unlocks the org's configuration so it can be edited again.
func (h *Handler) adminReopenCycle(c echo.Context) error {
	orgID, err := adminOrgID(c)
	if err != nil {
		return orgErr(c, err)
	}
	dto, serr := reopenCycleService(orgID)
	if serr != nil {
		return adminServiceErr(c, serr)
	}
	return shared.OK(c, dto)
}

// ── Assign + tracking ─────────────────────────────────────────────

func (h *Handler) adminAssignable(c echo.Context) error {
	orgID, err := adminOrgID(c)
	if err != nil {
		return orgErr(c, err)
	}
	rows, serr := listAssignableService(
		orgID,
		c.QueryParam("program_id"), c.QueryParam("cohort_id"),
		c.QueryParam("enrollment_status"), c.QueryParam("search"),
	)
	if serr != nil {
		return adminServiceErr(c, serr)
	}
	return shared.OK(c, rows)
}

func (h *Handler) adminListParticipants(c echo.Context) error {
	orgID, err := adminOrgID(c)
	if err != nil {
		return orgErr(c, err)
	}
	rows, serr := listCycleParticipantsService(orgID)
	if serr != nil {
		return adminServiceErr(c, serr)
	}
	return shared.OK(c, rows)
}

func (h *Handler) adminAssign(c echo.Context) error {
	orgID, err := adminOrgID(c)
	if err != nil {
		return orgErr(c, err)
	}
	var req AssignRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	n, serr := assignParticipantsService(orgID, req)
	if serr != nil {
		return adminServiceErr(c, serr)
	}
	return shared.OK(c, map[string]int{"assigned": n})
}

func (h *Handler) adminInvite(c echo.Context) error {
	orgID, err := adminOrgID(c)
	if err != nil {
		return orgErr(c, err)
	}
	var req RemindRequest // reuse: participant_ids / all
	_ = c.Bind(&req)
	n, serr := inviteParticipantsService(orgID, req.ParticipantIDs)
	if serr != nil {
		return adminServiceErr(c, serr)
	}
	return shared.OK(c, map[string]int{"invited": n})
}

func (h *Handler) adminRemind(c echo.Context) error {
	orgID, err := adminOrgID(c)
	if err != nil {
		return orgErr(c, err)
	}
	var req RemindRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	n, serr := remindParticipantsService(orgID, req)
	if serr != nil {
		return adminServiceErr(c, serr)
	}
	return shared.OK(c, map[string]int{"reminded": n})
}

// ── helpers ───────────────────────────────────────────────────────

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
