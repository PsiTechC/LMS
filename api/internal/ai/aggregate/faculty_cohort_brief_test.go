package aggregate

import (
	"os"
	"strings"
	"testing"
)

// TestFacultyCohortBriefQueriesScopeByCohortID guards the access boundary
// that stops a faculty brief for one cohort from pulling another cohort's
// participants/scores.
func TestFacultyCohortBriefQueriesScopeByCohortID(t *testing.T) {
	src, err := os.ReadFile("faculty_cohort_brief.go")
	if err != nil {
		t.Fatalf("failed to read faculty_cohort_brief.go: %v", err)
	}
	text := string(src)

	markers := []string{
		"WHERE en.cohort_id = ? AND en.status <> 'withdrawn'",
		"WHERE ccs.cohort_id = ?",
	}
	for _, m := range markers {
		if !strings.Contains(text, m) {
			t.Errorf("expected faculty_cohort_brief.go to contain scoping clause %q", m)
		}
	}
}
