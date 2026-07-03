package leaderboard

// ── Request DTOs ──────────────────────────────────────────────────

type SetVisibilityRequest struct {
	ShowOnLeaderboard bool `json:"show_on_leaderboard"`
}

// ── Response DTOs ─────────────────────────────────────────────────

type PointsBreakdownDTO struct {
	ModuleCompletions int `json:"module_completions"`
	Assessments       int `json:"assessments"`
	Discussions       int `json:"discussions"`
	Reflections       int `json:"reflections"`
	CoachingAttendance int `json:"coaching_attendance"`
	Total             int `json:"total"`
}

type LeaderRowDTO struct {
	Rank   int    `json:"rank"`
	UserID string `json:"user_id"`
	Name   string `json:"name"`
	Points int    `json:"points"`
	Streak int    `json:"streak"`
	IsYou  bool   `json:"is_you"`
}

type BadgeDTO struct {
	Key         string `json:"key"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Earned      bool   `json:"earned"`
}

// MyLeaderboardDTO is the participant's full Leaderboard tab.
type MyLeaderboardDTO struct {
	HasCohort         bool               `json:"has_cohort"`
	CohortName        string             `json:"cohort_name,omitempty"`
	ShowOnLeaderboard bool               `json:"show_on_leaderboard"`
	MyRank            *int               `json:"my_rank,omitempty"`
	MyPoints          int                `json:"my_points"`
	Breakdown         PointsBreakdownDTO `json:"breakdown"`
	Leaders           []LeaderRowDTO     `json:"leaders"`
	Badges            []BadgeDTO         `json:"badges"`
}
