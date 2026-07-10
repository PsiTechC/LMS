package feedback360

import (
	"errors"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/audit"
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
	g := v1.Group("/feedback_360", shared.RequireAuth(), shared.HybridPermission("feedback_360", "read", shared.RoleParticipant))
	g.GET("/my", h.getMyCycle)
	g.GET("/my/report", h.getMyReport)
	g.POST("/my/ai-summary", h.generateMyNarrative)
	// Superadmin cross-org aggregate of completed 360 cycles.
	g.GET("/admin", h.admin, shared.HybridPermission("feedback_360", "admin", shared.RoleSuperAdmin))
	g.POST("/cycles", h.createCycle, shared.HybridPermission("feedback_360", "write", shared.RoleParticipant))
	g.POST("/cycles/:id/raters", h.addRater, shared.HybridPermission("feedback_360", "write", shared.RoleParticipant))
	g.DELETE("/cycles/:id/raters/:raterId", h.removeRater, shared.HybridPermission("feedback_360", "write", shared.RoleParticipant))
	g.POST("/cycles/:id/raters/:raterId/remind", h.remindRater, shared.HybridPermission("feedback_360", "write", shared.RoleParticipant))
}

// admin returns all completed 360 cycles across orgs (?org_id= to scope).
func (h *Handler) admin(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	if orgID != "" {
		if _, err := uuid.Parse(orgID); err != nil {
			return shared.BadRequest(c, "VALIDATION_ERROR", "invalid org_id", "org_id")
		}
	}
	list, err := listAdminCyclesService(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to load 360 cycles")
	}
	return shared.OK(c, list)
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

// getMyReport streams the participant's PDF report. Gated server-side on
// quorum + self-rating completeness — see getMyReportService — so the
// download can't be forced by hitting the endpoint before results are ready.
func (h *Handler) getMyReport(c echo.Context) error {
	pid, err := participantIDFrom(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	pdf, err := getMyReportService(pid, optionalProgramID(c))
	if err != nil {
		switch {
		case errors.Is(err, ErrNotFound):
			return shared.NotFound(c, "no 360 cycle yet")
		case errors.Is(err, ErrReportNotReady):
			return shared.Conflict(c, "your report isn't ready yet — all required raters and your own self-rating need to be submitted first")
		default:
			return shared.InternalError(c, "failed to generate report")
		}
	}
	c.Response().Header().Set("Content-Disposition", `attachment; filename="360-feedback-report.pdf"`)
	return c.Blob(200, "application/pdf", pdf)
}

// generateMyNarrative produces a real AI-written narrative from the caller's
// own submitted 360 data (competency scores + open-text comments), replacing
// the deterministic composeNarrative summary shown by default. Called
// on-demand from the results page — not run automatically on every view,
// since it's an LLM call.
func (h *Handler) generateMyNarrative(c echo.Context) error {
	pid, err := participantIDFrom(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	narrative, err := generateMyNarrativeService(c.Request().Context(), pid)
	if err != nil {
		return shared.BadRequest(c, "AI_SUMMARY_ERROR", err.Error(), "")
	}
	return shared.OK(c, map[string]string{"summary": narrative})
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
	audit.Log(c, audit.Event{Category: "feedback_360", Action: "cycle.create", Severity: audit.SeveritySuccess, TargetType: "feedback_cycle", TargetID: dto.ID, OrgID: orgID.String()})
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
	if err == nil {
		audit.Log(c, audit.Event{Category: "feedback_360", Action: "cycle.rater.add", Severity: audit.SeveritySuccess, TargetType: "feedback_cycle", TargetID: cycleID.String()})
	}
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
	if serr == nil {
		audit.Log(c, audit.Event{Category: "feedback_360", Action: "cycle.rater.remove", Severity: audit.SeverityWarning, TargetType: "feedback_cycle", TargetID: cycleID.String()})
	}
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
	if serr == nil {
		audit.Log(c, audit.Event{Category: "feedback_360", Action: "cycle.rater.remind", Severity: audit.SeveritySuccess, TargetType: "feedback_cycle", TargetID: cycleID.String()})
	}
	return writeCycleResult(c, dto, serr)
}

// ── Public rater handlers (token-based) ───────────────────────────

// getRaterForm renders the public rater form from the cycle's frozen snapshot.
// Viewing never consumes the token (mail scanners pre-fetch links). An invalid
// token returns a generic message that doesn't reveal whether it expired, never
// existed, or was malformed.
func (h *Handler) getRaterForm(c echo.Context) error {
	token, err := uuid.Parse(c.Param("token"))
	if err != nil {
		return shared.NotFound(c, "this link isn't valid")
	}
	dto, serr := getRaterFormV2Service(token)
	if serr != nil {
		if errors.Is(serr, ErrNotFound) {
			return shared.NotFound(c, "this link isn't valid")
		}
		return shared.InternalError(c, "failed to load form")
	}
	return shared.OK(c, dto)
}

// submitResponses persists a rater's answers and consumes the token. Rate-limited
// per token and per client IP — this is a public, unauthenticated endpoint.
func (h *Handler) submitResponses(c echo.Context) error {
	raw := c.Param("token")
	token, err := uuid.Parse(raw)
	if err != nil {
		return shared.NotFound(c, "this link isn't valid")
	}
	if !submitLimiter.Allow("tok:"+raw) || !submitLimiter.Allow("ip:"+c.RealIP()) {
		return shared.BadRequest(c, "RATE_LIMITED", "too many attempts — please try again later", "")
	}

	var req SubmitRaterFormRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	serr := submitRaterFormV2Service(token, req)
	if serr != nil {
		switch {
		case errors.Is(serr, ErrNotFound):
			return shared.NotFound(c, "this link isn't valid")
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
