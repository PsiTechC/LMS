package ai

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
)

const systemPromptHeader = `You are the participant's AI Learning Coach in a leadership development program.
Be warm, concise, and encouraging. Your job:
- Answer the participant's questions about their program and progress.
- Offer thoughtful reflection prompts that deepen their learning.
- Suggest resources ONLY from the "AVAILABLE RESOURCES" list below — never invent resources or links.
- Ground every answer in the participant's real context below; if you lack a detail, say so briefly.
Keep replies focused (a few short paragraphs or a tight list). Do not fabricate facts.

--- PARTICIPANT CONTEXT ---
`

func userName(userID string) string {
	var name string
	database.DB.Raw(`SELECT name FROM users WHERE id = ?::uuid`, userID).Scan(&name)
	return name
}

func conversationToDTO(c Conversation) ConversationDTO {
	d := ConversationDTO{
		ID:        c.ID.String(),
		Title:     c.Title,
		CreatedAt: c.CreatedAt.Format(time.RFC3339),
		UpdatedAt: c.UpdatedAt.Format(time.RFC3339),
	}
	if c.ProgramID != nil {
		d.ProgramID = c.ProgramID.String()
	}
	return d
}

func listConversationsService(userID string) ([]ConversationDTO, error) {
	rows, err := listConversations(userID)
	if err != nil {
		return nil, err
	}
	out := make([]ConversationDTO, 0, len(rows))
	for _, c := range rows {
		out = append(out, conversationToDTO(c))
	}
	return out, nil
}

func createConversationService(userID, programID string) (*ConversationDTO, error) {
	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil, errors.New("invalid user id")
	}
	c := &Conversation{UserID: uid}
	if org := orgIDForUser(userID); org != "" {
		if oid, e := uuid.Parse(org); e == nil {
			c.OrgID = &oid
		}
	}
	if programID != "" {
		if pid, e := uuid.Parse(programID); e == nil {
			c.ProgramID = &pid
		}
	}
	if err := createConversation(c); err != nil {
		return nil, err
	}
	dto := conversationToDTO(*c)
	return &dto, nil
}

func getConversationService(userID, convID string) (*ConversationDetailDTO, error) {
	c, err := getConversation(userID, convID)
	if err != nil {
		return nil, err
	}
	msgs, err := listMessages(convID)
	if err != nil {
		return nil, err
	}
	out := &ConversationDetailDTO{
		ID:        c.ID.String(),
		Title:     c.Title,
		Messages:  make([]MessageDTO, 0, len(msgs)),
		CreatedAt: c.CreatedAt.Format(time.RFC3339),
		UpdatedAt: c.UpdatedAt.Format(time.RFC3339),
	}
	if c.ProgramID != nil {
		out.ProgramID = c.ProgramID.String()
	}
	for _, m := range msgs {
		out.Messages = append(out.Messages, MessageDTO{ID: m.ID.String(), Role: m.Role, Content: m.Content, CreatedAt: m.CreatedAt.Format(time.RFC3339)})
	}
	return out, nil
}

// streamReplyService persists the user turn, builds a personalized prompt,
// streams the assistant reply (via onDelta), and persists the result.
func streamReplyService(ctx context.Context, userID, convID, userText string, onDelta func(string)) (string, error) {
	userText = strings.TrimSpace(userText)
	if userText == "" {
		return "", errors.New("message content is required")
	}
	conv, err := getConversation(userID, convID)
	if err != nil {
		return "", err
	}
	if _, err := addMessage(conv.ID, "user", userText); err != nil {
		return "", err
	}

	// Personalized system prompt.
	systemPrompt := systemPromptHeader + buildParticipantContext(userID, userName(userID))

	// Conversation history (cap to last 10 turns to bound the prompt).
	history, err := listMessages(convID)
	if err != nil {
		return "", err
	}
	if len(history) > 10 {
		history = history[len(history)-10:]
	}
	msgs := make([]ChatMessage, 0, len(history)+1)
	msgs = append(msgs, ChatMessage{Role: "system", Content: systemPrompt})
	for _, m := range history {
		msgs = append(msgs, ChatMessage{Role: m.Role, Content: m.Content})
	}

	full, err := ChatStream(ctx, msgs, onDelta)
	if err != nil {
		return "", err
	}

	if _, err := addMessage(conv.ID, "assistant", full); err != nil {
		return full, err
	}
	title := conv.Title
	if title == "" {
		title = userText
		if len(title) > 60 {
			title = title[:57] + "…"
		}
	}
	_ = touchConversation(conv.ID, title)
	return full, nil
}
