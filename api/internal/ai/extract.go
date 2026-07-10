package ai

import (
	"bytes"
	"fmt"
	"io"
	"strings"

	"github.com/ledongthuc/pdf"
)

// ExtractText pulls raw text out of an uploaded file so it can be fed into
// an AI prompt. Only text-based PDFs are supported today — scanned/image-only
// PDFs will return little or no text (no OCR).
func ExtractText(fileBytes []byte, mimeType string) (string, error) {
	if strings.Contains(mimeType, "pdf") {
		return extractPDFText(fileBytes)
	}
	// Plain text / markdown-ish content can be used as-is.
	if strings.HasPrefix(mimeType, "text/") {
		return string(fileBytes), nil
	}
	return "", fmt.Errorf("unsupported file type for text extraction: %s", mimeType)
}

func extractPDFText(fileBytes []byte) (string, error) {
	reader, err := pdf.NewReader(bytes.NewReader(fileBytes), int64(len(fileBytes)))
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
