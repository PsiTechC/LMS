package billing

import (
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

// Handler holds the Billing page's read-only reporting handlers. The
// Organizations table on that page reuses the EXISTING GET /organizations
// endpoint (extended with billing fields — see api/internal/organizations)
// rather than being duplicated here; this module only owns what has no
// existing home: open-program participant enrollments.
type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/billing", shared.RequireAuth(), shared.HybridPermission("billing", "read", shared.RoleSuperAdmin))
	g.GET("/participants", h.listParticipants)
}

func (h *Handler) listParticipants(c echo.Context) error {
	list, err := listParticipantEnrollmentsService()
	if err != nil {
		return shared.InternalError(c, "failed to fetch participant enrollments")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}
