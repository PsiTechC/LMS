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
	g.GET("/:activityId/status", h.getStatus)
	g.POST("/submit", h.submit, shared.HybridPermission("assessments", "write", shared.RoleParticipant))

	// Faculty grading of open-ended assessment questions. Lives here (attempts
	// are this module's domain); submissions owns the separate read-only
	// /grading/admin superadmin view, so paths don't collide.
	gr := v1.Group("/grading", shared.RequireAuth())
	gr.GET("/queue", h.gradingQueue, shared.HybridPermission("submissions", "grade", shared.RoleFaculty))
	gr.GET("/attempts/:id", h.gradingDetail, shared.HybridPermission("submissions", "grade", shared.RoleFaculty))
	gr.PATCH("/attempts/:id", h.gradeAttempt, shared.HybridPermission("submissions", "grade", shared.RoleFaculty))
	// Grading Assist: AI-drafted suggestion for one open question's award.
	// Stateless - never writes a grade, the faculty reviews/edits/saves via
	// the PATCH above like any other award.
	gr.POST("/attempts/:id/questions/:questionId/ai_draft", h.gradingAIDraft, shared.HybridPermission("submissions", "grade", shared.RoleFaculty))
}

// gradingQueue lists attempts awaiting faculty review (?status=graded for
// history), scoped to the caller's own programs.
func (h *Handler) gradingQueue(c echo.Context) error {
	uid, err := userID(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	status := c.QueryParam("status")
	switch status {
	case "", "pending_review", "graded":
		// ok
	default:
		return shared.BadRequest(c, "VALIDATION_ERROR", "status must be pending_review or graded", "status")
	}
	list, serr := listGradingQueueService(uid, status)
	if serr != nil {
		return shared.InternalError(c, "failed to load grading queue")
	}
	return shared.OK(c, list)
}

// gradingDetail returns one attempt's full grading view (objective locked,
// open awaiting award).
func (h *Handler) gradingDetail(c echo.Context) error {
	uid, err := userID(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	attemptID, perr := uuid.Parse(c.Param("id"))
	if perr != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid attempt id", "id")
	}
	dto, serr := getGradingDetailService(uid, attemptID)
	if serr != nil {
		switch {
		case errors.Is(serr, ErrForbidden):
			return shared.Forbidden(c)
		case errors.Is(serr, ErrNotFound), errors.Is(serr, ErrNotQuizBacked):
			return shared.NotFound(c, "attempt not found")
		default:
			return shared.InternalError(c, "failed to load attempt")
		}
	}
	return shared.OK(c, dto)
}

// gradeAttempt applies faculty open-question awards, finalizes the score, and
// notifies the participant.
func (h *Handler) gradeAttempt(c echo.Context) error {
	uid, err := userID(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	attemptID, perr := uuid.Parse(c.Param("id"))
	if perr != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid attempt id", "id")
	}
	var req GradeAttemptRequest
	if berr := c.Bind(&req); berr != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	participantID, activityTitle, finalPct, _, serr := gradeAttemptService(uid, attemptID, req)
	if serr != nil {
		switch {
		case errors.Is(serr, ErrForbidden):
			return shared.Forbidden(c)
		case errors.Is(serr, ErrNotFound), errors.Is(serr, ErrNotQuizBacked):
			return shared.NotFound(c, "attempt not found")
		default:
			return shared.InternalError(c, "failed to grade attempt")
		}
	}

	claims := shared.ClaimsFrom(c)
	// Fire-and-forget participant notification (loopback to communications).
	go notifyGraded(claims.UserID, claims.Role, participantID, activityTitle, finalPct, "/dashboard/participant?tab=assessments")

	audit.Log(c, audit.Event{
		Category: "assessments", Action: "assessment.grade", Severity: audit.SeveritySuccess,
		TargetType: "assessment_attempt", TargetID: attemptID.String(),
		Detail: map[string]any{"score_pct": finalPct, "participant_id": participantID},
	})
	return shared.OK(c, map[string]any{"attempt_id": attemptID.String(), "score_pct": finalPct, "status": "graded"})
}

// gradingAIDraft returns an AI-drafted points/comment suggestion for one open
// question on an attempt. The faculty's browser pre-fills the normal award
// fields with it and can edit freely before saving via gradeAttempt.
func (h *Handler) gradingAIDraft(c echo.Context) error {
	uid, err := userID(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	attemptID, perr := uuid.Parse(c.Param("id"))
	if perr != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid attempt id", "id")
	}
	questionID := c.Param("questionId")
	dto, serr := gradingAIDraftService(c.Request().Context(), uid, attemptID, questionID)
	if serr != nil {
		switch {
		case errors.Is(serr, ErrForbidden):
			return shared.Forbidden(c)
		case errors.Is(serr, ErrNotFound):
			return shared.NotFound(c, "question not found on this attempt")
		case errors.Is(serr, ErrNoAnswerToGrade):
			return shared.BadRequest(c, "NO_ANSWER", serr.Error(), "")
		case errors.Is(serr, ErrAINotConfigured):
			return shared.BadRequest(c, "AI_NOT_CONFIGURED", serr.Error(), "")
		default:
			return shared.InternalError(c, "failed to draft AI feedback")
		}
	}
	return shared.OK(c, dto)
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

// getStatus returns the participant's standing on a quiz-backed activity -
// unlike getDetail this never errors once attempts are exhausted, so it's
// what the results UI polls to show a completed/graded attached Knowledge
// Check's score (getDetail is only for the take-modal's pre-submit load).
func (h *Handler) getStatus(c echo.Context) error {
	uid, err := userID(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	dto, serr := getAssessmentStatusService(uid, c.Param("activityId"))
	if serr != nil {
		switch {
		case errors.Is(serr, ErrForbidden):
			return shared.Forbidden(c)
		case errors.Is(serr, ErrNotFound), errors.Is(serr, ErrNotQuizBacked):
			return shared.NotFound(c, "assessment not found")
		case errors.Is(serr, ErrValidation):
			return shared.BadRequest(c, "VALIDATION_ERROR", "invalid assessment id", "activityId")
		default:
			return shared.InternalError(c, "failed to load assessment status")
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
// when absent or malformed - the service then falls back to most-recent
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
