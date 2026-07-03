package invitations

import (
	"errors"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	// Protected — PM sends invites
	g := v1.Group("/invitations", shared.RequireAuth())
	g.POST("", h.send, shared.RequirePermission("cohorts", "update"))
	g.POST("/faculty", h.sendFacultyOrgInvite, shared.RequirePermission("cohorts", "update"))
	g.GET("/cohort/:cohortId", h.listByCohort)

	// Public — no auth needed (user is not registered yet)
	v1.GET("/invitations/validate", h.validate)
	v1.POST("/invitations/accept", h.accept)
}

func (h *Handler) send(c echo.Context) error {
	var req SendInviteRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}

	claims := shared.ClaimsFrom(c)
	dto, err := sendInviteService(req, claims.UserID)
	if err != nil {
		switch {
		case errors.Is(err, ErrWrongOrg):
			return shared.BadRequest(c, "WRONG_ORG", "user belongs to a different organization", "email")
		case errors.Is(err, ErrAlreadyMember):
			return shared.Conflict(c, "user is already a member of this organization")
		case err.Error() != "":
			return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
		}
		return shared.InternalError(c, "failed to send invite")
	}

	// dto is nil when an existing org-member was enrolled directly (no email sent)
	if dto == nil {
		return shared.OK(c, map[string]string{"message": "user already exists in org — enrolled directly"})
	}
	return shared.Created(c, dto)
}

func (h *Handler) sendFacultyOrgInvite(c echo.Context) error {
	var req SendOrgFacultyInviteRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}

	claims := shared.ClaimsFrom(c)
	dto, err := sendOrgFacultyInviteService(req, claims.UserID)
	if err != nil {
		switch {
		case errors.Is(err, ErrAlreadyMember):
			return shared.Conflict(c, "user is already a faculty member in this organization")
		default:
			return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
		}
	}

	if dto == nil {
		return shared.OK(c, map[string]string{"message": "user already exists in org — added as faculty"})
	}
	return shared.Created(c, dto)
}

func (h *Handler) listByCohort(c echo.Context) error {
	list, err := listInvitesService(c.Param("cohortId"))
	if err != nil {
		return shared.InternalError(c, "failed to list invitations")
	}
	return shared.OKList(c, list, shared.Meta{Total: int64(len(list))})
}

func (h *Handler) validate(c echo.Context) error {
	token := c.QueryParam("token")
	if token == "" {
		return shared.BadRequest(c, "MISSING_PARAM", "token is required", "token")
	}

	dto, err := validateTokenService(token)
	if errors.Is(err, ErrAlreadyUsed) {
		return shared.BadRequest(c, "ALREADY_USED", "this invite has already been accepted", "")
	}
	if err != nil {
		return shared.BadRequest(c, "INVALID_TOKEN", "invite link is invalid or expired", "")
	}
	return shared.OK(c, dto)
}

func (h *Handler) accept(c echo.Context) error {
	var req AcceptInviteRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}

	if err := acceptInviteService(req); err != nil {
		switch {
		case errors.Is(err, ErrInvalidToken):
			return shared.BadRequest(c, "INVALID_TOKEN", "invite link is invalid or expired", "")
		case errors.Is(err, ErrAlreadyUsed):
			return shared.BadRequest(c, "ALREADY_USED", "this invite has already been accepted", "")
		default:
			return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
		}
	}

	return shared.OK(c, AcceptResponseDTO{Message: "enrolled successfully"})
}
