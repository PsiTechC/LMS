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

// generateCohortHealthScoreService produces the Program Manager-facing
// composite Cohort Health Score: a 0-100 score, label, and short narrative,
// synthesized on demand from the same engagement/at-risk/completion metrics
// as the Cohort Intelligence Brief, scoped to a single cohort.
func generateCohortHealthScoreService(ctx context.Context, userID uuid.UUID, role, cohortID string) (*CohortHealthScoreResponse, error) {
	cid, err := uuid.Parse(cohortID)
	if err != nil {
		return nil, errors.New("invalid cohort id")
	}
	s := scope.Scope{UserID: userID, Role: role, CohortID: &cid}
	result, err := aggregate.GenerateCohortHealthScore(ctx, s, provider.TierReason)
	if err != nil {
		return nil, err
	}
	return &CohortHealthScoreResponse{
		CohortID:  cohortID,
		Score:     result.Score,
		Label:     result.Label,
		Narrative: result.Narrative,
	}, nil
}
