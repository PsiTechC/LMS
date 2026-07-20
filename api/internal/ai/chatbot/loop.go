package chatbot

import (
	"context"
	"fmt"

	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/scope"
)

// maxToolRounds bounds the agentic loop so a misbehaving model can't spin
// forever calling tools instead of answering.
const maxToolRounds = 4

// Answer runs the shared agentic loop for a role: send history + the role's
// tools to the model, execute any requested tool calls against Scope,
// append results, and repeat until the model responds with plain text
// instead of a tool call (or maxToolRounds is hit). The final text answer
// is then streamed to onDelta so the caller gets the same token-by-token
// UX as before tool-calling existed.
//
// systemPrompt is prepended once as the first message. history is the raw
// conversation so far (system prompt NOT included - Answer adds it).
func Answer(ctx context.Context, s scope.Scope, systemPrompt string, history []provider.ChatMessage, tier provider.Tier, onDelta func(string)) (string, error) {
	tools := ToolsForRole(s.Role)
	toolDefs := toolDefsForRole(s.Role)

	msgs := make([]provider.ChatMessage, 0, len(history)+1)
	msgs = append(msgs, provider.ChatMessage{Role: "system", Content: systemPrompt})
	msgs = append(msgs, history...)

	cfg := provider.Resolve(s, tier)

	if len(toolDefs) == 0 {
		// No tools registered for this role - plain streamed chat.
		return provider.Stream(ctx, cfg, msgs, onDelta)
	}

	for round := 0; round < maxToolRounds; round++ {
		result, err := provider.Complete(ctx, cfg, msgs, provider.WithTools(toolDefs))
		if err != nil {
			return "", err
		}

		if len(result.ToolCalls) == 0 {
			// Model answered directly without a final tool round - stream
			// this content out so the UX still feels like streaming even
			// though this particular turn was a single Complete call.
			if onDelta != nil && result.Content != "" {
				onDelta(result.Content)
			}
			return result.Content, nil
		}

		msgs = append(msgs, provider.ChatMessage{Role: "assistant", ToolCalls: result.ToolCalls})
		for _, call := range result.ToolCalls {
			output := runTool(ctx, s, tools, call)
			msgs = append(msgs, provider.ChatMessage{Role: "tool", ToolCallID: call.ID, Content: output})
		}
	}

	// Ran out of rounds - force a final plain-text answer with tools
	// disabled so the model must respond in text using what it already has.
	final, err := provider.Complete(ctx, cfg, msgs)
	if err != nil {
		return "", err
	}
	if onDelta != nil && final.Content != "" {
		onDelta(final.Content)
	}
	return final.Content, nil
}

func runTool(ctx context.Context, s scope.Scope, tools []Tool, call provider.ToolCall) string {
	for _, t := range tools {
		if t.Def.Name != call.Name {
			continue
		}
		out, err := t.Run(ctx, s, call.Arguments)
		if err != nil {
			return fmt.Sprintf(`{"error":%q}`, err.Error())
		}
		return out
	}
	return fmt.Sprintf(`{"error":"unknown tool %q"}`, call.Name)
}
