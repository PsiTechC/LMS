package cohorts

import "time"

// ── Request DTOs ──────────────────────────────────────────────────

type CreateCohortRequest struct {
	ProgramID   string `json:"program_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	StartDate   string `json:"start_date"` // YYYY-MM-DD
	EndDate     string `json:"end_date"`
	MaxSeats    int    `json:"max_seats"`
}

type UpdateCohortRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
	StartDate   *string `json:"start_date"`
	EndDate     *string `json:"end_date"`
	MaxSeats    *int    `json:"max_seats"`
	IsActive    *bool   `json:"is_active"`
}

type EnrollParticipantRequest struct {
	UserID string `json:"user_id"`
	Role   string `json:"role"` // participant | faculty
}

type BulkEnrollRequest struct {
	UserIDs []string `json:"user_ids"`
	Role    string   `json:"role"`
}

type UpdateEnrollmentRequest struct {
	Status            *string `json:"status"`
	CompletionPercent *int    `json:"completion_percent"`
	RiskLevel         *string `json:"risk_level"`
}

type BulkEnrollResult struct {
	Enrolled []string `json:"enrolled"` // user_ids successfully enrolled
	Skipped  []string `json:"skipped"`  // user_ids already enrolled
	Failed   []string `json:"failed"`   // user_ids that errored
}

// CohortStatsDTO holds aggregated completion metrics for a cohort
type CohortStatsDTO struct {
	CohortID          string `json:"cohort_id"`
	TotalEnrolled     int    `json:"total_enrolled"`
	Completed         int    `json:"completed"`
	Active            int    `json:"active"`
	Withdrawn         int    `json:"withdrawn"`
	OnHold            int    `json:"on_hold"`
	AvgCompletion     int    `json:"avg_completion"`
	AtRiskCount       int    `json:"at_risk_count"`    // risk_level = high
	MediumRiskCount   int    `json:"medium_risk_count"`
}

// ── Response DTOs ─────────────────────────────────────────────────

type CohortDTO struct {
	ID          string     `json:"id"`
	ProgramID   string     `json:"program_id"`
	OrgID       string     `json:"org_id"`
	Name        string     `json:"name"`
	Description string     `json:"description,omitempty"`
	StartDate   *time.Time `json:"start_date,omitempty"`
	EndDate     *time.Time `json:"end_date,omitempty"`
	MaxSeats    int        `json:"max_seats"`
	IsActive    bool       `json:"is_active"`
	EnrolledCount int      `json:"enrolled_count"`
	CreatedAt   time.Time  `json:"created_at"`
}

type ParticipantDTO struct {
	EnrollmentID      string     `json:"enrollment_id"`
	UserID            string     `json:"user_id"`
	Name              string     `json:"name"`
	Email             string     `json:"email"`
	AvatarURL         *string    `json:"avatar_url,omitempty"`
	Department        *string    `json:"department,omitempty"`
	Role              string     `json:"role"`
	Status            string     `json:"status"`
	CompletionPercent int        `json:"completion_percent"`
	RiskLevel         string     `json:"risk_level"`
	EnrolledAt        time.Time  `json:"enrolled_at"`
	NudgedAt          *time.Time `json:"nudged_at,omitempty"`
}
