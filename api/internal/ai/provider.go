package ai

import (
	"os"
	"strings"
)

// The AI provider is an OpenAI-compatible chat endpoint, selected entirely by
// env (AI_BASE_URL / AI_API_KEY / AI_MODEL). Works with OpenAI, Azure OpenAI,
// or a local Ollama server — no code change to switch, per project convention.

func providerConfig() (baseURL, apiKey, model string) {
	baseURL = strings.TrimRight(os.Getenv("AI_BASE_URL"), "/")
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	apiKey = os.Getenv("AI_API_KEY")
	model = os.Getenv("AI_MODEL")
	if model == "" {
		model = "gpt-4o-mini"
	}
	return
}

// ProviderConfigured reports whether an API key is present so callers can
// fail fast with a friendly message instead of hitting the provider unauthenticated.
func ProviderConfigured() bool {
	_, key, _ := providerConfig()
	return strings.TrimSpace(key) != ""
}
