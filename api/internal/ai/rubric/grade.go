package rubric

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"

	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/scope"
)

//go:embed prompts/grade.tmpl
var gradeSystemPrompt string

// Grade scores submissionText against rubricCriteria and returns per-criterion
// points/feedback plus an overall summary. Used by both the Participant
// Capstone Feedback Assistant and Faculty Grading Assist — the only
// difference between those two features is caller-side (whether the score
// is shown to the participant immediately or queued for faculty review),
// not this function.
func Grade(ctx context.Context, s scope.Scope, submissionText string, rubricCriteria []Criterion, tier provider.Tier) (*Result, error) {
	criteriaJSON, err := json.Marshal(rubricCriteria)
	if err != nil {
		return nil, err
	}

	msgs := []provider.ChatMessage{
		{Role: "system", Content: gradeSystemPrompt},
		{Role: "user", Content: fmt.Sprintf("RUBRIC CRITERIA:\n%s\n\nSUBMISSION:\n%s", criteriaJSON, submissionText)},
	}

	cfg := provider.Resolve(s, tier)
	completion, err := provider.Complete(ctx, cfg, msgs, provider.WithJSONMode())
	if err != nil {
		return nil, err
	}

	var result Result
	if err := json.Unmarshal([]byte(completion.Content), &result); err != nil {
		return nil, fmt.Errorf("rubric: AI returned an unexpected response format: %w", err)
	}
	return &result, nil
}
