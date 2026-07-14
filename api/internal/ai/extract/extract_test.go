package extract

import (
	"archive/zip"
	"bytes"
	"strings"
	"testing"
)

func TestTextPlainAndMarkdown(t *testing.T) {
	got, err := Text([]byte("# Heading\n\nSome body text."), "text/markdown")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(got, "Some body text.") {
		t.Fatalf("expected plain text passthrough, got %q", got)
	}
}

func TestTextUnsupportedType(t *testing.T) {
	_, err := Text([]byte{0xff, 0xd8, 0xff}, "image/jpeg")
	if err == nil {
		t.Fatal("expected an error for an unsupported/non-text mime type")
	}
}

// TestExtractPptxTextReadsSlideRuns builds a minimal single-slide .pptx (a
// ZIP containing one slide XML with two <a:t> text runs) and confirms
// extractPptxText pulls both runs out in order.
func TestExtractPptxTextReadsSlideRuns(t *testing.T) {
	var buf bytes.Buffer
	zw := zip.NewWriter(&buf)
	slideXML := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld><p:spTree><p:sp><p:txBody>
    <a:p><a:r><a:t>Title Slide</a:t></a:r></a:p>
    <a:p><a:r><a:t>Subtitle text</a:t></a:r></a:p>
  </p:txBody></p:sp></p:spTree></p:cSld>
</p:sld>`
	w, err := zw.Create("ppt/slides/slide1.xml")
	if err != nil {
		t.Fatalf("failed to create zip entry: %v", err)
	}
	if _, err := w.Write([]byte(slideXML)); err != nil {
		t.Fatalf("failed to write slide xml: %v", err)
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("failed to close zip writer: %v", err)
	}

	text, err := extractPptxText(buf.Bytes())
	if err != nil {
		t.Fatalf("extractPptxText returned error: %v", err)
	}
	if !strings.Contains(text, "Title Slide") || !strings.Contains(text, "Subtitle text") {
		t.Fatalf("expected both text runs in output, got %q", text)
	}
	if !strings.Contains(text, "Slide 1:") {
		t.Fatalf("expected slide number header, got %q", text)
	}
}

func TestLooksLikeZipDocument(t *testing.T) {
	if !looksLikeZipDocument([]byte("PK\x03\x04rest")) {
		t.Fatal("expected ZIP magic bytes to be detected")
	}
	if looksLikeZipDocument([]byte("%PDF-1.4")) {
		t.Fatal("did not expect a PDF to be detected as a zip document")
	}
}
