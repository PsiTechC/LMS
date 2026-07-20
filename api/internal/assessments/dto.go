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
	PendingReview   bool     `json:"pending_review"` // an attempt awaits faculty grading of open questions
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

// AssessmentStatusDTO is a lightweight, type-agnostic "where do I stand on
// this quiz" summary - unlike AssessmentDetailDTO (which 404s/errors once
// attempts are exhausted, since it's built for taking the quiz) this always
// resolves as long as the caller is enrolled, so it works for an attached
// Knowledge Check on a content/case_study/video/PDF activity to show its
// latest result after attempts run out.
type AssessmentStatusDTO struct {
	ActivityID      string   `json:"activity_id"`
	AttemptsAllowed int      `json:"attempts_allowed"`
	AttemptsUsed    int      `json:"attempts_used"`
	BestScorePct    *float64 `json:"best_score_pct,omitempty"`
	Passed          *bool    `json:"passed,omitempty"`
	PendingReview   bool     `json:"pending_review"` // latest/any attempt awaits faculty grading
	LastStatus      string   `json:"last_status,omitempty"` // auto_scored | pending_review | graded - of the most recent attempt
}

// QuestionDTO is a question WITHOUT its correct answer - this is the only
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

// AssessmentDetailDTO is the full quiz for the take-modal. When TimeLimitMins
// > 0 the assessment is timed: StartedAt anchors the countdown server-side
// (stable across refresh) and ServerNow lets the client compute remaining time
// without trusting its own clock. Both are "" for untimed assessments.
type AssessmentDetailDTO struct {
	ActivityID      string        `json:"activity_id"`
	Title           string        `json:"title"`
	TimeLimitMins   int           `json:"time_limit_mins"`
	AttemptsAllowed int           `json:"attempts_allowed"`
	AttemptsUsed    int           `json:"attempts_used"`
	PassingScorePct int           `json:"passing_score_pct"`
	StartedAt       string        `json:"started_at,omitempty"` // RFC3339, timed only
	ServerNow       string        `json:"server_now,omitempty"` // RFC3339, timed only
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
	// Matches maps each left item (by its zero-based position in the question's
	// match_pairs) to the right-item text the participant paired it with. A pair
	// is correct when the chosen right text equals that pair's authored Right.
	Matches map[string]string `json:"matches,omitempty"` // matching: "leftIndex" -> chosen right text
}

// ── Response DTOs ─────────────────────────────────────────────────

// QuestionResultDTO echoes back one question WITH correctness - only ever
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

// ── Faculty grading DTOs ──────────────────────────────────────────

// GradingQueueItemDTO is one attempt in the faculty grading queue.
type GradingQueueItemDTO struct {
	AttemptID     string  `json:"attempt_id"`
	ActivityID    string  `json:"activity_id"`
	ActivityTitle string  `json:"activity_title"`
	ActivityType  string  `json:"activity_type"`
	ParticipantID string  `json:"participant_id"`
	Participant   string  `json:"participant"`
	ProgramID     string  `json:"program_id"`
	Program       string  `json:"program"`
	OrgID         string  `json:"org_id"`
	SubmittedAt   string  `json:"submitted_at"` // RFC3339
	Status        string  `json:"status"`
	ScorePct      float64 `json:"score_pct"` // objective-only until graded
}

// GradingDetailDTO is the full attempt a faculty member grades: every question
// with the participant's answer, objective ones pre-scored and locked, open
// ones awaiting a faculty award.
type GradingDetailDTO struct {
	AttemptID      string                 `json:"attempt_id"`
	ActivityID     string                 `json:"activity_id"`
	ActivityTitle  string                 `json:"activity_title"`
	Participant    string                 `json:"participant"`
	Status         string                 `json:"status"`
	Score          float64                `json:"score"`      // current best-known earned
	MaxScore       float64                `json:"max_score"`  // total possible (incl. open)
	ScorePct       float64                `json:"score_pct"`  // current
	FacultyComment *string                `json:"faculty_comment,omitempty"`
	Questions      []GradingQuestionDTO   `json:"questions"`
}

// GradingQuestionDTO is one question in the grading view. For objective
// questions IsObjective=true and PointsEarned/IsCorrect are read-only. For
// open questions the faculty enters PointsEarned (0..Points) and a comment.
type GradingQuestionDTO struct {
	ID            string   `json:"id"`
	Type          string   `json:"type"`
	Text          string   `json:"text"`
	Points        int      `json:"points"`
	IsObjective   bool     `json:"is_objective"`
	Options       []string `json:"options,omitempty"`
	SelectedIndex *int     `json:"selected_index,omitempty"`
	CorrectIndex  *int     `json:"correct_index,omitempty"`
	SelectedText  *string  `json:"selected_text,omitempty"` // open answer
	IsCorrect     *bool    `json:"is_correct,omitempty"`    // objective only
	PointsEarned  float64  `json:"points_earned"`           // auto for objective, faculty for open
	Comment       string   `json:"comment,omitempty"`       // faculty per-question comment (open)
}

// GradeAttemptRequest is the faculty's grading submission: a per-open-question
// award plus an optional overall comment. Objective questions are not included
// (they're locked server-side).
type GradeAttemptRequest struct {
	Scores  []GradeQuestionInput `json:"scores"`
	Comment string               `json:"comment"`
}

type GradeQuestionInput struct {
	QuestionID   string  `json:"question_id"`
	PointsEarned float64 `json:"points_earned"`
	Comment      string  `json:"comment,omitempty"`
}

// AssessmentResultDTO is the scored outcome shown right after submit.
// When Status is "pending_review" the assessment contains open-ended
// questions awaiting faculty grading - Score/ScorePct reflect the objective
// portion only and are non-final until Status becomes "graded".
type AssessmentResultDTO struct {
	ActivityID    string              `json:"activity_id"`
	Title         string              `json:"title"`
	Score         float64             `json:"score"`
	MaxScore      float64             `json:"max_score"`
	ScorePct      float64             `json:"score_pct"`
	Passed        bool                `json:"passed"`
	Status        string              `json:"status"` // auto_scored | pending_review | graded
	TimedOut      bool                `json:"timed_out"`
	AttemptNumber int                 `json:"attempt_number"`
	AttemptsLeft  int                 `json:"attempts_left"`
	Questions     []QuestionResultDTO `json:"questions"`
}
