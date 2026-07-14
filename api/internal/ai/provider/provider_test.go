package provider

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/xa-lms/api/internal/ai/scope"
)

func testScope() scope.Scope { return scope.Scope{} }

func TestComplete(t *testing.T) {
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Fatalf("unexpected auth header: %s", got)
		}
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{"message": map[string]string{"content": "hello back"}},
			},
		})
	}))
	defer srv.Close()

	cfg := Config{BaseURL: srv.URL, APIKey: "test-key", Model: "test-model"}
	out, err := Complete(context.Background(), cfg, []ChatMessage{{Role: "user", Content: "hi"}})
	if err != nil {
		t.Fatalf("Complete returned error: %v", err)
	}
	if out.Content != "hello back" {
		t.Fatalf("unexpected output: %q", out.Content)
	}
	if gotBody["response_format"] != nil {
		t.Fatalf("expected no response_format without WithJSONMode, got %v", gotBody["response_format"])
	}
}

func TestCompleteJSONMode(t *testing.T) {
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{{"message": map[string]string{"content": `{"ok":true}`}}},
		})
	}))
	defer srv.Close()

	cfg := Config{BaseURL: srv.URL, APIKey: "test-key", Model: "test-model"}
	out, err := Complete(context.Background(), cfg, []ChatMessage{{Role: "user", Content: "hi"}}, WithJSONMode())
	if err != nil {
		t.Fatalf("Complete returned error: %v", err)
	}
	if out.Content != `{"ok":true}` {
		t.Fatalf("unexpected output: %q", out.Content)
	}
	rf, ok := gotBody["response_format"].(map[string]any)
	if !ok || rf["type"] != "json_object" {
		t.Fatalf("expected response_format json_object, got %v", gotBody["response_format"])
	}
}

func TestCompleteMissingAPIKey(t *testing.T) {
	cfg := Config{BaseURL: "http://unused", APIKey: "", Model: "m"}
	_, err := Complete(context.Background(), cfg, []ChatMessage{{Role: "user", Content: "hi"}})
	if err == nil {
		t.Fatal("expected error when API key is missing")
	}
}

func TestCompleteWithToolsRequestsToolCall(t *testing.T) {
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = json.NewDecoder(r.Body).Decode(&gotBody)
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{
				{
					"message": map[string]any{
						"content": "",
						"tool_calls": []map[string]any{
							{
								"id":   "call_abc123",
								"type": "function",
								"function": map[string]string{
									"name":      "get_my_profile",
									"arguments": `{}`,
								},
							},
						},
					},
				},
			},
		})
	}))
	defer srv.Close()

	tools := []ToolDef{{Name: "get_my_profile", Description: "Get the caller's profile", Parameters: nil}}
	cfg := Config{BaseURL: srv.URL, APIKey: "test-key", Model: "test-model"}
	out, err := Complete(context.Background(), cfg, []ChatMessage{{Role: "user", Content: "who am i"}}, WithTools(tools))
	if err != nil {
		t.Fatalf("Complete returned error: %v", err)
	}
	if len(out.ToolCalls) != 1 {
		t.Fatalf("expected 1 tool call, got %d", len(out.ToolCalls))
	}
	if out.ToolCalls[0].Name != "get_my_profile" || out.ToolCalls[0].ID != "call_abc123" {
		t.Fatalf("unexpected tool call: %+v", out.ToolCalls[0])
	}

	// Confirm the wire request actually included the tool definition.
	reqTools, ok := gotBody["tools"].([]any)
	if !ok || len(reqTools) != 1 {
		t.Fatalf("expected 1 tool in outgoing request, got %v", gotBody["tools"])
	}
	if gotBody["tool_choice"] != "auto" {
		t.Fatalf("expected default tool_choice auto, got %v", gotBody["tool_choice"])
	}
}

func TestChatMessageMarshalToolRoundTrip(t *testing.T) {
	assistantMsg := ChatMessage{
		Role:      "assistant",
		ToolCalls: []ToolCall{{ID: "call_1", Name: "get_my_profile", Arguments: "{}"}},
	}
	b, err := json.Marshal(assistantMsg)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	var decoded map[string]any
	_ = json.Unmarshal(b, &decoded)
	if decoded["content"] != nil {
		t.Fatalf("expected null content on a tool-calling assistant message, got %v", decoded["content"])
	}
	calls, ok := decoded["tool_calls"].([]any)
	if !ok || len(calls) != 1 {
		t.Fatalf("expected 1 tool_calls entry, got %v", decoded["tool_calls"])
	}

	toolReply := ChatMessage{Role: "tool", ToolCallID: "call_1", Content: `{"name":"Jane"}`}
	b2, _ := json.Marshal(toolReply)
	var decoded2 map[string]any
	_ = json.Unmarshal(b2, &decoded2)
	if decoded2["tool_call_id"] != "call_1" {
		t.Fatalf("expected tool_call_id to round-trip, got %v", decoded2["tool_call_id"])
	}
	if decoded2["content"] != `{"name":"Jane"}` {
		t.Fatalf("expected content to round-trip, got %v", decoded2["content"])
	}
}

func TestStream(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		flusher := w.(http.Flusher)
		chunks := []string{"Hello", ", ", "world"}
		for _, c := range chunks {
			payload, _ := json.Marshal(map[string]any{
				"choices": []map[string]any{
					{"delta": map[string]string{"content": c}},
				},
			})
			_, _ = w.Write([]byte("data: " + string(payload) + "\n\n"))
			flusher.Flush()
		}
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
		flusher.Flush()
	}))
	defer srv.Close()

	cfg := Config{BaseURL: srv.URL, APIKey: "test-key", Model: "test-model"}
	var deltas []string
	out, err := Stream(context.Background(), cfg, []ChatMessage{{Role: "user", Content: "hi"}}, func(d string) {
		deltas = append(deltas, d)
	})
	if err != nil {
		t.Fatalf("Stream returned error: %v", err)
	}
	if out != "Hello, world" {
		t.Fatalf("unexpected accumulated output: %q", out)
	}
	if strings.Join(deltas, "") != "Hello, world" {
		t.Fatalf("unexpected deltas: %v", deltas)
	}
}

func TestEmbed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/embeddings" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		var req embedRequest
		_ = json.NewDecoder(r.Body).Decode(&req)
		w.Header().Set("Content-Type", "application/json")
		resp := embedResponse{}
		for i := range req.Input {
			resp.Data = append(resp.Data, struct {
				Embedding []float32 `json:"embedding"`
				Index     int       `json:"index"`
			}{Embedding: []float32{float32(i), 0.5}, Index: i})
		}
		_ = json.NewEncoder(w).Encode(resp)
	}))
	defer srv.Close()

	cfg := Config{BaseURL: srv.URL, APIKey: "test-key", Model: "embed-model"}
	vecs, err := Embed(context.Background(), cfg, []string{"a", "b"})
	if err != nil {
		t.Fatalf("Embed returned error: %v", err)
	}
	if len(vecs) != 2 {
		t.Fatalf("expected 2 vectors, got %d", len(vecs))
	}
	if vecs[0][0] != 0 || vecs[1][0] != 1 {
		t.Fatalf("vectors not in input order: %v", vecs)
	}
}

func TestResolveTierOverride(t *testing.T) {
	t.Setenv("AI_MODEL", "default-model")
	t.Setenv("AI_MODEL_CLASSIFY", "classify-model")
	t.Setenv("AI_BASE_URL", "")
	t.Setenv("AI_API_KEY", "k")

	cfg := Resolve(testScope(), TierClassify)
	if cfg.Model != "classify-model" {
		t.Fatalf("expected tier override model, got %q", cfg.Model)
	}

	cfg = Resolve(testScope(), TierReason)
	if cfg.Model != "default-model" {
		t.Fatalf("expected default model fallback, got %q", cfg.Model)
	}
}

func TestConfigured(t *testing.T) {
	t.Setenv("AI_API_KEY", "")
	if Configured() {
		t.Fatal("expected Configured() to be false with no API key")
	}
	t.Setenv("AI_API_KEY", "k")
	if !Configured() {
		t.Fatal("expected Configured() to be true with an API key set")
	}
}
