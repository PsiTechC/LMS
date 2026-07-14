package aggregate

import (
	"context"
	"testing"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/scope"
)

// TestGenerateBriefRequiresProgramScope verifies that a Scope with no
// ProgramID is rejected before any query or provider call is made — the
// cohort_intelligence brief must never run unscoped across programs.
func TestGenerateBriefRequiresProgramScope(t *testing.T) {
	s := scope.Scope{} // no ProgramID set
	_, err := GenerateBrief(context.Background(), s, KindCohortIntelligence, provider.TierDeepReason)
	if err == nil {
		t.Fatal("expected error when Scope has no ProgramID, got nil")
	}
}

func TestGenerateBriefRejectsUnknownKind(t *testing.T) {
	pid := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	s := scope.Scope{ProgramID: &pid}
	_, err := GenerateBrief(context.Background(), s, Kind("not_a_real_kind"), provider.TierDeepReason)
	if err == nil {
		t.Fatal("expected error for unsupported brief kind, got nil")
	}
}

// TestFacultyCohortBriefRequiresCohortScope mirrors the ProgramID
// requirement above — a faculty brief must never run unscoped across cohorts.
func TestFacultyCohortBriefRequiresCohortScope(t *testing.T) {
	s := scope.Scope{} // no CohortID set
	_, err := GenerateBrief(context.Background(), s, KindFacultyCohortBrief, provider.TierDeepReason)
	if err == nil {
		t.Fatal("expected error when Scope has no CohortID, got nil")
	}
}

func TestKindSystemPromptSelection(t *testing.T) {
	if KindFeedback360Narrative.systemPrompt() != feedback360SystemPrompt {
		t.Fatal("expected feedback_360_narrative to use its own prompt template")
	}
	if KindFacultyCohortBrief.systemPrompt() != facultyCohortBriefSystemPrompt {
		t.Fatal("expected faculty_cohort_brief to use its own prompt template")
	}
	if KindCohortIntelligence.systemPrompt() != briefSystemPrompt {
		t.Fatal("expected cohort_intelligence to keep using the shared brief prompt")
	}
}
