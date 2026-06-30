package communications

import (
	"strconv"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler {
	fixSchema()
	return &Handler{}
}

func (h *Handler) Register(v1 *echo.Group) {
	g := v1.Group("/communications", shared.RequireAuth(), shared.RequirePermission("communications", "read"))

	// Email Templates
	g.GET("/templates", h.listTemplates)
	g.POST("/templates", h.createTemplate, shared.RequirePermission("communications", "manage"))
	g.PATCH("/templates/:id", h.updateTemplate, shared.RequirePermission("communications", "manage"))
	g.DELETE("/templates/:id", h.deleteTemplate, shared.RequirePermission("communications", "manage"))

	// Campaigns
	g.GET("/campaigns", h.listCampaigns)
	g.POST("/campaigns", h.createCampaign, shared.RequirePermission("communications", "manage"))
	g.PATCH("/campaigns/:id", h.updateCampaign, shared.RequirePermission("communications", "manage"))
	g.POST("/campaigns/:id/send", h.sendCampaign, shared.RequirePermission("communications", "send"))
	g.POST("/campaigns/:id/schedule", h.scheduleCampaign, shared.RequirePermission("communications", "send"))
	g.DELETE("/campaigns/:id", h.deleteCampaign, shared.RequirePermission("communications", "manage"))

	// Automation Rules
	g.GET("/rules", h.listRules)
	g.POST("/rules", h.createRule, shared.RequirePermission("communications", "manage"))
	g.PATCH("/rules/:id", h.updateRule, shared.RequirePermission("communications", "manage"))
	g.DELETE("/rules/:id", h.deleteRule, shared.RequirePermission("communications", "manage"))

	// In-app notifications (any authenticated user can read their own)
	notifGroup := v1.Group("/communications/notifications", shared.RequireAuth(), shared.RequirePermission("notifications", "read"))
	notifGroup.GET("", h.listNotifications)
	notifGroup.POST("/:id/read", h.markRead)
	notifGroup.POST("/read-all", h.markAllRead)

	// Logs
	g.GET("/logs", h.listLogs)
}

// ── Templates ────────────────────────────────────────────────────

func (h *Handler) listTemplates(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	if orgID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "org_id is required", "org_id")
	}
	list, err := listTemplatesService(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to list templates")
	}
	return shared.OK(c, list)
}

func (h *Handler) createTemplate(c echo.Context) error {
	var req CreateTemplateRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	claims := shared.ClaimsFrom(c)
	dto, err := createTemplateService(req, claims.UserID)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, dto)
}

func (h *Handler) updateTemplate(c echo.Context) error {
	var req UpdateTemplateRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	if err := updateTemplateService(c.Param("id"), req); err != nil {
		return shared.InternalError(c, "failed to update template")
	}
	return shared.NoContent(c)
}

func (h *Handler) deleteTemplate(c echo.Context) error {
	if err := deleteTemplateService(c.Param("id")); err != nil {
		return shared.NotFound(c, "template not found")
	}
	return shared.NoContent(c)
}

// ── Campaigns ────────────────────────────────────────────────────

func (h *Handler) listCampaigns(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	if orgID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "org_id is required", "org_id")
	}
	page, _ := strconv.Atoi(c.QueryParam("page"))
	perPage, _ := strconv.Atoi(c.QueryParam("per_page"))
	if page < 1 {
		page = 1
	}
	if perPage < 1 {
		perPage = 20
	}
	list, total, err := listCampaignsService(orgID, page, perPage)
	if err != nil {
		return shared.InternalError(c, "failed to list campaigns")
	}
	return shared.OKList(c, list, shared.Meta{Page: page, PerPage: perPage, Total: total})
}

func (h *Handler) createCampaign(c echo.Context) error {
	var req CreateCampaignRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	claims := shared.ClaimsFrom(c)
	dto, err := createCampaignService(req, claims.UserID)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, dto)
}

func (h *Handler) updateCampaign(c echo.Context) error {
	var req UpdateCampaignRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	if err := updateCampaignService(c.Param("id"), req); err != nil {
		return shared.InternalError(c, "failed to update campaign")
	}
	return shared.NoContent(c)
}

func (h *Handler) sendCampaign(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if err := sendCampaignService(c.Param("id"), claims.UserID); err != nil {
		return shared.BadRequest(c, "SEND_ERROR", err.Error(), "")
	}
	return shared.OK(c, map[string]string{"message": "campaign is being sent"})
}

func (h *Handler) scheduleCampaign(c echo.Context) error {
	var req ScheduleCampaignRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	if req.ScheduledAt.IsZero() {
		return shared.BadRequest(c, "VALIDATION_ERROR", "scheduled_at is required", "scheduled_at")
	}
	if err := scheduleCampaignService(c.Param("id"), req.ScheduledAt); err != nil {
		return shared.InternalError(c, "failed to schedule campaign")
	}
	return shared.OK(c, map[string]string{"message": "campaign scheduled"})
}

func (h *Handler) deleteCampaign(c echo.Context) error {
	if err := deleteCampaignService(c.Param("id")); err != nil {
		return shared.BadRequest(c, "DELETE_ERROR", err.Error(), "")
	}
	return shared.NoContent(c)
}

// ── Automation Rules ─────────────────────────────────────────────

func (h *Handler) listRules(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	if orgID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "org_id is required", "org_id")
	}
	list, err := listRulesService(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to list rules")
	}
	return shared.OK(c, list)
}

func (h *Handler) createRule(c echo.Context) error {
	var req CreateRuleRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	claims := shared.ClaimsFrom(c)
	dto, err := createRuleService(req, claims.UserID)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.Created(c, dto)
}

func (h *Handler) updateRule(c echo.Context) error {
	var req UpdateRuleRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	if err := updateRuleService(c.Param("id"), req); err != nil {
		return shared.InternalError(c, "failed to update rule")
	}
	return shared.NoContent(c)
}

func (h *Handler) deleteRule(c echo.Context) error {
	if err := deleteRuleService(c.Param("id")); err != nil {
		return shared.NotFound(c, "rule not found")
	}
	return shared.NoContent(c)
}

// ── In-App Notifications ─────────────────────────────────────────

func (h *Handler) listNotifications(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	list, err := listNotificationsService(claims.UserID)
	if err != nil {
		return shared.InternalError(c, "failed to list notifications")
	}
	return shared.OK(c, list)
}

func (h *Handler) markRead(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if err := markReadService(c.Param("id"), claims.UserID); err != nil {
		return shared.NotFound(c, "notification not found")
	}
	return shared.NoContent(c)
}

func (h *Handler) markAllRead(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if err := markAllReadService(claims.UserID); err != nil {
		return shared.InternalError(c, "failed to mark all read")
	}
	return shared.NoContent(c)
}

// ── Logs ─────────────────────────────────────────────────────────

func (h *Handler) listLogs(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	if orgID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "org_id is required", "org_id")
	}
	campaignID := c.QueryParam("campaign_id")
	ruleID := c.QueryParam("rule_id")
	page, _ := strconv.Atoi(c.QueryParam("page"))
	perPage, _ := strconv.Atoi(c.QueryParam("per_page"))
	if page < 1 {
		page = 1
	}
	if perPage < 1 {
		perPage = 50
	}
	list, total, err := listLogsService(orgID, campaignID, ruleID, page, perPage)
	if err != nil {
		return shared.InternalError(c, "failed to list logs")
	}
	return shared.OKList(c, list, shared.Meta{Page: page, PerPage: perPage, Total: total})
}
