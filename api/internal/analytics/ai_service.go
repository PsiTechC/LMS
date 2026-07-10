package analytics

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/ai/aggregate"
	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/scope"
)

// generateCohortBriefService produces a real pre-session brief for a
// faculty member: attendance-based engagement, at-risk participant count,
// and competency gaps (if a faculty member has recorded scores for this
// cohort — omitted, not an error, if none exist yet).
func generateCohortBriefService(ctx context.Context, userID uuid.UUID, role, cohortID string) (string, error) {
	cid, err := uuid.Parse(cohortID)
	if err != nil {
		return "", errors.New("invalid cohort id")
	}
	s := scope.Scope{UserID: userID, Role: role, CohortID: &cid}
	return aggregate.GenerateBrief(ctx, s, aggregate.KindFacultyCohortBrief, provider.TierDeepReason)
}
