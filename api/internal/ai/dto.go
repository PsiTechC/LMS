package ai

// ConversationDTO is a chat thread summary.
type ConversationDTO struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	ProgramID string `json:"program_id,omitempty"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

// MessageDTO is one turn in a conversation.
type MessageDTO struct {
	ID        string `json:"id"`
	Role      string `json:"role"` // user | assistant
	Content   string `json:"content"`
	CreatedAt string `json:"created_at"`
}

// ConversationDetailDTO is a conversation plus its messages.
type ConversationDetailDTO struct {
	ID        string       `json:"id"`
	Title     string       `json:"title"`
	ProgramID string       `json:"program_id,omitempty"`
	Messages  []MessageDTO `json:"messages"`
	CreatedAt string       `json:"created_at"`
	UpdatedAt string       `json:"updated_at"`
}

// CreateConversationRequest optionally scopes a new conversation to a program.
type CreateConversationRequest struct {
	ProgramID string `json:"program_id"`
}

// SendMessageRequest is the body of the streaming message endpoint.
type SendMessageRequest struct {
	Content string `json:"content"`
}
