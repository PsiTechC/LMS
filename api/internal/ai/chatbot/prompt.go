package chatbot

import (
	_ "embed"
	"fmt"
)

//go:embed prompts/system.tmpl
var baseSystemPrompt string

// SystemPrompt builds the system message for a conversation: the shared
// role-agnostic base plus the caller's name. Tool availability (which
// varies per role) is what actually shapes what the assistant can talk
// about - the prompt text itself deliberately stays generic so adding a
// new role's tools doesn't require touching prompt copy.
func SystemPrompt(callerName string) string {
	return baseSystemPrompt + fmt.Sprintf("\nYou are talking to: %s\n", callerName)
}
