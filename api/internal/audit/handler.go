package audit

import (
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/audit-logs", shared.RequireAuth(), shared.RequirePermission("audit", "read"))
	g.GET("", h.list)
}

func (h *Handler) list(c echo.Context) error {
	var q ListAuditQuery
	if err := c.Bind(&q); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid query params", "")
	}
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 {
		q.Limit = 20
	}

	logs, total, err := listLogsService(q)
	if err != nil {
		return shared.InternalError(c, "failed to fetch audit logs")
	}
	return shared.OKList(c, logs, shared.Meta{Page: q.Page, PerPage: q.Limit, Total: total})
}
