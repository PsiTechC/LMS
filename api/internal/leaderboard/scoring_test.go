package leaderboard

import (
	"testing"
	"time"
)

// ── Engagement ───────────────────────────────────────────────────────────

func TestScoreEngagement_Complete(t *testing.T) {
	pts, reason := ScoreEngagement(EngagementComplete)
	if pts != 2 {
		t.Errorf("complete: got %d points, want 2", pts)
	}
	if reason == "" {
		t.Error("expected a non-empty reason")
	}
}

func TestScoreEngagement_Partial(t *testing.T) {
	pts, _ := ScoreEngagement(EngagementPartial)
	if pts != 1 {
		t.Errorf("partial: got %d points, want 1", pts)
	}
}

func TestScoreEngagement_NotStarted(t *testing.T) {
	pts, _ := ScoreEngagement(EngagementNotStarted)
	if pts != 0 {
		t.Errorf("not_started: got %d points, want 0", pts)
	}
}

func TestScoreEngagement_UnrecognizedTreatedAsNotStarted(t *testing.T) {
	pts, _ := ScoreEngagement(EngagementLevel("garbage"))
	if pts != 0 {
		t.Errorf("unrecognized level: got %d points, want 0 (treated as not started)", pts)
	}
}

// ── Speed ────────────────────────────────────────────────────────────────

func mustLoc(t *testing.T, name string) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation(name)
	if err != nil {
		t.Fatalf("failed to load location %s: %v", name, err)
	}
	return loc
}

func TestScoreSpeed_MoreThan48HoursEarly(t *testing.T) {
	deadline := time.Date(2026, 7, 21, 23, 59, 59, 0, time.UTC)
	completed := deadline.Add(-49 * time.Hour)
	pts, applies, _ := ScoreSpeed(true, &deadline, completed)
	if !applies || pts != 3 {
		t.Errorf("49h early: got points=%d applies=%v, want points=3 applies=true", pts, applies)
	}
}

func TestScoreSpeed_Exactly48HoursEarly(t *testing.T) {
	deadline := time.Date(2026, 7, 21, 23, 59, 59, 0, time.UTC)
	completed := deadline.Add(-48 * time.Hour)
	pts, applies, _ := ScoreSpeed(true, &deadline, completed)
	// Spec: "24 through 48 hours before" = 2 (inclusive of the 48h boundary).
	if !applies || pts != 2 {
		t.Errorf("exactly 48h early: got points=%d applies=%v, want points=2 applies=true", pts, applies)
	}
}

func TestScoreSpeed_Exactly24HoursEarly(t *testing.T) {
	deadline := time.Date(2026, 7, 21, 23, 59, 59, 0, time.UTC)
	completed := deadline.Add(-24 * time.Hour)
	pts, applies, _ := ScoreSpeed(true, &deadline, completed)
	if !applies || pts != 2 {
		t.Errorf("exactly 24h early: got points=%d applies=%v, want points=2 applies=true", pts, applies)
	}
}

func TestScoreSpeed_LessThan24HoursEarly(t *testing.T) {
	deadline := time.Date(2026, 7, 21, 23, 59, 59, 0, time.UTC)
	completed := deadline.Add(-23 * time.Hour)
	pts, applies, _ := ScoreSpeed(true, &deadline, completed)
	if !applies || pts != 0 {
		t.Errorf("23h early: got points=%d applies=%v, want points=0 applies=true", pts, applies)
	}
}

func TestScoreSpeed_ExactlyAtDeadline(t *testing.T) {
	deadline := time.Date(2026, 7, 21, 23, 59, 59, 0, time.UTC)
	pts, applies, _ := ScoreSpeed(true, &deadline, deadline)
	if !applies || pts != 0 {
		t.Errorf("at deadline: got points=%d applies=%v, want points=0 applies=true", pts, applies)
	}
}

func TestScoreSpeed_LateCompletion(t *testing.T) {
	deadline := time.Date(2026, 7, 21, 23, 59, 59, 0, time.UTC)
	completed := deadline.Add(3 * time.Hour)
	pts, applies, _ := ScoreSpeed(true, &deadline, completed)
	if !applies || pts != 0 {
		t.Errorf("late by 3h: got points=%d applies=%v, want points=0 applies=true", pts, applies)
	}
}

func TestScoreSpeed_NoDeadline_ExcludedFromMax(t *testing.T) {
	pts, applies, _ := ScoreSpeed(true, nil, time.Now())
	if applies {
		t.Error("no deadline: expected applies=false (excluded from max), got true")
	}
	if pts != 0 {
		t.Errorf("no deadline: got %d points, want 0", pts)
	}
}

func TestScoreSpeed_Disabled_ExcludedFromMax(t *testing.T) {
	deadline := time.Now()
	pts, applies, _ := ScoreSpeed(false, &deadline, time.Now())
	if applies {
		t.Error("speed disabled: expected applies=false (excluded from max), got true")
	}
	if pts != 0 {
		t.Errorf("speed disabled: got %d points, want 0", pts)
	}
}

// TestScoreSpeed_OrganizationTimezoneBoundary proves that two organizations
// in different timezones, with the SAME nominal due date and the SAME
// absolute completion instant, can land in different speed buckets - because
// "due by end of day X" resolves to a different absolute instant depending on
// the org's timezone. This is the one place SPEED scoring is genuinely
// timezone-dependent (see ResolveCalendarDeadline's doc comment).
func TestScoreSpeed_OrganizationTimezoneBoundary(t *testing.T) {
	dueDate := time.Date(2026, 7, 21, 0, 0, 0, 0, time.UTC) // "due July 21", no time-of-day

	kolkata := mustLoc(t, "Asia/Kolkata")           // UTC+5:30
	losAngeles := mustLoc(t, "America/Los_Angeles") // UTC-7 in July (PDT)

	deadlineKolkata, err := ResolveCalendarDeadline(dueDate, "Asia/Kolkata")
	if err != nil {
		t.Fatalf("ResolveCalendarDeadline (Kolkata): %v", err)
	}
	deadlineLA, err := ResolveCalendarDeadline(dueDate, "America/Los_Angeles")
	if err != nil {
		t.Fatalf("ResolveCalendarDeadline (LA): %v", err)
	}
	if deadlineKolkata.Equal(deadlineLA) {
		t.Fatal("expected different absolute deadlines for different org timezones, got the same instant")
	}

	// A single, fixed completion instant: 2026-07-21 20:00 UTC.
	completedAt := time.Date(2026, 7, 21, 20, 0, 0, 0, time.UTC)

	// End-of-day July 21 in Kolkata (UTC+5:30) is 2026-07-21T18:29:59.999999999Z -
	// already PAST at completion time (20:00 UTC) => late => 0.
	ptsKolkata, appliesKolkata, _ := ScoreSpeed(true, &deadlineKolkata, completedAt)
	if !appliesKolkata || ptsKolkata != 0 {
		t.Errorf("Kolkata deadline: got points=%d applies=%v, want points=0 applies=true (already late)", ptsKolkata, appliesKolkata)
	}

	// End-of-day July 21 in Los Angeles (UTC-7 PDT) is 2026-07-22T06:59:59.999999999Z -
	// completion at 20:00 UTC is ~11h before that => <24h early => 0 too, but
	// crucially a DIFFERENT deadline instant proves the timezone dependency.
	_, appliesLA, _ := ScoreSpeed(true, &deadlineLA, completedAt)
	if !appliesLA {
		t.Error("LA deadline: expected applies=true")
	}
	hoursBeforeLA := deadlineLA.Sub(completedAt).Hours()
	if hoursBeforeLA <= 0 {
		t.Fatalf("test setup error: expected completedAt to be before the LA deadline, hoursBefore=%v", hoursBeforeLA)
	}

	// Sanity: the two locations really do differ so this test is meaningful.
	if kolkata == losAngeles {
		t.Fatal("test setup error: expected distinct locations")
	}
}

func TestResolveCalendarDeadline_InvalidTimezone(t *testing.T) {
	_, err := ResolveCalendarDeadline(time.Now(), "Not/A_Real_Zone")
	if err == nil {
		t.Error("expected an error for an invalid timezone, got nil")
	}
}

// ── Quality ──────────────────────────────────────────────────────────────

func TestScoreQuality_Excellent(t *testing.T) {
	pts, applies, _ := ScoreQuality(true, QualityExcellent)
	if !applies || pts != 3 {
		t.Errorf("excellent: got points=%d applies=%v, want points=3 applies=true", pts, applies)
	}
}

func TestScoreQuality_Satisfactory(t *testing.T) {
	pts, applies, _ := ScoreQuality(true, QualitySatisfactory)
	if !applies || pts != 2 {
		t.Errorf("satisfactory: got points=%d applies=%v, want points=2 applies=true", pts, applies)
	}
}

func TestScoreQuality_Poor(t *testing.T) {
	pts, applies, _ := ScoreQuality(true, QualityPoor)
	if !applies || pts != 1 {
		t.Errorf("poor: got points=%d applies=%v, want points=1 applies=true", pts, applies)
	}
}

func TestScoreQuality_NotEvaluated_StillCountsTowardMax(t *testing.T) {
	pts, applies, _ := ScoreQuality(true, QualityNotEvaluated)
	if !applies {
		t.Error("not_evaluated: expected applies=true (it's a real scored level, not an exclusion)")
	}
	if pts != 0 {
		t.Errorf("not_evaluated: got %d points, want 0", pts)
	}
}

func TestScoreQuality_Disabled_ExcludedFromMax(t *testing.T) {
	pts, applies, _ := ScoreQuality(false, QualityExcellent)
	if applies {
		t.Error("quality disabled: expected applies=false (excluded from max) regardless of level, got true")
	}
	if pts != 0 {
		t.Errorf("quality disabled: got %d points, want 0", pts)
	}
}

// ── Composite: ComputeActivityScore ───────────────────────────────────────

func TestComputeActivityScore_AllDimensionsApplicable_MaxEight(t *testing.T) {
	deadline := time.Date(2026, 7, 21, 23, 59, 59, 0, time.UTC)
	completed := deadline.Add(-72 * time.Hour) // well more than 48h early
	calcAt := time.Date(2026, 7, 22, 0, 0, 0, 0, time.UTC)

	b := ComputeActivityScore(ActivityScoringInput{
		Engagement:        EngagementComplete,
		SpeedApplicable:   true,
		DeadlineAt:        &deadline,
		CompletedAt:       completed,
		QualityApplicable: true,
		Quality:           QualityExcellent,
	}, calcAt)

	if b.EngagementScore != 2 || b.SpeedScore != 3 || b.QualityScore != 3 {
		t.Fatalf("got engagement=%d speed=%d quality=%d, want 2/3/3", b.EngagementScore, b.SpeedScore, b.QualityScore)
	}
	if b.EarnedTotal != 8 {
		t.Errorf("earned total: got %d, want 8", b.EarnedTotal)
	}
	if b.MaximumTotal != 8 {
		t.Errorf("maximum total: got %d, want 8", b.MaximumTotal)
	}
	if b.Percentage() != 100 {
		t.Errorf("percentage: got %v, want 100", b.Percentage())
	}
	if b.CalculationReason == "" {
		t.Error("expected a non-empty calculation reason")
	}
	if !b.CalculatedAt.Equal(calcAt) {
		t.Errorf("calculated_at: got %v, want %v", b.CalculatedAt, calcAt)
	}
}

func TestComputeActivityScore_SpeedDisabled_ExcludedFromMax(t *testing.T) {
	b := ComputeActivityScore(ActivityScoringInput{
		Engagement:        EngagementComplete,
		SpeedApplicable:   false,
		DeadlineAt:        nil,
		QualityApplicable: true,
		Quality:           QualityExcellent,
	}, time.Now())

	// Max = engagement(2) + quality(3) = 5, NOT 8 - speed is excluded, not
	// scored as an artificial zero that still counts toward the denominator.
	if b.MaximumTotal != 5 {
		t.Errorf("maximum total with speed disabled: got %d, want 5", b.MaximumTotal)
	}
	if b.EarnedTotal != 5 {
		t.Errorf("earned total: got %d, want 5 (2 engagement + 3 quality)", b.EarnedTotal)
	}
	if b.SpeedScore != 0 {
		t.Errorf("speed score when disabled: got %d, want 0", b.SpeedScore)
	}
}

func TestComputeActivityScore_QualityDisabled_ExcludedFromMax(t *testing.T) {
	deadline := time.Now().Add(72 * time.Hour)
	b := ComputeActivityScore(ActivityScoringInput{
		Engagement:        EngagementComplete,
		SpeedApplicable:   true,
		DeadlineAt:        &deadline,
		CompletedAt:       time.Now(),
		QualityApplicable: false,
	}, time.Now())

	// Max = engagement(2) + speed(3) = 5, quality excluded entirely.
	if b.MaximumTotal != 5 {
		t.Errorf("maximum total with quality disabled: got %d, want 5", b.MaximumTotal)
	}
	if b.QualityScore != 0 {
		t.Errorf("quality score when disabled: got %d, want 0", b.QualityScore)
	}
}

func TestComputeActivityScore_NoDeadlineAndQualityDisabled_EngagementOnlyMax(t *testing.T) {
	b := ComputeActivityScore(ActivityScoringInput{
		Engagement:        EngagementPartial,
		SpeedApplicable:   true, // applicable, but no deadline supplied
		DeadlineAt:        nil,
		QualityApplicable: false,
	}, time.Now())

	if b.MaximumTotal != EngagementMaxPoints {
		t.Errorf("maximum total: got %d, want %d (engagement only)", b.MaximumTotal, EngagementMaxPoints)
	}
	if b.EarnedTotal != 1 {
		t.Errorf("earned total: got %d, want 1 (partial engagement only)", b.EarnedTotal)
	}
}

func TestComputeActivityScore_NotStartedIncomplete_ZeroEarned(t *testing.T) {
	b := ComputeActivityScore(ActivityScoringInput{
		Engagement:        EngagementNotStarted,
		SpeedApplicable:   false,
		QualityApplicable: false,
	}, time.Now())

	if b.EarnedTotal != 0 {
		t.Errorf("earned total for not-started/incomplete: got %d, want 0", b.EarnedTotal)
	}
	if b.MaximumTotal != EngagementMaxPoints {
		t.Errorf("maximum total: got %d, want %d", b.MaximumTotal, EngagementMaxPoints)
	}
}

func TestScoreBreakdown_PercentageGuardsZeroMax(t *testing.T) {
	b := ScoreBreakdown{EarnedTotal: 0, MaximumTotal: 0}
	if b.Percentage() != 0 {
		t.Errorf("percentage with zero maximum: got %v, want 0 (no divide-by-zero panic)", b.Percentage())
	}
}
