package leaderboard

import (
	"testing"
	"time"
)

func rankIDs(t *testing.T, ranked []LearnerScoreSummary) []string {
	t.Helper()
	ids := make([]string, len(ranked))
	for i, r := range ranked {
		ids[i] = r.LearnerID
	}
	return ids
}

func TestRankLearnerScores_PercentageDescending(t *testing.T) {
	in := []LearnerScoreSummary{
		{LearnerID: "low", EarnedTotal: 4, MaximumTotal: 8},  // 50%
		{LearnerID: "high", EarnedTotal: 8, MaximumTotal: 8}, // 100%
		{LearnerID: "mid", EarnedTotal: 6, MaximumTotal: 8},  // 75%
	}
	got := rankIDs(t, RankLearnerScores(in))
	want := []string{"high", "mid", "low"}
	if got[0] != want[0] || got[1] != want[1] || got[2] != want[2] {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestRankLearnerScores_TieBreakOnEarnedScore(t *testing.T) {
	// Same percentage (50%) but different absolute earned/maximum - earned
	// score descending should break the tie.
	in := []LearnerScoreSummary{
		{LearnerID: "small", EarnedTotal: 4, MaximumTotal: 8},  // 50%, earned 4
		{LearnerID: "large", EarnedTotal: 8, MaximumTotal: 16}, // 50%, earned 8
	}
	got := rankIDs(t, RankLearnerScores(in))
	if got[0] != "large" || got[1] != "small" {
		t.Errorf("got %v, want [large small]", got)
	}
}

func TestRankLearnerScores_TieBreakOnQualityScore(t *testing.T) {
	in := []LearnerScoreSummary{
		{LearnerID: "lowq", EarnedTotal: 5, MaximumTotal: 10, QualityScoreTotal: 1},
		{LearnerID: "highq", EarnedTotal: 5, MaximumTotal: 10, QualityScoreTotal: 3},
	}
	got := rankIDs(t, RankLearnerScores(in))
	if got[0] != "highq" || got[1] != "lowq" {
		t.Errorf("got %v, want [highq lowq]", got)
	}
}

func TestRankLearnerScores_TieBreakOnCompletedActivityCount(t *testing.T) {
	in := []LearnerScoreSummary{
		{LearnerID: "fewer", EarnedTotal: 5, MaximumTotal: 10, QualityScoreTotal: 2, CompletedActivityCount: 2},
		{LearnerID: "more", EarnedTotal: 5, MaximumTotal: 10, QualityScoreTotal: 2, CompletedActivityCount: 5},
	}
	got := rankIDs(t, RankLearnerScores(in))
	if got[0] != "more" || got[1] != "fewer" {
		t.Errorf("got %v, want [more fewer]", got)
	}
}

func TestRankLearnerScores_TieBreakOnFinalCompletionAscending(t *testing.T) {
	early := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	late := time.Date(2026, 7, 15, 0, 0, 0, 0, time.UTC)
	in := []LearnerScoreSummary{
		{LearnerID: "finished_late", EarnedTotal: 5, MaximumTotal: 10, QualityScoreTotal: 2, CompletedActivityCount: 3, FinalCompletionAt: late},
		{LearnerID: "finished_early", EarnedTotal: 5, MaximumTotal: 10, QualityScoreTotal: 2, CompletedActivityCount: 3, FinalCompletionAt: early},
	}
	got := rankIDs(t, RankLearnerScores(in))
	if got[0] != "finished_early" || got[1] != "finished_late" {
		t.Errorf("got %v, want [finished_early finished_late] (earlier finisher ranks first)", got)
	}
}

func TestRankLearnerScores_FinalTieBreakOnLearnerIDAscending(t *testing.T) {
	same := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	in := []LearnerScoreSummary{
		{LearnerID: "zzz-learner", EarnedTotal: 5, MaximumTotal: 10, QualityScoreTotal: 2, CompletedActivityCount: 3, FinalCompletionAt: same},
		{LearnerID: "aaa-learner", EarnedTotal: 5, MaximumTotal: 10, QualityScoreTotal: 2, CompletedActivityCount: 3, FinalCompletionAt: same},
	}
	got := rankIDs(t, RankLearnerScores(in))
	if got[0] != "aaa-learner" || got[1] != "zzz-learner" {
		t.Errorf("got %v, want [aaa-learner zzz-learner] (fully deterministic, no ties left)", got)
	}
}

func TestRankLearnerScores_DeterministicAcrossRepeatedCalls(t *testing.T) {
	same := time.Date(2026, 7, 1, 0, 0, 0, 0, time.UTC)
	in := []LearnerScoreSummary{
		{LearnerID: "b", EarnedTotal: 5, MaximumTotal: 10, FinalCompletionAt: same},
		{LearnerID: "a", EarnedTotal: 5, MaximumTotal: 10, FinalCompletionAt: same},
		{LearnerID: "c", EarnedTotal: 5, MaximumTotal: 10, FinalCompletionAt: same},
	}
	first := rankIDs(t, RankLearnerScores(in))
	second := rankIDs(t, RankLearnerScores(in))
	for i := range first {
		if first[i] != second[i] {
			t.Fatalf("ranking not deterministic across repeated calls: %v vs %v", first, second)
		}
	}
}

func TestRankLearnerScores_DoesNotMutateInput(t *testing.T) {
	in := []LearnerScoreSummary{
		{LearnerID: "b", EarnedTotal: 1, MaximumTotal: 10},
		{LearnerID: "a", EarnedTotal: 9, MaximumTotal: 10},
	}
	original := append([]LearnerScoreSummary(nil), in...)
	_ = RankLearnerScores(in)
	for i := range in {
		if in[i].LearnerID != original[i].LearnerID {
			t.Errorf("input slice was mutated: got %v, want %v", in, original)
		}
	}
}

func TestRankOrganizationLearners_RequiresOrgID(t *testing.T) {
	if _, err := RankOrganizationLearners("", nil, nil); err == nil {
		t.Error("expected an error when organization_id is empty (requirement #10 boundary)")
	}
}
