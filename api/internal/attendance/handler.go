package attendance

import (
	"errors"
	"log"
	"net/http"
	"os"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/attendance-sessions", shared.RequireAuth())
	g.POST("", h.start, shared.HybridPermission("attendance", "manage", shared.RoleFaculty, shared.RoleCoach))
	g.GET("/active", h.active, shared.HybridPermission("attendance", "manage", shared.RoleFaculty, shared.RoleCoach))
	g.POST("/:id/end", h.end, shared.HybridPermission("attendance", "manage", shared.RoleFaculty, shared.RoleCoach))
	// Check-in, participant-active, and my-status have no dedicated
	// permission gate beyond being logged in - any authenticated user may
	// call them; the service layer rejects anyone not actually enrolled in
	// the session's cohort.
	g.POST("/check-in", h.checkIn)
	g.GET("/participant-active", h.participantActive)
	g.GET("/:id/my-status", h.myStatus)
	g.GET("/:id/records", h.records, shared.HybridPermission("attendance", "manage", shared.RoleFaculty, shared.RoleCoach))
	g.GET("/:id/summary", h.summary, shared.HybridPermission("attendance", "manage", shared.RoleFaculty, shared.RoleCoach))
}

// frontendJoinBaseURL resolves the web app's base URL used to build the
// attendance QR/check-in join link. Falling back to localhost silently in
// production makes the QR code unscannable for anyone but the host machine -
// loud-log it so a missing APP_BASE_URL on the deployed env file gets
// noticed immediately instead of surfacing as "the QR code doesn't work".
func frontendJoinBaseURL() string {
	if base := os.Getenv("APP_BASE_URL"); base != "" {
		return base
	}
	if base := os.Getenv("NEXTAUTH_URL"); base != "" {
		return base
	}
	if os.Getenv("APP_ENV") == "production" {
		log.Println("⚠️  APP_BASE_URL is not set in production - attendance QR/join links will point to localhost and will not work. Set APP_BASE_URL in the API's env file.")
	}
	return "http://localhost:3000"
}

func (h *Handler) start(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req StartSessionRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	classSessionID, err := uuid.Parse(req.ClassSessionID)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "class_session_id must be a valid uuid", "class_session_id")
	}
	if req.Mode != ModeVirtual && req.Mode != ModeInPerson {
		return shared.BadRequest(c, "VALIDATION_ERROR", "mode must be 'virtual' or 'in_person'", "mode")
	}

	resp, err := StartSession(classSessionID, req.Mode, claims.UserID, claims.Role, frontendJoinBaseURL())
	if err != nil {
		switch {
		case errors.Is(err, ErrClassSessionNotFound):
			return shared.NotFound(c, "class session not found")
		case errors.Is(err, ErrForbidden):
			return shared.Forbidden(c)
		case errors.Is(err, ErrInvalidMode):
			return shared.BadRequest(c, "VALIDATION_ERROR", "mode must be 'virtual' or 'in_person'", "mode")
		case errors.Is(err, ErrTeamsMeetingNotReady):
			return shared.UnprocessableEntity(c, "TEAMS_MEETING_NOT_READY", "the Teams meeting is still being created; retry after the Teams join link is available", "")
		case errors.Is(err, ErrZoomAccountNotLinked):
			return shared.UnprocessableEntity(c, "ZOOM_NOT_CONNECTED", "you haven't connected your Zoom account yet - connect it before starting a virtual session", "")
		default:
			var zerr *ZoomLinkError
			if errors.As(err, &zerr) {
				return c.JSON(http.StatusBadGateway, map[string]any{
					"data": nil, "meta": nil,
					"error": shared.ErrorDetail{Code: "ZOOM_LINK_FAILED", Message: "failed to create the linked zoom meeting"},
				})
			}
			log.Printf("[attendance] start session failed class_session=%s: %v", req.ClassSessionID, err)
			return shared.InternalError(c, "failed to start attendance session")
		}
	}
	return shared.Created(c, resp)
}

// active looks up the currently active attendance window (if any) for a
// class session, so the frontend can reuse it instead of opening a
// duplicate one when the Attendance panel is re-opened.
func (h *Handler) active(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	classSessionID, err := uuid.Parse(c.QueryParam("class_session_id"))
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "class_session_id query param must be a valid uuid", "class_session_id")
	}

	resp, err := GetActiveSessionForClassSession(classSessionID, claims.UserID, claims.Role, frontendJoinBaseURL())
	if err != nil {
		switch {
		case errors.Is(err, ErrClassSessionNotFound):
			return shared.NotFound(c, "class session not found")
		case errors.Is(err, ErrForbidden):
			return shared.Forbidden(c)
		case errors.Is(err, ErrSessionNotFound):
			return shared.NotFound(c, "no active attendance session for this class session")
		default:
			log.Printf("[attendance] get active session failed class_session=%s: %v", c.QueryParam("class_session_id"), err)
			return shared.InternalError(c, "failed to load attendance session")
		}
	}
	return shared.OK(c, resp)
}

// participantActive returns the currently active attendance window's
// QR/code for a class session, for display on a participant's own device -
// mirrors active() but checks the caller's own enrollment instead of
// faculty ownership.
func (h *Handler) participantActive(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	classSessionID, err := uuid.Parse(c.QueryParam("class_session_id"))
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "class_session_id query param must be a valid uuid", "class_session_id")
	}

	resp, err := GetActiveSessionForParticipant(classSessionID, claims.UserID, frontendJoinBaseURL())
	if err != nil {
		switch {
		case errors.Is(err, ErrClassSessionNotFound):
			return shared.NotFound(c, "class session not found")
		case errors.Is(err, ErrForbidden):
			return shared.Forbidden(c)
		case errors.Is(err, ErrNoCohort):
			return shared.UnprocessableEntity(c, "NO_COHORT", "this class session has no cohort to check enrollment against", "")
		case errors.Is(err, ErrSessionNotFound):
			return shared.NotFound(c, "attendance has not been started for this session yet")
		default:
			log.Printf("[attendance] participant active failed class_session=%s: %v", c.QueryParam("class_session_id"), err)
			return shared.InternalError(c, "failed to load attendance session")
		}
	}
	return shared.OK(c, resp)
}

// myStatus reports whether the calling participant has checked into an
// attendance session yet, for their own device to poll while it displays
// the QR/code to be scanned externally (e.g. by their phone).
func (h *Handler) myStatus(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return shared.NotFound(c, "attendance session not found")
	}
	resp, err := GetMyCheckInStatus(id, claims.UserID)
	if err != nil {
		log.Printf("[attendance] my-status failed id=%s: %v", c.Param("id"), err)
		return shared.InternalError(c, "failed to load check-in status")
	}
	return shared.OK(c, resp)
}

func (h *Handler) end(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return shared.NotFound(c, "attendance session not found")
	}
	if err := EndSession(id, claims.UserID, claims.Role); err != nil {
		switch {
		case errors.Is(err, ErrSessionNotFound), errors.Is(err, ErrClassSessionNotFound):
			return shared.NotFound(c, "attendance session not found")
		case errors.Is(err, ErrForbidden):
			return shared.Forbidden(c)
		default:
			log.Printf("[attendance] end session failed id=%s: %v", c.Param("id"), err)
			return shared.InternalError(c, "failed to end attendance session")
		}
	}
	return shared.OK(c, map[string]bool{"ended": true})
}

func (h *Handler) checkIn(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req CheckInRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if req.Code == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "code is required", "code")
	}

	resp, err := CheckIn(req.Code, req.Token, claims.UserID)
	if err != nil {
		switch {
		case errors.Is(err, ErrSessionNotFound):
			return shared.NotFound(c, "invalid attendance code")
		case errors.Is(err, ErrInvalidToken):
			return shared.UnprocessableEntity(c, "INVALID_TOKEN", "this QR code is invalid or does not match the scanned code", "token")
		case errors.Is(err, ErrSessionEnded):
			return shared.UnprocessableEntity(c, "SESSION_ENDED", "this attendance session has ended", "")
		case errors.Is(err, ErrNotEnrolled):
			return shared.Forbidden(c)
		case errors.Is(err, ErrNoCohort):
			return shared.UnprocessableEntity(c, "NO_COHORT", "this session has no cohort to check enrollment against", "")
		default:
			log.Printf("[attendance] check-in failed code=%s: %v", req.Code, err)
			return shared.InternalError(c, "failed to check in")
		}
	}
	return shared.OK(c, resp)
}

func (h *Handler) records(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return shared.NotFound(c, "attendance session not found")
	}
	roster, err := ListRecords(id, claims.UserID, claims.Role)
	if err != nil {
		switch {
		case errors.Is(err, ErrSessionNotFound), errors.Is(err, ErrClassSessionNotFound):
			return shared.NotFound(c, "attendance session not found")
		case errors.Is(err, ErrForbidden):
			return shared.Forbidden(c)
		case errors.Is(err, ErrNoCohort):
			return shared.UnprocessableEntity(c, "NO_COHORT", "this session has no cohort roster", "")
		default:
			log.Printf("[attendance] list records failed id=%s: %v", c.Param("id"), err)
			return shared.InternalError(c, "failed to load attendance records")
		}
	}
	return shared.OKList(c, roster, shared.Meta{Total: int64(len(roster))})
}

func (h *Handler) summary(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return shared.NotFound(c, "attendance session not found")
	}
	summary, err := GetSummary(id, claims.UserID, claims.Role)
	if err != nil {
		switch {
		case errors.Is(err, ErrSessionNotFound), errors.Is(err, ErrClassSessionNotFound):
			return shared.NotFound(c, "attendance session not found")
		case errors.Is(err, ErrForbidden):
			return shared.Forbidden(c)
		case errors.Is(err, ErrNoCohort):
			return shared.UnprocessableEntity(c, "NO_COHORT", "this session has no cohort roster", "")
		default:
			log.Printf("[attendance] get summary failed id=%s: %v", c.Param("id"), err)
			return shared.InternalError(c, "failed to load attendance summary")
		}
	}
	return shared.OK(c, summary)
}
