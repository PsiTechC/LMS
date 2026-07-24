package activityprogress

import (
	"errors"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
	"github.com/xa-lms/api/pkg/database"
)

type Handler struct{}

func NewHandler() *Handler {
	fixActivityProgressSchema()
	return &Handler{}
}

// fixActivityProgressSchema ensures the indexes activity_progress needs exist.
// The table itself was defined in migrations/000004_programs.up.sql, but per
// CLAUDE.md that .sql file never actually runs against the shared DB - only
// idempotent Go code applies schema at boot. These indexes were never backed
// by any Go code, so they may be missing on the live table; this module owns
// activity_progress, so it (not riskscoring or any other caller) is
// responsible for guaranteeing them. Safe to re-run.
func fixActivityProgressSchema() {
	database.DB.Exec(`CREATE INDEX IF NOT EXISTS idx_activity_progress_activity ON activity_progress(activity_id)`)
	database.DB.Exec(`CREATE INDEX IF NOT EXISTS idx_activity_progress_user ON activity_progress(user_id)`)
	database.DB.Exec(`CREATE INDEX IF NOT EXISTS idx_activity_progress_enrollment ON activity_progress(enrollment_id)`)
	// Composite covering the ai/riskscoring overdue-activities correlated
	// subquery's exact filter (activity_id + enrollment_id + status), and
	// generally useful for any completed-status lookup per enrollment.
	database.DB.Exec(`CREATE INDEX IF NOT EXISTS idx_activity_progress_activity_enrollment_status ON activity_progress(activity_id, enrollment_id, status)`)
}

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/activity_progress", shared.RequireAuth(), shared.HybridPermission("activity_progress", "read", shared.RoleParticipant))
	// Batch fetch: all my progress rows for a program (for the Pre-Work grid).
	g.GET("", h.listMine)
	// Single activity progress (for the content viewer resume).
	g.GET("/:activity_id", h.getMine)
	// Create / update my progress for an activity.
	g.POST("", h.upsert, shared.HybridPermission("activity_progress", "write", shared.RoleParticipant))
	// Ping to update time spent and progress incrementally
	g.PATCH("/:activity_id/ping", h.ping, shared.HybridPermission("activity_progress", "write", shared.RoleParticipant))
}

func (h *Handler) listMine(c echo.Context) error {
	participantID, err := participantIDFrom(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	programID := c.QueryParam("program_id")
	if programID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "program_id is required", "program_id")
	}
	rows, err := listMyProgramProgressService(participantID, programID)
	if err != nil {
		if isValidationErr(err) {
			return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
		}
		return shared.InternalError(c, "failed to fetch progress")
	}
	return shared.OK(c, rows)
}

func (h *Handler) getMine(c echo.Context) error {
	participantID, err := participantIDFrom(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	dto, err := getMyActivityProgressService(participantID, c.Param("activity_id"))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "no progress yet")
		}
		if isValidationErr(err) {
			return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
		}
		return shared.InternalError(c, "failed to fetch progress")
	}
	return shared.OK(c, dto)
}

func (h *Handler) upsert(c echo.Context) error {
	participantID, err := participantIDFrom(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	var req UpsertProgressRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if req.ActivityID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "activity_id is required", "activity_id")
	}
	dto, err := upsertProgressService(participantID, req)
	if err != nil {
		switch {
		case errors.Is(err, ErrForbidden):
			return shared.Forbidden(c)
		case errors.Is(err, ErrNotFound):
			return shared.NotFound(c, "activity not found")
		case isValidationErr(err):
			return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
		default:
			return shared.InternalError(c, "failed to save progress")
		}
	}
	return shared.OK(c, dto)
}

func (h *Handler) ping(c echo.Context) error {
	participantID, err := participantIDFrom(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	var req PingProgressRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	
	activityID := c.Param("activity_id")
	if activityID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "activity_id is required", "activity_id")
	}
	
	dto, err := pingProgressService(participantID, activityID, req)
	if err != nil {
		switch {
		case errors.Is(err, ErrForbidden):
			return shared.Forbidden(c)
		case errors.Is(err, ErrNotFound):
			return shared.NotFound(c, "activity not found")
		case isValidationErr(err):
			return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
		default:
			return shared.InternalError(c, "failed to ping progress")
		}
	}
	return shared.OK(c, dto)
}

// ── helpers ──────────────────────────────────────────────────────

func participantIDFrom(c echo.Context) (uuid.UUID, error) {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return uuid.Nil, echo.ErrUnauthorized
	}
	return uuid.Parse(claims.UserID)
}

// isValidationErr distinguishes user-input errors (invalid uuid) from infra
// errors so the handler can return 400 vs 500 correctly.
func isValidationErr(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	return msg == "invalid activity_id" || msg == "invalid program_id"
}
