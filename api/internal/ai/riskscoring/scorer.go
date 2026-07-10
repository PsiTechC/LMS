package riskscoring

import (
	"context"

	"github.com/xa-lms/api/internal/ai/scope"
	"github.com/google/uuid"
)

// Scorer computes a risk score for one subject. RuleBasedScorer is the only
// implementation today (no labeled data yet); a trained-model implementation
// can satisfy the same interface later without changing callers.
type Scorer interface {
	Score(ctx context.Context, s scope.Scope, subjectID uuid.UUID) (Score, error)
}

// thresholds for mapping a 0-100 score to a level.
const (
	levelHighMin   = 70.0
	levelMediumMin = 40.0
)

func levelFor(score float64) string {
	switch {
	case score >= levelHighMin:
		return "high"
	case score >= levelMediumMin:
		return "medium"
	default:
		return "low"
	}
}
