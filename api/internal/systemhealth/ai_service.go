package systemhealth

import (
	"context"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/ai/aggregate"
	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/scope"
)

// generatePlatformOptimizationBriefService produces the Super Admin-facing
// Platform Optimization Advisor: a narrative synthesized from real request
// volume/error-rate/latency trend and DB connection pool data, comparing the
// last 24h against the prior 24h. Platform-wide, not org-scoped - CohortID/
// ProgramID/OrgID are intentionally left nil.
func generatePlatformOptimizationBriefService(ctx context.Context, userID uuid.UUID, role string) (string, error) {
	s := scope.Scope{UserID: userID, Role: role}
	return aggregate.GenerateBrief(ctx, s, aggregate.KindPlatformOptimization, provider.TierReason)
}
