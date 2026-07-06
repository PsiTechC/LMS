package submissions

import (
	"errors"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/submissions", shared.RequireAuth(), shared.HybridPermission("submissions", "read", shared.RoleFaculty, shared.RoleParticipant))
	g.GET("", h.list)
	g.GET("/my", h.my)
	g.GET("/stats", h.stats)
	g.GET("/:id", h.get)
	g.POST("", h.submit, shared.HybridPermission("submissions", "create", shared.RoleParticipant))
	g.PATCH("/:id/grade", h.grade, shared.HybridPermission("submissions", "grade", shared.RoleFaculty))

	// Grading admin — cross-org aggregate of submissions + capstones (superadmin).
	gr := v1.Group("/grading", shared.RequireAuth())
	gr.GET("/admin", h.gradingAdmin, shared.RequirePermission("grading", "admin"))
}

// gradingAdmin returns the unioned submissions + capstones list for the
// superadmin Grading & Capstone view. Optional ?org_id= and ?status= filters.
func (h *Handler) gradingAdmin(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	if orgID != "" {
		if _, err := uuid.Parse(orgID); err != nil {
			return shared.BadRequest(c, "VALIDATION_ERROR", "invalid org_id", "org_id")
		}
	}
	status := c.QueryParam("status")
	switch status {
	case "", "pending", "graded", "capstone":
		// ok
	default:
		return shared.BadRequest(c, "VALIDATION_ERROR", "status must be pending, graded, or capstone", "status")
	}
	list, err := listGradingAdminService(orgID, status)
	if err != nil {
		return shared.InternalError(c, "failed to load grading items")
	}
	return shared.OK(c, list)
}

func (h *Handler) list(c echo.Context) error {
	var q ListSubmissionsQuery
	if err := c.Bind(&q); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid query params", "")
	}
	if q.ActivityID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "activity_id is required", "activity_id")
	}
	if q.Page < 1 {
		q.Page = 1
	}
	if q.Limit < 1 {
		q.Limit = 20
	}
	rows, total, err := listSubmissionsService(q)
	if err != nil {
		return shared.InternalError(c, "failed to fetch submissions")
	}
	return shared.OKList(c, rows, shared.Meta{Page: q.Page, PerPage: q.Limit, Total: total})
}

func (h *Handler) my(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	activityID := c.QueryParam("activity_id")
	if activityID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "activity_id is required", "activity_id")
	}
	s, err := getMySubmissionService(claims.UserID, activityID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "submission not found")
		}
		return shared.InternalError(c, "failed to fetch submission")
	}
	return shared.OK(c, s)
}

func (h *Handler) get(c echo.Context) error {
	s, err := getSubmissionService(c.Param("id"))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "submission not found")
		}
		return shared.InternalError(c, "failed to fetch submission")
	}
	return shared.OK(c, s)
}

func (h *Handler) submit(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req CreateSubmissionRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	s, err := submitService(req, claims.UserID)
	if err != nil {
		if errors.Is(err, ErrDuplicate) {
			return shared.Conflict(c, "you have already submitted for this activity")
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, s)
}

func (h *Handler) stats(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	row, err := facultyStatsService(claims.UserID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch stats")
	}
	return shared.OK(c, row)
}

func (h *Handler) grade(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req GradeRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	s, err := gradeService(c.Param("id"), req, claims.UserID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "submission not found")
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.OK(c, s)
}
