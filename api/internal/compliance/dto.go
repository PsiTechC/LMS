package compliance

// ── Completion Gates ─────────────────────────────────────────────────────────

// CompletionGateDTO is the public representation of a completion gate rule.
type CompletionGateDTO struct {
	ID               string `json:"id"`
	ProgramID        string `json:"program_id"`
	ActivityID       string `json:"activity_id"`
	PrereqActivityID string `json:"prereq_activity_id"`
	EscalationEmail  string `json:"escalation_email"`
	EscalationDays   int    `json:"escalation_days"`
	CreatedAt        string `json:"created_at"`
}

// CreateGateRequest is the body for POST /compliance/gates.
type CreateGateRequest struct {
	ProgramID        string `json:"program_id" validate:"required"`
	ActivityID       string `json:"activity_id" validate:"required"`
	PrereqActivityID string `json:"prereq_activity_id" validate:"required"`
	EscalationEmail  string `json:"escalation_email"`
	EscalationDays   int    `json:"escalation_days"`
}

// ── Data Retention Policies ──────────────────────────────────────────────────

// DataRetentionPolicyDTO is the public representation of a retention policy.
type DataRetentionPolicyDTO struct {
	ID              string `json:"id"`
	ProgramID       string `json:"program_id"`
	SubmissionsDays int    `json:"submissions_days"`
	RecordingsDays  int    `json:"recordings_days"`
	ChatLogsDays    int    `json:"chat_logs_days"`
	UpdatedAt       string `json:"updated_at"`
}

// UpsertRetentionRequest is the body for POST /compliance/retention.
type UpsertRetentionRequest struct {
	ProgramID       string `json:"program_id" validate:"required"`
	SubmissionsDays int    `json:"submissions_days"`
	RecordingsDays  int    `json:"recordings_days"`
	ChatLogsDays    int    `json:"chat_logs_days"`
}

// ── GDPR ─────────────────────────────────────────────────────────────────────

// AckGDPRRequest is the body for POST /compliance/gdpr/ack.
type AckGDPRRequest struct {
	Context string `json:"context" validate:"required"`
}

// ── Attendance Register ───────────────────────────────────────────────────────

// AttendanceRegisterRow represents a single learner/session row in the attendance export.
type AttendanceRegisterRow struct {
	LearnerName  string `json:"learner_name"`
	LearnerEmail string `json:"learner_email"`
	SessionTitle string `json:"session_title"`
	SessionDate  string `json:"session_date"`
	Status       string `json:"status"` // present | absent | late
	DurationMins int    `json:"duration_mins"`
}

// AttendanceRegisterResponse is returned by GET /compliance/attendance.
type AttendanceRegisterResponse struct {
	CohortID string                  `json:"cohort_id"`
	Rows     []AttendanceRegisterRow `json:"rows"`
}

// ── Audit Logs ───────────────────────────────────────────────────────────────

// AuditQueryDTO holds query parameters for the compliance-scoped audit log endpoint.
type AuditQueryDTO struct {
	OrgID    string `query:"org_id"`
	UserID   string `query:"user_id"`
	Resource string `query:"resource"`
	Action   string `query:"action"`
	DateFrom string `query:"date_from"`
	DateTo   string `query:"date_to"`
	Page     int    `query:"page"`
	Limit    int    `query:"limit"`
}

// AuditLogDTO is the public representation of a single audit log entry.
type AuditLogDTO struct {
	ID         string `json:"id"`
	UserID     string `json:"user_id"`
	UserName   string `json:"user_name,omitempty"`
	Action     string `json:"action"`
	Resource   string `json:"resource"`
	ResourceID string `json:"resource_id"`
	IPAddress  string `json:"ip_address,omitempty"`
	CreatedAt  string `json:"created_at"`
}
