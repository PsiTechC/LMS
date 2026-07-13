package feedback360

// DTOs for the public, login-less rater form (/rater/{token}). Raters are
// EXTERNAL people, not platform users — nothing here exposes participant PII
// beyond a first name, and nothing requires an account.

// RaterFormV2DTO is what a rater sees when they open their token link. It is
// rendered entirely from the cycle's FROZEN snapshot, so re-editing the org's
// live competency framework never changes a form already sent out.
type RaterFormV2DTO struct {
	CycleName       string `json:"cycle_name"`
	OrgName         string `json:"org_name"`
	ParticipantName string `json:"participant_name"` // first name only
	Relationship    string `json:"relationship"`
	// ShowImportance is true only for manager / skip_level raters.
	ShowImportance   bool `json:"show_importance"`
	AlreadySubmitted bool `json:"already_submitted"`

	Competencies  []RaterCompetencyV2DTO `json:"competencies"`
	OpenQuestions []RaterOpenQuestionDTO `json:"open_questions"`
}

// RaterCompetencyV2DTO is one competency and the behavior statements a rater
// scores under it.
type RaterCompetencyV2DTO struct {
	CompetencyID string             `json:"competency_id"`
	Title        string             `json:"title"`
	Behaviors    []RaterBehaviorDTO `json:"behaviors"`
}

// The behavior statement IS the item a rater rates on the 1–5 scale.
type RaterBehaviorDTO struct {
	BehaviorID string `json:"behavior_id"` // feedback_cycle_behaviors.id
	Statement  string `json:"statement"`
	Mandatory  bool   `json:"mandatory"`
	SortOrder  int    `json:"sort_order"`
}

type RaterOpenQuestionDTO struct {
	QuestionID string `json:"question_id"` // feedback_cycle_open_questions.id
	Prompt     string `json:"prompt"`
	Mandatory  bool   `json:"mandatory"`
	SortOrder  int    `json:"sort_order"`
}

// ── Submission ────────────────────────────────────────────────────

type SubmitRaterFormRequest struct {
	Behaviors []BehaviorAnswer `json:"behaviors"`
	OpenAnswers []OpenAnswer   `json:"open_answers"`
}

// BehaviorAnswer is one behavior rating. When NotObserved is true the score is
// ignored (the rater picked "Unable to rate / Not observed").
type BehaviorAnswer struct {
	BehaviorID  string   `json:"behavior_id"`
	Score       *float64 `json:"score"`
	Importance  *int     `json:"importance"` // manager / skip_level only
	NotObserved bool     `json:"not_observed"`
}

type OpenAnswer struct {
	QuestionID string `json:"question_id"`
	AnswerText string `json:"answer_text"`
}
