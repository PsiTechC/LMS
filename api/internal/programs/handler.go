package programs

import (
	"errors"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	// Public route — no auth needed for landing page
	v1.GET("/programs/public", h.listPublic)

	g := v1.Group("/programs", shared.RequireAuth())

	// Programs CRUD
	g.GET("", h.list)
	g.POST("", h.create, shared.RequirePermission("programs", "create"))
	g.GET("/:id", h.get)
	g.PATCH("/:id", h.update, shared.RequirePermission("programs", "update"))
	g.POST("/:id/publish", h.publish, shared.RequirePermission("programs", "update"))
	g.POST("/:id/duplicate", h.duplicate, shared.RequirePermission("programs", "create"))

	// Phases (nested under a program)
	g.POST("/:id/phases", h.createPhase, shared.RequirePermission("programs", "update"))
	g.PATCH("/:id/phases/:phaseId", h.updatePhase, shared.RequirePermission("programs", "update"))
	g.DELETE("/:id/phases/:phaseId", h.deletePhase, shared.RequirePermission("programs", "update"))
	g.POST("/:id/phases/reorder", h.reorderPhases, shared.RequirePermission("programs", "update"))

	// Activities (nested under program for auth scoping)
	g.POST("/:id/activities", h.createActivity, shared.RequirePermission("programs", "update"))
	g.PATCH("/:id/activities/:actId", h.updateActivity, shared.RequirePermission("programs", "update"))
	g.DELETE("/:id/activities/:actId", h.deleteActivity, shared.RequirePermission("programs", "update"))
}

// ── Programs ──────────────────────────────────────────────────────

func (h *Handler) listPublic(c echo.Context) error {
	list, err := listPublicProgramsService()
	if err != nil {
		return shared.InternalError(c, "failed to list programs")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) list(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	isSA := claims.Role == shared.RoleSuperAdmin

	orgID := ""
	if !isSA {
		orgID = c.QueryParam("org_id")
		if orgID == "" {
			return shared.BadRequest(c, "MISSING_PARAM", "org_id is required", "org_id")
		}
	}

	list, err := listProgramsService(orgID, isSA)
	if err != nil {
		return shared.InternalError(c, "failed to list programs")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) get(c echo.Context) error {
	id := c.Param("id")
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
	return shared.Created(c, p)
}

func (h *Handler) update(c echo.Context) error {
	id := c.Param("id")
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
	id := c.Param("id")
	p, err := publishProgramService(id)
	if errors.Is(err, ErrNotFound) {
		return shared.NotFound(c, "program not found")
	}
	if errors.Is(err, ErrPublishNotReady) {
		return c.JSON(http.StatusUnprocessableEntity, map[string]string{
			"error": "program must have at least one phase and each phase must have at least one activity",
		})
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

// ── Phases ────────────────────────────────────────────────────────

func (h *Handler) createPhase(c echo.Context) error {
	programID := c.Param("id")
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
	phaseID := c.Param("phaseId")
	programID := c.Param("id")
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
	programID := c.Param("id")
	var req ReorderPhasesRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	if err := reorderPhasesService(programID, req); err != nil {
		return shared.InternalError(c, "failed to reorder phases")
	}
	return shared.NoContent(c)
}

// ── Activities ────────────────────────────────────────────────────

func (h *Handler) createActivity(c echo.Context) error {
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
	actID := c.Param("actId")
	if err := deleteActivityService(actID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "activity not found")
		}
		return shared.InternalError(c, "failed to delete activity")
	}
	return shared.NoContent(c)
}
