package cohorts

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/ai/aggregate"
	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/scope"
)

// generateCohortPulseService produces the "AI Cohort Pulse" one-line insight
// for a program's Cohort Management screen: unassigned participants and
// per-cohort load balance, synthesized into a short nudge.
func generateCohortPulseService(ctx context.Context, userID, role, programID string) (string, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return "", errors.New("invalid user id")
	}
	pid, err := uuid.Parse(programID)
	if err != nil {
		return "", errors.New("invalid program id")
	}
	s := scope.Scope{UserID: uid, Role: role, ProgramID: &pid}
	return aggregate.GenerateBrief(ctx, s, aggregate.KindCohortPulse, provider.TierReason)
}

// generateDailyFocusService produces the "AI Daily Focus" one-line nudge for
// a participant's My Journey screen: their active program, completion
// percentage, and next incomplete activity.
func generateDailyFocusService(ctx context.Context, userID, role string) (string, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return "", errors.New("invalid user id")
	}
	s := scope.Scope{UserID: uid, Role: role}
	return aggregate.GenerateBrief(ctx, s, aggregate.KindDailyFocus, provider.TierReason)
}
