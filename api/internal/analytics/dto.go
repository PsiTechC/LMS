package analytics

import "time"

// ── Engagement ────────────────────────────────────────────────────

// EngagementPoint is returned from the live SQL query.
type EngagementPoint struct {
	WeekNumber    int    `json:"week_number"    db:"week_number"`
	WeekLabel     string `json:"week_label"     db:"week_label"`
	EngagementPct int    `json:"engagement_pct" db:"engagement_pct"`
}

// ── Competency scores ─────────────────────────────────────────────

type UpsertCompetencyScoreRequest struct {
	CohortID      string  `json:"cohort_id"       validate:"required"`
	CompetencyID  string  `json:"competency_id"   validate:"required"`
	PreProgramPct float64 `json:"pre_program_pct"`
	CurrentPct    float64 `json:"current_pct"`
}

type CompetencyScoreResponse struct {
	ID            string    `json:"id"`
	CohortID      string    `json:"cohort_id"`
	CompetencyID  string    `json:"competency_id"`
	Title         string    `json:"title"`
	Category      string    `json:"category"`
	PreProgramPct float64   `json:"pre_program_pct"`
	CurrentPct    float64   `json:"current_pct"`
	UpdatedAt     time.Time `json:"updated_at"`
}
