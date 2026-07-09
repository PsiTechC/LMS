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

// EnrollByEmailRequest enrolls participants by name+email (find-or-create user)
type EnrollByEmailRequest struct {
	Participants []ParticipantInput `json:"participants"`
	Role         string             `json:"role,omitempty"` // participant | participant_retailer — defaults to participant
}

type ParticipantInput struct {
	Name       string `json:"name"`
	Email      string `json:"email"`
	Department string `json:"department"`
	Seniority  string `json:"seniority,omitempty"`
	Function   string `json:"function,omitempty"`
	Location   string `json:"location,omitempty"`
}

type EnrollByEmailResult struct {
	Enrolled     int              `json:"enrolled"`
	AlreadyIn    int              `json:"already_in"`
	Failed       int              `json:"failed"`
	Errors       []EnrollRowError `json:"errors,omitempty"`
}

type EnrollRowError struct {
	Email  string `json:"email"`
	Reason string `json:"reason"`
}

// CSVImportResult is returned from POST /cohorts/:id/enroll/csv
type CSVImportResult struct {
	SuccessCount int              `json:"success_count"`
	FailedCount  int              `json:"failed_count"`
	Errors       []EnrollRowError `json:"errors,omitempty"`
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

// ── Group DTOs ────────────────────────────────────────────────────

// TransferRequest moves a participant from their current cohort into a new one.
type TransferRequest struct {
	UserID       string `json:"user_id"`
	FromCohortID string `json:"from_cohort_id"` // empty = from pool (just enroll)
}

// RandomDistributeRequest shuffles unassigned participants across cohorts of a program.
type RandomDistributeRequest struct {
	ProgramID string `json:"program_id"`
}

// PoolParticipantDTO is a user in the org who isn't enrolled in any cohort for a program.
type PoolParticipantDTO struct {
	UserID     string  `json:"user_id"`
	Name       string  `json:"name"`
	Email      string  `json:"email"`
	Department *string `json:"department,omitempty"`
}

type RandomDistributeResult struct {
	Distributed int `json:"distributed"`
	PerCohort   int `json:"per_cohort"`
}

type CreateGroupsRequest struct {
	Count      int    `json:"count"`       // number of groups to create
	NamePrefix string `json:"name_prefix"` // e.g. "Circle" → Circle 1, Circle 2 …
	GroupType  string `json:"group_type"`  // coaching_circle | peer_triad | als_team | custom
}

type MoveMemberRequest struct {
	EnrollmentID string `json:"enrollment_id"`
	ToGroupID    string `json:"to_group_id"` // empty string = remove from group (ungroup)
}

type GroupDTO struct {
	ID        string           `json:"id"`
	CohortID  string           `json:"cohort_id"`
	Name      string           `json:"name"`
	GroupType string           `json:"group_type"`
	SortOrder int              `json:"sort_order"`
	Members   []GroupMemberDTO `json:"members"`
}

type GroupMemberDTO struct {
	EnrollmentID string  `json:"enrollment_id"`
	UserID       string  `json:"user_id"`
	Name         string  `json:"name"`
	Email        string  `json:"email"`
	Department   *string `json:"department,omitempty"`
}

type MyEnrollmentDTO struct {
	EnrollmentID         string     `json:"enrollment_id"`
	CohortID             string     `json:"cohort_id"`
	CohortName           string     `json:"cohort_name"`
	CohortStartDate      *time.Time `json:"cohort_start_date,omitempty"`
	CohortEndDate        *time.Time `json:"cohort_end_date,omitempty"`
	Role                 string     `json:"role"`
	Status               string     `json:"status"`
	CompletionPercent    int        `json:"completion_percent"`
	RiskLevel            string     `json:"risk_level"`
	EnrolledAt           time.Time  `json:"enrolled_at"`
	ProgramID            string     `json:"program_id"`
	ProgramTitle         string     `json:"program_title"`
	ProgramDescription   *string    `json:"program_description,omitempty"`
	ProgramColor         string     `json:"program_color"`
	ProgramDurationWeeks int        `json:"program_duration_weeks"`
	ProgramStatus        string     `json:"program_status"`
}
