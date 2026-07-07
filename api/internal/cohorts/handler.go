package cohorts

import (
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler {
	fixSchema()
	return &Handler{}
}

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/cohorts", shared.RequireAuth())

	// My enrollments — must be registered before /:id to avoid route conflict
	g.GET("/my", h.myEnrollments)

	// Pool & distribution (must be before /:id)
	g.GET("/pool", h.pool, shared.RequirePermission("cohorts", "read"))
	g.POST("/distribute", h.randomDistribute, shared.RequirePermission("cohorts", "update"))

	// Cohorts CRUD
	g.GET("", h.list)
	g.POST("", h.create, shared.RequirePermission("cohorts", "create"))
	g.GET("/:id", h.get)
	g.PATCH("/:id", h.update, shared.RequirePermission("cohorts", "update"))

	// Participants within a cohort
	g.GET("/:id/participants", h.listParticipants)
	g.POST("/:id/participants", h.enroll, shared.RequirePermission("cohorts", "update"))
	g.POST("/:id/participants/bulk", h.bulkEnroll, shared.RequirePermission("cohorts", "update"))
	g.PATCH("/:id/participants/:enrollId", h.updateEnrollment, shared.RequirePermission("cohorts", "update"))
	g.POST("/:id/participants/:enrollId/nudge", h.nudge, shared.RequirePermission("cohorts", "update"))

	// Enroll by email (find-or-create) + CSV import
	g.POST("/:id/enroll", h.enrollByEmail, shared.RequirePermission("cohorts", "update"))
	g.POST("/:id/enroll/csv", h.enrollCSV, shared.RequirePermission("cohorts", "update"))

	// Transfer participant into this cohort (drag-and-drop)
	g.POST("/:id/transfer", h.transfer, shared.RequirePermission("cohorts", "update"))

	// Groups (Coaching Circles / Peer Triads / ALS Teams)
	g.GET("/:id/groups", h.listGroups, shared.RequirePermission("cohorts", "read"))
	g.POST("/:id/groups", h.createGroups, shared.RequirePermission("cohorts", "update"))
	g.POST("/:id/groups/reshuffle", h.reshuffleGroups, shared.RequirePermission("cohorts", "update"))
	g.DELETE("/:id/groups/:groupId", h.deleteGroup, shared.RequirePermission("cohorts", "update"))
	g.POST("/:id/groups/move", h.moveMember, shared.RequirePermission("cohorts", "update"))

	// Stats
	g.GET("/:id/stats", h.stats)
}

// ── Cohorts ───────────────────────────────────────────────────────

func (h *Handler) list(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	programID := c.QueryParam("program_id")

	claims := shared.ClaimsFrom(c)
	isSuperAdmin := claims.Role == shared.RoleSuperAdmin || claims.Role == shared.RoleSuperAdminSecondary
	if !isSuperAdmin && orgID == "" {
		return shared.BadRequest(c, "MISSING_PARAM", "org_id is required", "org_id")
	}

	list, err := listCohortsService(orgID, programID)
	if err != nil {
		return shared.InternalError(c, "failed to list cohorts")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) get(c echo.Context) error {
	id := c.Param("id")
	// Guard against static route names leaking into this parameterized handler
	if _, err := uuid.Parse(id); err != nil {
		return shared.NotFound(c, "cohort not found")
	}
	cohort, err := getCohortService(id)
	if errors.Is(err, ErrNotFound) {
		return shared.NotFound(c, "cohort not found")
	}
	if err != nil {
		return shared.InternalError(c, "failed to get cohort")
	}
	return shared.OK(c, cohort)
}

func (h *Handler) create(c echo.Context) error {
	var req CreateCohortRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}

	orgID := c.QueryParam("org_id")
	if orgID == "" {
		return shared.BadRequest(c, "MISSING_PARAM", "org_id is required", "org_id")
	}

	cohort, err := createCohortService(req, orgID)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, cohort)
}

func (h *Handler) update(c echo.Context) error {
	var req UpdateCohortRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}

	cohort, err := updateCohortService(c.Param("id"), req)
	if errors.Is(err, ErrNotFound) {
		return shared.NotFound(c, "cohort not found")
	}
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.OK(c, cohort)
}

// ── Participants ──────────────────────────────────────────────────

func (h *Handler) listParticipants(c echo.Context) error {
	participants, err := listParticipantsService(c.Param("id"))
	if err != nil {
		return shared.InternalError(c, "failed to list participants")
	}
	return shared.OKList(c, participants, shared.Meta{Total: int64(len(participants))})
}

func (h *Handler) enroll(c echo.Context) error {
	var req EnrollParticipantRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}

	p, err := enrollParticipantService(c.Param("id"), req)
	if errors.Is(err, ErrAlreadyEnrolled) {
		return shared.Conflict(c, "user is already enrolled in this cohort")
	}
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, p)
}

func (h *Handler) updateEnrollment(c echo.Context) error {
	var req UpdateEnrollmentRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}

	p, err := updateEnrollmentService(c.Param("enrollId"), req)
	if errors.Is(err, ErrNotFound) {
		return shared.NotFound(c, "enrollment not found")
	}
	if err != nil {
		return shared.InternalError(c, "failed to update enrollment")
	}
	return shared.OK(c, p)
}

func (h *Handler) bulkEnroll(c echo.Context) error {
	var req BulkEnrollRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	if len(req.UserIDs) == 0 {
		return shared.BadRequest(c, "VALIDATION_ERROR", "user_ids must not be empty", "user_ids")
	}

	result, err := bulkEnrollService(c.Param("id"), req)
	if err != nil {
		return shared.InternalError(c, "bulk enroll failed")
	}
	return shared.OK(c, result)
}

func (h *Handler) stats(c echo.Context) error {
	stats, err := getCohortStatsService(c.Param("id"))
	if err != nil {
		return shared.InternalError(c, "failed to get cohort stats")
	}
	return shared.OK(c, stats)
}

func (h *Handler) myEnrollments(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	list, err := myEnrollmentsService(claims.UserID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch enrollments")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) nudge(c echo.Context) error {
	if err := nudgeParticipantService(c.Param("enrollId")); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "enrollment not found")
		}
		return shared.InternalError(c, "failed to send nudge")
	}
	return shared.NoContent(c)
}

func (h *Handler) enrollByEmail(c echo.Context) error {
	var req EnrollByEmailRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	if len(req.Participants) == 0 {
		return shared.BadRequest(c, "VALIDATION_ERROR", "participants must not be empty", "participants")
	}
	result, err := enrollByEmailService(c.Param("id"), req)
	if err != nil {
		return shared.InternalError(c, "enroll failed")
	}
	return shared.OK(c, result)
}

func (h *Handler) enrollCSV(c echo.Context) error {
	file, err := c.FormFile("file")
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "file field is required", "file")
	}
	src, err := file.Open()
	if err != nil {
		return shared.InternalError(c, "failed to read file")
	}
	defer src.Close()

	r := csv.NewReader(src)
	r.TrimLeadingSpace = true
	headers, err := r.Read()
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "CSV is empty or unreadable", "file")
	}

	// Build column index map (case-insensitive)
	col := map[string]int{}
	for i, h := range headers {
		col[strings.ToLower(strings.TrimSpace(h))] = i
	}
	get := func(row []string, key string) string {
		if i, ok := col[key]; ok && i < len(row) {
			return strings.TrimSpace(row[i])
		}
		return ""
	}

	var rows []ParticipantInput
	var errs []EnrollRowError
	lineNum := 1
	for {
		record, err := r.Read()
		if err == io.EOF {
			break
		}
		lineNum++
		if err != nil {
			errs = append(errs, EnrollRowError{Email: "", Reason: fmt.Sprintf("parse error on row %d", lineNum)})
			continue
		}
		email := strings.ToLower(get(record, "email"))
		name := get(record, "name")
		if email == "" || name == "" {
			errs = append(errs, EnrollRowError{Email: email, Reason: "name and email required"})
			continue
		}
		rows = append(rows, ParticipantInput{
			Name:       name,
			Email:      email,
			Department: get(record, "department"),
			Seniority:  get(record, "seniority"),
			Function:   get(record, "function"),
			Location:   get(record, "location"),
		})
	}

	result, err := enrollCSVService(c.Param("id"), rows)
	if err != nil {
		return shared.InternalError(c, "enroll failed")
	}
	// Merge parse errors into result
	result.FailedCount += len(errs)
	result.Errors = append(result.Errors, errs...)
	return shared.OK(c, result)
}

// ── Pool & Transfer ───────────────────────────────────────────────

func (h *Handler) pool(c echo.Context) error {
	programID := c.QueryParam("program_id")
	orgID := c.QueryParam("org_id")
	if programID == "" || orgID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "program_id and org_id are required", "")
	}
	list, err := listPoolService(programID, orgID)
	if err != nil {
		return shared.InternalError(c, "failed to load pool")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) transfer(c echo.Context) error {
	var req TransferRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	if err := transferParticipantService(c.Param("id"), req); err != nil {
		return shared.InternalError(c, "transfer failed")
	}
	return shared.NoContent(c)
}

func (h *Handler) randomDistribute(c echo.Context) error {
	var req RandomDistributeRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	result, err := randomDistributeService(req.ProgramID)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.OK(c, result)
}

// ── Groups ────────────────────────────────────────────────────────

func (h *Handler) listGroups(c echo.Context) error {
	groups, err := listGroupsService(c.Param("id"))
	if err != nil {
		return shared.InternalError(c, "failed to list groups")
	}
	return shared.OKList(c, groups, shared.Meta{Total: int64(len(groups))})
}

func (h *Handler) createGroups(c echo.Context) error {
	var req CreateGroupsRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	groups, err := createGroupsService(c.Param("id"), req)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, groups)
}

func (h *Handler) reshuffleGroups(c echo.Context) error {
	var req CreateGroupsRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	groups, err := reshuffleService(c.Param("id"), req)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.OK(c, groups)
}

func (h *Handler) deleteGroup(c echo.Context) error {
	if err := deleteGroupService(c.Param("groupId")); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "group not found")
		}
		return shared.InternalError(c, "failed to delete group")
	}
	return shared.NoContent(c)
}

func (h *Handler) moveMember(c echo.Context) error {
	var req MoveMemberRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	if req.EnrollmentID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "enrollment_id is required", "enrollment_id")
	}
	if err := moveMemberService(req); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "group or enrollment not found")
		}
		return shared.InternalError(c, "failed to move member")
	}
	return shared.NoContent(c)
}

