package classify

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/scope"
)

//go:embed prompts/classify.tmpl
var systemPrompt string

// Classify labels text against a fixed taxonomy (e.g. sentiment labels
// ["positive","neutral","negative"], or content-quality labels
// ["strong","needs_revision","weak"]).
func Classify(ctx context.Context, s scope.Scope, text string, taxonomy []string, tier provider.Tier) (*Result, error) {
	if len(taxonomy) == 0 {
		return nil, fmt.Errorf("classify: taxonomy must not be empty")
	}

	msgs := []provider.ChatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: fmt.Sprintf("TAXONOMY: [%s]\n\nTEXT:\n%s", strings.Join(taxonomy, ", "), text)},
	}

	cfg := provider.Resolve(s, tier)
	completion, err := provider.Complete(ctx, cfg, msgs, provider.WithJSONMode())
	if err != nil {
		return nil, err
	}

	var result Result
	if err := json.Unmarshal([]byte(completion.Content), &result); err != nil {
		return nil, fmt.Errorf("classify: AI returned an unexpected response format: %w", err)
	}
	return &result, nil
}
