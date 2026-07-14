package recommend

import (
	"context"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/ai/scope"
)

// Recommender produces next-step suggestions for one subject. RuleBasedRecommender
// is the only implementation today; a trained-model implementation (e.g.
// collaborative filtering over completed activities) can satisfy the same
// interface later without changing callers.
type Recommender interface {
	Recommend(ctx context.Context, s scope.Scope, subjectID uuid.UUID) ([]Recommendation, error)
}

func NewRuleBasedRecommender() *RuleBasedRecommender { return &RuleBasedRecommender{} }
