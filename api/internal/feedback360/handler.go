package feedback360

import (
	"errors"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	// Public, login-less rater endpoints (limited-access per PRD): a rater opens
	// their form and submits via an invite token. No auth middleware.
	v1.GET("/feedback_360/rater/:token", h.getRaterForm)
	v1.POST("/feedback_360/rater/:token", h.submitResponses)

	// Participant-facing (authenticated) surface.
	g := v1.Group("/feedback_360", shared.RequireAuth(), shared.RequirePermission("feedback_360", "read"))
	g.GET("/my", h.getMyCycle)
	g.POST("/cycles", h.createCycle, shared.RequirePermission("feedback_360", "write"))
	g.POST("/cycles/:id/raters", h.addRater, shared.RequirePermission("feedback_360", "write"))
	g.DELETE("/cycles/:id/raters/:raterId", h.removeRater, shared.RequirePermission("feedback_360", "write"))
	g.POST("/cycles/:id/raters/:raterId/remind", h.remindRater, shared.RequirePermission("feedback_360", "write"))
}

// ── Participant handlers ──────────────────────────────────────────

func (h *Handler) getMyCycle(c echo.Context) error {
	pid, err := participantIDFrom(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	dto, err := getMyCycleService(pid, optionalProgramID(c))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "no 360 cycle yet")
		}
		return shared.InternalError(c, "failed to load cycle")
	}
	return shared.OK(c, dto)
}

func (h *Handler) createCycle(c echo.Context) error {
	pid, err := participantIDFrom(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	orgID, err := orgIDForUser(pid)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "org context missing", "org_id")
	}
	var req CreateCycleRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	dto, err := createCycleService(orgID, pid, req)
	if err != nil {
		return shared.InternalError(c, "failed to create cycle: "+err.Error())
	}
	return shared.Created(c, dto)
}

func (h *Handler) addRater(c echo.Context) error {
	pid, cycleID, err := participantAndCycle(c)
	if err != nil {
		return err
	}
	var req AddRaterRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	dto, err := addRaterService(pid, cycleID, req)
	return writeCycleResult(c, dto, err)
}

func (h *Handler) removeRater(c echo.Context) error {
	pid, cycleID, err := participantAndCycle(c)
	if err != nil {
		return err
	}
	raterID, perr := uuid.Parse(c.Param("raterId"))
	if perr != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid rater id", "raterId")
	}
	dto, serr := removeRaterService(pid, cycleID, raterID)
	return writeCycleResult(c, dto, serr)
}

func (h *Handler) remindRater(c echo.Context) error {
	pid, cycleID, err := participantAndCycle(c)
	if err != nil {
		return err
	}
	raterID, perr := uuid.Parse(c.Param("raterId"))
	if perr != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid rater id", "raterId")
	}
	dto, serr := remindRaterService(pid, cycleID, raterID)
	return writeCycleResult(c, dto, serr)
}

// ── Public rater handlers (token-based) ───────────────────────────

func (h *Handler) getRaterForm(c echo.Context) error {
	token, err := uuid.Parse(c.Param("token"))
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid token", "token")
	}
	dto, serr := getRaterFormService(token)
	if serr != nil {
		if errors.Is(serr, ErrNotFound) {
			return shared.NotFound(c, "invalid or expired invite")
		}
		return shared.InternalError(c, "failed to load form")
	}
	return shared.OK(c, dto)
}

func (h *Handler) submitResponses(c echo.Context) error {
	token, err := uuid.Parse(c.Param("token"))
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid token", "token")
	}
	var req SubmitResponsesRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	serr := submitResponsesService(token, req)
	if serr != nil {
		switch {
		case errors.Is(serr, ErrNotFound):
			return shared.NotFound(c, "invalid or expired invite")
		case errors.Is(serr, ErrCycleClosed):
			return shared.BadRequest(c, "CONFLICT", "this feedback cycle is closed", "")
		case errors.Is(serr, ErrValidation):
			return shared.BadRequest(c, "VALIDATION_ERROR", serr.Error(), "")
		default:
			return shared.InternalError(c, "failed to submit responses")
		}
	}
	return shared.OK(c, map[string]string{"status": "submitted"})
}

// ── helpers ───────────────────────────────────────────────────────

func participantIDFrom(c echo.Context) (uuid.UUID, error) {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return uuid.Nil, echo.ErrUnauthorized
	}
	return uuid.Parse(claims.UserID)
}

// optionalProgramID parses ?program_id= (the program the switcher is on). Nil
// when absent or malformed — the service then prefers/falls back accordingly.
func optionalProgramID(c echo.Context) *uuid.UUID {
	raw := c.QueryParam("program_id")
	if raw == "" {
		return nil
	}
	pid, err := uuid.Parse(raw)
	if err != nil {
		return nil
	}
	return &pid
}

func participantAndCycle(c echo.Context) (uuid.UUID, uuid.UUID, error) {
	pid, err := participantIDFrom(c)
	if err != nil {
		return uuid.Nil, uuid.Nil, shared.Unauthorized(c, "invalid token")
	}
	cycleID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return uuid.Nil, uuid.Nil, shared.BadRequest(c, "VALIDATION_ERROR", "invalid cycle id", "id")
	}
	return pid, cycleID, nil
}

func writeCycleResult(c echo.Context, dto *CycleDTO, err error) error {
	if err != nil {
		switch {
		case errors.Is(err, ErrForbidden):
			return shared.Forbidden(c)
		case errors.Is(err, ErrNotFound):
			return shared.NotFound(c, "cycle or rater not found")
		case errors.Is(err, ErrCycleClosed):
			return shared.BadRequest(c, "CONFLICT", "this feedback cycle is closed", "")
		case errors.Is(err, ErrValidation):
			return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
		default:
			return shared.InternalError(c, "operation failed")
		}
	}
	return shared.OK(c, dto)
}
