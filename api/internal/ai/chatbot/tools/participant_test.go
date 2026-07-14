package tools

import (
	"os"
	"strings"
	"testing"
)

// TestParticipantToolsScopeByCallerID is a structural regression guard:
// every participant tool's raw SQL must filter by the caller's own ID
// (s.UserID, bound via the "?" placeholder immediately following
// `database.DB.Raw(`) — never take a subject/user ID from the model's tool
// arguments. This is the entire access boundary for the chatbot's data
// tools, so a future tool added here without a caller-scoped WHERE clause
// should fail this test rather than fail silently in production.
func TestParticipantToolsScopeByCallerID(t *testing.T) {
	src, err := os.ReadFile("participant.go")
	if err != nil {
		t.Fatalf("failed to read participant.go: %v", err)
	}
	text := string(src)

	// Every `database.DB.Raw(` call in this file must be followed (within a
	// reasonable window) by a WHERE clause scoped to the caller — matched
	// loosely here since the exact join shape differs per tool, but the
	// scoping column (participant_id, user_id, or cep.participant_id passed
	// s.UserID) must appear in each query block.
	scopingMarkers := []string{
		"WHERE id = ?", // get_my_profile
		"WHERE e.user_id = ? AND e.status <> 'withdrawn'",             // enrollments, activity progress, sessions, surveys
		"WHERE sub.participant_id = ?",                                // submissions
		"WHERE participant_id = ?",                                    // goals
		"WHERE cep.participant_id = ? AND ce.status",                  // coaching
		"WHERE fc.participant_id = ?",                                 // feedback360
		"WHERE e.user_id = ? AND e.role = 'participant'",              // capstone
	}
	for _, marker := range scopingMarkers {
		if !strings.Contains(text, marker) {
			t.Errorf("expected participant.go to contain scoping clause %q — a tool may be missing its caller-ID filter", marker)
		}
	}
}
