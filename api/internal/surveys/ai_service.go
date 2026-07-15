package surveys

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/ai/aggregate"
	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/scope"
)

// generateSurveyInsightService produces the "AI Survey Insights" one-line
// card on the participant's Surveys tab: how many surveys are awaiting a
// response, synthesized into a short motivating nudge.
func generateSurveyInsightService(ctx context.Context, userID, role string) (string, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return "", errors.New("invalid user id")
	}
	s := scope.Scope{UserID: uid, Role: role}
	return aggregate.GenerateBrief(ctx, s, aggregate.KindSurveyInsight, provider.TierReason)
}
