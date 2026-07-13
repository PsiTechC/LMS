package organizations

import (
	"errors"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/audit"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/organizations", shared.RequireAuth(), shared.HybridPermission("organizations", "read", shared.RoleSuperAdmin))
	g.GET("", h.list)
	g.POST("", h.create, shared.HybridPermission("organizations", "create", shared.RoleSuperAdmin))
	g.GET("/:id", h.get)
	g.PATCH("/:id", h.update, shared.HybridPermission("organizations", "update", shared.RoleSuperAdmin))

	// Org-level Zoom S2S credentials — Superadmin-managed only; the org's own
	// PM may read connection status (never the secret) via a separate action
	// key (org_zoom:read) so this doesn't touch organizations:read/update.
	zc := v1.Group("/organizations/:id/zoom-credentials", shared.RequireAuth())
	zc.PUT("", h.saveZoomCredentials, shared.HybridPermission("org_zoom", "manage", shared.RoleSuperAdmin))
	zc.DELETE("", h.deleteZoomCredentials, shared.HybridPermission("org_zoom", "manage", shared.RoleSuperAdmin))
	zc.GET("/status", h.zoomCredentialsStatus, shared.HybridPermission("org_zoom", "read", shared.RoleSuperAdmin, shared.RoleProgramManager))

	b := v1.Group("/branding", shared.RequireAuth())
	b.GET("/current", h.currentBrandKit, shared.HybridPermission("branding", "read", shared.RoleParticipant))
	b.GET("/:orgId", h.getBrandKit, shared.HybridPermission("branding", "read", shared.RoleParticipant))
	// branding:manage is PM-ONLY in the matrix — superadmin is deliberately
	// NOT listed here, or the resolver's superadmin bootstrap (Full access
	// with no assignments) would incorrectly grant this when the matrix
	// denies it.
	b.PATCH("/:orgId", h.updateBrandKit, shared.HybridPermission("branding", "manage", shared.RoleProgramManager))
}

func (h *Handler) list(c echo.Context) error {
	orgs, err := listOrgsService()
	if err != nil {
		return shared.InternalError(c, "failed to fetch organizations")
	}
	return shared.OKList(c, orgs, shared.Meta{Total: int64(len(orgs))})
}

func (h *Handler) get(c echo.Context) error {
	org, err := getOrgByID(c.Param("id"))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "organization not found")
		}
		return shared.InternalError(c, "failed to fetch organization")
	}
	return shared.OK(c, orgToDTO(*org))
}

func (h *Handler) update(c echo.Context) error {
	var req UpdateOrgRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	org, err := updateOrgService(c.Param("id"), req)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "organization not found")
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	// Org config change (plan/status/seats/etc.) — log the fields that changed.
	audit.Log(c, audit.Event{
		Category:   "organization",
		Action:     "config.update",
		Severity:   audit.SeveritySuccess,
		TargetType: "organization",
		TargetID:   org.ID,
		OrgID:      org.ID,
		Detail:     req,
	})
	return shared.OK(c, org)
}

func (h *Handler) create(c echo.Context) error {
	var req CreateOrgRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}

	resp, err := createOrgService(req)
	if err != nil {
		switch {
		case errors.Is(err, ErrSlugTaken):
			return shared.Conflict(c, "slug is already in use")
		case err.Error() != "":
			return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
		default:
			return shared.InternalError(c, "failed to create organization")
		}
	}

	audit.Log(c, audit.Event{
		Category:   "organization",
		Action:     "create",
		Severity:   audit.SeveritySuccess,
		TargetType: "organization",
		TargetID:   resp.Organization.ID,
		OrgID:      resp.Organization.ID,
		Detail: map[string]any{
			"name": resp.Organization.Name,
			"slug": resp.Organization.Slug,
			"plan": resp.Organization.Plan,
		},
	})

	return shared.Created(c, resp)
}

// saveZoomCredentials upserts the org's S2S Zoom credentials. Superadmin-only
// (route gate) — no own-org check needed since Superadmin manages every org.
func (h *Handler) saveZoomCredentials(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	orgID := c.Param("id")
	var req SaveZoomCredentialsRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if err := saveOrgZoomCredentialsService(orgID, claims.UserID, req); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "organization not found")
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	audit.Log(c, audit.Event{
		Category:   "organization",
		Action:     "zoom_credentials.save",
		Severity:   audit.SeveritySuccess,
		TargetType: "organization",
		TargetID:   orgID,
		OrgID:      orgID,
	})
	return shared.OK(c, map[string]bool{"saved": true})
}

// deleteZoomCredentials removes the org's stored Zoom credentials entirely.
func (h *Handler) deleteZoomCredentials(c echo.Context) error {
	orgID := c.Param("id")
	if err := deleteOrgZoomCredentialsService(orgID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "organization not found")
		}
		return shared.InternalError(c, "failed to remove zoom credentials")
	}
	audit.Log(c, audit.Event{
		Category:   "organization",
		Action:     "zoom_credentials.delete",
		Severity:   audit.SeveritySuccess,
		TargetType: "organization",
		TargetID:   orgID,
		OrgID:      orgID,
	})
	return shared.NoContent(c)
}

// zoomCredentialsStatus is readable by Superadmin (any org) or the org's own
// Program Manager — never the raw secret, only connected/masked-id/timestamp.
func (h *Handler) zoomCredentialsStatus(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	orgID := c.Param("id")
	if claims.Role == shared.RoleProgramManager {
		ownOrgID, err := getOrgIDForUser(claims.UserID)
		if err != nil || ownOrgID != orgID {
			return shared.Forbidden(c)
		}
	}
	status, err := getOrgZoomCredentialsStatusService(orgID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "organization not found")
		}
		return shared.InternalError(c, "failed to fetch zoom credentials status")
	}
	return shared.OK(c, status)
}

func (h *Handler) currentBrandKit(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	brand, err := getCurrentBrandKitService(claims.UserID)
	if err != nil {
		return shared.InternalError(c, "failed to fetch brand kit")
	}
	return shared.OK(c, brand)
}

func (h *Handler) getBrandKit(c echo.Context) error {
	brand, err := getBrandKitService(c.Param("orgId"))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "organization not found")
		}
		return shared.InternalError(c, "failed to fetch brand kit")
	}
	return shared.OK(c, brand)
}

func (h *Handler) updateBrandKit(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	orgID := c.Param("orgId")
	ownOrgID, err := getOrgIDForUser(claims.UserID)
	if err != nil || ownOrgID != orgID {
		return shared.Forbidden(c)
	}
	var req UpdateBrandKitRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	brand, err := updateBrandKitService(orgID, req)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "organization not found")
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.OK(c, brand)
}
