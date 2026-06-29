package discussions

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type Thread struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	CohortID   uuid.UUID `gorm:"type:uuid;not null"`
	ProgramID  uuid.UUID `gorm:"type:uuid;not null"`
	AuthorID   uuid.UUID `gorm:"type:uuid;not null"`
	AuthorName string    `gorm:"not null"`
	Title      string    `gorm:"not null"`
	Body       string    `gorm:"not null"`
	Category   string    `gorm:"not null;default:'discussion'"`
	Tags       []byte    `gorm:"type:jsonb;default:'[]'"`
	IsPinned   bool      `gorm:"not null;default:false"`
	IsDeleted  bool      `gorm:"not null;default:false"`
	ReplyCount int       `gorm:"not null;default:0"`
	ViewCount  int       `gorm:"not null;default:0"`
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

func (Thread) TableName() string { return "threads" }

type ThreadReply struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ThreadID   uuid.UUID `gorm:"type:uuid;not null"`
	AuthorID   uuid.UUID `gorm:"type:uuid;not null"`
	AuthorName string    `gorm:"not null"`
	Body       string    `gorm:"not null"`
	IsDeleted  bool      `gorm:"not null;default:false"`
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

func (ThreadReply) TableName() string { return "thread_replies" }

type DirectMessage struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	CohortID    *uuid.UUID `gorm:"type:uuid"`
	SenderID    uuid.UUID  `gorm:"type:uuid;not null"`
	SenderName  string     `gorm:"not null"`
	RecipientID uuid.UUID  `gorm:"type:uuid;not null"`
	Body        string     `gorm:"not null"`
	IsRead      bool       `gorm:"not null;default:false"`
	CreatedAt   time.Time
}

func (DirectMessage) TableName() string { return "direct_messages" }

type Announcement struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	CohortID   uuid.UUID `gorm:"type:uuid;not null"`
	AuthorID   uuid.UUID `gorm:"type:uuid;not null"`
	AuthorName string    `gorm:"not null"`
	Title      string    `gorm:"not null"`
	Body       string    `gorm:"not null"`
	SendEmail  bool      `gorm:"not null;default:false"`
	CreatedAt  time.Time
	UpdatedAt  time.Time
}

func (Announcement) TableName() string { return "announcements" }

// parseTags unmarshals JSONB-stored tags into a string slice.
func parseTags(b []byte) []string {
	if len(b) == 0 {
		return []string{}
	}
	var tags []string
	if err := json.Unmarshal(b, &tags); err != nil {
		return []string{}
	}
	return tags
}

// marshalTags serialises a string slice to JSONB bytes.
func marshalTags(tags []string) []byte {
	if tags == nil {
		tags = []string{}
	}
	b, _ := json.Marshal(tags)
	return b
}