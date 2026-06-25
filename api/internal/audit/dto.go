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
