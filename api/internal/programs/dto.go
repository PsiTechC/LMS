package programs

import "time"

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
	IsMandatory  bool   `json:"is_mandatory"`
}

type UpdateActivityRequest struct {
	Title        *string `json:"title"`
	Description  *string `json:"description"`
	DeliveryMode *string `json:"delivery_mode"`
	DurationMins *int    `json:"duration_mins"`
	DueDayOffset *int    `json:"due_day_offset"`
	IsMandatory  *bool   `json:"is_mandatory"`
	SortOrder    *int    `json:"sort_order"`
}

// ── Response DTOs ─────────────────────────────────────────────────

type ActivityDTO struct {
	ID           string  `json:"id"`
	PhaseID      string  `json:"phase_id"`
	Title        string  `json:"title"`
	Description  string  `json:"description,omitempty"`
	Type         string  `json:"type"`
	DeliveryMode string  `json:"delivery_mode"`
	SortOrder    int     `json:"sort_order"`
	DurationMins int     `json:"duration_mins"`
	DueDayOffset int     `json:"due_day_offset"`
	IsMandatory  bool    `json:"is_mandatory"`
}

type PhaseDTO struct {
	ID          string        `json:"id"`
	ProgramID   string        `json:"program_id"`
	Title       string        `json:"title"`
	Description string        `json:"description,omitempty"`
	PhaseNumber int           `json:"phase_number"`
	WeekLabel   string        `json:"week_label,omitempty"`
	Color       string        `json:"color"`
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
