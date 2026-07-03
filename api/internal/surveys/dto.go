package surveys

// ── Request DTOs ──────────────────────────────────────────────────

// SetQuestionsRequest replaces the question set for a survey activity
// (PM/faculty authoring). Idempotent — replaces all existing questions.
type SetQuestionsRequest struct {
	Questions []QuestionInput `json:"questions"`
}

type QuestionInput struct {
	Type    string   `json:"type"` // likert | nps | mcq | rating | open
	Text    string   `json:"text"`
	Options []string `json:"options,omitempty"`
}

// SubmitSurveyRequest is a participant submitting their answers.
type SubmitSurveyRequest struct {
	ActivityID string          `json:"activity_id"`
	Answers    []AnswerInput   `json:"answers"`
}

type AnswerInput struct {
	QuestionID string   `json:"question_id"`
	Num        *float64 `json:"num,omitempty"`  // likert/nps/rating/mcq-index
	Text       *string  `json:"text,omitempty"` // open
}

// ── Response DTOs ─────────────────────────────────────────────────

type QuestionDTO struct {
	ID      string   `json:"id"`
	Type    string   `json:"type"`
	Text    string   `json:"text"`
	Options []string `json:"options,omitempty"`
	// Answer echoes the participant's own prior answer (identified surveys only).
	AnswerNum  *float64 `json:"answer_num,omitempty"`
	AnswerText *string  `json:"answer_text,omitempty"`
}

// SurveyCardDTO is one survey in the participant's list.
type SurveyCardDTO struct {
	ActivityID    string  `json:"activity_id"`
	Title         string  `json:"title"`
	SurveyType    string  `json:"survey_type"` // pre | mid | post | pulse | session
	IsAnonymous   bool    `json:"is_anonymous"`
	TimeEstimate  int     `json:"time_estimate_mins"`
	QuestionCount int     `json:"question_count"`
	Status        string  `json:"status"` // completed | active | upcoming
	DueDate       *string `json:"due_date,omitempty"`
	CompletedDate *string `json:"completed_date,omitempty"`
}

type MySurveysDTO struct {
	HasProgram     bool            `json:"has_program"`
	Total          int             `json:"total"`
	Completed      int             `json:"completed"`
	ActionRequired int             `json:"action_required"`
	CompletionRate int             `json:"completion_rate"`
	Surveys        []SurveyCardDTO `json:"surveys"`
}

// SurveyDetailDTO is the full survey for the take-modal (with questions).
type SurveyDetailDTO struct {
	ActivityID   string        `json:"activity_id"`
	Title        string        `json:"title"`
	SurveyType   string        `json:"survey_type"`
	IsAnonymous  bool          `json:"is_anonymous"`
	TimeEstimate int           `json:"time_estimate_mins"`
	Completed    bool          `json:"completed"`
	Questions    []QuestionDTO `json:"questions"`
}
