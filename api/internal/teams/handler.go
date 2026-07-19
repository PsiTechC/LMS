package teams

import (
	"errors"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
	"net/http"
)

type Handler struct{ s *Service }

func NewHandler() (*Handler, error) {
	service, err := DefaultService()
	if err != nil {
		return nil, err
	}
	return &Handler{s: service}, nil
}
func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/teams", shared.RequireAuth())
	g.GET("/health", h.health, shared.HybridPermission("sessions", "update", shared.RoleSuperAdmin, shared.RoleProgramManager))
	g.POST("/online-meetings", h.create, shared.HybridPermission("sessions", "update", shared.RoleSuperAdmin, shared.RoleProgramManager, shared.RoleFaculty, shared.RoleCoach))
}
func (h *Handler) create(c echo.Context) error {
	var r CreateMeetingRequest
	if e := c.Bind(&r); e != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	m, e := h.s.CreateMeeting(c.Request().Context(), r)
	if e == nil {
		return shared.Created(c, m)
	}
	var ge *GraphError
	if errors.As(e, &ge) {
		return c.JSON(http.StatusBadGateway, map[string]any{"data": nil, "error": shared.ErrorDetail{Code: "MICROSOFT_GRAPH_ERROR", Message: "Microsoft Teams could not create the meeting"}})
	}
	return shared.BadRequest(c, "VALIDATION_ERROR", e.Error(), "")
}

func (h *Handler) health(c echo.Context) error {
	result, err := h.s.Health(c.Request().Context())
	if err == nil {
		return shared.OK(c, result)
	}
	var graphErr *GraphError
	if errors.As(err, &graphErr) {
		return c.JSON(http.StatusBadGateway, map[string]any{"data": nil, "error": shared.ErrorDetail{Code: "MICROSOFT_TEAMS_UNAVAILABLE", Message: "Microsoft Teams organizer verification failed"}})
	}
	return shared.InternalError(c, "Microsoft Teams configuration check failed")
}
