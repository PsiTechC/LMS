package leaderboard

import (
	"errors"
	"sort"
	"time"

	"github.com/xa-lms/api/pkg/database"
)

// ── Deterministic ranking for the new scoring model ─────────────────────────
//
// GET /leaderboard/my and GET /leaderboard/admin (handler.go) are now cut
// over to this model - service.go's getMyLeaderboardService/
// listAdminLeaderboardService call RankOrganizationLearners/RankLearnerScores
// below instead of the old per-category AwardedBreakdown (awards.go), which
// is left in place (still fed by AwardActivity/AwardSubmission/etc., every
// one of those untouched) but no longer read by anything - an intentional,
// approved cutover, not dead code from an abandoned attempt.

// LearnerScoreSummary is one learner's aggregated standing across every
// activity_scores row in scope (one organization, optionally one
// program/cohort - requirement #10's boundary).
type LearnerScoreSummary struct {
	LearnerID              string
	EngagementScoreTotal   int
	SpeedScoreTotal        int
	QualityScoreTotal      int
	EarnedTotal            int
	MaximumTotal           int
	CompletedActivityCount int
	FinalCompletionAt      time.Time
}

// Percentage guards MaximumTotal == 0 (a learner with zero scored activities
// in scope) rather than dividing by zero.
func (s LearnerScoreSummary) Percentage() float64 {
	if s.MaximumTotal == 0 {
		return 0
	}
	return float64(s.EarnedTotal) / float64(s.MaximumTotal) * 100
}

// lessLearnerScoreSummary is the approved deterministic tie-break order
// (requirement #9), centralized here so every ranked view - the per-cohort
// participant view and the superadmin cross-org/cross-program view, which
// can legitimately list the SAME learner more than once (once per program
// enrollment) and so can't use RankLearnerScores' map-by-LearnerID-friendly
// shape - shares the exact same rule instead of re-implementing it:
//  1. percentage descending
//  2. earned score descending
//  3. quality score descending
//  4. completed activity count descending
//  5. final completion timestamp ascending (earlier finisher ranks higher)
//  6. learner ID ascending (last-resort, fully deterministic)
func lessLearnerScoreSummary(a, b LearnerScoreSummary) bool {
	if pa, pb := a.Percentage(), b.Percentage(); pa != pb {
		return pa > pb
	}
	if a.EarnedTotal != b.EarnedTotal {
		return a.EarnedTotal > b.EarnedTotal
	}
	if a.QualityScoreTotal != b.QualityScoreTotal {
		return a.QualityScoreTotal > b.QualityScoreTotal
	}
	if a.CompletedActivityCount != b.CompletedActivityCount {
		return a.CompletedActivityCount > b.CompletedActivityCount
	}
	if !a.FinalCompletionAt.Equal(b.FinalCompletionAt) {
		return a.FinalCompletionAt.Before(b.FinalCompletionAt)
	}
	return a.LearnerID < b.LearnerID
}

// RankLearnerScores sorts already-fetched summaries (one per distinct
// learner) per lessLearnerScoreSummary above. Pure - takes no DB dependency,
// so this is the one place ranking behavior is unit-testable without a live
// database. Does not mutate the input slice.
func RankLearnerScores(summaries []LearnerScoreSummary) []LearnerScoreSummary {
	ranked := make([]LearnerScoreSummary, len(summaries))
	copy(ranked, summaries)
	sort.SliceStable(ranked, func(i, j int) bool {
		return lessLearnerScoreSummary(ranked[i], ranked[j])
	})
	return ranked
}

type learnerAggregateRow struct {
	LearnerID              string
	EngagementScoreTotal   int
	SpeedScoreTotal        int
	QualityScoreTotal      int
	EarnedTotal            int
	MaximumTotal           int
	CompletedActivityCount int
	FinalCompletionAt      time.Time
}

// RankOrganizationLearners aggregates activity_scores per participant,
// scoped to exactly one organization and optionally one program/cohort -
// this NEVER aggregates across organizations (requirement #10), matching
// AwardedBreakdown's existing per-org/per-program scoping convention in
// awards.go. "Completed" for the count is earned_total > 0 on a row (some
// engagement/speed/quality credit was actually earned), not merely having a
// row at all. Requires the activity_scores table to exist - see Phase 2/3's
// notes on that being proposed but not yet applied.
func RankOrganizationLearners(orgID string, programID, cohortID *string) ([]LearnerScoreSummary, error) {
	if orgID == "" {
		return nil, errors.New("organization_id is required")
	}
	q := `
		SELECT participant_id::text AS learner_id,
		       COALESCE(SUM(engagement_score),0) AS engagement_score_total,
		       COALESCE(SUM(speed_score),0)      AS speed_score_total,
		       COALESCE(SUM(quality_score),0)    AS quality_score_total,
		       COALESCE(SUM(earned_total),0)     AS earned_total,
		       COALESCE(SUM(maximum_total),0)    AS maximum_total,
		       COUNT(*) FILTER (WHERE earned_total > 0) AS completed_activity_count,
		       MAX(calculated_at) AS final_completion_at
		FROM activity_scores
		WHERE organization_id = ?::uuid`
	args := []any{orgID}
	if programID != nil && *programID != "" {
		q += ` AND program_id = ?::uuid`
		args = append(args, *programID)
	}
	if cohortID != nil && *cohortID != "" {
		q += ` AND cohort_id = ?::uuid`
		args = append(args, *cohortID)
	}
	q += ` GROUP BY participant_id`

	var rows []learnerAggregateRow
	if err := database.DB.Raw(q, args...).Scan(&rows).Error; err != nil {
		return nil, err
	}
	summaries := make([]LearnerScoreSummary, 0, len(rows))
	for _, r := range rows {
		summaries = append(summaries, LearnerScoreSummary{
			LearnerID:              r.LearnerID,
			EngagementScoreTotal:   r.EngagementScoreTotal,
			SpeedScoreTotal:        r.SpeedScoreTotal,
			QualityScoreTotal:      r.QualityScoreTotal,
			EarnedTotal:            r.EarnedTotal,
			MaximumTotal:           r.MaximumTotal,
			CompletedActivityCount: r.CompletedActivityCount,
			FinalCompletionAt:      r.FinalCompletionAt,
		})
	}
	return RankLearnerScores(summaries), nil
}
