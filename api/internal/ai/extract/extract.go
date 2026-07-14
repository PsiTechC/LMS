// Package extract pulls raw text out of uploaded files so it can be fed
// into an AI prompt or indexed for retrieval. It's a leaf package (no
// dependency on internal/ai or internal/ai/rag) specifically so both can
// import it without a cycle — internal/ai depends on internal/ai/rag, and
// internal/ai/rag needs text extraction for indexing content assets.
package extract

import (
	"bytes"
	"fmt"
	"io"
	"strings"
)

// Text pulls raw text out of an uploaded file, dispatching on MIME type
// (falling back to the file extension when the MIME type is generic/absent,
// e.g. "application/octet-stream"). Supported: PDF, DOCX, PPTX, and plain
// text formats (.md, .txt, and anything under text/*). Scanned/image-only
// PDFs and files with no text layer return an empty string, not an error.
func Text(fileBytes []byte, mimeType string) (string, error) {
	mimeType = strings.ToLower(strings.TrimSpace(mimeType))

	switch {
	case strings.Contains(mimeType, "pdf"):
		return extractPDFText(fileBytes)
	case strings.Contains(mimeType, "wordprocessingml"): // docx
		return extractDocxText(fileBytes)
	case strings.Contains(mimeType, "presentationml"): // pptx
		return extractPptxText(fileBytes)
	case strings.HasPrefix(mimeType, "text/"):
		return string(fileBytes), nil
	}

	// MIME type was generic (application/octet-stream, empty, or something
	// the browser guessed wrong) — fall back to sniffing the file's own
	// magic bytes / structure rather than trusting an unhelpful mime_type.
	if looksLikePDF(fileBytes) {
		return extractPDFText(fileBytes)
	}
	if looksLikeZipDocument(fileBytes) {
		if text, err := extractDocxText(fileBytes); err == nil && text != "" {
			return text, nil
		}
		if text, err := extractPptxText(fileBytes); err == nil {
			return text, nil
		}
	}

	return "", fmt.Errorf("unsupported file type for text extraction: %s", mimeType)
}

func looksLikePDF(b []byte) bool {
	return len(b) >= 4 && string(b[:4]) == "%PDF"
}

// looksLikeZipDocument reports whether b starts with the ZIP local file
// header signature — both .docx and .pptx are ZIP containers.
func looksLikeZipDocument(b []byte) bool {
	return len(b) >= 4 && b[0] == 'P' && b[1] == 'K' && b[2] == 0x03 && b[3] == 0x04
}

func extractPDFText(fileBytes []byte) (string, error) {
	reader, err := newPDFReader(fileBytes)
	if err != nil {
		return "", fmt.Errorf("failed to open PDF: %w", err)
	}
	textReader, err := reader.GetPlainText()
	if err != nil {
		return "", fmt.Errorf("failed to extract PDF text: %w", err)
	}
	var buf bytes.Buffer
	if _, err := io.Copy(&buf, textReader); err != nil {
		return "", fmt.Errorf("failed to read extracted PDF text: %w", err)
	}
	return buf.String(), nil
}
