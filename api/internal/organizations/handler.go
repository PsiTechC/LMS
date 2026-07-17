package organizations

import (
	"errors"
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v4"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/audit"
	"github.com/xa-lms/api/internal/shared"
	"gorm.io/gorm"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/organizations", shared.RequireAuth(), shared.HybridPermission("organizations", "read", shared.RoleSuperAdmin))
	g.GET("", h.list)
	g.POST("", h.create, shared.HybridPermission("organizations", "create", shared.RoleSuperAdmin))
	g.GET("/:id", h.get)
	g.PATCH("/:id", h.update, shared.HybridPermission("organizations", "update", shared.RoleSuperAdmin))

	// Onboarding Automation — AI-suggested setup defaults for the new-org
	// wizard. Read-only (never creates an org itself); gated with the exact
	// same permission key as org creation, so nothing here is reachable by
	// anyone who couldn't already create an org.
	g.POST("/onboarding/suggest", h.suggestOrgSetup, shared.HybridPermission("organizations", "create", shared.RoleSuperAdmin))

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
	// branding:manage includes Superadmin (matrix-level, not a resolverRole —
	// see rbac_matrix comment) specifically so the org-creation wizard can set
	// initial branding right after creating a new org. updateBrandKit's own-org
	// check (below) is bypassed for Superadmin/SuperadminSecondary only; a PM
	// still can't touch another org's branding.
	b.PATCH("/:orgId", h.updateBrandKit, shared.HybridPermission("branding", "manage", shared.RoleProgramManager, shared.RoleSuperAdmin))

	// Org logo — multipart upload/serve/delete, org-management surface kept
	// separate from the branding group's pure-JSON routes. Same permission and
	// own-org-or-superadmin semantics as branding:manage.
	l := v1.Group("/organizations/:orgId/logo", shared.RequireAuth())
	l.POST("", h.uploadOrgLogo, shared.HybridPermission("branding", "manage", shared.RoleProgramManager, shared.RoleSuperAdmin))
	l.DELETE("", h.deleteOrgLogo, shared.HybridPermission("branding", "manage", shared.RoleProgramManager, shared.RoleSuperAdmin))

	// Logo file serving — token-authenticated like content's serveFile, not
	// permission-gated, so an <img src> tag can load it directly.
	v1.GET("/organizations/:orgId/logo/:logoId/file", h.serveOrgLogo)
}

// canManageOrgBranding reports whether the caller may manage orgID's branding
// (logo/colors): Superadmin (any org) or the org's own Program Manager.
// Shared by updateBrandKit and the logo upload/delete handlers so both stay
// consistent as this rule evolves.
func canManageOrgBranding(claims *shared.JWTClaims, orgID string) bool {
	if claims.Role == shared.RoleSuperAdmin || claims.Role == shared.RoleSuperAdminSecondary {
		return true
	}
	ownOrgID, err := getOrgIDForUser(claims.UserID)
	return err == nil && ownOrgID == orgID
}

func (h *Handler) list(c echo.Context) error {
	orgs, err := listOrgsService()
	if err != nil {
		return shared.InternalError(c, "failed to fetch organizations")
	}
	return shared.OKList(c, orgs, shared.Meta{Total: int64(len(orgs))})
}

func (h *Handler) get(c echo.Context) error {
	org, err := getOrgService(c.Param("id"))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "organization not found")
		}
		return shared.InternalError(c, "failed to fetch organization")
	}
	return shared.OK(c, org)
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

// suggestOrgSetup returns AI-suggested defaults for the new-org wizard —
// read-only, never creates or modifies anything. The wizard still submits
// the existing POST /organizations request to actually create the org.
func (h *Handler) suggestOrgSetup(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return shared.Unauthorized(c, "invalid token")
	}
	if !provider.Configured() {
		return shared.BadRequest(c, "AI_NOT_CONFIGURED", "AI provider is not configured (set AI_API_KEY)", "")
	}
	var req SuggestOrgSetupRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	dto, err := suggestOrgSetupService(c.Request().Context(), claims.UserID, claims.Role, req)
	if err != nil {
		return shared.BadRequest(c, "ONBOARDING_SUGGEST_ERROR", err.Error(), "")
	}
	return shared.OK(c, dto)
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
	if !canManageOrgBranding(claims, orgID) {
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

// uploadOrgLogo — multipart upload, Superadmin (any org) or the org's own PM.
func (h *Handler) uploadOrgLogo(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	orgID := c.Param("orgId")
	if !canManageOrgBranding(claims, orgID) {
		return shared.Forbidden(c)
	}
	file, err := c.FormFile("file")
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "file is required", "file")
	}
	resp, err := uploadOrgLogoService(orgID, file)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "organization not found")
		}
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	audit.Log(c, audit.Event{
		Category:   "organization",
		Action:     "logo.upload",
		Severity:   audit.SeveritySuccess,
		TargetType: "organization",
		TargetID:   orgID,
		OrgID:      orgID,
	})
	return shared.OK(c, resp)
}

// deleteOrgLogo clears the org's logo entirely.
func (h *Handler) deleteOrgLogo(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	orgID := c.Param("orgId")
	if !canManageOrgBranding(claims, orgID) {
		return shared.Forbidden(c)
	}
	if err := deleteOrgLogoService(orgID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "organization not found")
		}
		return shared.InternalError(c, "failed to remove logo")
	}
	audit.Log(c, audit.Event{
		Category:   "organization",
		Action:     "logo.delete",
		Severity:   audit.SeveritySuccess,
		TargetType: "organization",
		TargetID:   orgID,
		OrgID:      orgID,
	})
	return shared.NoContent(c)
}

// serveOrgLogo streams the logo's raw bytes — token-authenticated (Bearer
// header or ?token= query param) like content's serveFile, not permission-
// gated, so a plain <img src="..."> tag can load it without extra headers.
func (h *Handler) serveOrgLogo(c echo.Context) error {
	if err := validateLogoFileToken(c); err != nil {
		return shared.Unauthorized(c, "missing or invalid token")
	}
	orgID := c.Param("orgId")
	logoID := c.Param("logoId")
	if _, err := uuid.Parse(orgID); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid org id", "orgId")
	}
	if _, err := uuid.Parse(logoID); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid logo id", "logoId")
	}
	data, fileName, mimeType, err := getOrgLogoFileService(orgID, logoID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return shared.NotFound(c, "logo not found")
		}
		return shared.InternalError(c, "failed to serve logo")
	}
	c.Response().Header().Set("Content-Disposition", `inline; filename="`+fileName+`"`)
	return c.Blob(200, mimeType, data)
}

// validateLogoFileToken mirrors content.validateFileToken — small per-module
// duplication is the established pattern here rather than a cross-module
// export (see content/handler.go's validateFileToken).
func validateLogoFileToken(c echo.Context) error {
	tokenStr := ""
	header := c.Request().Header.Get("Authorization")
	if strings.HasPrefix(header, "Bearer ") {
		tokenStr = strings.TrimPrefix(header, "Bearer ")
	} else if t := c.QueryParam("token"); t != "" {
		tokenStr = t
	}
	if tokenStr == "" {
		return errors.New("missing token")
	}
	claims := &shared.JWTClaims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, echo.ErrUnauthorized
		}
		return []byte(os.Getenv("JWT_SECRET")), nil
	})
	if err != nil || !token.Valid {
		return errors.New("invalid token")
	}
	c.Set("claims", claims)
	return nil
}
