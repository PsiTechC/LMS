package sessions

import (
	"errors"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/sessions", shared.RequireAuth(), shared.RequirePermission("sessions", "read"))
	g.GET("", h.list)
	g.POST("", h.create, shared.RequirePermission("sessions", "create"))
	g.GET("/:id", h.get)
	g.PATCH("/:id", h.update, shared.RequirePermission("sessions", "update"))
	g.DELETE("/:id", h.delete, shared.RequirePermission("sessions", "delete"))

	g.POST("/:id/materials", h.addMaterial, shared.RequirePermission("sessions", "update"))
	g.GET("/:id/materials", h.listMaterials)
	g.POST("/:id/attendance", h.markAttendance, shared.RequirePermission("sessions", "update"))
	g.GET("/:id/attendance", h.getAttendance)
}

func (h *Handler) list(c echo.Context) error {
	var q ListSessionsQuery
	if err := c.Bind(&q); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid query params", "")
	}
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 {
		q.Limit = 20
	}
	rows, total, err := listSessionsService(q)
	if err != nil {
		return shared.InternalError(c, "failed to fetch sessions")
	}
	return shared.OKList(c, rows, shared.Meta{Page: q.Page, PerPage: q.Limit, Total: total})
}

func (h *Handler) get(c echo.Context) error {
	s, err := getSessionService(c.Param("id"))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "session not found")
		}
		return shared.InternalError(c, "failed to fetch session")
	}
	return shared.OK(c, s)
}

func (h *Handler) create(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req CreateSessionRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	s, err := createSessionService(req, claims.UserID)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, s)
}

func (h *Handler) update(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req UpdateSessionRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	s, err := updateSessionService(c.Param("id"), req, claims.UserID, claims.Role)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "session not found")
		}
		if err.Error() == "forbidden" {
			return shared.Forbidden(c)
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.OK(c, s)
}

func (h *Handler) delete(c echo.Context) error {
	if err := updateSession(c.Param("id"), map[string]any{"status": "cancelled"}); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "session not found")
		}
		return shared.InternalError(c, "failed to cancel session")
	}
	return shared.NoContent(c)
}

func (h *Handler) addMaterial(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req AddMaterialRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	m, err := addMaterialService(c.Param("id"), claims.UserID, req)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, m)
}

func (h *Handler) listMaterials(c echo.Context) error {
	rows, err := listMaterialsService(c.Param("id"))
	if err != nil {
		return shared.InternalError(c, "failed to fetch materials")
	}
	return shared.OK(c, rows)
}

func (h *Handler) markAttendance(c echo.Context) error {
	var req MarkAttendanceRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if err := markAttendanceService(c.Param("id"), req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.NoContent(c)
}

func (h *Handler) getAttendance(c echo.Context) error {
	rows, err := getAttendanceService(c.Param("id"))
	if err != nil {
		return shared.InternalError(c, "failed to fetch attendance")
	}
	return shared.OK(c, rows)
}
