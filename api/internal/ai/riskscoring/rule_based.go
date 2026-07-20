package riskscoring

import (
	"context"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/ai/scope"
)

// RuleBasedScorer computes risk from weighted, hand-tuned rules over
// enrollment/activity signals. No labeled training data exists yet - this
// is the starting implementation of Scorer; a trained-model implementation
// can swap in later behind the same interface.
type RuleBasedScorer struct{}

func NewRuleBasedScorer() *RuleBasedScorer { return &RuleBasedScorer{} }

func (RuleBasedScorer) Score(_ context.Context, s scope.Scope, subjectID uuid.UUID) (Score, error) {
	f, ok := loadFeatures(subjectID)
	if !ok {
		return Score{}, fmt.Errorf("no active enrollment found for subject %s", subjectID)
	}

	var points float64
	var reasons []string

	// Inactivity is the strongest signal.
	switch {
	case f.DaysSinceActivity >= 21:
		points += 40
		reasons = append(reasons, "no activity in 21+ days")
	case f.DaysSinceActivity >= 10:
		points += 22
		reasons = append(reasons, "no activity in 10+ days")
	case f.DaysSinceActivity >= 5:
		points += 10
		reasons = append(reasons, "no activity in 5+ days")
	}

	// Low completion relative to time elapsed.
	if f.CompletionPercent < 25 {
		points += 25
		reasons = append(reasons, "completion under 25%")
	} else if f.CompletionPercent < 50 {
		points += 12
		reasons = append(reasons, "completion under 50%")
	}

	if f.OverdueActivities >= 5 {
		points += 20
		reasons = append(reasons, fmt.Sprintf("%d overdue activities", f.OverdueActivities))
	} else if f.OverdueActivities >= 2 {
		points += 10
		reasons = append(reasons, fmt.Sprintf("%d overdue activities", f.OverdueActivities))
	}

	if f.MissedSessions >= 2 {
		points += 15
		reasons = append(reasons, fmt.Sprintf("%d missed sessions", f.MissedSessions))
	}

	if points > 100 {
		points = 100
	}

	_ = s // scope reserved for org-level rule overrides later
	return Score{
		OrgID:     f.OrgID,
		ProgramID: f.ProgramID,
		SubjectID: subjectID,
		Score:     points,
		Level:     levelFor(points),
		Reasons:   strings.Join(reasons, "; "),
	}, nil
}
