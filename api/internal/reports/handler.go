package reports

import (
	"log"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler {
	return &Handler{}
}

// Register wires the platform report export endpoint. This is a generated
// file download (PDF), so — same as feedback360's GET /my/report and audit's
// GET /audit-events/export — it bypasses the standard JSON envelope; every
// error path before the PDF starts streaming still uses the shared JSON
// error helpers.
func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/reports", shared.RequireAuth())
	g.POST("/platform/export", h.exportPlatformReport, shared.RequirePermission("reports", "export"))
}

// exportPlatformReport generates and streams the platform-wide PDF report:
// organizations, seats, users, programs, cohorts, enrollment completion, plus
// bar-chart breakdowns (orgs by plan/status, users by role, enrollment trend).
// POST + verb suffix per CLAUDE.md's non-CRUD action convention.
func (h *Handler) exportPlatformReport(c echo.Context) error {
	pdf, err := generatePlatformReportPDF()
	if err != nil {
		log.Printf("reports.exportPlatformReport: %v", err)
		return shared.InternalError(c, "failed to generate platform report")
	}
	c.Response().Header().Set("Content-Disposition", `attachment; filename="platform-report.pdf"`)
	return c.Blob(200, "application/pdf", pdf)
}
