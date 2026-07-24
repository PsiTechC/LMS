package content

// QuestionType enumerates the question shapes supported by the content
// library's question-set builder (quiz/survey/Kirkpatrick L1-L4 assets).
// "scale" is reserved for feedback instruments (survey/L1-L4) - quizzes use
// mcq/true_false/matching/open.
type QuestionType string

const (
	QTypeMCQ       QuestionType = "mcq"
	QTypeTrueFalse QuestionType = "true_false"
	QTypeMatching  QuestionType = "matching"
	QTypeOpen      QuestionType = "open"
	QTypeScale     QuestionType = "scale"
)

type MatchPair struct {
	Left  string `json:"left"`
	Right string `json:"right"`
}

type Question struct {
	ID           string       `json:"id"`
	Type         QuestionType `json:"type"`
	Text         string       `json:"text"`
	Options      []string     `json:"options,omitempty"`
	CorrectIndex *int         `json:"correct_index,omitempty"`
	CorrectText  *string      `json:"correct_text,omitempty"`
	MatchPairs   []MatchPair  `json:"match_pairs,omitempty"`
	ScaleMin     *int         `json:"scale_min,omitempty"`
	ScaleMax     *int         `json:"scale_max,omitempty"`
	ScaleLabels  []string     `json:"scale_labels,omitempty"`
	Points       *int         `json:"points,omitempty"`
	SortOrder    int          `json:"sort_order"`
}

type QuestionSet struct {
	Questions []Question `json:"questions"`
}

// CertificateConfig holds the design/issuance settings for a "certificate"
// asset. The custom background image/PDF (if any) is stored as the asset's
// own FileData - this struct holds structured settings plus the field
// placement layout drawn on top of that background.
//
// Placements is the canvas designer's output: a flat, percent-based layout
// ported from the reference implementation studied for this feature (a
// hand-rolled drag-and-drop certificate editor) rather than a token/mustache
// substitution system - each field is a fixed semantic slot (name,
// program_title, date, email, score) the renderer looks up by key, not
// embedded {{}} tokens in free text.
type CertificateConfig struct {
	CertType     string `json:"cert_type"`
	Authority    string `json:"authority"`
	SigName      string `json:"sig_name"`
	SigTitle     string `json:"sig_title"`
	Trigger      string `json:"trigger"`
	Validity     string `json:"validity"`
	PassingScore *int   `json:"passing_score,omitempty"`
	Layout       string `json:"layout"`
	Placements   *CertificatePlacements `json:"placements,omitempty"`
}

// CertificatePlacement is one field/custom-text/logo's position and style on
// the certificate canvas. X/Y are percent (0-100) of the background image's
// own dimensions - resolution-independent, matching how the background is
// rendered at any preview size. FontSize is stored in source-image pixel
// space and scaled at render time.
type CertificatePlacement struct {
	X          float64 `json:"x"`
	Y          float64 `json:"y"`
	FontSize   float64 `json:"font_size"`
	Color      string  `json:"color"`
	FontFamily string  `json:"font_family,omitempty"`
	Bold       bool    `json:"bold,omitempty"`
	Italic     bool    `json:"italic,omitempty"`
}

// CertificateLogoCopy is one independently-positioned copy of the org logo
// (up to a handful of copies sharing one shared width).
type CertificateLogoCopy struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"` // width, percent of canvas
}

// CertificateCustomText is a free-form text element the designer typed in
// and positioned (e.g. a tagline or signature line), distinct from the fixed
// semantic fields in CertificatePlacements.Fields.
type CertificateCustomText struct {
	ID string `json:"id"`
	Text string `json:"text"`
	CertificatePlacement
}

// CertificatePlacements is the full canvas layout for a certificate template.
type CertificatePlacements struct {
	FontFamily  string                           `json:"font_family"`
	Fields      map[string]CertificatePlacement  `json:"fields"`       // keys: name | program_title | date | email | score
	LogoCopies  []CertificateLogoCopy             `json:"logo_copies,omitempty"`
	CustomTexts []CertificateCustomText           `json:"custom_texts,omitempty"`
}

// CaseStudyBody holds typed-in case study content when no file is attached.
type CaseStudyBody struct {
	BodyText string `json:"body_text"`
}
