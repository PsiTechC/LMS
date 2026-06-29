package coaching

import (
	"errors"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/coaching", shared.RequireAuth(), shared.RequirePermission("coaching", "read"))
	g.POST("/notes", h.createNote, shared.RequirePermission("coaching", "write"))
	g.GET("/notes", h.listNotes)
	g.PATCH("/notes/:id", h.updateNote, shared.RequirePermission("coaching", "write"))
	g.GET("/notes/participant/:participantId", h.listByParticipant)
}

func (h *Handler) createNote(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req CreateNoteRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	note, err := createNoteService(req, claims.UserID)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, note)
}

func (h *Handler) listNotes(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var q ListNotesQuery
	if err := c.Bind(&q); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid query params", "")
	}
	if q.SessionID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "session_id is required", "session_id")
	}
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 {
		q.Limit = 20
	}
	rows, total, err := listBySessionService(q, claims.Role)
	if err != nil {
		return shared.InternalError(c, "failed to fetch coaching notes")
	}
	return shared.OKList(c, rows, shared.Meta{Page: q.Page, PerPage: q.Limit, Total: total})
}

func (h *Handler) updateNote(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req UpdateNoteRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	note, err := updateNoteService(c.Param("id"), req, claims.UserID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "coaching note not found")
		}
		if errors.Is(err, ErrForbidden) {
			return shared.Forbidden(c)
		}
		return shared.InternalError(c, "failed to update note")
	}
	return shared.OK(c, note)
}

func (h *Handler) listByParticipant(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var q ListNotesQuery
	if err := c.Bind(&q); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid query params", "")
	}
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 {
		q.Limit = 20
	}
	rows, total, err := listByParticipantService(c.Param("participantId"), q, claims.Role)
	if err != nil {
		return shared.InternalError(c, "failed to fetch coaching notes")
	}
	return shared.OKList(c, rows, shared.Meta{Page: q.Page, PerPage: q.Limit, Total: total})
}
