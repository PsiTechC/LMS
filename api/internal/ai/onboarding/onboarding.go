// Package onboarding is the Super Admin's Onboarding Automation Engine -
// workflow automation, not a reasoning engine (see CLAUDE.md's AI engine
// table). It is a pure suggestion layer in front of the existing
// organizations module: SuggestOrgSetup never writes to the database and
// never calls the org-creation endpoint itself. A human still reviews the
// suggestion and submits the existing POST /organizations request - this
// package has no path to that write beyond what the caller already has.
package onboarding

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"

	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/scope"
)

//go:embed prompts/suggest_org_setup.tmpl
var suggestOrgSetupSystemPrompt string

// Input is what the Super Admin has typed so far in the new-org wizard.
type Input struct {
	OrgName     string
	Description string // freeform "describe this client" field
}

// BrandKitSuggestion is a partial brand kit - only the two colors an LLM can
// plausibly reason about from a name/description; the full BrandKitDTO in
// organizations/dto.go has more fields (font, logo) left to the existing
// defaultBrandKit() default or manual entry.
type BrandKitSuggestion struct {
	Primary string `json:"primary"`
	Accent  string `json:"accent"`
}

// Suggestion is the structured output - every field maps directly onto
// CreateOrgWizard's form state (apps/web/components/superadmin/CreateOrgWizard.tsx)
// so the frontend can pre-fill without any translation step.
type Suggestion struct {
	Industry  string              `json:"industry"`
	Size      string              `json:"size"`
	Plan      string              `json:"plan"`
	Seats     int                 `json:"seats"`
	BrandKit  *BrandKitSuggestion `json:"brand_kit"`
	Rationale string              `json:"rationale"`
}

// SuggestOrgSetup asks the model for smart defaults for a brand-new
// organization's setup form. Read-only: no DB access, no write path. The
// caller (handler) is responsible for enforcing the same
// "organizations:create" permission org creation itself requires - this
// function does not and cannot create anything.
func SuggestOrgSetup(ctx context.Context, s scope.Scope, in Input) (*Suggestion, error) {
	if in.OrgName == "" {
		return nil, fmt.Errorf("onboarding: org name is required")
	}

	userMsg := fmt.Sprintf("ORGANIZATION NAME: %s\n\nDESCRIPTION: %s", in.OrgName, in.Description)
	msgs := []provider.ChatMessage{
		{Role: "system", Content: suggestOrgSetupSystemPrompt},
		{Role: "user", Content: userMsg},
	}

	cfg := provider.Resolve(s, provider.TierReason)
	result, err := provider.Complete(ctx, cfg, msgs, provider.WithJSONMode())
	if err != nil {
		return nil, err
	}

	var out Suggestion
	if err := json.Unmarshal([]byte(result.Content), &out); err != nil {
		return nil, fmt.Errorf("onboarding: AI returned an unexpected response format: %w", err)
	}
	return &out, nil
}
