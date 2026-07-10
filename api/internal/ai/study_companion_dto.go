package ai

// StudyCompanionRequest asks for practice material generated from one
// activity's underlying content asset.
type StudyCompanionRequest struct {
	ActivityID string `json:"activity_id"`
	Mode       string `json:"mode"` // practice_questions | scenario_simulation | concept_explanation | summary
	Count      int    `json:"count,omitempty"`
}

// StudyCompanionQuestionDTO is one practice question with its model answer.
type StudyCompanionQuestionDTO struct {
	Question    string `json:"question"`
	ModelAnswer string `json:"model_answer"`
	Difficulty  string `json:"difficulty"`
}

// StudyCompanionScenarioDTO is one workplace scenario with suggested guidance.
type StudyCompanionScenarioDTO struct {
	Scenario   string `json:"scenario"`
	Guidance   string `json:"guidance"`
	Difficulty string `json:"difficulty"`
}

// StudyCompanionConceptDTO is one glossary-style reference entry.
type StudyCompanionConceptDTO struct {
	Term        string `json:"term"`
	Explanation string `json:"explanation"`
}

// StudyCompanionSummarySectionDTO is one section of a prose summary.
type StudyCompanionSummarySectionDTO struct {
	Heading string `json:"heading"`
	Body    string `json:"body"`
}

// StudyCompanionResponse is the generation result for one module. Exactly
// one of Questions/Scenarios/Concepts/Summary is populated, matching Mode —
// each mode has the shape that actually fits its content (Q&A pairs for
// practice/scenarios, reference entries for concepts, prose for summary).
type StudyCompanionResponse struct {
	ActivityID string                            `json:"activity_id"`
	Mode       string                            `json:"mode"`
	Questions  []StudyCompanionQuestionDTO       `json:"questions,omitempty"`
	Scenarios  []StudyCompanionScenarioDTO       `json:"scenarios,omitempty"`
	Concepts   []StudyCompanionConceptDTO        `json:"concepts,omitempty"`
	Summary    []StudyCompanionSummarySectionDTO `json:"summary,omitempty"`
}

// StudyCompanionAvailabilityResponse tells the frontend whether the
// companion has usable content for an activity, without generating anything
// (used to decide whether to show the button at all).
type StudyCompanionAvailabilityResponse struct {
	ActivityID string `json:"activity_id"`
	Available  bool   `json:"available"`
	Reason     string `json:"reason,omitempty"`
}
