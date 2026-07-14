package chatbot

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/ai/provider"
	"github.com/xa-lms/api/internal/ai/scope"
)

func mustParseTestUUID(t *testing.T) uuid.UUID {
	t.Helper()
	return uuid.MustParse("11111111-1111-1111-1111-111111111111")
}

// TestAnswerExecutesToolThenAnswers drives the full loop against a fake
// OpenAI-compatible server: round 1 returns a tool_call, round 2 (after the
// tool result is fed back) returns plain text. Confirms the loop calls the
// registered tool with the right args and that the tool's Scope, not any
// model-supplied value, is what gets used.
func TestAnswerExecutesToolThenAnswers(t *testing.T) {
	defer resetRegistryForTest()

	var toolCalledWithUserID string
	var requestCount int
	Register("test_role", Tool{
		Def: provider.ToolDef{Name: "get_thing", Description: "gets a thing"},
		Run: func(_ context.Context, s scope.Scope, _ string) (string, error) {
			toolCalledWithUserID = s.UserID.String()
			return `{"thing":"found it"}`, nil
		},
	})

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		w.Header().Set("Content-Type", "application/json")
		if requestCount == 1 {
			// First call: model asks to call the tool.
			_ = json.NewEncoder(w).Encode(map[string]any{
				"choices": []map[string]any{
					{
						"message": map[string]any{
							"content": "",
							"tool_calls": []map[string]any{
								{"id": "call_1", "type": "function", "function": map[string]string{"name": "get_thing", "arguments": "{}"}},
							},
						},
					},
				},
			})
			return
		}
		// Second call: model answers using the tool result already in messages.
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		msgs, _ := body["messages"].([]any)
		foundToolReply := false
		for _, m := range msgs {
			mm, _ := m.(map[string]any)
			if mm["role"] == "tool" && mm["tool_call_id"] == "call_1" {
				foundToolReply = true
			}
		}
		if !foundToolReply {
			t.Error("expected the follow-up request to include the tool's reply message")
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"choices": []map[string]any{{"message": map[string]any{"content": "Found it: found it"}}},
		})
	}))
	defer srv.Close()

	uid := mustParseTestUUID(t)
	s := scope.Scope{UserID: uid, Role: "test_role"}

	t.Setenv("AI_BASE_URL", srv.URL)
	t.Setenv("AI_API_KEY", "k")
	t.Setenv("AI_MODEL", "m")

	var deltas []string
	full, err := Answer(context.Background(), s, "system prompt", []provider.ChatMessage{{Role: "user", Content: "find the thing"}}, provider.TierReason, func(d string) {
		deltas = append(deltas, d)
	})
	if err != nil {
		t.Fatalf("Answer returned error: %v", err)
	}
	if full != "Found it: found it" {
		t.Fatalf("unexpected final answer: %q", full)
	}
	if len(deltas) == 0 {
		t.Fatal("expected onDelta to be called with the final answer")
	}
	if toolCalledWithUserID != uid.String() {
		t.Fatalf("expected tool to be called with scope.UserID %s, got %q", uid, toolCalledWithUserID)
	}
	if requestCount != 2 {
		t.Fatalf("expected exactly 2 requests (tool round + final answer), got %d", requestCount)
	}
}

// TestAnswerNoToolsForRoleFallsBackToPlainStream confirms a role with no
// registered tools still gets a working chat (via provider.Stream), so
// adding tool-calling doesn't regress roles that haven't been given tools yet.
func TestAnswerNoToolsForRoleFallsBackToPlainStream(t *testing.T) {
	defer resetRegistryForTest()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body["tools"] != nil {
			t.Error("expected no tools field in the request for a role with none registered")
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.WriteHeader(http.StatusOK)
		flusher := w.(http.Flusher)
		payload, _ := json.Marshal(map[string]any{"choices": []map[string]any{{"delta": map[string]string{"content": "hi"}}}})
		_, _ = w.Write([]byte("data: " + string(payload) + "\n\n"))
		_, _ = w.Write([]byte("data: [DONE]\n\n"))
		flusher.Flush()
	}))
	defer srv.Close()

	t.Setenv("AI_BASE_URL", srv.URL)
	t.Setenv("AI_API_KEY", "k")
	t.Setenv("AI_MODEL", "m")

	s := scope.Scope{UserID: mustParseTestUUID(t), Role: "role_with_no_tools"}
	full, err := Answer(context.Background(), s, "system prompt", nil, provider.TierReason, nil)
	if err != nil {
		t.Fatalf("Answer returned error: %v", err)
	}
	if full != "hi" {
		t.Fatalf("unexpected answer: %q", full)
	}
}
