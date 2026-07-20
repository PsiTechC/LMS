package content

// ── AI quiz/survey generation DTOs ──────────────────────────────────
// Stateless request/response shapes for the AI draft-generation endpoint.
// Nothing here is persisted - the frontend takes the draft, lets the user
// review/edit it, then calls the normal create-asset endpoint to save it.

type AIChatTurn struct {
	Role    string `json:"role"` // user | assistant
	Content string `json:"content"`
}

type AIQuizGenerateRequest struct {
	Prompt        string       `json:"prompt"`
	AssetType     string       `json:"asset_type"` // quiz | survey | l1_reaction | l2_learning | l3_behaviour | l4_impact
	ExistingDraft *QuestionSet `json:"existing_draft,omitempty"`
	ExistingTitle *string      `json:"existing_title,omitempty"`
	ChatHistory   []AIChatTurn `json:"chat_history,omitempty"`
}

type AIQuizGenerateResponse struct {
	Title            string      `json:"title"`
	Description      string      `json:"description"`
	QuestionSet      QuestionSet `json:"question_set"`
	AssistantMessage string      `json:"assistant_message"`
}
