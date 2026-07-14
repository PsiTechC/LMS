package ai

import (
	"errors"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("conversation not found")

// ── Conversations & messages ───────────────────────────────────────

func createConversation(c *Conversation) error {
	return database.DB.Create(c).Error
}

func listConversations(userID string) ([]Conversation, error) {
	var rows []Conversation
	err := database.DB.Where("user_id = ?", userID).Order("updated_at DESC").Find(&rows).Error
	return rows, err
}

// getConversation returns a conversation only if it belongs to the user.
func getConversation(userID, convID string) (*Conversation, error) {
	var c Conversation
	err := database.DB.Where("id = ? AND user_id = ?", convID, userID).First(&c).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &c, err
}

func listMessages(convID string) ([]Message, error) {
	var rows []Message
	err := database.DB.Where("conversation_id = ?", convID).Order("created_at ASC").Find(&rows).Error
	return rows, err
}

func addMessage(convID uuid.UUID, role, content string) (*Message, error) {
	m := &Message{ConversationID: convID, Role: role, Content: content}
	if err := database.DB.Create(m).Error; err != nil {
		return nil, err
	}
	return m, nil
}

func touchConversation(convID uuid.UUID, title string) error {
	updates := map[string]any{"updated_at": gorm.Expr("NOW()")}
	if title != "" {
		updates["title"] = title
	}
	return database.DB.Model(&Conversation{}).Where("id = ?", convID).Updates(updates).Error
}

func orgIDForUser(userID string) string {
	var orgID string
	database.DB.Raw(`SELECT org_id::text FROM org_members WHERE user_id = ?::uuid LIMIT 1`, userID).Scan(&orgID)
	return orgID
}

// orgFeatureEnabled reads organizations.feature_flags JSONB; a feature is on
// unless explicitly set to false (default-on when unset).
func orgFeatureEnabled(orgID, flag string) bool {
	var val *bool
	database.DB.Raw(`SELECT (feature_flags ->> ?)::boolean FROM organizations WHERE id = ?::uuid`, flag, orgID).Scan(&val)
	if val == nil {
		return true
	}
	return *val
}
