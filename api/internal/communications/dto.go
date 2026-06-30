package communications

import "time"

// ── Email Templates ──────────────────────────────────────────────

type CreateTemplateRequest struct {
	OrgID     string   `json:"org_id"`
	Name      string   `json:"name"`
	Subject   string   `json:"subject"`
	BodyHTML  string   `json:"body_html"`
	Variables []string `json:"variables"`
}

type UpdateTemplateRequest struct {
	Name      string   `json:"name"`
	Subject   string   `json:"subject"`
	BodyHTML  string   `json:"body_html"`
	Variables []string `json:"variables"`
}

type EmailTemplateDTO struct {
	ID        string    `json:"id"`
	OrgID     string    `json:"org_id"`
	Name      string    `json:"name"`
	Subject   string    `json:"subject"`
	BodyHTML  string    `json:"body_html"`
	Variables []string  `json:"variables"`
	CreatedBy string    `json:"created_by"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

// ── Campaigns ────────────────────────────────────────────────────

type CreateCampaignRequest struct {
	OrgID      string `json:"org_id"`
	CohortID   string `json:"cohort_id"`
	TemplateID string `json:"template_id"`
	Name       string `json:"name"`
	Subject    string `json:"subject"`
	BodyHTML   string `json:"body_html"`
	Audience   string `json:"audience"`
}

type UpdateCampaignRequest struct {
	CohortID   string `json:"cohort_id"`
	TemplateID string `json:"template_id"`
	Name       string `json:"name"`
	Subject    string `json:"subject"`
	BodyHTML   string `json:"body_html"`
	Audience   string `json:"audience"`
}

type ScheduleCampaignRequest struct {
	ScheduledAt time.Time `json:"scheduled_at"`
}

type EmailCampaignDTO struct {
	ID             string     `json:"id"`
	OrgID          string     `json:"org_id"`
	CohortID       *string    `json:"cohort_id,omitempty"`
	TemplateID     *string    `json:"template_id,omitempty"`
	Name           string     `json:"name"`
	Subject        string     `json:"subject"`
	BodyHTML       string     `json:"body_html"`
	Audience       string     `json:"audience"`
	Status         string     `json:"status"`
	ScheduledAt    *time.Time `json:"scheduled_at,omitempty"`
	SentAt         *time.Time `json:"sent_at,omitempty"`
	RecipientCount int        `json:"recipient_count"`
	SentCount      int        `json:"sent_count"`
	CreatedBy      string     `json:"created_by"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

// ── Automation Rules ─────────────────────────────────────────────

type CreateRuleRequest struct {
	OrgID          string                 `json:"org_id"`
	Name           string                 `json:"name"`
	IsActive       bool                   `json:"is_active"`
	TriggerType    string                 `json:"trigger_type"`
	TriggerConfig  map[string]interface{} `json:"trigger_config"`
	Channel        string                 `json:"channel"`
	TemplateID     string                 `json:"template_id"`
	MessageSubject string                 `json:"message_subject"`
	MessageBody    string                 `json:"message_body"`
}

type UpdateRuleRequest struct {
	Name           string                 `json:"name"`
	IsActive       *bool                  `json:"is_active"`
	TriggerType    string                 `json:"trigger_type"`
	TriggerConfig  map[string]interface{} `json:"trigger_config"`
	Channel        string                 `json:"channel"`
	TemplateID     string                 `json:"template_id"`
	MessageSubject string                 `json:"message_subject"`
	MessageBody    string                 `json:"message_body"`
}

type AutomationRuleDTO struct {
	ID             string                 `json:"id"`
	OrgID          string                 `json:"org_id"`
	Name           string                 `json:"name"`
	IsActive       bool                   `json:"is_active"`
	TriggerType    string                 `json:"trigger_type"`
	TriggerConfig  map[string]interface{} `json:"trigger_config"`
	Channel        string                 `json:"channel"`
	TemplateID     *string                `json:"template_id,omitempty"`
	MessageSubject string                 `json:"message_subject"`
	MessageBody    string                 `json:"message_body"`
	LastRunAt      *time.Time             `json:"last_run_at,omitempty"`
	CreatedBy      string                 `json:"created_by"`
	CreatedAt      time.Time              `json:"created_at"`
	UpdatedAt      time.Time              `json:"updated_at"`
}

// ── In-App Notifications ─────────────────────────────────────────

type InAppNotificationDTO struct {
	ID         string     `json:"id"`
	UserID     string     `json:"user_id"`
	Title      string     `json:"title"`
	Body       string     `json:"body"`
	Type       string     `json:"type"`
	RuleID     *string    `json:"rule_id,omitempty"`
	CampaignID *string    `json:"campaign_id,omitempty"`
	ReadAt     *time.Time `json:"read_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

// ── Notification Logs ────────────────────────────────────────────

type NotificationLogDTO struct {
	ID             string    `json:"id"`
	OrgID          string    `json:"org_id"`
	CampaignID     *string   `json:"campaign_id,omitempty"`
	RuleID         *string   `json:"rule_id,omitempty"`
	UserID         string    `json:"user_id"`
	Channel        string    `json:"channel"`
	RecipientEmail string    `json:"recipient_email"`
	Subject        string    `json:"subject"`
	Status         string    `json:"status"`
	ErrorMsg       string    `json:"error_msg,omitempty"`
	SentAt         time.Time `json:"sent_at"`
}
