package communications

import (
	"strconv"

	"github.com/google/uuid"
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
	g := v1.Group("/communications", shared.RequireAuth(), shared.HybridPermission("communications", "read", shared.RoleSuperAdmin, shared.RoleProgramManager))

	// Email Templates
	g.GET("/templates", h.listTemplates)
	g.POST("/templates", h.createTemplate, shared.HybridPermission("communications", "manage", shared.RoleSuperAdmin, shared.RoleProgramManager))
	g.PATCH("/templates/:id", h.updateTemplate, shared.HybridPermission("communications", "manage", shared.RoleSuperAdmin, shared.RoleProgramManager))
	g.DELETE("/templates/:id", h.deleteTemplate, shared.HybridPermission("communications", "manage", shared.RoleSuperAdmin, shared.RoleProgramManager))

	// Campaigns
	g.GET("/campaigns", h.listCampaigns)
	g.POST("/campaigns", h.createCampaign, shared.HybridPermission("communications", "manage", shared.RoleSuperAdmin, shared.RoleProgramManager))
	g.PATCH("/campaigns/:id", h.updateCampaign, shared.HybridPermission("communications", "manage", shared.RoleSuperAdmin, shared.RoleProgramManager))
	g.POST("/campaigns/:id/send", h.sendCampaign, shared.HybridPermission("communications", "send", shared.RoleSuperAdmin, shared.RoleProgramManager))
	g.POST("/campaigns/:id/schedule", h.scheduleCampaign, shared.HybridPermission("communications", "send", shared.RoleSuperAdmin, shared.RoleProgramManager))
	g.DELETE("/campaigns/:id", h.deleteCampaign, shared.HybridPermission("communications", "manage", shared.RoleSuperAdmin, shared.RoleProgramManager))

	// Automation Rules
	g.GET("/rules", h.listRules)
	g.POST("/rules", h.createRule, shared.HybridPermission("communications", "manage", shared.RoleSuperAdmin, shared.RoleProgramManager))
	g.PATCH("/rules/:id", h.updateRule, shared.HybridPermission("communications", "manage", shared.RoleSuperAdmin, shared.RoleProgramManager))
	g.DELETE("/rules/:id", h.deleteRule, shared.HybridPermission("communications", "manage", shared.RoleSuperAdmin, shared.RoleProgramManager))

	// In-app notifications (any authenticated user can read their own) — untouched, different resource.
	notifGroup := v1.Group("/communications/notifications", shared.RequireAuth(), shared.HybridPermission("notifications", "read", shared.RoleCoach, shared.RoleParticipant))
	notifGroup.GET("", h.listNotifications)
	notifGroup.POST("/:id/read", h.markRead)
	notifGroup.POST("/read-all", h.markAllRead)

	// Internal-only, machine-to-machine: sessions' loopback call when a
	// session goes live. Not exposed to any frontend client.
	internalGroup := v1.Group("/communications/internal", shared.RequireAuth(), shared.HybridPermission("communications", "notify_internal", shared.RoleFaculty, shared.RoleCoach))
	internalGroup.POST("/session-started", h.sessionStarted)
	internalGroup.POST("/notify", h.notifyDirect)

	// Logs
	g.GET("/logs", h.listLogs)

	// At-risk participants + nudge (superadmin/PM — group already gates read).
	g.GET("/at-risk", h.atRisk)
	g.POST("/nudge", h.sendNudge, shared.HybridPermission("communications", "send", shared.RoleSuperAdmin, shared.RoleProgramManager))
}

// atRisk lists at-risk participants across an org (?org_id=) or all orgs.
func (h *Handler) atRisk(c echo.Context) error {
	orgID := c.QueryParam("org_id")
	if orgID != "" {
		if _, err := uuid.Parse(orgID); err != nil {
			return shared.BadRequest(c, "VALIDATION_ERROR", "invalid org_id", "org_id")
		}
	}
	list, err := listAtRiskService(orgID)
	if err != nil {
		return shared.InternalError(c, "failed to load at-risk participants")
	}
	return shared.OK(c, list)
}

// sendNudge sends an in-app nudge to one at-risk participant.
func (h *Handler) sendNudge(c echo.Context) error {
	var req NudgeRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if req.UserID == "" {
		return shared.BadRequest(c, "VALIDATION_ERROR", "user_id is required", "user_id")
	}
	if _, err := uuid.Parse(req.UserID); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid user_id", "user_id")
	}
	if err := sendNudgeService(req.UserID, req.CohortID, req.Message); err != nil {
		return shared.InternalError(c, "failed to send nudge")
	}
	audit.Log(c, audit.Event{
		Category: "communications", Action: "nudge.send", Severity: audit.SeveritySuccess,
		TargetType: "user", TargetID: req.UserID,
		Detail: map[string]any{"cohort_id": req.CohortID},
	})
	return shared.NoContent(c)
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
	audit.Log(c, audit.Event{
		Category: "communications", Action: "template.create", Severity: audit.SeveritySuccess,
		TargetType: "email_template", TargetID: dto.ID, OrgID: dto.OrgID,
		Detail: map[string]any{"name": dto.Name, "subject": dto.Subject},
	})
	return shared.Created(c, dto)
}

func (h *Handler) updateTemplate(c echo.Context) error {
	var req UpdateTemplateRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	id := c.Param("id")
	if err := updateTemplateService(id, req); err != nil {
		return shared.InternalError(c, "failed to update template")
	}
	audit.Log(c, audit.Event{
		Category: "communications", Action: "template.update", Severity: audit.SeveritySuccess,
		TargetType: "email_template", TargetID: id,
	})
	return shared.NoContent(c)
}

func (h *Handler) deleteTemplate(c echo.Context) error {
	id := c.Param("id")
	if err := deleteTemplateService(id); err != nil {
		return shared.NotFound(c, "template not found")
	}
	audit.Log(c, audit.Event{
		Category: "communications", Action: "template.delete", Severity: audit.SeverityWarning,
		TargetType: "email_template", TargetID: id,
	})
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
	audit.Log(c, audit.Event{
		Category: "communications", Action: "campaign.create", Severity: audit.SeveritySuccess,
		TargetType: "email_campaign", TargetID: dto.ID, OrgID: dto.OrgID,
		Detail: map[string]any{"name": dto.Name, "audience": dto.Audience},
	})
	return shared.Created(c, dto)
}

func (h *Handler) updateCampaign(c echo.Context) error {
	var req UpdateCampaignRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	id := c.Param("id")
	if err := updateCampaignService(id, req); err != nil {
		return shared.InternalError(c, "failed to update campaign")
	}
	audit.Log(c, audit.Event{
		Category: "communications", Action: "campaign.update", Severity: audit.SeveritySuccess,
		TargetType: "email_campaign", TargetID: id,
	})
	return shared.NoContent(c)
}

func (h *Handler) sendCampaign(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	id := c.Param("id")
	if err := sendCampaignService(id, claims.UserID); err != nil {
		return shared.BadRequest(c, "SEND_ERROR", err.Error(), "")
	}
	audit.Log(c, audit.Event{
		Category: "communications", Action: "campaign.send", Severity: audit.SeveritySuccess,
		TargetType: "email_campaign", TargetID: id,
	})
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
	id := c.Param("id")
	if err := scheduleCampaignService(id, req.ScheduledAt); err != nil {
		return shared.InternalError(c, "failed to schedule campaign")
	}
	audit.Log(c, audit.Event{
		Category: "communications", Action: "campaign.schedule", Severity: audit.SeveritySuccess,
		TargetType: "email_campaign", TargetID: id,
		Detail: map[string]any{"scheduled_at": req.ScheduledAt},
	})
	return shared.OK(c, map[string]string{"message": "campaign scheduled"})
}

func (h *Handler) deleteCampaign(c echo.Context) error {
	id := c.Param("id")
	if err := deleteCampaignService(id); err != nil {
		return shared.BadRequest(c, "DELETE_ERROR", err.Error(), "")
	}
	audit.Log(c, audit.Event{
		Category: "communications", Action: "campaign.delete", Severity: audit.SeverityWarning,
		TargetType: "email_campaign", TargetID: id,
	})
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
	audit.Log(c, audit.Event{
		Category: "communications", Action: "rule.create", Severity: audit.SeveritySuccess,
		TargetType: "automation_rule", TargetID: dto.ID, OrgID: dto.OrgID,
		Detail: map[string]any{"name": dto.Name, "trigger_type": dto.TriggerType},
	})
	return shared.Created(c, dto)
}

func (h *Handler) updateRule(c echo.Context) error {
	var req UpdateRuleRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	id := c.Param("id")
	if err := updateRuleService(id, req); err != nil {
		return shared.InternalError(c, "failed to update rule")
	}
	audit.Log(c, audit.Event{
		Category: "communications", Action: "rule.update", Severity: audit.SeveritySuccess,
		TargetType: "automation_rule", TargetID: id,
	})
	return shared.NoContent(c)
}

func (h *Handler) deleteRule(c echo.Context) error {
	id := c.Param("id")
	if err := deleteRuleService(id); err != nil {
		return shared.NotFound(c, "rule not found")
	}
	audit.Log(c, audit.Event{
		Category: "communications", Action: "rule.delete", Severity: audit.SeverityWarning,
		TargetType: "automation_rule", TargetID: id,
	})
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

// ── Session-Started (internal, machine-to-machine) ───────────────

func (h *Handler) sessionStarted(c echo.Context) error {
	var req SessionStartedNotifyRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	if err := notifySessionStartedService(req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
	}
	return shared.NoContent(c)
}

// notifyDirect writes a single in-app notification to one user. Internal-only,
// posted by another module's loopback bridge (e.g. assessments grade finalize).
func (h *Handler) notifyDirect(c echo.Context) error {
	var req DirectNotifyRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "INVALID_BODY", "invalid request body", "")
	}
	if err := notifyDirectService(req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", err.Error(), "")
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
