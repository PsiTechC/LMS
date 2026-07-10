package audit

import (
	"encoding/csv"
	"encoding/json"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler {
	fixSchema()
	return &Handler{}
}

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/audit-logs", shared.RequireAuth(), shared.HybridPermission("audit", "read", shared.RoleSuperAdmin, shared.RoleProgramManager))
	g.GET("", h.list)

	// Central audit event log — superadmin-only read/query surface.
	e := v1.Group("/audit-events", shared.RequireAuth(), shared.HybridPermission("audit", "admin", shared.RoleSuperAdmin))
	e.GET("", h.listEvents)
	e.GET("/summary", h.eventsSummary)
	e.GET("/categories", h.eventCategories)
	e.GET("/export", h.exportEvents)
}

// eventCategories returns every distinct category value actually present in
// audit_events — the real, complete list for the frontend's category
// pills/filter (not bounded by the paginated list's row cap).
func (h *Handler) eventCategories(c echo.Context) error {
	cats, err := categoriesService()
	if err != nil {
		return shared.InternalError(c, "failed to load categories")
	}
	return shared.OK(c, cats)
}

func (h *Handler) eventsSummary(c echo.Context) error {
	summary, err := summaryService(c.QueryParam("org_id"))
	if err != nil {
		return shared.InternalError(c, "failed to compute audit summary")
	}
	return shared.OK(c, summary)
}

func (h *Handler) exportEvents(c echo.Context) error {
	var q ListEventsQuery
	if err := c.Bind(&q); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid query params", "")
	}

	events, err := exportEventsService(q)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}

	c.Response().Header().Set("Content-Type", "text/csv")
	c.Response().Header().Set("Content-Disposition", `attachment; filename="audit_events.csv"`)
	c.Response().WriteHeader(200)

	w := csv.NewWriter(c.Response())
	_ = w.Write([]string{
		"ID", "Timestamp", "Category", "Action", "Severity",
		"Actor Name", "Actor Email", "Actor Role", "Org ID",
		"Target Type", "Target ID", "Detail",
	})
	for _, ev := range events {
		var detail string
		if ev.Detail != nil {
			if b, err := json.Marshal(ev.Detail); err == nil {
				detail = string(b)
			}
		}
		_ = w.Write([]string{
			ev.ID, ev.CreatedAt, ev.Category, ev.Action, ev.Severity,
			ev.ActorName, ev.ActorEmail, ev.ActorRole, ev.OrgID,
			ev.TargetType, ev.TargetID, detail,
		})
	}
	w.Flush()
	return w.Error()
}

func (h *Handler) listEvents(c echo.Context) error {
	var q ListEventsQuery
	if err := c.Bind(&q); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid query params", "")
	}
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 {
		q.Limit = 20
	}

	events, total, err := listEventsService(q)
	if err != nil {
		return shared.InternalError(c, "failed to fetch audit events")
	}
	return shared.OKList(c, events, shared.Meta{Page: q.Page, PerPage: q.Limit, Total: total})
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
