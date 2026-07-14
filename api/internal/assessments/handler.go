package assessments

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
	g := v1.Group("/assessments", shared.RequireAuth(), shared.HybridPermission("assessments", "read", shared.RoleParticipant))
	g.GET("/my", h.getMy)
	g.GET("/:activityId", h.getDetail)
	g.POST("/submit", h.submit, shared.HybridPermission("assessments", "write", shared.RoleParticipant))
}

func (h *Handler) getMy(c echo.Context) error {
	uid, err := userID(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	dto, err := getMyAssessmentsService(uid, optionalProgramID(c))
	if err != nil {
		return shared.InternalError(c, "failed to load assessments")
	}
	return shared.OK(c, dto)
}

func (h *Handler) getDetail(c echo.Context) error {
	uid, err := userID(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	dto, serr := getAssessmentDetailService(uid, c.Param("activityId"))
	if serr != nil {
		switch {
		case errors.Is(serr, ErrForbidden):
			return shared.Forbidden(c)
		case errors.Is(serr, ErrNotFound), errors.Is(serr, ErrNotQuizBacked):
			return shared.NotFound(c, "assessment not found")
		case errors.Is(serr, ErrNoAttemptsLeft):
			return shared.BadRequest(c, "NO_ATTEMPTS_LEFT", "you have used all allowed attempts for this assessment", "")
		case errors.Is(serr, ErrValidation):
			return shared.BadRequest(c, "VALIDATION_ERROR", "invalid assessment id", "activityId")
		default:
			return shared.InternalError(c, "failed to load assessment")
		}
	}
	return shared.OK(c, dto)
}

func (h *Handler) submit(c echo.Context) error {
	uid, err := userID(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	var req SubmitAssessmentRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	dto, serr := submitAssessmentService(uid, req)
	if serr != nil {
		switch {
		case errors.Is(serr, ErrForbidden):
			return shared.Forbidden(c)
		case errors.Is(serr, ErrNotFound), errors.Is(serr, ErrNotQuizBacked):
			return shared.NotFound(c, "assessment not found")
		case errors.Is(serr, ErrNoAttemptsLeft):
			return shared.BadRequest(c, "NO_ATTEMPTS_LEFT", "you have used all allowed attempts for this assessment", "")
		case errors.Is(serr, ErrValidation):
			return shared.BadRequest(c, "VALIDATION_ERROR", "invalid submission", "")
		default:
			return shared.InternalError(c, "failed to submit assessment")
		}
	}
	audit.Log(c, audit.Event{Category: "assessments", Action: "assessment.submit", Severity: audit.SeveritySuccess, TargetType: "user", TargetID: uid.String()})
	return shared.OK(c, dto)
}

func userID(c echo.Context) (uuid.UUID, error) {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return uuid.Nil, echo.ErrUnauthorized
	}
	return uuid.Parse(claims.UserID)
}

// optionalProgramID parses ?program_id= (the program the switcher is on). Nil
// when absent or malformed — the service then falls back to most-recent
// enrollment, same convention as surveys.optionalProgramID.
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
