package surveys

// AdminSurveyDTO is one row of the superadmin cross-org survey list. All values
// are computed from real data (activities/programs/orgs + completions/responses).
type AdminSurveyDTO struct {
	ActivityID    string  `json:"activity_id"`
	Title         string  `json:"title"`
	Program       string  `json:"program"`
	ProgramID     string  `json:"program_id"`
	Org           string  `json:"org"`
	OrgID         string  `json:"org_id"`
	SurveyType    string  `json:"survey_type"` // pre | mid | post | pulse | session
	Responses     int     `json:"responses"`   // survey_completions count
	TotalEnrolled int     `json:"total_enrolled"`
	Faculty       int     `json:"faculty"`    // faculty enrolled in the program
	Cohorts       int     `json:"cohorts"`    // cohort count in the program
	Completion    int     `json:"completion"` // response rate % (responses/total_enrolled)
	AvgScore      float64 `json:"avg_score"`  // mean of numeric answers
	Status        string  `json:"status"`     // active | closed
	CloseDate     string  `json:"close_date,omitempty"`
}

// ── Results (superadmin View Results modal) ───────────────────────

// SurveyResultsDTO is the aggregated result set for one survey.
type SurveyResultsDTO struct {
	ActivityID    string           `json:"activity_id"`
	Title         string           `json:"title"`
	Program       string           `json:"program"`
	Org           string           `json:"org"`
	SurveyType    string           `json:"survey_type"`
	TotalEnrolled int              `json:"total_enrolled"`
	Responses     int              `json:"responses"`  // completions
	Completion    int              `json:"completion"` // response rate %
	Faculty       []string         `json:"faculty"`    // enrolled faculty names
	Roster        []RosterEntryDTO `json:"roster"`     // enrolled participants
	// ExternalRespondents lists nominated non-participant respondents
	// (facilitator/manager/business sponsor) and their status - empty when the
	// survey has no external link enabled. Their answers are already folded
	// into Questions[].* below alongside participant answers.
	ExternalRespondents []ExternalRespondentDTO `json:"external_respondents"`
	Questions           []QuestionResultDTO     `json:"questions"`
}

// RosterEntryDTO is one enrolled participant and whether they've responded.
type RosterEntryDTO struct {
	Name      string `json:"name"`
	Email     string `json:"email"`
	Cohort    string `json:"cohort"`
	Responded bool   `json:"responded"`
}

// QuestionResultDTO is one question's aggregated answers.
type QuestionResultDTO struct {
	ID            string       `json:"id"`
	Type          string       `json:"type"` // likert | nps | mcq | rating | open
	Text          string       `json:"text"`
	ResponseCount int          `json:"response_count"`
	Average       *float64     `json:"average,omitempty"`      // numeric types
	Distribution  []DistBucket `json:"distribution,omitempty"` // numeric + mcq
	TextAnswers   []string     `json:"text_answers,omitempty"` // open
}

// DistBucket is one bar of a distribution (a numeric value or an mcq option).
type DistBucket struct {
	Label string  `json:"label"`
	Value float64 `json:"value"`
	Count int     `json:"count"`
}

// RemindResponseDTO reports how many reminder notifications were sent.
type RemindResponseDTO struct {
	Sent int `json:"sent"`
}

// RemindSurveyRequest allows customizing the reminder notification.
type RemindSurveyRequest struct {
	Title *string `json:"title,omitempty"`
	Body  *string `json:"body,omitempty"`
}

// ── Request DTOs ──────────────────────────────────────────────────

// SetQuestionsRequest replaces the question set for a survey activity
// (PM/faculty authoring). Idempotent - replaces all existing questions.
type SetQuestionsRequest struct {
	Questions []QuestionInput `json:"questions"`
}

type QuestionInput struct {
	Type    string   `json:"type"` // likert | nps | mcq | rating | open
	Text    string   `json:"text"`
	Section string   `json:"section,omitempty"`
	Options []string `json:"options,omitempty"`
}

// SubmitSurveyRequest is a participant submitting their answers.
type SubmitSurveyRequest struct {
	ActivityID string        `json:"activity_id"`
	Answers    []AnswerInput `json:"answers"`
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
	Section string   `json:"section,omitempty"`
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
	OpenDate      *string `json:"open_date,omitempty"`
	DueDate       *string `json:"due_date,omitempty"`
	CompletedDate *string `json:"completed_date,omitempty"`
	// Level tags a Kirkpatrick L1-L4 feedback form ("l1".."l4"); empty for a
	// plain survey.
	Level string `json:"level,omitempty"`
	// ExternalLinkEnabled mirrors SurveyConfig.ExternalLinkEnabled - when true
	// the participant may nominate an external respondent (facilitator/
	// manager/business sponsor) for this activity.
	ExternalLinkEnabled bool `json:"external_link_enabled"`
	// Locked mirrors programs.ActivityDTO's module pre-work gate: a post-slot
	// survey is locked until every pre-slot sibling in its module is
	// complete (any activity type - see modulePreWorkDoneMap).
	Locked       bool   `json:"locked,omitempty"`
	LockedReason string `json:"locked_reason,omitempty"`
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
