package ai

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/ai", shared.RequireAuth(), shared.RequirePermission("ai_coach", "use"))
	g.GET("/conversations", h.listConversations)
	g.POST("/conversations", h.createConversation)
	g.GET("/conversations/:id", h.getConversation)
	g.POST("/conversations/:id/messages", h.streamMessage)

	// AI Study Companion — single-shot generation, not the conversational SSE shape.
	g.GET("/study-companion/availability/:activity_id", h.studyCompanionAvailability)
	g.POST("/study-companion/generate", h.studyCompanionGenerate)
}

// aiEnabled resolves the caller's org and checks the ai_coach feature flag.
func aiEnabled(userID string) bool {
	org := orgIDForUser(userID)
	if org == "" {
		return true // no org resolved — don't block
	}
	return orgFeatureEnabled(org, "ai_coach")
}

func (h *Handler) listConversations(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	list, err := listConversationsService(claims.UserID)
	if err != nil {
		return shared.InternalError(c, "failed to list conversations")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) createConversation(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	if !aiEnabled(claims.UserID) {
		return shared.Forbidden(c)
	}
	var req CreateConversationRequest
	_ = c.Bind(&req)
	dto, err := createConversationService(claims.UserID, req.ProgramID)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, dto)
}

func (h *Handler) getConversation(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	dto, err := getConversationService(claims.UserID, c.Param("id"))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "conversation not found")
		}
		return shared.InternalError(c, "failed to load conversation")
	}
	return shared.OK(c, dto)
}

// streamMessage streams the assistant reply as Server-Sent Events. Each token
// chunk is emitted as `data: {"delta":"…"}` and the stream ends with
// `data: {"done":true}` (or `{"error":"…"}` on failure).
func (h *Handler) streamMessage(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	if !aiEnabled(claims.UserID) {
		return shared.Forbidden(c)
	}
	if !provider.Configured() {
		return shared.BadRequest(c, "AI_NOT_CONFIGURED", "AI provider is not configured (set AI_API_KEY)", "")
	}
	var req SendMessageRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}

	res := c.Response()
	res.Header().Set("Content-Type", "text/event-stream")
	res.Header().Set("Cache-Control", "no-cache")
	res.Header().Set("Connection", "keep-alive")
	res.WriteHeader(http.StatusOK)
	flusher, ok := res.Writer.(http.Flusher)
	if !ok {
		return shared.InternalError(c, "streaming unsupported")
	}

	send := func(payload any) {
		b, _ := json.Marshal(payload)
		fmt.Fprintf(res.Writer, "data: %s\n\n", b)
		flusher.Flush()
	}

	onDelta := func(delta string) { send(map[string]string{"delta": delta}) }

	_, err := streamReplyService(c.Request().Context(), claims.UserID, claims.Role, c.Param("id"), req.Content, onDelta)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			send(map[string]string{"error": "conversation not found"})
		} else {
			send(map[string]string{"error": err.Error()})
		}
		return nil
	}
	send(map[string]bool{"done": true})
	return nil
}

// studyCompanionAvailability tells the frontend whether the companion has
// usable content for an activity, without generating anything — cheap
// enough to call whenever a module opens so the button can be hidden for
// content types with no extractable text (e.g. video).
func (h *Handler) studyCompanionAvailability(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	dto, err := checkStudyCompanionAvailability(claims.UserID, c.Param("activity_id"))
	if err != nil {
		return shared.InternalError(c, "failed to check study companion availability")
	}
	return shared.OK(c, dto)
}

// studyCompanionGenerate produces practice questions, scenario simulations,
// or concept explanations grounded in one activity's content — a single
// JSON response, not a stream.
func (h *Handler) studyCompanionGenerate(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	if !aiEnabled(claims.UserID) {
		return shared.Forbidden(c)
	}
	if !provider.Configured() {
		return shared.BadRequest(c, "AI_NOT_CONFIGURED", "AI provider is not configured (set AI_API_KEY)", "")
	}
	var req StudyCompanionRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}

	dto, err := generateStudyCompanionService(c.Request().Context(), claims.UserID, claims.Role, req)
	if err != nil {
		if errors.Is(err, ErrActivityNotAccessible) {
			return shared.NotFound(c, "activity not found")
		}
		return shared.BadRequest(c, "STUDY_COMPANION_ERROR", err.Error(), "")
	}
	return shared.OK(c, dto)
}
