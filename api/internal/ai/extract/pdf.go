package extract

import (
	"bytes"

	"github.com/ledongthuc/pdf"
)

func newPDFReader(fileBytes []byte) (*pdf.Reader, error) {
	return pdf.NewReader(bytes.NewReader(fileBytes), int64(len(fileBytes)))
}
