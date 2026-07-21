package surveys

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
	// Public, login-less external respondent endpoints (facilitator/manager/
	// business sponsor) - mirrors /v1/feedback_360/rater/:token. No auth middleware.
	v1.GET("/surveys/external/:token", h.getExternalForm)
	v1.POST("/surveys/external/:token", h.submitExternal)

	g := v1.Group("/surveys", shared.RequireAuth(), shared.HybridPermission("surveys", "read", shared.RoleParticipant))
	g.GET("/my", h.getMy)
	// Cross-org aggregate for the superadmin Surveys admin page (superadmin-only).
	g.GET("/admin", h.admin, shared.HybridPermission("surveys", "admin", shared.RoleSuperAdmin))
	// Superadmin View Results + Send Reminder for a single survey.
	g.GET("/admin/:activityId/results", h.adminResults, shared.HybridPermission("surveys", "admin", shared.RoleSuperAdmin))
	g.POST("/admin/:activityId/remind", h.adminRemind, shared.HybridPermission("surveys", "admin", shared.RoleSuperAdmin))
	g.GET("/:activityId", h.getDetail)
	g.POST("/submit", h.submit, shared.HybridPermission("surveys", "write", shared.RoleParticipant))
	// Authoring - PM/faculty set the question set for a survey activity.
	g.PUT("/:activityId/questions", h.setQuestions, shared.HybridPermission("surveys", "manage", shared.RoleSuperAdmin, shared.RoleProgramManager, shared.RoleFaculty))
	// AI Survey Insights - one-line card on the participant's Surveys tab,
	// on-demand (LLM call), fetched on page load.
	g.POST("/ai_insight", h.aiInsight, shared.HybridPermission("surveys", "read", shared.RoleParticipant))

	// External respondent management (nominate/list/remove/remind) - the
	// enrolled participant may nominate their own manager/sponsor, and
	// PM/faculty/superadmin may do so on a participant's behalf.
	ext := shared.HybridPermission("surveys", "write", shared.RoleSuperAdmin, shared.RoleProgramManager, shared.RoleFaculty, shared.RoleParticipant)
	g.POST("/:activityId/external_respondents", h.addExternalRespondent, ext)
	g.GET("/:activityId/external_respondents", h.listExternalRespondents, shared.HybridPermission("surveys", "read", shared.RoleSuperAdmin, shared.RoleProgramManager, shared.RoleFaculty, shared.RoleParticipant))
	g.DELETE("/:activityId/external_respondents/:id", h.removeExternalRespondent, ext)
	g.POST("/:activityId/external_respondents/:id/remind", h.remindExternalRespondent, ext)
}

func (h *Handler) admin(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	if orgID != "" {
		if _, err := uuid.Parse(orgID); err != nil {
			return shared.BadRequest(c, "VALIDATION_ERROR", "invalid org_id", "org_id")
		}
	}
	list, err := listAdminSurveysService(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to load surveys")
	}
	return shared.OK(c, list)
}

// adminResults returns the aggregated results for one survey (superadmin modal).
func (h *Handler) adminResults(c echo.Context) error {
	dto, serr := getSurveyResultsService(c.Param("activityId"))
	if serr != nil {
		switch {
		case errors.Is(serr, ErrNotFound):
			return shared.NotFound(c, "survey not found")
		case errors.Is(serr, ErrValidation):
			return shared.BadRequest(c, "VALIDATION_ERROR", "invalid survey id", "activityId")
		default:
			return shared.InternalError(c, "failed to load results")
		}
	}
	return shared.OK(c, dto)
}

// adminRemind sends an in-app reminder to enrolled participants who have not yet
// completed the survey (superadmin action).
func (h *Handler) adminRemind(c echo.Context) error {
	var req RemindSurveyRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	dto, serr := remindSurveyService(c.Param("activityId"), &req)
	if serr != nil {
		switch {
		case errors.Is(serr, ErrNotFound):
			return shared.NotFound(c, "survey not found")
		case errors.Is(serr, ErrValidation):
			return shared.BadRequest(c, "VALIDATION_ERROR", "invalid survey id", "activityId")
		default:
			return shared.InternalError(c, "failed to send reminders")
		}
	}
	return shared.OK(c, dto)
}

func (h *Handler) getMy(c echo.Context) error {
	uid, err := userID(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	dto, err := getMySurveysService(uid, optionalProgramID(c))
	if err != nil {
		return shared.InternalError(c, "failed to load surveys")
	}
	return shared.OK(c, dto)
}

// aiInsight generates the "AI Survey Insights" one-line card on the
// participant's Surveys tab - on demand (LLM call), fetched on page load.
func (h *Handler) aiInsight(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	insight, err := generateSurveyInsightService(c.Request().Context(), claims.UserID, claims.Role)
	if err != nil {
		return shared.BadRequest(c, "AI_PULSE_ERROR", err.Error(), "")
	}
	return shared.OK(c, map[string]string{"insight": insight})
}

func (h *Handler) getDetail(c echo.Context) error {
	uid, err := userID(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	dto, serr := getSurveyDetailService(uid, c.Param("activityId"))
	if serr != nil {
		switch {
		case errors.Is(serr, ErrForbidden):
			return shared.Forbidden(c)
		case errors.Is(serr, ErrNotFound):
			return shared.NotFound(c, "survey not found")
		case errors.Is(serr, ErrValidation):
			return shared.BadRequest(c, "VALIDATION_ERROR", "invalid survey id", "activityId")
		default:
			return shared.InternalError(c, "failed to load survey")
		}
	}
	return shared.OK(c, dto)
}

func (h *Handler) submit(c echo.Context) error {
	uid, err := userID(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	var req SubmitSurveyRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	dto, serr := submitSurveyService(uid, req)
	if serr != nil {
		switch {
		case errors.Is(serr, ErrForbidden):
			return shared.Forbidden(c)
		case errors.Is(serr, ErrNotFound):
			return shared.NotFound(c, "survey not found")
		case errors.Is(serr, ErrValidation):
			return shared.BadRequest(c, "VALIDATION_ERROR", "invalid submission", "")
		case errors.Is(serr, ErrNotOpenYet):
			return shared.BadRequest(c, "NOT_OPEN_YET", "this survey is not open yet", "")
		default:
			return shared.InternalError(c, "failed to submit survey")
		}
	}
	audit.Log(c, audit.Event{Category: "surveys", Action: "survey.submit", Severity: audit.SeveritySuccess, TargetType: "user", TargetID: uid.String()})
	return shared.OK(c, dto)
}

func (h *Handler) setQuestions(c echo.Context) error {
	var req SetQuestionsRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	activityID := c.Param("activityId")
	serr := setQuestionsService(activityID, req)
	if serr != nil {
		switch {
		case errors.Is(serr, ErrNotFound):
			return shared.NotFound(c, "survey activity not found")
		case errors.Is(serr, ErrValidation):
			return shared.BadRequest(c, "VALIDATION_ERROR", "invalid question set", "")
		default:
			return shared.InternalError(c, "failed to save questions")
		}
	}
	audit.Log(c, audit.Event{Category: "surveys", Action: "survey.questions.set", Severity: audit.SeveritySuccess, TargetType: "survey_activity", TargetID: activityID})
	return shared.NoContent(c)
}

// ── External respondent management (authenticated) ────────────────

func (h *Handler) addExternalRespondent(c echo.Context) error {
	var req AddExternalRespondentRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	dto, err := addExternalRespondentService(callerFrom(c), c.Param("activityId"), req)
	if err != nil {
		return writeExternalManageResult(c, err)
	}
	audit.Log(c, audit.Event{Category: "surveys", Action: "survey.external_respondent.add", Severity: audit.SeveritySuccess, TargetType: "activity", TargetID: c.Param("activityId")})
	return shared.Created(c, dto)
}

func (h *Handler) listExternalRespondents(c echo.Context) error {
	list, err := listExternalRespondentsService(callerFrom(c), c.Param("activityId"))
	if err != nil {
		return writeExternalManageResult(c, err)
	}
	return shared.OK(c, list)
}

func (h *Handler) removeExternalRespondent(c echo.Context) error {
	err := removeExternalRespondentService(callerFrom(c), c.Param("activityId"), c.Param("id"))
	if err != nil {
		return writeExternalManageResult(c, err)
	}
	audit.Log(c, audit.Event{Category: "surveys", Action: "survey.external_respondent.remove", Severity: audit.SeverityWarning, TargetType: "activity", TargetID: c.Param("activityId")})
	return shared.NoContent(c)
}

func (h *Handler) remindExternalRespondent(c echo.Context) error {
	err := remindExternalRespondentService(callerFrom(c), c.Param("activityId"), c.Param("id"))
	if err != nil {
		return writeExternalManageResult(c, err)
	}
	audit.Log(c, audit.Event{Category: "surveys", Action: "survey.external_respondent.remind", Severity: audit.SeveritySuccess, TargetType: "activity", TargetID: c.Param("activityId")})
	return shared.NoContent(c)
}

// callerFrom builds the (userID, role) pair every external-respondent
// management service call uses to scope access: a participant may only act
// on activities they're enrolled in (checked in the service layer, same as
// submitSurveyService/getSurveyDetailService); PM/faculty/superadmin act at
// the role level, same as setQuestionsService's authoring access today.
func callerFrom(c echo.Context) caller {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return caller{}
	}
	uid, _ := uuid.Parse(claims.UserID)
	return caller{UserID: uid, Role: claims.Role}
}

func writeExternalManageResult(c echo.Context, err error) error {
	switch {
	case errors.Is(err, ErrForbidden):
		return shared.Forbidden(c)
	case errors.Is(err, ErrNotFound):
		return shared.NotFound(c, "survey or respondent not found")
	case errors.Is(err, ErrValidation):
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	default:
		return shared.InternalError(c, "operation failed")
	}
}

// ── External respondent public form (token-based) ──────────────────

// getExternalForm renders the public form from the token's activity. Viewing
// never consumes the token. An invalid token returns a generic message that
// doesn't reveal whether it expired, never existed, or was malformed - same
// posture as feedback360's rater form.
func (h *Handler) getExternalForm(c echo.Context) error {
	token, err := uuid.Parse(c.Param("token"))
	if err != nil {
		return shared.NotFound(c, "this link isn't valid")
	}
	dto, serr := getExternalFormService(token)
	if serr != nil {
		if errors.Is(serr, ErrNotFound) {
			return shared.NotFound(c, "this link isn't valid")
		}
		return shared.InternalError(c, "failed to load form")
	}
	return shared.OK(c, dto)
}

// submitExternal persists an external respondent's answers and consumes the
// token. Rate-limited per token and per client IP - this is a public,
// unauthenticated endpoint.
func (h *Handler) submitExternal(c echo.Context) error {
	raw := c.Param("token")
	token, err := uuid.Parse(raw)
	if err != nil {
		return shared.NotFound(c, "this link isn't valid")
	}
	if !externalSubmitLimiter.Allow("tok:"+raw) || !externalSubmitLimiter.Allow("ip:"+c.RealIP()) {
		return shared.BadRequest(c, "RATE_LIMITED", "too many attempts - please try again later", "")
	}

	var req SubmitExternalRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	serr := submitExternalService(token, req)
	if serr != nil {
		switch {
		case errors.Is(serr, ErrNotFound):
			return shared.NotFound(c, "this link isn't valid")
		case errors.Is(serr, ErrNotOpenYet):
			return shared.BadRequest(c, "NOT_OPEN_YET", "this survey is not open yet", "")
		case errors.Is(serr, ErrValidation):
			return shared.BadRequest(c, "VALIDATION_ERROR", serr.Error(), "")
		default:
			return shared.InternalError(c, "failed to submit responses")
		}
	}
	return shared.OK(c, map[string]string{"status": "submitted"})
}

func userID(c echo.Context) (uuid.UUID, error) {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return uuid.Nil, echo.ErrUnauthorized
	}
	return uuid.Parse(claims.UserID)
}

// optionalProgramID parses ?program_id= (the program the switcher is on). Nil
// when absent or malformed - the service then falls back to most-recent cohort.
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
