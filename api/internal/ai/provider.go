package ai

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

// The AI provider is an OpenAI-compatible chat endpoint, selected entirely by
// env (AI_BASE_URL / AI_API_KEY / AI_MODEL). Works with OpenAI, Azure OpenAI,
// or a local Ollama server — no code change to switch.

// ChatMessage is one message sent to the model.
type ChatMessage struct {
	Role    string `json:"role"` // system | user | assistant
	Content string `json:"content"`
}

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

// ProviderConfigured reports whether an API key is present so callers can fail
// fast with a friendly message instead of hitting the provider unauthenticated.
func ProviderConfigured() bool {
	_, key, _ := providerConfig()
	return strings.TrimSpace(key) != ""
}

type chatRequest struct {
	Model    string        `json:"model"`
	Messages []ChatMessage `json:"messages"`
	Stream   bool          `json:"stream"`
}

type streamChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
}

// ChatStream streams a completion, invoking onDelta for each token chunk, and
// returns the full accumulated assistant text. onDelta may be nil.
func ChatStream(ctx context.Context, msgs []ChatMessage, onDelta func(string)) (string, error) {
	baseURL, apiKey, model := providerConfig()
	if strings.TrimSpace(apiKey) == "" {
		return "", errors.New("AI provider not configured (AI_API_KEY missing)")
	}

	body, _ := json.Marshal(chatRequest{Model: model, Messages: msgs, Stream: true})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Accept", "text/event-stream")

	client := &http.Client{Timeout: 120 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return "", fmt.Errorf("AI provider error %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}

	var full strings.Builder
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "[DONE]" {
			break
		}
		var chunk streamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue // skip keep-alives / non-JSON lines
		}
		for _, ch := range chunk.Choices {
			if ch.Delta.Content != "" {
				full.WriteString(ch.Delta.Content)
				if onDelta != nil {
					onDelta(ch.Delta.Content)
				}
			}
		}
	}
	if err := scanner.Err(); err != nil {
		return full.String(), err
	}
	return full.String(), nil
}
