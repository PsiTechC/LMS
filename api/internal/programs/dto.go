package programs

import (
	"encoding/json"
	"time"
)

// ── Activity Faculty DTOs ─────────────────────────────────────────

type AssignFacultyRequest struct {
	FacultyUserID string  `json:"faculty_user_id"`
	Role          string  `json:"role"`                // Lead | Co-Facilitator | Observer
	CohortID      string  `json:"cohort_id,omitempty"` // optional - scope to specific cohort
	OverrideNote  *string `json:"override_note,omitempty"`
}

type ActivityFacultyDTO struct {
	ID            string  `json:"id"`
	ActivityID    string  `json:"activity_id"`
	FacultyUserID string  `json:"faculty_user_id"`
	CohortID      string  `json:"cohort_id,omitempty"`
	CohortName    string  `json:"cohort_name,omitempty"`
	Name          string  `json:"name"`
	Email         string  `json:"email"`
	AvatarURL     string  `json:"avatar_url,omitempty"`
	Role          string  `json:"role"`
	OverrideNote  *string `json:"override_note,omitempty"`
}

// ConflictDTO describes a scheduling conflict found for a faculty member.
type ConflictDTO struct {
	ActivityID    string `json:"activity_id"`
	ActivityTitle string `json:"activity_title"`
	ProgramTitle  string `json:"program_title"`
	CohortName    string `json:"cohort_name"`
	StartDate     string `json:"start_date"` // ISO date string
	EndDate       string `json:"end_date"`
	Role          string `json:"role"`
}

type CheckConflictResponse struct {
	HasConflict bool          `json:"has_conflict"`
	Conflicts   []ConflictDTO `json:"conflicts"`
}

// FacultyScheduleDay is one day entry in the calendar view.
type FacultyScheduleDay struct {
	Date         string `json:"date"` // YYYY-MM-DD
	IsBusy       bool   `json:"is_busy"`
	SessionID    string `json:"session_id,omitempty"`
	SessionTitle string `json:"session_title,omitempty"`
	ProgramTitle string `json:"program_title,omitempty"`
	Role         string `json:"role,omitempty"`
}

// FacultyAssignmentDTO is one activity a faculty member is assigned to deliver.
type FacultyAssignmentDTO struct {
	ActivityID    string `json:"activity_id"`
	ActivityTitle string `json:"activity_title"`
	ActivityType  string `json:"activity_type"`
	PhaseName     string `json:"phase_name"`
	ProgramID     string `json:"program_id"`
	ProgramTitle  string `json:"program_title"`
	ProgramColor  string `json:"program_color"`
	CohortID      string `json:"cohort_id,omitempty"`
	CohortName    string `json:"cohort_name,omitempty"`
	Role          string `json:"role"`
	StartDay      int    `json:"start_day"`
	DurationDays  int    `json:"duration_days"`
	OrgID         string `json:"org_id"`
	OrgName       string `json:"org_name"`
}

// ── Request DTOs ──────────────────────────────────────────────────

type CreateProgramRequest struct {
	Title           string `json:"title"`
	Description     string `json:"description"`
	Color           string `json:"color"`
	DurationWeeks   int    `json:"duration_weeks"`
	PaymentRequired bool   `json:"payment_required"`
	PriceAmount     int64  `json:"price_amount"`
	Currency        string `json:"currency"`
	GSTInclusive    *bool  `json:"gst_inclusive"`
	GSTRateBPS      int    `json:"gst_rate_bps"`
}

type UpdateProgramRequest struct {
	Title           *string `json:"title"`
	Description     *string `json:"description"`
	Color           *string `json:"color"`
	IsOpen          *bool   `json:"is_open"`
	DurationWeeks   *int    `json:"duration_weeks"`
	StartDate       *string `json:"start_date"` // YYYY-MM-DD
	EndDate         *string `json:"end_date"`
	PaymentRequired *bool   `json:"payment_required"`
	PriceAmount     *int64  `json:"price_amount"`
	Currency        *string `json:"currency"`
	GSTInclusive    *bool   `json:"gst_inclusive"`
	GSTRateBPS      *int    `json:"gst_rate_bps"`
}

type UpsertPhaseRequest struct {
	Title        string `json:"title"`
	Description  string `json:"description"`
	PhaseNumber  int    `json:"phase_number"`
	WeekLabel    string `json:"week_label"`
	Color        string `json:"color"`
	StartDay     int    `json:"start_day"`
	EndDay       int    `json:"end_day"`
	PhaseType    string `json:"phase_type"`    // pre-enrolment | orientation | module-virtual | module-in-person | coaching | capstone | post-program | custom
	DeliveryMode string `json:"delivery_mode"` // virtual | in-person | ''
}

type ReorderPhasesRequest struct {
	PhaseIDs []string `json:"phase_ids"` // ordered list of UUIDs
}

// ── Modules ───────────────────────────────────────────────────────

type UpsertModuleRequest struct {
	Title        string `json:"title"`
	DeliveryMode string `json:"delivery_mode"` // virtual | in-person
	SessionDate  string `json:"session_date"`  // YYYY-MM-DD, optional
	SortOrder    int    `json:"sort_order"`
}

type ModuleDTO struct {
	ID           string        `json:"id"`
	PhaseID      string        `json:"phase_id"`
	Title        string        `json:"title"`
	DeliveryMode string        `json:"delivery_mode"`
	SessionDate  string        `json:"session_date,omitempty"`
	SortOrder    int           `json:"sort_order"`
	Pre          []ActivityDTO `json:"pre"`
	Post         []ActivityDTO `json:"post"`
}

type CreateActivityRequest struct {
	PhaseID      string          `json:"phase_id"`
	ModuleID     string          `json:"module_id,omitempty"` // set when adding a pre/post-work element to a module
	Slot         string          `json:"slot,omitempty"`      // pre | post - required when module_id is set
	Title        string          `json:"title"`
	Description  string          `json:"description"`
	Type         string          `json:"type"`
	DeliveryMode string          `json:"delivery_mode"`
	DurationMins int             `json:"duration_mins"`
	DueDayOffset int             `json:"due_day_offset"`
	StartDay     int             `json:"start_day"`
	DurationDays int             `json:"duration_days"`
	IsMandatory  bool            `json:"is_mandatory"`
	Config       json.RawMessage `json:"config,omitempty"`
}

type UpdateActivityRequest struct {
	Title        *string         `json:"title"`
	Description  *string         `json:"description"`
	DeliveryMode *string         `json:"delivery_mode"`
	DurationMins *int            `json:"duration_mins"`
	DueDayOffset *int            `json:"due_day_offset"`
	StartDay     *int            `json:"start_day"`
	DurationDays *int            `json:"duration_days"`
	IsMandatory  *bool           `json:"is_mandatory"`
	SortOrder    *int            `json:"sort_order"`
	Config       json.RawMessage `json:"config,omitempty"`
}

// ── Response DTOs ─────────────────────────────────────────────────

type ActivityDTO struct {
	ID           string               `json:"id"`
	PhaseID      string               `json:"phase_id"`
	ModuleID     string               `json:"module_id,omitempty"`
	Slot         string               `json:"slot,omitempty"`
	Title        string               `json:"title"`
	Description  string               `json:"description,omitempty"`
	Type         string               `json:"type"`
	DeliveryMode string               `json:"delivery_mode"`
	SortOrder    int                  `json:"sort_order"`
	DurationMins int                  `json:"duration_mins"`
	DueDayOffset int                  `json:"due_day_offset"`
	StartDay     int                  `json:"start_day"`
	DurationDays int                  `json:"duration_days"`
	IsMandatory  bool                 `json:"is_mandatory"`
	Config       json.RawMessage      `json:"config,omitempty"`
	Faculty      []ActivityFacultyDTO `json:"faculty,omitempty"`
	// Locked/LockedReason/Completed are only ever set on a PARTICIPANT's own
	// request (see applyParticipantLocks in completion.go) - a post-slot
	// activity is locked until every mandatory pre-slot sibling in the same
	// module is complete. Never set for PM/faculty/superadmin views, which
	// must see everything regardless of any one participant's progress.
	Locked       bool   `json:"locked,omitempty"`
	LockedReason string `json:"locked_reason,omitempty"`
	// Completed is the SAME unified, cross-type completion signal
	// (survey_completions / submissions / assessment_attempts /
	// activity_progress / live_session-coaching) the module and phase gates
	// are computed from - the one source of truth every UI surface (Timeline,
	// Surveys, Assessments) should read instead of re-deriving completion
	// from just the generic `submissions` table, which many activity types
	// never write to.
	Completed bool `json:"completed,omitempty"`
}

type PhaseDTO struct {
	ID           string        `json:"id"`
	ProgramID    string        `json:"program_id"`
	Title        string        `json:"title"`
	Description  string        `json:"description,omitempty"`
	PhaseNumber  int           `json:"phase_number"`
	WeekLabel    string        `json:"week_label,omitempty"`
	Color        string        `json:"color"`
	StartDay     int           `json:"start_day"`
	EndDay       int           `json:"end_day"`
	PhaseType    string        `json:"phase_type"`
	DeliveryMode string        `json:"delivery_mode,omitempty"`
	Modules      []ModuleDTO   `json:"modules"`
	Activities   []ActivityDTO `json:"activities"`
	// Locked/LockedReason - participant view only, see ActivityDTO's doc.
	// A phase (after the first) is locked until the prior phase is fully
	// complete AND this phase's own start date has arrived.
	Locked       bool   `json:"locked,omitempty"`
	LockedReason string `json:"locked_reason,omitempty"`
}

type ProgramDTO struct {
	ID              string     `json:"id"`
	OrgID           string     `json:"org_id"`
	Title           string     `json:"title"`
	Description     string     `json:"description,omitempty"`
	Status          string     `json:"status"`
	Color           string     `json:"color"`
	IsOpen          bool       `json:"is_open"`
	PaymentRequired bool       `json:"payment_required"`
	PriceAmount     int64      `json:"price_amount"`
	Currency        string     `json:"currency"`
	GSTInclusive    bool       `json:"gst_inclusive"`
	GSTRateBPS      int        `json:"gst_rate_bps"`
	DurationWeeks   int        `json:"duration_weeks"`
	StartDate       *time.Time `json:"start_date,omitempty"`
	EndDate         *time.Time `json:"end_date,omitempty"`
	PublishedAt     *time.Time `json:"published_at,omitempty"`
	PhaseCount      int        `json:"phase_count"`
	ActivityCount   int        `json:"activity_count"`
	EnrolledCount   int        `json:"enrolled_count"`
	AvgCompletion   int        `json:"avg_completion"`
	CreatedAt       time.Time  `json:"created_at"`
}

type ProgramDetailDTO struct {
	ProgramDTO
	Phases []PhaseDTO `json:"phases"`
}

// ── Session Scheduling DTOs ──────────────────────────────────────

// ScheduleSessionRequest is sent by a PM to create a class_session for a specific activity.
type ScheduleSessionRequest struct {
	ActivityID   string `json:"activity_id"` // set by handler from URL param
	ProgramID    string `json:"program_id"`
	CohortID     string `json:"cohort_id"`
	FacultyID    string `json:"faculty_id"` // the faculty member who will run this session
	Title        string `json:"title"`
	Description  string `json:"description"`
	SessionType  string `json:"session_type"` // classroom | coaching_group | coaching_individual
	VirtualLink  string `json:"virtual_link"`
	ScheduledAt  string `json:"scheduled_at"` // RFC3339
	DurationMins int    `json:"duration_mins"`
}

// ScheduledSessionDTO is returned from the schedule-session endpoints.
type ScheduledSessionDTO struct {
	ID           string  `json:"id"`
	ActivityID   string  `json:"activity_id"`
	ProgramID    string  `json:"program_id"`
	CohortID     string  `json:"cohort_id"`
	FacultyID    string  `json:"faculty_id"`
	FacultyName  string  `json:"faculty_name,omitempty"`
	Title        string  `json:"title"`
	Description  *string `json:"description,omitempty"`
	SessionType  string  `json:"session_type"`
	VirtualLink  *string `json:"virtual_link,omitempty"`
	ScheduledAt  string  `json:"scheduled_at"`
	DurationMins int     `json:"duration_mins"`
	Status       string  `json:"status"`
	CreatedAt    string  `json:"created_at"`
}

// ── Program Materials DTOs ────────────────────────────────────────

type ProgramMaterialDTO struct {
	ID         string `json:"id"`
	ProgramID  string `json:"program_id"`
	UploadedBy string `json:"uploaded_by"`
	Title      string `json:"title"`
	Type       string `json:"type"`
	URL        string `json:"url"`
	SizeBytes  *int64 `json:"size_bytes,omitempty"`
	CreatedAt  string `json:"created_at"`
}

type AddProgramMaterialRequest struct {
	Title     string `json:"title"`
	Type      string `json:"type"`
	URL       string `json:"url"`
	SizeBytes *int64 `json:"size_bytes,omitempty"`
}

// ── Faculty Profile DTOs ──────────────────────────────────────────

// OrgFacultyProfileDTO is the full faculty card used in Roster tab.
type OrgFacultyProfileDTO struct {
	ID               string   `json:"id"`
	Name             string   `json:"name"`
	Email            string   `json:"email"`
	AvatarURL        string   `json:"avatar_url,omitempty"`
	Specialization   string   `json:"specialization,omitempty"`
	Bio              string   `json:"bio,omitempty"`
	Phone            string   `json:"phone,omitempty"`
	Location         string   `json:"location,omitempty"`
	LinkedinURL      string   `json:"linkedin_url,omitempty"`
	Certifications   []string `json:"certifications"`
	OnboardingStatus string   `json:"onboarding_status"` // active | onboarding | inactive
	SessionsCount    int      `json:"sessions_count"`
	ScheduledCount   int      `json:"scheduled_count"`
	EngagementPct    int      `json:"engagement_pct"`
	AvgL1Score       float64  `json:"avg_l1_score"`
	ProgramIDs       []string `json:"program_ids"`
	ProgramTitles    []string `json:"program_titles"`
}

type UpdateFacultyProfileRequest struct {
	Specialization   *string  `json:"specialization"`
	Bio              *string  `json:"bio"`
	Phone            *string  `json:"phone"`
	Location         *string  `json:"location"`
	LinkedinURL      *string  `json:"linkedin_url"`
	Certifications   []string `json:"certifications"`
	OnboardingStatus *string  `json:"onboarding_status"`
}

// OnboardFacultyRequest is the 4-step wizard payload (sent all at once on final submit).
type OnboardFacultyRequest struct {
	// Step 1 - Personal Info
	FirstName   string `json:"first_name"`
	LastName    string `json:"last_name"`
	Email       string `json:"email"`
	Phone       string `json:"phone"`
	Location    string `json:"location"`
	LinkedinURL string `json:"linkedin_url"`
	// Step 2 - Professional
	Specialization string   `json:"specialization"`
	Certifications []string `json:"certifications"`
	Bio            string   `json:"bio"`
	// Step 3 - Program assignments (program IDs to pre-assign)
	ProgramIDs []string `json:"program_ids"`
	// Step 4 - Platform access
	OrgID string `json:"org_id"`
}

// ── Faculty Dashboard / L1-L4 DTOs ───────────────────────────────

type FacultyDashboardDTO struct {
	TotalFaculty      int                     `json:"total_faculty"`
	SessionsDelivered int                     `json:"sessions_delivered"`
	AvgEngagement     int                     `json:"avg_engagement"`
	AvgL1Reaction     float64                 `json:"avg_l1_reaction"`
	FacultyRows       []FacultyPerformanceRow `json:"faculty_rows"`
}

type FacultyPerformanceRow struct {
	FacultyID      string  `json:"faculty_id"`
	FacultyName    string  `json:"faculty_name"`
	AvatarURL      string  `json:"avatar_url,omitempty"`
	Specialization string  `json:"specialization,omitempty"`
	Sessions       int     `json:"sessions"`
	Scheduled      int     `json:"scheduled"`
	EngagementPct  int     `json:"engagement_pct"`
	AvgL1Score     float64 `json:"avg_l1_score"`
	Status         string  `json:"status"`
}

type FacultyL1L4SummaryDTO struct {
	FacultyID      string  `json:"faculty_id"`
	FacultyName    string  `json:"faculty_name"`
	AvatarURL      string  `json:"avatar_url,omitempty"`
	Specialization string  `json:"specialization,omitempty"`
	AvgL1          float64 `json:"avg_l1"`
	AvgL2          float64 `json:"avg_l2"`
	AvgL3          float64 `json:"avg_l3"`
	AvgL4          float64 `json:"avg_l4"`
	L1Responses    int     `json:"l1_responses"`
	L2Responses    int     `json:"l2_responses"`
	L3Responses    int     `json:"l3_responses"`
	L4Responses    int     `json:"l4_responses"`
}
