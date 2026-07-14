package classify

// Result is a single-label classification with confidence and a short
// rationale. Used by PM's Survey Sentiment Analysis, Faculty's Content
// Quality Scorer, and the classification half of the 360° Narrative Summary.
type Result struct {
	Label      string  `json:"label"`
	Confidence float64 `json:"confidence"`
	Rationale  string  `json:"rationale"`
}
