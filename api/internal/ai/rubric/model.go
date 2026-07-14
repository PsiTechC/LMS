package rubric

// Criterion is one scored dimension of a rubric.
type Criterion struct {
	Name        string `json:"name"`
	MaxPoints   int    `json:"max_points"`
	Description string `json:"description"`
}

// CriterionResult is the model's score + feedback for one criterion.
type CriterionResult struct {
	Name     string `json:"name"`
	Points   int    `json:"points"`
	Feedback string `json:"feedback"`
}

// Result is the full graded output for one submission.
type Result struct {
	Criteria       []CriterionResult `json:"criteria"`
	TotalPoints    int               `json:"total_points"`
	OverallFeedback string           `json:"overall_feedback"`
}
