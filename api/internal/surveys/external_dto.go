package surveys

// DTOs for the external respondent flow: nominating/managing respondents
// (authenticated) and the public, login-less form itself (token-based).

// AddExternalRespondentRequest nominates one external respondent for a survey
// activity that has ExternalLinkEnabled in its config.
type AddExternalRespondentRequest struct {
	Name      string `json:"name"`
	Email     string `json:"email"`
	RoleLabel string `json:"role_label"` // free text, e.g. "Facilitator", "Manager", "Business Sponsor"
}

// ExternalRespondentDTO is one nominated respondent + their status.
type ExternalRespondentDTO struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Email       string  `json:"email"`
	RoleLabel   string  `json:"role_label"`
	Status      string  `json:"status"` // pending | submitted
	RemindedAt  *string `json:"reminded_at,omitempty"`
	SubmittedAt *string `json:"submitted_at,omitempty"`
}

// ── Public form (token-based) ──────────────────────────────────────

// ExternalFormDTO is what a respondent sees when they open their token link.
type ExternalFormDTO struct {
	Title            string        `json:"title"`
	RoleLabel        string        `json:"role_label"`
	AlreadySubmitted bool          `json:"already_submitted"`
	Questions        []QuestionDTO `json:"questions"`
}

// SubmitExternalRequest is a respondent submitting their answers.
type SubmitExternalRequest struct {
	Answers []AnswerInput `json:"answers"`
}
