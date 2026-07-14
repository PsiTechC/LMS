package provider

import (
	"os"
	"strings"

	"github.com/xa-lms/api/internal/ai/scope"
)

// Resolve returns the Config to use for a given scope and tier. Today it
// reads env vars only (global default, plus optional AI_MODEL_<TIER>
// per-tier overrides) and ignores scope for provider selection — but
// because scope is already a parameter, per-org provider overrides (e.g.
// pinning a specific client org to Azure OpenAI for compliance) slot in
// here later without a signature change on any call site.
func Resolve(_ scope.Scope, tier Tier) Config {
	baseURL := strings.TrimRight(os.Getenv("AI_BASE_URL"), "/")
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	apiKey := os.Getenv("AI_API_KEY")

	model := os.Getenv(tierModelEnvVar(tier))
	if model == "" {
		model = os.Getenv("AI_MODEL")
	}
	if model == "" {
		model = "gpt-4o-mini"
	}

	return Config{BaseURL: baseURL, APIKey: apiKey, Model: model}
}

// Configured reports whether an API key is present so callers can fail
// fast with a friendly message instead of hitting the provider unauthenticated.
func Configured() bool {
	return strings.TrimSpace(os.Getenv("AI_API_KEY")) != ""
}

func tierModelEnvVar(tier Tier) string {
	return "AI_MODEL_" + strings.ToUpper(string(tier))
}
