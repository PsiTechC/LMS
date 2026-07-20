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

// ── At-Risk Participants (Nudge & Comms) ─────────────────────────

// AtRiskParticipantDTO is one at-risk participant (enrollments.risk_level in
// high|medium) with the context needed to nudge them. All values are real.
type AtRiskParticipantDTO struct {
	UserID            string  `json:"user_id"`
	Name              string  `json:"name"`
	Email             string  `json:"email"`
	Org               string  `json:"org"`
	OrgID             string  `json:"org_id"`
	Program           string  `json:"program"`
	Cohort            string  `json:"cohort"`
	CohortID          string  `json:"cohort_id"`
	RiskLevel         string  `json:"risk_level"`         // high | medium
	CompletionPercent float64 `json:"completion_percent"`
	DaysSinceActivity int     `json:"days_since_activity"`
	NudgedAt          string  `json:"nudged_at"` // RFC3339 UTC, "" if never nudged
}

// NudgeRequest sends an in-app nudge to one at-risk participant.
type NudgeRequest struct {
	UserID   string `json:"user_id"`
	CohortID string `json:"cohort_id"`
	Message  string `json:"message"`
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
	Link       *string    `json:"link,omitempty"`
	ReadAt     *time.Time `json:"read_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

// ── Session-Started (internal, machine-to-machine) ───────────────

// SessionStartedNotifyRequest is posted by sessions' loopback bridge
// (internal/sessions/notify_bridge.go) exactly once, right after a session
// transitions scheduled -> live. Exactly one of EngagementID / CohortID /
// ProgramID-only determines the recipient-resolution path - see
// notifySessionStartedService.
type SessionStartedNotifyRequest struct {
	SessionID    string    `json:"session_id"`
	Title        string    `json:"title"`
	ScheduledAt  time.Time `json:"scheduled_at"`
	MeetingType  string    `json:"meeting_type"`
	JoinURL      string    `json:"join_url"`
	ProgramID    string    `json:"program_id"`
	CohortID     string    `json:"cohort_id"`
	EngagementID string    `json:"engagement_id"`
}

// DirectNotifyRequest is a generic single-recipient in-app notification posted
// by another module's loopback bridge (e.g. assessments after a faculty member
// finalizes a grade). It writes exactly one InAppNotification - no email, no
// recipient resolution - so any module can surface a targeted in-app alert
// without importing the communications package. Type defaults to "info".
type DirectNotifyRequest struct {
	UserID string `json:"user_id"`
	Title  string `json:"title"`
	Body   string `json:"body"`
	Type   string `json:"type"`
	// Link is an optional in-app deep link (e.g. "/dashboard/participant?tab=capstone")
	// the frontend navigates to on click.
	Link string `json:"link,omitempty"`
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
