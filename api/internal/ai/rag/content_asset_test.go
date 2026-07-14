package rag

import "testing"

func TestHasExtractableFile(t *testing.T) {
	cases := map[string]bool{
		"slides.pptx":  true,
		"handout.docx": true,
		"notes.md":     true,
		"readme.txt":   true,
		"reading.pdf":  true,
		"clip.mp4":     false,
		"archive.zip":  false, // SCORM package — no generic text extraction
		"noextension":  false,
		"UPPER.PDF":    true,
		"":             false,
	}
	for name, want := range cases {
		if got := HasExtractableFile(name); got != want {
			t.Errorf("HasExtractableFile(%q) = %v, want %v", name, got, want)
		}
	}
}
