package coaching

// AICoachConversationDTO is a coach-persona chat thread summary.
type AICoachConversationDTO struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// AICoachMessageDTO is one turn in a coach-persona conversation.
type AICoachMessageDTO struct {
	ID        string `json:"id"`
	Role      string `json:"role"` // user | assistant
	Content   string `json:"content"`
	CreatedAt string `json:"created_at"`
}

// AICoachConversationDetailDTO is a conversation plus its messages.
type AICoachConversationDetailDTO struct {
	ID        string              `json:"id"`
	Title     string              `json:"title"`
	Messages  []AICoachMessageDTO `json:"messages"`
	CreatedAt string              `json:"created_at"`
	UpdatedAt string              `json:"updated_at"`
}

// AISendMessageRequest is the body of the streaming message endpoint.
type AISendMessageRequest struct {
	Content string `json:"content"`
}
