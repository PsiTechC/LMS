package aggregate

import (
	"context"
	_ "embed"
	"fmt"

	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/scope"
	"github.com/xa-lms/api/pkg/database"
)

//go:embed prompts/brief.tmpl
var briefSystemPrompt string

//go:embed prompts/feedback360.tmpl
var feedback360SystemPrompt string

//go:embed prompts/faculty_cohort_brief.tmpl
var facultyCohortBriefSystemPrompt string

// Kind selects which structured metrics get pulled for the brief, and which
// system prompt frames the synthesis. Faculty's Cohort Intelligence Brief,
// PM's ROI Narrative / Cohort Health Score, Super Admin's Platform
// Optimization Advisor / Cross-Org Benchmarks, the participant's 360
// Narrative Summary, and Faculty's pre-session Cohort Brief all route
// through GenerateBrief with a different Kind — same synthesis step,
// different metric query and prompt.
type Kind string

const (
	KindCohortIntelligence   Kind = "cohort_intelligence"
	KindFeedback360Narrative Kind = "feedback_360_narrative"
	KindFacultyCohortBrief   Kind = "faculty_cohort_brief"
)

func (k Kind) systemPrompt() string {
	switch k {
	case KindFeedback360Narrative:
		return feedback360SystemPrompt
	case KindFacultyCohortBrief:
		return facultyCohortBriefSystemPrompt
	default:
		return briefSystemPrompt
	}
}

// GenerateBrief pulls structured metrics for kind (scoped to s), then asks
// the model to synthesize a narrative brief using that kind's prompt.
// Unsupported kinds return an error rather than silently generating an
// ungrounded brief.
func GenerateBrief(ctx context.Context, s scope.Scope, kind Kind, tier provider.Tier) (string, error) {
	metrics, err := loadMetrics(kind, s)
	if err != nil {
		return "", err
	}

	msgs := []provider.ChatMessage{
		{Role: "system", Content: kind.systemPrompt()},
		{Role: "user", Content: "METRICS:\n" + metrics},
	}
	cfg := provider.Resolve(s, tier)
	result, err := provider.Complete(ctx, cfg, msgs)
	if err != nil {
		return "", err
	}
	return result.Content, nil
}

func loadMetrics(kind Kind, s scope.Scope) (string, error) {
	switch kind {
	case KindCohortIntelligence:
		return cohortIntelligenceMetrics(s)
	case KindFeedback360Narrative:
		return feedback360NarrativeMetrics(s)
	case KindFacultyCohortBrief:
		return facultyCohortBriefMetrics(s)
	default:
		return "", fmt.Errorf("aggregate: unsupported brief kind %q", kind)
	}
}

func cohortIntelligenceMetrics(s scope.Scope) (string, error) {
	if s.ProgramID == nil {
		return "", fmt.Errorf("aggregate: cohort_intelligence requires a program-scoped Scope")
	}

	type row struct {
		TotalEnrolled  int
		AvgCompletion  float64
		HighRisk       int
		MediumRisk     int
		LowRisk        int
		WithdrawnCount int
	}
	var r row
	err := database.DB.Raw(`
		SELECT
			COUNT(*) FILTER (WHERE e.status <> 'withdrawn') AS total_enrolled,
			COALESCE(AVG(e.completion_percent) FILTER (WHERE e.status <> 'withdrawn'), 0) AS avg_completion,
			COUNT(*) FILTER (WHERE e.risk_level = 'high' AND e.status <> 'withdrawn') AS high_risk,
			COUNT(*) FILTER (WHERE e.risk_level = 'medium' AND e.status <> 'withdrawn') AS medium_risk,
			COUNT(*) FILTER (WHERE e.risk_level = 'low' AND e.status <> 'withdrawn') AS low_risk,
			COUNT(*) FILTER (WHERE e.status = 'withdrawn') AS withdrawn_count
		FROM enrollments e
		JOIN cohorts c ON c.id = e.cohort_id
		WHERE c.program_id = ?
	`, *s.ProgramID).Scan(&r).Error
	if err != nil {
		return "", err
	}

	return fmt.Sprintf(
		"Total enrolled: %d\nAverage completion: %.1f%%\nRisk distribution: %d high, %d medium, %d low\nWithdrawn: %d",
		r.TotalEnrolled, r.AvgCompletion, r.HighRisk, r.MediumRisk, r.LowRisk, r.WithdrawnCount,
	), nil
}
