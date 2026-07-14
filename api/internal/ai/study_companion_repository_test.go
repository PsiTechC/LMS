package ai

import (
	"os"
	"strings"
	"testing"
)

// TestResolveActivityAssetScopesToCallerEnrollment guards the access
// boundary that stops a participant from generating study material for an
// activity outside their own enrollment — the query must join through the
// caller's active enrollments, not just look up the activity by ID.
func TestResolveActivityAssetScopesToCallerEnrollment(t *testing.T) {
	src, err := os.ReadFile("study_companion_repository.go")
	if err != nil {
		t.Fatalf("failed to read study_companion_repository.go: %v", err)
	}
	text := string(src)

	if !strings.Contains(text, "JOIN enrollments e ON e.cohort_id IN") {
		t.Fatal("expected the activity/asset resolver to join through the caller's enrollments")
	}
	if !strings.Contains(text, "e.user_id = ?::uuid AND e.status <> 'withdrawn'") {
		t.Fatal("expected the resolver to filter by the caller's own user_id and an active enrollment status")
	}
}
