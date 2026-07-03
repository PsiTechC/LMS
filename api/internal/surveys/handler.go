package surveys

import (
	"errors"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/surveys", shared.RequireAuth(), shared.RequirePermission("surveys", "read"))
	g.GET("/my", h.getMy)
	g.GET("/:activityId", h.getDetail)
	g.POST("/submit", h.submit, shared.RequirePermission("surveys", "write"))
	// Authoring — PM/faculty set the question set for a survey activity.
	g.PUT("/:activityId/questions", h.setQuestions, shared.RequirePermission("surveys", "manage"))
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
		default:
			return shared.InternalError(c, "failed to submit survey")
		}
	}
	return shared.OK(c, dto)
}

func (h *Handler) setQuestions(c echo.Context) error {
	var req SetQuestionsRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	serr := setQuestionsService(c.Param("activityId"), req)
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
	return shared.NoContent(c)
}

func userID(c echo.Context) (uuid.UUID, error) {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return uuid.Nil, echo.ErrUnauthorized
	}
	return uuid.Parse(claims.UserID)
}

// optionalProgramID parses ?program_id= (the program the switcher is on). Nil
// when absent or malformed — the service then falls back to most-recent cohort.
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
