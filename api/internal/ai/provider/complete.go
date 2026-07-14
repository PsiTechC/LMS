package provider

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Option configures a single Complete call.
type Option func(*completeOptions)

type completeOptions struct {
	jsonMode   bool
	tools      []ToolDef
	toolChoice string // "" (default: auto when tools present), "none", "auto", "required"
}

// WithJSONMode instructs the model to return a single JSON object
// (OpenAI's response_format: {"type":"json_object"}). The caller is
// responsible for unmarshaling the returned string. Mutually exclusive with
// WithTools in practice (most providers reject both on one request).
func WithJSONMode() Option {
	return func(o *completeOptions) { o.jsonMode = true }
}

// WithTools makes the given tools available to the model for this call. Use
// CompleteResult.ToolCalls on the response to see what the model asked to
// call; the caller executes them and feeds results back as ChatMessage{Role:
// "tool", ...} in a follow-up Complete call.
func WithTools(tools []ToolDef) Option {
	return func(o *completeOptions) { o.tools = tools }
}

// WithToolChoice forces "none" (never call a tool) or "required" (must call
// one). Omit for the default "auto" behavior once tools are present.
func WithToolChoice(choice string) Option {
	return func(o *completeOptions) { o.toolChoice = choice }
}

type responseFormat struct {
	Type string `json:"type"`
}

type chatRequest struct {
	Model          string          `json:"model"`
	Messages       []ChatMessage   `json:"messages"`
	ResponseFormat *responseFormat `json:"response_format,omitempty"`
	Tools          []toolWire      `json:"tools,omitempty"`
	ToolChoice     string          `json:"tool_choice,omitempty"`
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Content   string         `json:"content"`
			ToolCalls []toolCallWire `json:"tool_calls"`
		} `json:"message"`
	} `json:"choices"`
}

// Result is what Complete returns: text content, and/or tool calls the
// model wants executed. When ToolCalls is non-empty, Content is usually
// empty and the caller should execute the calls and continue the
// conversation rather than treating Content as the final answer.
type Result struct {
	Content   string
	ToolCalls []ToolCall
}

// Complete sends a single non-streaming chat completion request. Pass
// WithJSONMode() to force JSON-object output, or WithTools(...) to make
// tools available — check Result.ToolCalls before treating Result.Content
// as the final answer.
func Complete(ctx context.Context, cfg Config, msgs []ChatMessage, opts ...Option) (Result, error) {
	if strings.TrimSpace(cfg.APIKey) == "" {
		return Result{}, errors.New("AI provider not configured (AI_API_KEY missing)")
	}

	var o completeOptions
	for _, opt := range opts {
		opt(&o)
	}

	reqBody := chatRequest{Model: cfg.Model, Messages: msgs}
	if o.jsonMode {
		reqBody.ResponseFormat = &responseFormat{Type: "json_object"}
	}
	if len(o.tools) > 0 {
		reqBody.Tools = toolDefsToWire(o.tools)
		reqBody.ToolChoice = o.toolChoice
		if reqBody.ToolChoice == "" {
			reqBody.ToolChoice = "auto"
		}
	}

	body, err := json.Marshal(reqBody)
	if err != nil {
		return Result{}, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.BaseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return Result{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)

	client := &http.Client{Timeout: 90 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return Result{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return Result{}, fmt.Errorf("AI provider error %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}

	var parsed chatResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return Result{}, fmt.Errorf("failed to decode AI provider response: %w", err)
	}
	if len(parsed.Choices) == 0 {
		return Result{}, errors.New("AI provider returned no choices")
	}

	msg := parsed.Choices[0].Message
	result := Result{Content: msg.Content}
	for _, tc := range msg.ToolCalls {
		result.ToolCalls = append(result.ToolCalls, ToolCall{
			ID:        tc.ID,
			Name:      tc.Function.Name,
			Arguments: tc.Function.Arguments,
		})
	}
	return result, nil
}
