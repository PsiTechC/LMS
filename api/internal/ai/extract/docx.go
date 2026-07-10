package extract

import (
	"bytes"
	"strings"

	docx "github.com/fumiama/go-docx"
)

func extractDocxText(fileBytes []byte) (string, error) {
	reader := bytes.NewReader(fileBytes)
	doc, err := docx.Parse(reader, int64(len(fileBytes)))
	if err != nil {
		return "", err
	}

	var b strings.Builder
	for _, item := range doc.Document.Body.Items {
		if p, ok := item.(*docx.Paragraph); ok {
			text := p.String()
			if text != "" {
				b.WriteString(text)
				b.WriteString("\n")
			}
		}
	}
	return strings.TrimSpace(b.String()), nil
}
