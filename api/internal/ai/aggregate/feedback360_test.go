package aggregate

import (
	"os"
	"strings"
	"testing"
)

// TestFeedback360QueriesScopeByParticipantID is a structural regression
// guard: every query reading feedback_behavior_responses/feedback_responses/
// feedback_open_responses in this file must filter by r.participant_id — the
// access boundary that stops one participant's 360 narrative from including
// another participant's scores or comments (all raters across every
// participant on an admin cycle share the same feedback_raters table,
// distinguished only by participant_id).
func TestFeedback360QueriesScopeByParticipantID(t *testing.T) {
	src, err := os.ReadFile("feedback360.go")
	if err != nil {
		t.Fatalf("failed to read feedback360.go: %v", err)
	}
	text := string(src)

	markers := []string{
		"WHERE fcp.participant_id = ? AND fc.status IN",       // latestAssignedCycleID
		"WHERE r.cycle_id = ?::uuid AND r.participant_id = ?", // competency scores + open comments (appears twice)
	}
	for _, m := range markers {
		if !strings.Contains(text, m) {
			t.Errorf("expected feedback360.go to contain scoping clause %q", m)
		}
	}
	if strings.Count(text, "WHERE r.cycle_id = ?::uuid AND r.participant_id = ?") < 3 {
		t.Error("expected the participant_id scoping clause on all 3 rater-joined queries (2 in the UNION + open comments)")
	}
}
