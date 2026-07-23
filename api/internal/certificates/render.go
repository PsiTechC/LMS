package certificates

import (
	"bytes"
	"fmt"
	"image"
	"image/png"
	"os"

	"github.com/fogleman/gg"
	"github.com/jung-kurt/gofpdf"
)

// renderInput is everything render() needs to draw one certificate.
// Assembled by the service layer from the template asset + participant/
// enrollment/program rows - this file has no DB access of its own, matching
// the same separation feedback360/report.go uses (ReportData in, bytes out).
type renderInput struct {
	Background image.Image // nil = no custom background (procedural fallback)
	Placements *certificatePlacements
	Logo       image.Image // nil = no logo uploaded

	ParticipantName string
	ProgramTitle    string
	CompletedOn     string // pre-formatted display date
	Email           string
	Score           string // pre-formatted, empty = not applicable
	SerialCode      string
}

// fieldValue resolves the real value for one of the fixed semantic slot
// keys - the reference implementation's "field" model (name/videoTitle/date/
// email/team/score), adapted to this app's domain (program completion, not
// a video/course): "team" is dropped (not applicable here), "video_title"
// becomes "program_title".
func (in renderInput) fieldValue(key string) string {
	switch key {
	case "name":
		return in.ParticipantName
	case "program_title":
		return in.ProgramTitle
	case "date":
		return in.CompletedOn
	case "email":
		return in.Email
	case "score":
		return in.Score
	default:
		return ""
	}
}

// defaultCanvasWidth/Height are used for the procedural fallback design when
// a template has no uploaded background image, mirroring the reference
// implementation's fixed-size default canvas.
const (
	defaultCanvasWidth  = 1600
	defaultCanvasHeight = 1200
)

// render draws in onto a canvas (the template's background image if present,
// otherwise a procedural fallback design) and returns a single-page PDF.
func render(in renderInput) ([]byte, error) {
	var dc *gg.Context
	var w, h float64

	if in.Background != nil {
		bounds := in.Background.Bounds()
		w, h = float64(bounds.Dx()), float64(bounds.Dy())
		dc = gg.NewContextForImage(in.Background)
	} else {
		w, h = defaultCanvasWidth, defaultCanvasHeight
		dc = gg.NewContext(int(w), int(h))
		drawDefaultBackground(dc, w, h)
	}

	if in.Placements != nil {
		fontFamily := in.Placements.FontFamily
		for key, p := range in.Placements.Fields {
			value := in.fieldValue(key)
			if value == "" {
				continue
			}
			drawPlacement(dc, w, h, value, p, fontFamily)
		}
		for _, ct := range in.Placements.CustomTexts {
			drawPlacement(dc, w, h, ct.Text, ct.certificatePlacement, fontFamily)
		}
		if in.Logo != nil {
			for _, lc := range in.Placements.LogoCopies {
				drawLogo(dc, w, h, in.Logo, lc)
			}
		}
	} else if in.Background == nil {
		// No template at all - draw the fully procedural fallback content
		// (name/program/date), matching the reference's drawDefaultCert path.
		drawDefaultContent(dc, w, h, in)
	}

	// Verification footer - always present regardless of template, burned
	// into the image itself so it survives a screenshot/printout, not just
	// the PDF metadata.
	drawFooter(dc, w, h, in.SerialCode)

	return imageToPDF(dc.Image(), w, h)
}

func drawPlacement(dc *gg.Context, w, h float64, value string, p certificatePlacement, defaultFamily string) {
	family := p.FontFamily
	if family == "" {
		family = defaultFamily
	}
	if err := setFontFace(dc, family, p.Bold, p.Italic, p.FontSize); err != nil {
		return
	}
	r, g, b := hexToRGBA(p.Color)
	if p.Color == "" {
		r, g, b = 0, 0, 0
	}
	dc.SetRGB(r, g, b)
	dc.DrawStringAnchored(value, w*p.X/100, h*p.Y/100, 0.5, 0.5)
}

func drawLogo(dc *gg.Context, w, h float64, logo image.Image, lc certificateLogoCopy) {
	bounds := logo.Bounds()
	aspect := float64(bounds.Dy()) / float64(bounds.Dx())
	logoW := w * lc.W / 100
	logoH := logoW * aspect

	x := w*lc.X/100 - logoW/2
	y := h*lc.Y/100 - logoH/2

	dc.Push()
	dc.Translate(x, y)
	dc.Scale(logoW/float64(bounds.Dx()), logoH/float64(bounds.Dy()))
	dc.DrawImage(logo, 0, 0)
	dc.Pop()
}

func drawDefaultBackground(dc *gg.Context, w, h float64) {
	// Clean brand-colored bars, matching the reference implementation's
	// procedural fallback (top/bottom bars, no background image needed).
	dc.SetRGB(1, 1, 1)
	dc.Clear()
	dc.SetHexColor("#182848") // Midnight Navy, per apps/CLAUDE.md
	dc.DrawRectangle(0, 0, w, h*0.04)
	dc.Fill()
	dc.DrawRectangle(0, h*0.96, w, h*0.04)
	dc.Fill()
}

func drawDefaultContent(dc *gg.Context, w, h float64, in renderInput) {
	_ = setFontFace(dc, "serif", true, false, h*0.06)
	dc.SetHexColor("#182848")
	dc.DrawStringAnchored("Certificate of Completion", w/2, h*0.28, 0.5, 0.5)

	_ = setFontFace(dc, "serif", false, true, h*0.08)
	dc.SetHexColor("#C8A860") // Champagne Gold, per apps/CLAUDE.md
	dc.DrawStringAnchored(in.ParticipantName, w/2, h*0.45, 0.5, 0.5)

	_ = setFontFace(dc, "sans", false, false, h*0.03)
	dc.SetHexColor("#4A5573")
	dc.DrawStringAnchored(fmt.Sprintf("has successfully completed “%s”", in.ProgramTitle), w/2, h*0.58, 0.5, 0.5)
	dc.DrawStringAnchored(in.CompletedOn, w/2, h*0.66, 0.5, 0.5)
}

func drawFooter(dc *gg.Context, w, h float64, serialCode string) {
	_ = setFontFace(dc, "sans", false, false, h*0.015)
	dc.SetHexColor("#8b90a7")
	dc.DrawStringAnchored(fmt.Sprintf("Verify at %s/certificates/verify/%s", frontendBaseURL(), serialCode), w/2, h*0.985, 0.5, 0.5)
}

// frontendBaseURL mirrors zoom/handler.go's frontendCallbackURL() - same
// APP_BASE_URL/NEXTAUTH_URL fallback chain, since this is the same "which
// frontend origin serves the participant-facing app" question.
func frontendBaseURL() string {
	base := os.Getenv("APP_BASE_URL")
	if base == "" {
		base = os.Getenv("NEXTAUTH_URL")
	}
	if base == "" {
		base = "http://localhost:3000"
	}
	return base
}

// imageToPDF encodes img as PNG and embeds it as a single full-bleed PDF
// page sized to match the image's own aspect ratio at 96dpi, matching the
// reference implementation's canvas-to-mm conversion so the PDF never
// letterboxes the certificate.
func imageToPDF(img image.Image, wPx, hPx float64) ([]byte, error) {
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, fmt.Errorf("failed to encode certificate image: %w", err)
	}

	const pxToMM = 25.4 / 96.0
	wMM, hMM := wPx*pxToMM, hPx*pxToMM

	orientation := "L"
	if hMM > wMM {
		orientation = "P"
	}
	pdf := gofpdf.NewCustom(&gofpdf.InitType{
		OrientationStr: orientation,
		UnitStr:        "mm",
		SizeStr:        "",
		Size:           gofpdf.SizeType{Wd: wMM, Ht: hMM},
	})
	pdf.SetMargins(0, 0, 0)
	pdf.SetAutoPageBreak(false, 0)
	pdf.AddPage()

	imgOpts := gofpdf.ImageOptions{ImageType: "PNG"}
	pdf.RegisterImageOptionsReader("certificate", imgOpts, bytes.NewReader(buf.Bytes()))
	pdf.ImageOptions("certificate", 0, 0, wMM, hMM, false, imgOpts, 0, "")

	var out bytes.Buffer
	if err := pdf.Output(&out); err != nil {
		return nil, fmt.Errorf("failed to write certificate pdf: %w", err)
	}
	return out.Bytes(), nil
}
