package submissions

import (
	"errors"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/submissions", shared.RequireAuth(), shared.RequirePermission("submissions", "read"))
	g.GET("", h.list)
	g.GET("/my", h.my)
	g.GET("/:id", h.get)
	g.POST("", h.submit, shared.RequirePermission("submissions", "create"))
	g.PATCH("/:id/grade", h.grade, shared.RequirePermission("submissions", "grade"))
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
