package audit

type AuditLogResponse struct {
	ID         string  `json:"id"`
	UserID     string  `json:"user_id"`
	Action     string  `json:"action"`
	Resource   string  `json:"resource"`
	ResourceID string  `json:"resource_id"`
	Changes    any     `json:"changes,omitempty"`
	IPAddress  *string `json:"ip_address,omitempty"`
	CreatedAt  string  `json:"created_at"`
}

type ListAuditQuery struct {
	UserID   string `query:"user_id"`
	Resource string `query:"resource"`
	Action   string `query:"action"`
	Page     int    `query:"page"`
	Limit    int    `query:"limit"`
}

// ── Central audit_events ────────────────────────────────────────────────────

type AuditEventResponse struct {
	ID          string `json:"id"`
	ActorUserID string `json:"actor_user_id,omitempty"`
	ActorName   string `json:"actor_name,omitempty"`
	ActorEmail  string `json:"actor_email,omitempty"`
	ActorRole   string `json:"actor_role,omitempty"`
	OrgID       string `json:"org_id,omitempty"`
	Category    string `json:"category"`
	Action      string `json:"action"`
	TargetType  string `json:"target_type,omitempty"`
	TargetID    string `json:"target_id,omitempty"`
	Severity    string `json:"severity"`
	Detail      any    `json:"detail,omitempty"`
	CreatedAt   string `json:"created_at"`
}

// ListEventsQuery holds the filters for the audit-event read surface.
// UserSearch matches the actor's name or email (case-insensitive, partial).
// DateFrom / DateTo accept either RFC3339 or YYYY-MM-DD.
type ListEventsQuery struct {
	ActorUserID string `query:"actor_user_id"`
	OrgID       string `query:"org_id"`
	Category    string `query:"category"`
	Action      string `query:"action"`
	Severity    string `query:"severity"`
	UserSearch  string `query:"user_search"`
	DateFrom    string `query:"date_from"`
	DateTo      string `query:"date_to"`
	Page        int    `query:"page"`
	Limit       int    `query:"limit"`
}

// AuditSummaryResponse holds the dashboard counts, all scoped to the current
// server day (UTC) and computed from real rows.
type AuditSummaryResponse struct {
	TotalToday   int64 `json:"total_today"`
	Errors       int64 `json:"errors"`
	Warnings     int64 `json:"warnings"`
	AdminActions int64 `json:"admin_actions"` // events performed by a superadmin actor
}
