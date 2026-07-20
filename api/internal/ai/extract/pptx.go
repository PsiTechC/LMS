package extract

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"
)

// pptxTextRun matches a DrawingML text run <a:t>text</a:t> anywhere in a
// slide's XML - slide layouts nest text several levels deep (shape > text
// body > paragraph > run), but every text run is <a:t>, so a flat decode
// over the whole document is sufficient without modeling the full schema.
type pptxTextRun struct {
	XMLName xml.Name `xml:"t"`
	Text    string   `xml:",chardata"`
}

// extractPptxText reads slide text from a .pptx (a ZIP of slideN.xml files
// under ppt/slides/). Slides are read in numeric order so the extracted
// text follows the deck's presentation order.
func extractPptxText(fileBytes []byte) (string, error) {
	zr, err := zip.NewReader(bytes.NewReader(fileBytes), int64(len(fileBytes)))
	if err != nil {
		return "", fmt.Errorf("failed to open pptx: %w", err)
	}

	type slideFile struct {
		num  int
		file *zip.File
	}
	var slides []slideFile
	for _, f := range zr.File {
		if !strings.HasPrefix(f.Name, "ppt/slides/slide") || !strings.HasSuffix(f.Name, ".xml") {
			continue
		}
		numStr := strings.TrimSuffix(strings.TrimPrefix(f.Name, "ppt/slides/slide"), ".xml")
		num, err := strconv.Atoi(numStr)
		if err != nil {
			continue // skip non-numeric slide filenames (e.g. slideLayouts, slideMasters live elsewhere anyway)
		}
		slides = append(slides, slideFile{num: num, file: f})
	}
	sort.Slice(slides, func(i, j int) bool { return slides[i].num < slides[j].num })

	var b strings.Builder
	for _, s := range slides {
		rc, err := s.file.Open()
		if err != nil {
			continue
		}
		text := extractSlideText(rc)
		rc.Close()
		if text == "" {
			continue
		}
		fmt.Fprintf(&b, "Slide %d:\n%s\n\n", s.num, text)
	}
	return strings.TrimSpace(b.String()), nil
}

// extractSlideText reads every <a:t> text run out of one slide's XML, in
// document order. Malformed/truncated XML just stops the scan early and
// returns whatever text runs were already found.
func extractSlideText(r io.Reader) string {
	dec := xml.NewDecoder(r)
	var parts []string
	for {
		tok, err := dec.Token()
		if err != nil {
			break // io.EOF or malformed trailing bytes - return what we have
		}
		start, ok := tok.(xml.StartElement)
		if !ok || start.Name.Local != "t" {
			continue
		}
		var run pptxTextRun
		if err := dec.DecodeElement(&run, &start); err != nil {
			continue
		}
		if strings.TrimSpace(run.Text) != "" {
			parts = append(parts, run.Text)
		}
	}
	return strings.Join(parts, " ")
}
