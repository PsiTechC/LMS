package ai

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

// ChatMessage is one message sent to the model.
type ChatMessage struct {
	Role    string `json:"role"` // system | user | assistant
	Content string `json:"content"`
}

type chatRequest struct {
	Model          string          `json:"model"`
	Messages       []ChatMessage   `json:"messages"`
	ResponseFormat *responseFormat `json:"response_format,omitempty"`
}

type responseFormat struct {
	Type string `json:"type"`
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

// ChatJSON sends a single non-streaming chat completion request, instructing
// the model to return a JSON object, and returns the raw JSON string content
// for the caller to unmarshal into its own response shape.
func ChatJSON(ctx context.Context, msgs []ChatMessage) (string, error) {
	baseURL, apiKey, model := providerConfig()
	if strings.TrimSpace(apiKey) == "" {
		return "", errors.New("AI provider not configured (AI_API_KEY missing)")
	}

	body, err := json.Marshal(chatRequest{
		Model:          model,
		Messages:       msgs,
		ResponseFormat: &responseFormat{Type: "json_object"},
	})
	if err != nil {
		return "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 90 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return "", fmt.Errorf("AI provider error %d: %s", resp.StatusCode, strings.TrimSpace(string(b)))
	}

	var parsed chatResponse
	if err := json.NewDecoder(resp.Body).Decode(&parsed); err != nil {
		return "", fmt.Errorf("failed to decode AI provider response: %w", err)
	}
	if len(parsed.Choices) == 0 {
		return "", errors.New("AI provider returned no choices")
	}
	return parsed.Choices[0].Message.Content, nil
}
