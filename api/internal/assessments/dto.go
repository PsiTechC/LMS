package assessments

// AssessmentCardDTO is one quiz-backed assessment in the participant's list.
type AssessmentCardDTO struct {
	ActivityID      string   `json:"activity_id"`
	Title           string   `json:"title"`
	QuestionCount   int      `json:"question_count"`
	TimeLimitMins   int      `json:"time_limit_mins"`
	AttemptsAllowed int      `json:"attempts_allowed"`
	AttemptsUsed    int      `json:"attempts_used"`
	PassingScorePct int      `json:"passing_score_pct"`
	Status          string   `json:"status"` // completed | active | upcoming
	BestScorePct    *float64 `json:"best_score_pct,omitempty"`
	Passed          *bool    `json:"passed,omitempty"`
	DueDate         *string  `json:"due_date,omitempty"`
}

type MyAssessmentsDTO struct {
	HasProgram  bool                `json:"has_program"`
	Total       int                 `json:"total"`
	Completed   int                 `json:"completed"`
	Graded      int                 `json:"graded"`
	AvgScore    *float64            `json:"avg_score,omitempty"`
	Assessments []AssessmentCardDTO `json:"assessments"`
}

// QuestionDTO is a question WITHOUT its correct answer — this is the only
// shape ever sent to a participant before they submit.
type QuestionDTO struct {
	ID         string      `json:"id"`
	Type       string      `json:"type"` // mcq | true_false | matching | open
	Text       string      `json:"text"`
	Options    []string    `json:"options,omitempty"`
	MatchPairs []MatchPair `json:"match_pairs,omitempty"` // left only shown; right shuffled client-side is out of scope for v1
	Points     int         `json:"points"`
}

type MatchPair struct {
	Left  string `json:"left"`
	Right string `json:"right"`
}

// AssessmentDetailDTO is the full quiz for the take-modal.
type AssessmentDetailDTO struct {
	ActivityID      string        `json:"activity_id"`
	Title           string        `json:"title"`
	TimeLimitMins   int           `json:"time_limit_mins"`
	AttemptsAllowed int           `json:"attempts_allowed"`
	AttemptsUsed    int           `json:"attempts_used"`
	PassingScorePct int           `json:"passing_score_pct"`
	Questions       []QuestionDTO `json:"questions"`
}

// ── Request DTOs ──────────────────────────────────────────────────

type SubmitAssessmentRequest struct {
	ActivityID string        `json:"activity_id"`
	Answers    []AnswerInput `json:"answers"`
}

type AnswerInput struct {
	QuestionID string  `json:"question_id"`
	Index      *int    `json:"index,omitempty"` // mcq / true_false selection
	Text       *string `json:"text,omitempty"`  // open
}

// ── Response DTOs ─────────────────────────────────────────────────

// QuestionResultDTO echoes back one question WITH correctness — only ever
// returned after a submit, never before.
type QuestionResultDTO struct {
	ID            string   `json:"id"`
	Type          string   `json:"type"`
	Text          string   `json:"text"`
	Options       []string `json:"options,omitempty"`
	SelectedIndex *int     `json:"selected_index,omitempty"`
	SelectedText  *string  `json:"selected_text,omitempty"`
	CorrectIndex  *int     `json:"correct_index,omitempty"`
	CorrectText   *string  `json:"correct_text,omitempty"`
	IsCorrect     *bool    `json:"is_correct,omitempty"` // nil for "open" (ungraded)
	Points        int      `json:"points"`
	PointsEarned  int      `json:"points_earned"`
}

// AssessmentResultDTO is the scored outcome shown right after submit.
type AssessmentResultDTO struct {
	ActivityID    string              `json:"activity_id"`
	Title         string              `json:"title"`
	Score         float64             `json:"score"`
	MaxScore      float64             `json:"max_score"`
	ScorePct      float64             `json:"score_pct"`
	Passed        bool                `json:"passed"`
	AttemptNumber int                 `json:"attempt_number"`
	AttemptsLeft  int                 `json:"attempts_left"`
	Questions     []QuestionResultDTO `json:"questions"`
}
