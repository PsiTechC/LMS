package invitations

import (
	"errors"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/audit"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler {
	fixSchema()
	return &Handler{}
}

func (h *Handler) Register(v1 *echo.Group) {
	// Protected — PM sends invites
	g := v1.Group("/invitations", shared.RequireAuth())
	g.POST("", h.send, shared.HybridPermission("cohorts", "update", shared.RoleSuperAdmin, shared.RoleProgramManager, shared.RoleFaculty))
	g.POST("/faculty", h.sendFacultyOrgInvite, shared.HybridPermission("cohorts", "update", shared.RoleSuperAdmin, shared.RoleProgramManager, shared.RoleFaculty))
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

	auditDetail := map[string]any{"email": req.Email, "role": req.Role, "cohort_id": req.CohortID}
	// dto is nil when an existing org-member was enrolled directly (no email sent)
	if dto == nil {
		audit.Log(c, audit.Event{Category: "invitations", Action: "invite.enroll_direct", Severity: audit.SeveritySuccess, TargetType: "invitation", Detail: auditDetail})
		return shared.OK(c, map[string]string{"message": "user already exists in org — enrolled directly"})
	}
	audit.Log(c, audit.Event{Category: "invitations", Action: "invite.send", Severity: audit.SeveritySuccess, TargetType: "invitation", TargetID: dto.ID, Detail: auditDetail})
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

	auditDetail := map[string]any{"email": req.Email, "role": req.Role, "org_id": req.OrgID, "role_id": req.RoleID}
	if dto == nil {
		audit.Log(c, audit.Event{Category: "invitations", Action: "invite.faculty.enroll_direct", Severity: audit.SeveritySuccess, TargetType: "invitation", OrgID: req.OrgID, Detail: auditDetail})
		return shared.OK(c, map[string]string{"message": "user already exists in org — added as faculty"})
	}
	audit.Log(c, audit.Event{Category: "invitations", Action: "invite.faculty.send", Severity: audit.SeveritySuccess, TargetType: "invitation", TargetID: dto.ID, OrgID: req.OrgID, Detail: auditDetail})
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

	// Capture invite context BEFORE accepting — validateTokenService rejects
	// already-accepted tokens, so this must run first. Used only to enrich
	// the audit log below; never affects accept behavior either way.
	preInfo, _ := validateTokenService(req.Token)

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

	if preInfo != nil {
		if u, uerr := lookupUser(preInfo.Email); uerr == nil && u != nil {
			audit.LogActor(u.ID, preInfo.Role, preInfo.OrgID, audit.Event{
				Category:   "users",
				Action:     "user.create",
				Severity:   audit.SeveritySuccess,
				TargetType: "user",
				TargetID:   u.ID,
				OrgID:      preInfo.OrgID,
				Detail:     map[string]any{"email": preInfo.Email, "role": preInfo.Role, "via": "invite_accept"},
			})
		}
	}

	return shared.OK(c, AcceptResponseDTO{Message: "enrolled successfully"})
}
