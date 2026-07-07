package content

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"mime/multipart"
	"os"
	"strings"

	"github.com/golang-jwt/jwt/v4"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
	"gorm.io/gorm"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	// File serving: auth via Bearer header OR ?token= query param (for browser direct links)
	v1.GET("/content/assets/:id/file", h.serveFile)

	g := v1.Group("/content", shared.RequireAuth())
	g.GET("/assets", h.listAssets, shared.RequirePermission("content", "read"))
	g.GET("/assets/stats", h.getStats, shared.RequirePermission("content", "read"))
	g.GET("/assets/:id", h.getAsset, shared.RequirePermission("content", "read"))
	g.POST("/assets", h.createAsset, shared.RequirePermission("content", "create"))
	g.PATCH("/assets/:id", h.updateAsset, shared.RequirePermission("content", "update"))
	g.POST("/assets/:id/archive", h.archiveAsset, shared.RequirePermission("content", "update"))
}

func (h *Handler) listAssets(c echo.Context) error {
	orgID, err := optionalOrgID(c)
	if err != nil {
		return shared.BadRequest(c, "MISSING_PARAM", "org_id is required", "org_id")
	}
	assetType := c.QueryParam("type")
	status := c.QueryParam("status")
	search := c.QueryParam("search")

	assets, stats, err := listAssetsService(orgID, assetType, status, search)
	if err != nil {
		return shared.InternalError(c, "failed to list assets")
	}

	return shared.OK(c, map[string]interface{}{
		"assets": assets,
		"stats":  stats,
	})
}

func (h *Handler) getStats(c echo.Context) error {
	orgID, err := optionalOrgID(c)
	if err != nil {
		return shared.BadRequest(c, "MISSING_PARAM", "org_id is required", "org_id")
	}
	stats, err := getLibraryStats(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to get stats")
	}
	return shared.OK(c, stats)
}

func (h *Handler) getAsset(c echo.Context) error {
	orgID, err := requireOrgID(c)
	if err != nil {
		return shared.BadRequest(c, "MISSING_PARAM", "org_id is required", "org_id")
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid asset id", "id")
	}
	dto, err := getAssetService(id, orgID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return shared.NotFound(c, "asset not found")
		}
		return shared.InternalError(c, "failed to get asset")
	}
	return shared.OK(c, dto)
}

func (h *Handler) createAsset(c echo.Context) error {
	orgID, err := requireOrgID(c)
	if err != nil {
		return shared.BadRequest(c, "MISSING_PARAM", "org_id is required", "org_id")
	}
	userID, err := requireUserID(c)
	if err != nil {
		return shared.Unauthorized(c, "invalid token")
	}

	// Support both multipart (with file) and JSON (metadata-only creation)
	var req CreateAssetRequest
	ct := c.Request().Header.Get("Content-Type")
	var file *multipart.FileHeader
	if strings.Contains(ct, "multipart/form-data") {
		if err := parseMultipartAsset(c, &req); err != nil {
			return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
		}
		file, _ = c.FormFile("file")
	} else {
		if err := c.Bind(&req); err != nil {
			return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
		}
	}

	if strings.TrimSpace(req.Title) == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "title is required", "title")
	}
	if req.AssetType == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "asset_type is required", "asset_type")
	}

	dto, err := createAssetService(orgID, userID, req, file)
	if err != nil {
		return shared.InternalError(c, "failed to create asset: "+err.Error())
	}
	return shared.Created(c, dto)
}

func (h *Handler) updateAsset(c echo.Context) error {
	orgID, err := requireOrgID(c)
	if err != nil {
		return shared.BadRequest(c, "MISSING_PARAM", "org_id is required", "org_id")
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid asset id", "id")
	}

	var req UpdateAssetRequest
	ct := c.Request().Header.Get("Content-Type")
	var file *multipart.FileHeader
	if strings.Contains(ct, "multipart/form-data") {
		if err := parseMultipartUpdate(c, &req); err != nil {
			return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
		}
		file, _ = c.FormFile("file")
	} else {
		if err := c.Bind(&req); err != nil {
			return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
		}
	}

	dto, err := updateAssetService(id, orgID, req, file)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return shared.NotFound(c, "asset not found")
		}
		return shared.InternalError(c, "failed to update asset")
	}
	return shared.OK(c, dto)
}

func (h *Handler) archiveAsset(c echo.Context) error {
	orgID, err := requireOrgID(c)
	if err != nil {
		return shared.BadRequest(c, "MISSING_PARAM", "org_id is required", "org_id")
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid asset id", "id")
	}
	if err := archiveAssetService(id, orgID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return shared.NotFound(c, "asset not found")
		}
		return shared.InternalError(c, "failed to archive asset")
	}
	return shared.NoContent(c)
}

func (h *Handler) serveFile(c echo.Context) error {
	log.Printf("content: serveFile called id=%s org_id=%s token_present=%v",
		c.Param("id"), c.QueryParam("org_id"), c.QueryParam("token") != "" || c.Request().Header.Get("Authorization") != "")

	// Accept token via query param so browser <a href> and <video src> work
	if err := validateFileToken(c); err != nil {
		log.Printf("content: serveFile token validation failed: %v", err)
		return shared.Unauthorized(c, "missing or invalid token")
	}

	orgID, err := requireOrgID(c)
	if err != nil {
		return shared.BadRequest(c, "MISSING_PARAM", "org_id is required", "org_id")
	}
	id, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid asset id", "id")
	}

	data, fileName, mimeType, err := serveAssetFile(id, orgID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			log.Printf("content: serveFile not found id=%s org=%s", id, orgID)
			return shared.NotFound(c, "file not found")
		}
		log.Printf("content: serveFile error id=%s org=%s: %v", id, orgID, err)
		return shared.InternalError(c, "failed to serve file")
	}

	c.Response().Header().Set("Content-Disposition", `inline; filename="`+fileName+`"`)
	return c.Blob(200, mimeType, data)
}

// ── helpers ──────────────────────────────────────────────────────

func requireOrgID(c echo.Context) (uuid.UUID, error) {
	raw := c.QueryParam("org_id")
	if raw == "" {
		raw = c.FormValue("org_id")
	}
	if raw == "" {
		return uuid.Nil, errors.New("org_id required")
	}
	return uuid.Parse(raw)
}

// optionalOrgID allows superadmin (primary + secondary) to omit org_id to mean
// "all orgs" on read/browse endpoints. Every other role must pass a concrete,
// parseable org_id. Returns nil when the caller is a superadmin viewing all orgs.
func optionalOrgID(c echo.Context) (*uuid.UUID, error) {
	raw := c.QueryParam("org_id")
	if raw == "" {
		raw = c.FormValue("org_id")
	}
	if raw == "" {
		claims := shared.ClaimsFrom(c)
		if claims != nil && (claims.Role == shared.RoleSuperAdmin || claims.Role == shared.RoleSuperAdminSecondary) {
			return nil, nil
		}
		return nil, errors.New("org_id required")
	}
	id, err := uuid.Parse(raw)
	if err != nil {
		return nil, err
	}
	return &id, nil
}

// validateFileToken accepts Bearer header OR ?token= query param (for browser direct links).
func validateFileToken(c echo.Context) error {
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

func requireUserID(c echo.Context) (uuid.UUID, error) {
	claims := shared.ClaimsFrom(c)
	if claims == nil {
		return uuid.Nil, echo.ErrUnauthorized
	}
	return uuid.Parse(claims.UserID)
}

func parseMultipartAsset(c echo.Context, req *CreateAssetRequest) error {
	req.Title = c.FormValue("title")
	req.Description = c.FormValue("description")
	req.AssetType = c.FormValue("asset_type")
	if tagsJSON := c.FormValue("tags"); tagsJSON != "" {
		_ = json.Unmarshal([]byte(tagsJSON), &req.Tags)
	}
	if qc := c.FormValue("question_count"); qc != "" {
		var v int
		if _, err := fmt.Sscan(qc, &v); err == nil {
			req.QuestionCount = &v
		}
	}
	if dm := c.FormValue("duration_mins"); dm != "" {
		var v int
		if _, err := fmt.Sscan(dm, &v); err == nil {
			req.DurationMins = &v
		}
	}
	if se := c.FormValue("scorm_entry"); se != "" {
		req.ScormEntry = &se
	}
	if vu := c.FormValue("video_url"); vu != "" {
		req.VideoURL = &vu
	}
	return nil
}

func parseMultipartUpdate(c echo.Context, req *UpdateAssetRequest) error {
	if v := c.FormValue("title"); v != "" {
		req.Title = &v
	}
	if v := c.FormValue("description"); v != "" {
		req.Description = &v
	}
	if v := c.FormValue("status"); v != "" {
		req.Status = &v
	}
	if tagsJSON := c.FormValue("tags"); tagsJSON != "" {
		_ = json.Unmarshal([]byte(tagsJSON), &req.Tags)
	}
	if qc := c.FormValue("question_count"); qc != "" {
		var v int
		if _, err := fmt.Sscan(qc, &v); err == nil {
			req.QuestionCount = &v
		}
	}
	if dm := c.FormValue("duration_mins"); dm != "" {
		var v int
		if _, err := fmt.Sscan(dm, &v); err == nil {
			req.DurationMins = &v
		}
	}
	if se := c.FormValue("scorm_entry"); se != "" {
		req.ScormEntry = &se
	}
	if vu := c.FormValue("video_url"); vu != "" {
		req.VideoURL = &vu
	}
	return nil
}
