package ai

import (
	"time"

	"github.com/google/uuid"
)

// Conversation is a chat thread between a participant and the AI Learning Coach.
type Conversation struct {
	ID        uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	UserID    uuid.UUID  `gorm:"type:uuid;not null"`
	OrgID     *uuid.UUID `gorm:"type:uuid"`
	ProgramID *uuid.UUID `gorm:"type:uuid"`
	Title     string     `gorm:"not null;default:''"`
	CreatedAt time.Time  `gorm:"not null;default:now()"`
	UpdatedAt time.Time  `gorm:"not null;default:now()"`
}

func (Conversation) TableName() string { return "ai_conversations" }

// Message is a single turn in a conversation (user or assistant).
type Message struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ConversationID uuid.UUID `gorm:"type:uuid;not null"`
	Role           string    `gorm:"not null"` // user | assistant
	Content        string    `gorm:"not null"`
	CreatedAt      time.Time `gorm:"not null;default:now()"`
}

func (Message) TableName() string { return "ai_messages" }
