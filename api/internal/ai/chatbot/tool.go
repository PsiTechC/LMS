// Package chatbot is the shared, role-agnostic chat core: one agentic loop
// (provider.Complete with tools, execute, feed results back, repeat) driven
// by a per-role Tool registry. Adding a new role's capabilities means
// writing a new tools file and calling Register - the loop, the provider
// wiring, and the HTTP/SSE surface are shared and never change per role.
package chatbot

import (
	"context"
	"encoding/json"

	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/scope"
)

// Tool is one callable function the model can invoke. Run receives the
// caller's Scope (never the model's say-so) as the source of truth for
// whose data to fetch - argsJSON should only ever carry query parameters
// like a date range or a free-text filter, never an identity the tool then
// trusts. Every Run implementation is expected to filter by scope.UserID
// (or another scope field), the same way internal/ai/rag's engines do.
type Tool struct {
	Def provider.ToolDef
	Run func(ctx context.Context, s scope.Scope, argsJSON string) (string, error)
}

// Registry maps role -> the tools available to that role. Populated by each
// role's init() via Register; see chatbot/tools/participant.go for the
// reference implementation.
var registry = map[string][]Tool{}

// Register adds tools for a role. Call from an init() in a
// chatbot/tools/<role>.go file - panics on a duplicate tool name within the
// same role, since that's always a copy-paste bug, not a valid state.
func Register(role string, tools ...Tool) {
	existing := registry[role]
	seen := make(map[string]bool, len(existing))
	for _, t := range existing {
		seen[t.Def.Name] = true
	}
	for _, t := range tools {
		if seen[t.Def.Name] {
			panic("chatbot: duplicate tool name \"" + t.Def.Name + "\" registered for role \"" + role + "\"")
		}
		seen[t.Def.Name] = true
	}
	registry[role] = append(existing, tools...)
}

// ToolsForRole returns the tools available to a role, or nil if none are
// registered (the loop degrades to a plain chat with no tool-calling).
func ToolsForRole(role string) []Tool {
	return registry[role]
}

func toolDefsForRole(role string) []provider.ToolDef {
	tools := ToolsForRole(role)
	if len(tools) == 0 {
		return nil
	}
	defs := make([]provider.ToolDef, 0, len(tools))
	for _, t := range tools {
		defs = append(defs, t.Def)
	}
	return defs
}

func findTool(role, name string) (Tool, bool) {
	for _, t := range ToolsForRole(role) {
		if t.Def.Name == name {
			return t, true
		}
	}
	return Tool{}, false
}

// JSONSchema is a small helper for hand-authoring a tool's Parameters
// schema without repeating JSON Schema boilerplate at every call site.
func JSONSchema(properties map[string]any, required ...string) json.RawMessage {
	schema := map[string]any{
		"type":       "object",
		"properties": properties,
	}
	if len(required) > 0 {
		schema["required"] = required
	}
	b, _ := json.Marshal(schema)
	return b
}
