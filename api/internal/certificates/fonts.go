package certificates

import (
	"embed"
	"fmt"

	"github.com/fogleman/gg"
	"github.com/golang/freetype/truetype"
)

// fontFiles embeds a small bundled font set for server-side rendering. This
// mirrors the reference implementation's Google Fonts usage but sidesteps
// its central gotcha (browser canvas fillText() silently falls back unless
// the font is explicitly loaded via the Font Loading API first) - there is
// no such concern server-side, since these are real files loaded once at
// process start, not fetched over the network per-render.
//
//go:embed assets/fonts/*.ttf
var fontFiles embed.FS

// fontKey identifies one (family, bold, italic) combination this module can
// render. Unrecognized designer-supplied font_family values fall back to
// "sans" (Poppins) - the app's own default typeface per apps/CLAUDE.md -
// rather than failing the render.
type fontKey struct {
	family string // "sans" | "serif"
	bold   bool
	italic bool
}

var loadedFaces = map[fontKey]*truetype.Font{}

func init() {
	files := map[fontKey]string{
		{"sans", false, false}:  "assets/fonts/Poppins-Regular.ttf",
		{"sans", true, false}:   "assets/fonts/Poppins-Bold.ttf",
		{"sans", false, true}:   "assets/fonts/Poppins-Italic.ttf",
		{"sans", true, true}:    "assets/fonts/Poppins-BoldItalic.ttf",
		{"serif", false, false}: "assets/fonts/PlayfairDisplay-Regular.ttf",
		{"serif", true, false}:  "assets/fonts/PlayfairDisplay-Regular.ttf",
		{"serif", false, true}:  "assets/fonts/PlayfairDisplay-Italic.ttf",
		{"serif", true, true}:   "assets/fonts/PlayfairDisplay-Italic.ttf",
	}
	for key, path := range files {
		data, err := fontFiles.ReadFile(path)
		if err != nil {
			panic(fmt.Sprintf("certificates: failed to embed font %s: %v", path, err))
		}
		f, err := truetype.Parse(data)
		if err != nil {
			panic(fmt.Sprintf("certificates: failed to parse font %s: %v", path, err))
		}
		loadedFaces[key] = f
	}
}

// normalizeFontFamily maps a designer-supplied family name to one of this
// module's two bundled families. Unrecognized values default to "sans"
// rather than erroring, since a template's font_family is cosmetic, not a
// value that should ever block a render.
func normalizeFontFamily(family string) string {
	if family == "serif" {
		return "serif"
	}
	return "sans"
}

// setFontFace configures dc to draw with (family, bold, italic) at sizePx.
func setFontFace(dc *gg.Context, family string, bold, italic bool, sizePx float64) error {
	key := fontKey{family: normalizeFontFamily(family), bold: bold, italic: italic}
	f, ok := loadedFaces[key]
	if !ok {
		return fmt.Errorf("certificates: no font loaded for %+v", key)
	}
	face := truetype.NewFace(f, &truetype.Options{Size: sizePx})
	dc.SetFontFace(face)
	return nil
}

// hexToRGBA parses a "#RRGGBB" color string (as produced by an
// <input type="color">, matching the reference designer's color picker) into
// gg-ready 0-1 float components. Falls back to opaque black on any
// malformed input rather than erroring the whole render over one bad field.
func hexToRGBA(hex string) (r, g, b float64) {
	var ri, gi, bi int
	if _, err := fmt.Sscanf(hex, "#%02x%02x%02x", &ri, &gi, &bi); err != nil {
		return 0, 0, 0
	}
	return float64(ri) / 255, float64(gi) / 255, float64(bi) / 255
}
