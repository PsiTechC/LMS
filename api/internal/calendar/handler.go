package calendar

import (
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

// Handler serves GET /v1/calendar/events
type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/calendar", shared.RequireAuth())
	// All admin/faculty roles may view the calendar.
	// Participants and coaches have their own dedicated calendars (unchanged).
	g.GET("/events", h.events, shared.HybridPermission("sessions", "read",
		shared.RoleSuperAdmin,
		shared.RoleSuperAdminSecondary,
		shared.RoleProgramManager,
		shared.RoleFaculty,
	))
}

func (h *Handler) events(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}

	role := claims.Role
	orgID := c.QueryParam("org_id")
	programID := c.QueryParam("program_id")
	eventType := c.QueryParam("type") // session | coaching | "" = all
	from := c.QueryParam("from")
	to := c.QueryParam("to")

	// Validate org_id and program_id if provided.
	if orgID != "" {
		if _, err := uuid.Parse(orgID); err != nil {
			return shared.BadRequest(c, "VALIDATION_ERROR", "invalid org_id", "org_id")
		}
	}
	if programID != "" {
		if _, err := uuid.Parse(programID); err != nil {
			return shared.BadRequest(c, "VALIDATION_ERROR", "invalid program_id", "program_id")
		}
	}

	// Program Admins are always scoped to their own org — they cannot see
	// other orgs even if they pass an org_id query param.
	if role == shared.RoleProgramManager {
		pmOrgID, err := getCalendarOrgForUser(claims.UserID)
		if err != nil || pmOrgID == "" {
			// If we can't determine org, return empty rather than erroring.
			return shared.OKList(c, []CalendarEventDTO{}, shared.Meta{Total: 0})
		}
		orgID = pmOrgID
	}

	// Faculty see only sessions they are assigned to.
	events, err := listCalendarEventsService(role, claims.UserID, orgID, programID, eventType, from, to)
	if err != nil {
		return shared.InternalError(c, "failed to load calendar events")
	}

	return shared.OKList(c, events, shared.Meta{Total: int64(len(events))})
}
