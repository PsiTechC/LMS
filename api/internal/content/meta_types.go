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
// asset. The custom design image/PDF (if any) is stored as the asset's own
// FileData - this struct only holds structured settings.
type CertificateConfig struct {
	CertType     string `json:"cert_type"`
	Authority    string `json:"authority"`
	SigName      string `json:"sig_name"`
	SigTitle     string `json:"sig_title"`
	Trigger      string `json:"trigger"`
	Validity     string `json:"validity"`
	PassingScore *int   `json:"passing_score,omitempty"`
	Layout       string `json:"layout"`
}

// CaseStudyBody holds typed-in case study content when no file is attached.
type CaseStudyBody struct {
	BodyText string `json:"body_text"`
}
