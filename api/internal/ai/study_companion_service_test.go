package ai

import "testing"

func TestExcludedActivityTypesExcludesOnlyVideoAndLiveSession(t *testing.T) {
	if !excludedActivityTypes["video"] {
		t.Fatal("video must be excluded — there is no transcript to generate from")
	}
	if !excludedActivityTypes["live_session"] {
		t.Fatal("live_session must be excluded — no attached document")
	}
	// Every other activity type should be eligible (gated by the attached
	// file's extractability, not by activity/asset type) — this is the fix
	// for the bug where pdf/docx/etc. uploaded under any content-library
	// category (case_study, elearning, ...) were wrongly excluded.
	for _, allowed := range []string{"pdf", "case_study", "content", "assessment", "assignment"} {
		if excludedActivityTypes[allowed] {
			t.Fatalf("%q should not be excluded — availability is decided by the attached file, not activity type", allowed)
		}
	}
}
