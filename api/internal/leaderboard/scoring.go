package leaderboard

import (
	"strings"
	"time"
)

// ── New scoring model (engagement + speed + quality) ────────────────────────
//
// This is a SEPARATE, additive scoring engine from CalculateAward/AwardResult
// in awards.go (the multiplier-of-variable-base model currently live in
// leaderboard_awards). It is not wired into any award/aggregation call site
// yet - this phase is the pure domain model + unit tests only, per the
// approved phased rollout. Nothing in this file is called by production code
// today; wiring it into the real award pipeline (repository reads, DB
// upserts, ranking) is later phases.
//
// Every function here is pure (no DB access, no time.Now()) so it is fully
// unit-testable and so "calculate only from persisted backend data" holds by
// construction: callers must supply already-fetched values, never trust
// anything from the request/browser.

// EngagementLevel is the participant's engagement state for one activity,
// derived from persisted activity_progress (status + percent_complete) by
// the caller - this package does not read the DB itself.
type EngagementLevel string

const (
	EngagementComplete   EngagementLevel = "complete"
	EngagementPartial    EngagementLevel = "partial"
	EngagementNotStarted EngagementLevel = "not_started"
)

// QualityLevel is the evaluator's judgment for one activity's submission.
// There is no existing numeric-grade -> tier mapping anywhere in this
// codebase (see analysis §D/§K) - deliberately NOT auto-derived here from a
// raw grade/score_pct. Callers must supply the level explicitly until that
// banding policy is decided; inventing thresholds silently here would be
// exactly the kind of unapproved assumption the task asked to avoid.
type QualityLevel string

const (
	QualityExcellent    QualityLevel = "excellent"
	QualitySatisfactory QualityLevel = "satisfactory"
	QualityPoor         QualityLevel = "poor"
	QualityNotEvaluated QualityLevel = "not_evaluated"
)

// Point values and per-dimension maximums. Centralized here - the one place
// these numbers may live, per requirement #2 (no duplicating point values
// across handlers/repositories/frontend).
const (
	EngagementCompletePoints   = 2
	EngagementPartialPoints    = 1
	EngagementNotStartedPoints = 0
	EngagementMaxPoints        = 2 // engagement always applies - no disable case in the approved spec

	SpeedEarlyPoints  = 3 // completed more than 48h before the deadline
	SpeedOnTimePoints = 2 // completed 24h through 48h before the deadline (inclusive)
	SpeedLatePoints   = 0 // completed <24h before, at, or after the deadline
	SpeedMaxPoints    = 3

	QualityExcellentPoints    = 3
	QualitySatisfactoryPoints = 2
	QualityPoorPoints         = 1
	QualityNotEvaluatedPoints = 0
	QualityMaxPoints          = 3
)

// ScoreEngagement maps an engagement level to its points. Engagement has no
// "disabled" case in the approved spec (unlike speed/quality) - it always
// contributes EngagementMaxPoints to the maximum.
func ScoreEngagement(level EngagementLevel) (points int, reason string) {
	switch level {
	case EngagementComplete:
		return EngagementCompletePoints, "engagement: complete"
	case EngagementPartial:
		return EngagementPartialPoints, "engagement: partial"
	default: // EngagementNotStarted, "", or any unrecognized value
		return EngagementNotStartedPoints, "engagement: not started"
	}
}

// ScoreSpeed buckets a completion instant against a deadline instant using
// plain elapsed-duration math. Both instants must already be resolved,
// absolute points in time (time.Time is timezone-invariant for Sub/duration
// purposes - converting either side to a particular .Location() would not
// change the result). Where organization timezone actually matters is
// upstream, in resolving WHICH absolute instant "the deadline" is when the
// stored due date is a calendar day with no time-of-day component - see
// ResolveCalendarDeadline below, which callers should use to build
// deadlineAt from a due date + org timezone before calling this function.
//
// contributes is false (speed excluded from the maximum, not scored as an
// artificial zero) when speed scoring is disabled for the activity, or when
// there is no deadline to compare against - both per requirement's explicit
// exclusion rule.
func ScoreSpeed(applicable bool, deadlineAt *time.Time, completedAt time.Time) (points int, contributes bool, reason string) {
	if !applicable {
		return 0, false, "speed: not applicable for this activity"
	}
	if deadlineAt == nil {
		return 0, false, "speed: no deadline set"
	}
	hoursBefore := deadlineAt.Sub(completedAt).Hours()
	switch {
	case hoursBefore > 48:
		return SpeedEarlyPoints, true, "speed: completed more than 48h before deadline"
	case hoursBefore >= 24:
		return SpeedOnTimePoints, true, "speed: completed 24h-48h before deadline"
	default:
		return SpeedLatePoints, true, "speed: completed less than 24h before, at, or after deadline"
	}
}

// ResolveCalendarDeadline converts a due DATE (calendar day, no time
// component - matching activities.start_day/due_day_offset's day-count
// model) into the absolute instant marking the end of that day in the
// organization's timezone. "Due by end of day X" is a different real-world
// instant depending on the org's timezone (e.g. end-of-day in Asia/Kolkata,
// UTC+5:30, is several hours earlier in absolute UTC terms than end-of-day
// in America/Los_Angeles) - this is the one place SPEED scoring's deadline
// comparison actually depends on organization timezone, satisfying
// requirement #4.
func ResolveCalendarDeadline(dueDate time.Time, timezone string) (time.Time, error) {
	loc, err := time.LoadLocation(timezone)
	if err != nil {
		return time.Time{}, err
	}
	y, m, d := dueDate.Date()
	return time.Date(y, m, d, 23, 59, 59, 999999999, loc), nil
}

// ScoreQuality maps a quality level to its points. Distinct from "not
// applicable": NOT_EVALUATED is a real, scoreable level (0 points, still
// counts toward the maximum) for a graded-but-not-yet-scored activity;
// applicable=false is the separate "quality scoring disabled for this
// activity type" case, which excludes quality from the maximum entirely.
func ScoreQuality(applicable bool, level QualityLevel) (points int, contributes bool, reason string) {
	if !applicable {
		return 0, false, "quality: not applicable for this activity"
	}
	switch level {
	case QualityExcellent:
		return QualityExcellentPoints, true, "quality: excellent"
	case QualitySatisfactory:
		return QualitySatisfactoryPoints, true, "quality: satisfactory"
	case QualityPoor:
		return QualityPoorPoints, true, "quality: poor"
	default: // QualityNotEvaluated, "", or any unrecognized value
		return QualityNotEvaluatedPoints, true, "quality: not evaluated"
	}
}

// ActivityScoringInput is everything ComputeActivityScore needs, all
// pre-resolved by the caller from persisted data - never from request input.
type ActivityScoringInput struct {
	Engagement EngagementLevel

	SpeedApplicable bool
	DeadlineAt      *time.Time // nil = no deadline (see ScoreSpeed)
	CompletedAt     time.Time

	QualityApplicable bool
	Quality           QualityLevel
}

// ScoreBreakdown is the persisted/returned audit record for one activity's
// score - exactly the fields requirement #5 lists, no more.
type ScoreBreakdown struct {
	EngagementScore   int
	SpeedScore        int
	QualityScore      int
	EarnedTotal       int
	MaximumTotal      int
	CalculationReason string
	CalculatedAt      time.Time
}

// Percentage is a convenience derived value (earned/max*100 for THIS one
// activity) - not one of the persisted breakdown fields itself, but useful
// for tests and for the learner-level ranking aggregation in a later phase.
// MaximumTotal is never 0 in practice (engagement always contributes at
// least EngagementMaxPoints), but the guard keeps this safe to call anyway.
func (b ScoreBreakdown) Percentage() float64 {
	if b.MaximumTotal == 0 {
		return 0
	}
	return float64(b.EarnedTotal) / float64(b.MaximumTotal) * 100
}

// ComputeActivityScore combines all three dimensions for one activity.
// calculatedAt is supplied by the caller (not time.Now()) so this stays a
// pure, deterministic function for testing; a later phase's service layer
// will pass the real clock time.
func ComputeActivityScore(input ActivityScoringInput, calculatedAt time.Time) ScoreBreakdown {
	engagementPts, engagementReason := ScoreEngagement(input.Engagement)
	speedPts, speedApplies, speedReason := ScoreSpeed(input.SpeedApplicable, input.DeadlineAt, input.CompletedAt)
	qualityPts, qualityApplies, qualityReason := ScoreQuality(input.QualityApplicable, input.Quality)

	maxTotal := EngagementMaxPoints
	if speedApplies {
		maxTotal += SpeedMaxPoints
	}
	if qualityApplies {
		maxTotal += QualityMaxPoints
	}

	// speedPts/qualityPts are always 0 when their dimension doesn't apply
	// (see ScoreSpeed/ScoreQuality above), so summing unconditionally here
	// is safe and cannot double-count an excluded dimension.
	earned := engagementPts + speedPts + qualityPts

	reason := strings.Join([]string{engagementReason, speedReason, qualityReason}, "; ")

	return ScoreBreakdown{
		EngagementScore:   engagementPts,
		SpeedScore:        speedPts,
		QualityScore:      qualityPts,
		EarnedTotal:       earned,
		MaximumTotal:      maxTotal,
		CalculationReason: reason,
		CalculatedAt:      calculatedAt,
	}
}
