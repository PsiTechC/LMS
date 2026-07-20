package feedback360

import (
	"context"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/ai/aggregate"
	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/scope"
)

// generateMyNarrativeService synthesizes a real narrative from the
// participant's own submitted 360 data (competency scores + open-text
// comments) via the shared aggregate engine. Called on demand, not on every
// page load - this is an LLM call, unlike the deterministic composeNarrative
// template buildCycleDTO uses for the default read-time summary.
func generateMyNarrativeService(ctx context.Context, participantID uuid.UUID) (string, error) {
	s := scope.Scope{UserID: participantID, Role: "participant"}
	return aggregate.GenerateBrief(ctx, s, aggregate.KindFeedback360Narrative, provider.TierDeepReason)
}
