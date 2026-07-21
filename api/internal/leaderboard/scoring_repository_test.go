package leaderboard

import (
	"testing"
	"time"
)

// ── DeriveEngagementLevel (pure, no DB) ────────────────────────────────────

func TestDeriveEngagementLevel_Completed(t *testing.T) {
	if got := DeriveEngagementLevel("completed", 100); got != EngagementComplete {
		t.Errorf("got %v, want %v", got, EngagementComplete)
	}
}

func TestDeriveEngagementLevel_InProgressPartial(t *testing.T) {
	if got := DeriveEngagementLevel("in_progress", 45); got != EngagementPartial {
		t.Errorf("got %v, want %v", got, EngagementPartial)
	}
}

func TestDeriveEngagementLevel_InProgressZeroPercentIsNotStarted(t *testing.T) {
	if got := DeriveEngagementLevel("in_progress", 0); got != EngagementNotStarted {
		t.Errorf("got %v, want %v", got, EngagementNotStarted)
	}
}

func TestDeriveEngagementLevel_NotStarted(t *testing.T) {
	if got := DeriveEngagementLevel("not_started", 0); got != EngagementNotStarted {
		t.Errorf("got %v, want %v", got, EngagementNotStarted)
	}
}

func TestDeriveEngagementLevel_SkippedTreatedAsNotStarted(t *testing.T) {
	if got := DeriveEngagementLevel("skipped", 0); got != EngagementNotStarted {
		t.Errorf("got %v, want %v", got, EngagementNotStarted)
	}
}

// ── resolveDeadline (pure, no DB) ───────────────────────────────────────────

func TestResolveDeadline_NoCohortStartDate_ReturnsNil(t *testing.T) {
	row := &activityScoringContextRow{
		CohortStartDate:      nil,
		ActivityStartDay:     1,
		ActivityDueDayOffset: 7,
		Timezone:             "UTC",
	}
	deadline, err := resolveDeadline(row)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if deadline != nil {
		t.Errorf("expected nil deadline when cohort has no start date, got %v", deadline)
	}
}

func TestResolveDeadline_MatchesExistingAwardArithmetic(t *testing.T) {
	// Mirrors AwardActivity's due_at derivation in awards.go: cohort start +
	// (start_day + due_day_offset) days, end of that calendar day.
	cohortStart := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	row := &activityScoringContextRow{
		CohortStartDate:      &cohortStart,
		ActivityStartDay:     1,
		ActivityDueDayOffset: 7,
		Timezone:             "UTC",
	}
	deadline, err := resolveDeadline(row)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if deadline == nil {
		t.Fatal("expected a non-nil deadline")
	}
	wantDate := time.Date(2026, 7, 9, 23, 59, 59, 999999999, time.UTC)
	if !deadline.Equal(wantDate) {
		t.Errorf("got %v, want %v", deadline, wantDate)
	}
}

func TestResolveDeadline_DifferentOrgTimezonesProduceDifferentInstants(t *testing.T) {
	cohortStart := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	base := activityScoringContextRow{
		CohortStartDate:      &cohortStart,
		ActivityStartDay:     1,
		ActivityDueDayOffset: 7,
	}

	utcRow := base
	utcRow.Timezone = "UTC"
	kolkataRow := base
	kolkataRow.Timezone = "Asia/Kolkata"

	utcDeadline, err := resolveDeadline(&utcRow)
	if err != nil {
		t.Fatalf("unexpected error (UTC): %v", err)
	}
	kolkataDeadline, err := resolveDeadline(&kolkataRow)
	if err != nil {
		t.Fatalf("unexpected error (Kolkata): %v", err)
	}
	if utcDeadline.Equal(*kolkataDeadline) {
		t.Error("expected different absolute deadline instants for different org timezones on the same nominal due date")
	}
}

func TestResolveDeadline_InvalidTimezone(t *testing.T) {
	cohortStart := time.Now()
	row := &activityScoringContextRow{
		CohortStartDate: &cohortStart,
		Timezone:        "Not/A_Real_Zone",
	}
	if _, err := resolveDeadline(row); err == nil {
		t.Error("expected an error for an invalid timezone")
	}
}

// ── loadPersistedQuality (pure, no DB) ──────────────────────────────────────

func TestLoadPersistedQuality_GradeableTypesApplicableButNotEvaluated(t *testing.T) {
	for _, activityType := range []string{"assessment", "journal", "assignment", "peer_review"} {
		applicable, level := loadPersistedQuality(activityType)
		if !applicable {
			t.Errorf("%s: expected quality applicable=true", activityType)
		}
		if level != QualityNotEvaluated {
			t.Errorf("%s: expected QualityNotEvaluated (no banding policy approved yet), got %v", activityType, level)
		}
	}
}

func TestLoadPersistedQuality_ContentTypesNotApplicable(t *testing.T) {
	for _, activityType := range []string{"video", "pdf", "case_study", "content"} {
		applicable, _ := loadPersistedQuality(activityType)
		if applicable {
			t.Errorf("%s: expected quality applicable=false (no grade concept)", activityType)
		}
	}
}
