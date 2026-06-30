package programs

import "time"

// ── Activity Faculty DTOs ─────────────────────────────────────────

type AssignFacultyRequest struct {
	FacultyUserID string  `json:"faculty_user_id"`
	Role          string  `json:"role"` // Lead | Co-Facilitator | Observer
	CohortID      string  `json:"cohort_id,omitempty"` // optional — scope to specific cohort
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
	ActivityID    string  `json:"activity_id"`
	ActivityTitle string  `json:"activity_title"`
	ProgramTitle  string  `json:"program_title"`
	CohortName    string  `json:"cohort_name"`
	StartDate     string  `json:"start_date"` // ISO date string
	EndDate       string  `json:"end_date"`
	Role          string  `json:"role"`
}

type CheckConflictResponse struct {
	HasConflict bool          `json:"has_conflict"`
	Conflicts   []ConflictDTO `json:"conflicts"`
}

// FacultyScheduleDay is one day entry in the calendar view.
type FacultyScheduleDay struct {
	Date      string `json:"date"` // YYYY-MM-DD
	IsBusy    bool   `json:"is_busy"`
	SessionID string `json:"session_id,omitempty"`
	SessionTitle string `json:"session_title,omitempty"`
	ProgramTitle string `json:"program_title,omitempty"`
	Role      string `json:"role,omitempty"`
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
}

// ── Request DTOs ──────────────────────────────────────────────────

type CreateProgramRequest struct {
	Title         string `json:"title"`
	Description   string `json:"description"`
	Color         string `json:"color"`
	DurationWeeks int    `json:"duration_weeks"`
}

type UpdateProgramRequest struct {
	Title         *string `json:"title"`
	Description   *string `json:"description"`
	Color         *string `json:"color"`
	DurationWeeks *int    `json:"duration_weeks"`
	StartDate     *string `json:"start_date"` // YYYY-MM-DD
	EndDate       *string `json:"end_date"`
}

type UpsertPhaseRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	PhaseNumber int    `json:"phase_number"`
	WeekLabel   string `json:"week_label"`
	Color       string `json:"color"`
	StartDay    int    `json:"start_day"`
	EndDay      int    `json:"end_day"`
}

type ReorderPhasesRequest struct {
	PhaseIDs []string `json:"phase_ids"` // ordered list of UUIDs
}

type CreateActivityRequest struct {
	PhaseID      string `json:"phase_id"`
	Title        string `json:"title"`
	Description  string `json:"description"`
	Type         string `json:"type"`
	DeliveryMode string `json:"delivery_mode"`
	DurationMins int    `json:"duration_mins"`
	DueDayOffset int    `json:"due_day_offset"`
	StartDay     int    `json:"start_day"`
	DurationDays int    `json:"duration_days"`
	IsMandatory  bool   `json:"is_mandatory"`
}

type UpdateActivityRequest struct {
	Title        *string `json:"title"`
	Description  *string `json:"description"`
	DeliveryMode *string `json:"delivery_mode"`
	DurationMins *int    `json:"duration_mins"`
	DueDayOffset *int    `json:"due_day_offset"`
	StartDay     *int    `json:"start_day"`
	DurationDays *int    `json:"duration_days"`
	IsMandatory  *bool   `json:"is_mandatory"`
	SortOrder    *int    `json:"sort_order"`
}

// ── Response DTOs ─────────────────────────────────────────────────

type ActivityDTO struct {
	ID           string               `json:"id"`
	PhaseID      string               `json:"phase_id"`
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
	Faculty      []ActivityFacultyDTO `json:"faculty,omitempty"`
}

type PhaseDTO struct {
	ID          string        `json:"id"`
	ProgramID   string        `json:"program_id"`
	Title       string        `json:"title"`
	Description string        `json:"description,omitempty"`
	PhaseNumber int           `json:"phase_number"`
	WeekLabel   string        `json:"week_label,omitempty"`
	Color       string        `json:"color"`
	StartDay    int           `json:"start_day"`
	EndDay      int           `json:"end_day"`
	Activities  []ActivityDTO `json:"activities"`
}

type ProgramDTO struct {
	ID            string     `json:"id"`
	OrgID         string     `json:"org_id"`
	Title         string     `json:"title"`
	Description   string     `json:"description,omitempty"`
	Status        string     `json:"status"`
	Color         string     `json:"color"`
	DurationWeeks int        `json:"duration_weeks"`
	StartDate     *time.Time `json:"start_date,omitempty"`
	EndDate       *time.Time `json:"end_date,omitempty"`
	PublishedAt   *time.Time `json:"published_at,omitempty"`
	PhaseCount    int        `json:"phase_count"`
	ActivityCount int        `json:"activity_count"`
	CreatedAt     time.Time  `json:"created_at"`
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
	ID         string  `json:"id"`
	ProgramID  string  `json:"program_id"`
	UploadedBy string  `json:"uploaded_by"`
	Title      string  `json:"title"`
	Type       string  `json:"type"`
	URL        string  `json:"url"`
	SizeBytes  *int64  `json:"size_bytes,omitempty"`
	CreatedAt  string  `json:"created_at"`
}

type AddProgramMaterialRequest struct {
	Title     string `json:"title"`
	Type      string `json:"type"`
	URL       string `json:"url"`
	SizeBytes *int64 `json:"size_bytes,omitempty"`
}
