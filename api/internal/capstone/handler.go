package capstone

import (
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/audit"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/capstone", shared.RequireAuth(), shared.HybridPermission("capstone", "read", shared.RoleParticipant))
	g.GET("/my", h.getMy)
	g.POST("/submit", h.submit, shared.HybridPermission("capstone", "write", shared.RoleParticipant))
	g.POST("/files", h.addFile, shared.HybridPermission("capstone", "write", shared.RoleParticipant))
	g.POST("/peer-reviews", h.submitPeerReview, shared.HybridPermission("capstone", "write", shared.RoleParticipant))
}

func (h *Handler) getMy(c echo.Context) error {
	uid, err := userID(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	dto, err := getMyCapstoneService(uid, optionalProgramID(c))
	if err != nil {
		return shared.InternalError(c, "failed to load capstone")
	}
	return shared.OK(c, dto)
}

func (h *Handler) submit(c echo.Context) error {
	uid, err := userID(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	var req SubmitRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	dto, serr := submitCapstoneService(uid, optionalProgramID(c), req)
	if serr == nil {
		audit.Log(c, audit.Event{Category: "capstone", Action: "capstone.submit", Severity: audit.SeveritySuccess, TargetType: "user", TargetID: uid.String()})
	}
	return writeResult(c, dto, serr)
}

func (h *Handler) addFile(c echo.Context) error {
	uid, err := userID(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	var req AddFileRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	dto, serr := addFileService(uid, optionalProgramID(c), req)
	if serr == nil {
		audit.Log(c, audit.Event{Category: "capstone", Action: "capstone.file.add", Severity: audit.SeveritySuccess, TargetType: "user", TargetID: uid.String()})
	}
	return writeResult(c, dto, serr)
}

func (h *Handler) submitPeerReview(c echo.Context) error {
	uid, err := userID(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}
	var req SubmitPeerReviewRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	dto, serr := submitPeerReviewService(uid, optionalProgramID(c), req)
	if serr == nil {
		audit.Log(c, audit.Event{Category: "capstone", Action: "capstone.peer_review.submit", Severity: audit.SeveritySuccess, TargetType: "user", TargetID: uid.String()})
	}
	return writeResult(c, dto, serr)
}

// ── helpers ───────────────────────────────────────────────────────

func userID(c echo.Context) (uuid.UUID, error) {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return uuid.Nil, echo.ErrUnauthorized
	}
	return uuid.Parse(claims.UserID)
}

// optionalProgramID parses ?program_id= (the program the switcher is on). Nil
// when absent or malformed — the service then falls back to most-recent team.
func optionalProgramID(c echo.Context) *uuid.UUID {
	raw := c.QueryParam("program_id")
	if raw == "" {
		return nil
	}
	pid, err := uuid.Parse(raw)
	if err != nil {
		return nil
	}
	return &pid
}

func writeResult(c echo.Context, dto *MyCapstoneDTO, err error) error {
	if err != nil {
		switch {
		case errors.Is(err, ErrForbidden):
			return shared.Forbidden(c)
		case errors.Is(err, ErrNoTeam):
			return shared.BadRequest(c, "NO_TEAM", "you are not in a capstone team yet", "")
		case errors.Is(err, ErrNotFound):
			return shared.NotFound(c, "not found")
		case strings.HasPrefix(err.Error(), "validation:"):
			return shared.BadRequest(c, "VALIDATION_ERROR", strings.TrimPrefix(err.Error(), "validation: "), "")
		default:
			return shared.InternalError(c, "operation failed")
		}
	}
	return shared.OK(c, dto)
}
