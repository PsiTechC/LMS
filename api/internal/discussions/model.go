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
	IsFlagged  bool      `gorm:"not null;default:false"`
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

// DirectMessage is either a 1:1 message (RecipientID set, GroupID nil) or a
// group message (GroupID set, RecipientID the zero UUID) - never both, see
// sendDMService / sendGroupMessageService. ProgramID scopes 1:1 messages to
// the program the conversation is about (participant↔participant share a
// program; participant↔PM is scoped to that PM's program) - CohortID is kept
// only for the pre-existing single-cohort DM callers, ProgramID is the
// primary scope going forward since DMs are program-wide, not per-cohort.
type DirectMessage struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	CohortID    *uuid.UUID `gorm:"type:uuid"`
	ProgramID   *uuid.UUID `gorm:"type:uuid"`
	GroupID     *uuid.UUID `gorm:"type:uuid"`
	SenderID    uuid.UUID  `gorm:"type:uuid;not null"`
	SenderName  string     `gorm:"not null"`
	RecipientID uuid.UUID  `gorm:"type:uuid;not null"`
	Body        string     `gorm:"not null"`
	IsRead      bool       `gorm:"not null;default:false"`
	CreatedAt   time.Time
}

func (DirectMessage) TableName() string { return "direct_messages" }

// DMGroup is a participant-created group chat, scoped to one program. Only
// participants may be members (enforced in service.go, not by a DB
// constraint) - no faculty, no PM, matching the "no faculty in DMs" rule.
type DMGroup struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ProgramID uuid.UUID `gorm:"type:uuid;not null"`
	CreatedBy uuid.UUID `gorm:"type:uuid;not null"`
	Name      string    `gorm:"not null"`
	CreatedAt time.Time
}

func (DMGroup) TableName() string { return "dm_groups" }

type DMGroupMember struct {
	ID       uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	GroupID  uuid.UUID `gorm:"type:uuid;not null"`
	UserID   uuid.UUID `gorm:"type:uuid;not null"`
	UserName string    `gorm:"not null"`
	JoinedAt time.Time
}

func (DMGroupMember) TableName() string { return "dm_group_members" }

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