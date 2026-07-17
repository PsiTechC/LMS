package capstone

import (
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/audit"
	"github.com/xa-lms/api/internal/shared"
)

// RegisterManage wires the capstone authoring/management routes (capstone:manage
// — SA/PM/Faculty). Called from the same Handler.Register.
func (h *Handler) RegisterManage(v1 *echo.Group) {
	g := v1.Group("/capstone/configs", shared.RequireAuth(),
		shared.HybridPermission("capstone", "manage", shared.RoleSuperAdmin, shared.RoleProgramManager, shared.RoleFaculty))

	g.GET("", h.listConfigs)
	g.POST("", h.createConfig)
	g.GET("/:id", h.getConfigDetail)
	g.PATCH("/:id", h.updateConfig)
	g.DELETE("/:id", h.deleteConfig)
	g.POST("/:id/assign", h.assignConfig)

	g.POST("/:id/milestones", h.createMilestone)
	g.PATCH("/:id/milestones/:milestoneId", h.updateMilestone)
	g.DELETE("/:id/milestones/:milestoneId", h.deleteMilestone)

	g.POST("/:id/grades", h.gradeTeam)
	g.POST("/:id/release", h.releaseGrades)
}

// listConfigs — SA sees all orgs (optional ?org_id= filter); PM/Faculty are
// scoped to their programs.
func (h *Handler) listConfigs(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	uid, err := uuid.Parse(claims.UserID)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}

	var orgFilter string
	var programIDs []string // nil = no program restriction (SA)

	switch claims.Role {
	case shared.RoleSuperAdmin:
		orgFilter = c.QueryParam("org_id") // optional
	case shared.RoleProgramManager:
		// PM scoped to their org; all programs in it.
		if org, e := orgForUser(uid); e == nil {
			orgFilter = org.String()
		}
	default: // faculty
		ids, e := facultyProgramIDs(uid)
		if e != nil {
			return shared.InternalError(c, "failed to resolve programs")
		}
		programIDs = ids
	}

	list, err := listConfigsService(orgFilter, programIDs)
	if err != nil {
		return shared.InternalError(c, "failed to list capstones")
	}
	return shared.OK(c, list)
}

// createConfig attaches a capstone to a program (SA/PM) and notifies its faculty.
func (h *Handler) createConfig(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	uid, err := uuid.Parse(claims.UserID)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	var req CreateConfigRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	programID, perr := uuid.Parse(req.ProgramID)
	if perr != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "program_id is required", "program_id")
	}
	orgID, oerr := programOrg(programID)
	if oerr != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "program not found", "program_id")
	}

	dto, serr := createConfigService(orgID, uid, req)
	if serr != nil {
		if errors.Is(serr, ErrConfigValidation) {
			return shared.BadRequest(c, "VALIDATION_ERROR", serr.Error(), "")
		}
		return shared.InternalError(c, "failed to create capstone")
	}

	// Notify the program's faculty that a capstone needs configuring.
	if fac, e := programFacultyIDs(programID); e == nil && len(fac) > 0 {
		go notifyUsers(claims.UserID, claims.Role, fac,
			"New capstone to configure",
			fmt.Sprintf("A capstone \"%s\" was attached to your program and needs configuring before it can be assigned.", dto.Title),
			"capstone")
	}
	audit.Log(c, audit.Event{Category: "capstone", Action: "capstone.config.create", Severity: audit.SeveritySuccess, TargetType: "capstone_config", TargetID: dto.ID})
	return shared.Created(c, dto)
}

func (h *Handler) getConfigDetail(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid id", "id")
	}
	dto, serr := getConfigDetailService(id)
	if serr != nil {
		if errors.Is(serr, ErrNotFound) {
			return shared.NotFound(c, "capstone not found")
		}
		return shared.InternalError(c, "failed to load capstone")
	}
	return shared.OK(c, dto)
}

func (h *Handler) updateConfig(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid id", "id")
	}
	var req UpdateConfigRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if serr := updateConfigService(id, req); serr != nil {
		if errors.Is(serr, ErrConfigValidation) {
			return shared.BadRequest(c, "VALIDATION_ERROR", serr.Error(), "")
		}
		if errors.Is(serr, ErrNotFound) {
			return shared.NotFound(c, "capstone not found")
		}
		return shared.InternalError(c, "failed to update capstone")
	}
	audit.Log(c, audit.Event{Category: "capstone", Action: "capstone.config.update", Severity: audit.SeveritySuccess, TargetType: "capstone_config", TargetID: id.String()})
	return shared.NoContent(c)
}

func (h *Handler) deleteConfig(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid id", "id")
	}
	if serr := deleteConfigService(id); serr != nil {
		return shared.InternalError(c, "failed to delete capstone")
	}
	audit.Log(c, audit.Event{Category: "capstone", Action: "capstone.config.delete", Severity: audit.SeveritySuccess, TargetType: "capstone_config", TargetID: id.String()})
	return shared.NoContent(c)
}

// assignConfig publishes the capstone to teams/individuals and notifies participants.
func (h *Handler) assignConfig(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid id", "id")
	}
	var req AssignConfigRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	count, serr := assignConfigService(id, req)
	if serr != nil {
		if errors.Is(serr, ErrConfigValidation) {
			return shared.BadRequest(c, "VALIDATION_ERROR", serr.Error(), "")
		}
		if errors.Is(serr, ErrNotFound) {
			return shared.NotFound(c, "capstone not found")
		}
		return shared.InternalError(c, "failed to assign capstone")
	}
	if parts, e := configParticipantIDs(id); e == nil && len(parts) > 0 {
		go notifyUsers(claims.UserID, claims.Role, parts,
			"Your capstone is ready",
			"Your capstone project has been assigned. Open the Capstone tab to see the brief, milestones, and deadline.",
			"capstone")
	}
	audit.Log(c, audit.Event{Category: "capstone", Action: "capstone.config.assign", Severity: audit.SeveritySuccess, TargetType: "capstone_config", TargetID: id.String(), Detail: map[string]any{"teams": count}})
	return shared.OK(c, map[string]any{"assigned_teams": count, "status": "assigned"})
}

// ── Milestones ────────────────────────────────────────────────────────────

func (h *Handler) createMilestone(c echo.Context) error {
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid id", "id")
	}
	var req MilestoneRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	dto, serr := createMilestoneService(id, req)
	if serr != nil {
		if errors.Is(serr, ErrConfigValidation) {
			return shared.BadRequest(c, "VALIDATION_ERROR", serr.Error(), "")
		}
		return shared.InternalError(c, "failed to create milestone")
	}
	return shared.Created(c, dto)
}

func (h *Handler) updateMilestone(c echo.Context) error {
	mid, err := uuid.Parse(c.Param("milestoneId"))
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid milestone id", "milestoneId")
	}
	var req MilestoneRequest
	_ = c.Bind(&req)
	status := c.QueryParam("status")
	if serr := updateMilestoneService(mid, req, status); serr != nil {
		if errors.Is(serr, ErrConfigValidation) {
			return shared.BadRequest(c, "VALIDATION_ERROR", serr.Error(), "")
		}
		return shared.InternalError(c, "failed to update milestone")
	}
	return shared.NoContent(c)
}

func (h *Handler) deleteMilestone(c echo.Context) error {
	mid, err := uuid.Parse(c.Param("milestoneId"))
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid milestone id", "milestoneId")
	}
	if serr := deleteMilestoneService(mid); serr != nil {
		return shared.InternalError(c, "failed to delete milestone")
	}
	return shared.NoContent(c)
}

// ── Grading + release ─────────────────────────────────────────────────────

func (h *Handler) gradeTeam(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	uid, err := uuid.Parse(claims.UserID)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid id", "id")
	}
	var req GradeRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if serr := gradeService(id, uid, req); serr != nil {
		if errors.Is(serr, ErrConfigValidation) {
			return shared.BadRequest(c, "VALIDATION_ERROR", serr.Error(), "")
		}
		if errors.Is(serr, ErrNotFound) {
			return shared.NotFound(c, "capstone or team not found")
		}
		return shared.InternalError(c, "failed to save grade")
	}
	audit.Log(c, audit.Event{Category: "capstone", Action: "capstone.grade", Severity: audit.SeveritySuccess, TargetType: "capstone_config", TargetID: id.String(), Detail: map[string]any{"team_id": req.TeamID, "score": req.Score}})
	return shared.OK(c, map[string]any{"saved": true})
}

// releaseGrades releases held grades, computes completion, issues certificates,
// and notifies participants.
func (h *Handler) releaseGrades(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid id", "id")
	}
	notify, serr := releaseService(id)
	if serr != nil {
		if errors.Is(serr, ErrNotFound) {
			return shared.NotFound(c, "capstone not found")
		}
		return shared.InternalError(c, "failed to release grades")
	}
	if len(notify) > 0 {
		go notifyUsers(claims.UserID, claims.Role, notify,
			"Your capstone results are ready",
			"Your capstone has been graded. Open the Capstone tab to see your score and feedback.",
			"capstone")
	}
	audit.Log(c, audit.Event{Category: "capstone", Action: "capstone.release", Severity: audit.SeveritySuccess, TargetType: "capstone_config", TargetID: id.String()})
	return shared.OK(c, map[string]any{"released": true, "notified": len(notify)})
}
