// Package provider is the single OpenAI-compatible wire client for the AI
// layer. Every engine calls Resolve to get a Config, then Complete/Stream/
// Embed — no engine reads env vars or picks a model name directly, so
// cheap-vs-expensive routing and provider swaps are config changes, not
// code changes.
package provider

import "encoding/json"

// Config is the resolved connection info for one provider call. Works
// unmodified against OpenAI, Azure OpenAI, or a local Ollama server — all
// three speak the same OpenAI-compatible wire format.
type Config struct {
	BaseURL string
	APIKey  string
	Model   string
}

// Tier is a cost/capability routing hint. Engines pass the tier that fits
// the job; Resolve maps it to a concrete model via env override.
type Tier string

const (
	// TierClassify is for cheap, high-volume, low-reasoning calls
	// (sentiment tagging, short classification).
	TierClassify Tier = "classify"
	// TierReason is the default tier for everyday conversational/generative
	// calls (chat replies, quiz generation).
	TierReason Tier = "reason"
	// TierDeepReason is for slower, higher-quality synthesis
	// (cohort briefs, ROI narratives, rubric grading).
	TierDeepReason Tier = "deep_reason"
	// TierEmbed is for embedding calls.
	TierEmbed Tier = "embed"
)

// ChatMessage is one message in a chat completion request.
//
// For a plain text turn, set Role ("system" | "user" | "assistant") and
// Content. For tool calling: an assistant turn that invokes tools sets
// ToolCalls (Content is typically empty); the corresponding results are fed
// back as one ChatMessage per call with Role "tool", ToolCallID matching
// the call's ID, and Content set to the tool's (string) result.
type ChatMessage struct {
	Role       string     `json:"role"`
	Content    string     `json:"content"`
	ToolCalls  []ToolCall `json:"-"` // set on assistant messages that called tools
	ToolCallID string     `json:"-"` // set on role:"tool" reply messages
}

// chatMessageWire is the OpenAI wire shape for a message, including the
// tool-calling fields that don't map 1:1 onto ChatMessage's Go-friendly shape.
type chatMessageWire struct {
	Role       string         `json:"role"`
	Content    *string        `json:"content"`
	ToolCalls  []toolCallWire `json:"tool_calls,omitempty"`
	ToolCallID string         `json:"tool_call_id,omitempty"`
}

// MarshalJSON emits the OpenAI wire shape: content is omitted (null) on an
// assistant message that only carries tool_calls, present otherwise.
func (m ChatMessage) MarshalJSON() ([]byte, error) {
	w := chatMessageWire{Role: m.Role, ToolCallID: m.ToolCallID}
	if len(m.ToolCalls) > 0 {
		w.ToolCalls = make([]toolCallWire, 0, len(m.ToolCalls))
		for _, tc := range m.ToolCalls {
			w.ToolCalls = append(w.ToolCalls, toolCallWire{
				ID:   tc.ID,
				Type: "function",
				Function: toolCallFuncWire{
					Name:      tc.Name,
					Arguments: tc.Arguments,
				},
			})
		}
	}
	if len(m.ToolCalls) == 0 || m.Content != "" {
		c := m.Content
		w.Content = &c
	}
	return json.Marshal(w)
}
