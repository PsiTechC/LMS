package leaderboard

// ── Request DTOs ──────────────────────────────────────────────────

type SetVisibilityRequest struct {
	ShowOnLeaderboard bool `json:"show_on_leaderboard"`
}

// ── Response DTOs ─────────────────────────────────────────────────

// PointsBreakdownDTO is the participant's score breakdown for the scoped
// program, summed across every scored activity's engagement/speed/quality
// dimensions (see leaderboard.ScoreBreakdown / activity_scores) - cut over
// from the old per-category (module/assessment/discussion/...) breakdown to
// the approved engagement+speed+quality model. Total is EarnedTotal, kept
// under this field name since it's the one existing consumers already read.
type PointsBreakdownDTO struct {
	EngagementScore int     `json:"engagement_score"`
	SpeedScore      int     `json:"speed_score"`
	QualityScore    int     `json:"quality_score"`
	EarnedTotal     int     `json:"earned_total"`
	MaximumTotal    int     `json:"maximum_total"`
	Percentage      float64 `json:"percentage"`
	Total           int     `json:"total"`
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

// ── Admin (cross-org) DTOs ────────────────────────────────────────

// AdminLeaderRowDTO is one ranked participant in the superadmin leaderboard.
type AdminLeaderRowDTO struct {
	Rank        int    `json:"rank"`
	UserID      string `json:"user_id"`
	Participant string `json:"participant"`
	Org         string `json:"org"`
	OrgID       string `json:"org_id"`
	Program     string `json:"program"`
	Points      int    `json:"points"`
	Streak      int    `json:"streak"`
	Progress    int    `json:"progress"` // program completion %
	// Change is the rank movement vs the previous period. There is no historical
	// leaderboard snapshot stored, so it is always null (shown as "-").
	Change *int `json:"change"`
}

// AdminOrgRowDTO is one organization aggregated for the "By Organization" view.
type AdminOrgRowDTO struct {
	Rank         int    `json:"rank"`
	Org          string `json:"org"`
	OrgID        string `json:"org_id"`
	Participants int    `json:"participants"`
	TotalPoints  int    `json:"total_points"`
	AvgPoints    int    `json:"avg_points"`
	AvgProgress  int    `json:"avg_progress"`
}

// AdminLeaderboardDTO carries both groupings so the UI can toggle without a
// refetch: a flat participant ranking and an org-aggregated ranking.
type AdminLeaderboardDTO struct {
	Participants  []AdminLeaderRowDTO `json:"participants"`
	Organizations []AdminOrgRowDTO    `json:"organizations"`
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
