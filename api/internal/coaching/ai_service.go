package coaching

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/ai/aggregate"
	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/scope"
)

// generateCoachingPulseService produces the "Coaching Pulse" one-line
// insight on the coach dashboard: each coachee's momentum (completion %) and
// pending action count, synthesized into a short nudge.
func generateCoachingPulseService(ctx context.Context, userID, role string) (string, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return "", errors.New("invalid user id")
	}
	s := scope.Scope{UserID: uid, Role: role}
	return aggregate.GenerateBrief(ctx, s, aggregate.KindCoachingPulse, provider.TierReason)
}
