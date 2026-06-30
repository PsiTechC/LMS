package sessions

import (
	"encoding/json"
	"time"

	"github.com/google/uuid"
)

type ClassSession struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ProgramID     uuid.UUID  `gorm:"type:uuid;not null"`
	CohortID      uuid.UUID  `gorm:"type:uuid;not null"`
	ActivityID    *uuid.UUID `gorm:"type:uuid"` // nullable — links to a live_session/coaching activity
	FacultyID     uuid.UUID  `gorm:"type:uuid;not null"`
	Title         string     `gorm:"not null"`
	Description   *string
	SessionType   string     `gorm:"not null;default:'classroom'"`
	VirtualLink   *string
	WhiteboardURL *string
	ScheduledAt   time.Time  `gorm:"not null"`
	DurationMins  int        `gorm:"not null;default:60"`
	Status        string     `gorm:"not null;default:'scheduled'"`
	Agenda        []byte     `gorm:"type:jsonb;default:'[]'"`
	Notes         *string
	StartedAt     *time.Time
	EndedAt       *time.Time
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func (ClassSession) TableName() string { return "class_sessions" }

// AgendaItem is a single time block in a session agenda (stored as JSONB array).
type AgendaItem struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	DurationMins int    `json:"duration_mins"`
	Type         string `json:"type"` // presentation|discussion|activity|break|poll
}

func parseAgenda(b []byte) []AgendaItem {
	if len(b) == 0 {
		return []AgendaItem{}
	}
	var items []AgendaItem
	if err := json.Unmarshal(b, &items); err != nil {
		return []AgendaItem{}
	}
	return items
}

type SessionMaterial struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	SessionID  uuid.UUID `gorm:"type:uuid;not null"`
	UploadedBy uuid.UUID `gorm:"type:uuid;not null"`
	Title      string    `gorm:"not null"`
	Type       string    `gorm:"not null"`
	URL        string    `gorm:"not null"`
	SizeBytes  *int64
	CreatedAt  time.Time
}

func (SessionMaterial) TableName() string { return "session_materials" }

type SessionAttendance struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	SessionID uuid.UUID `gorm:"type:uuid;not null"`
	UserID    uuid.UUID `gorm:"type:uuid;not null"`
	Status    string    `gorm:"not null;default:'present'"`
	MarkedAt  time.Time `gorm:"not null;default:now()"`
}

func (SessionAttendance) TableName() string { return "session_attendance" }

// SessionPoll represents a live poll created during a session.
type SessionPoll struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	SessionID uuid.UUID `gorm:"type:uuid;not null"`
	CreatedBy uuid.UUID `gorm:"type:uuid;not null"`
	Question  string    `gorm:"not null"`
	Options   []byte    `gorm:"type:jsonb;default:'[]'"`
	IsActive  bool      `gorm:"not null;default:false"`
	CreatedAt time.Time
}

func (SessionPoll) TableName() string { return "session_polls" }

func parsePollOptions(b []byte) []string {
	if len(b) == 0 {
		return []string{}
	}
	var opts []string
	if err := json.Unmarshal(b, &opts); err != nil {
		return []string{}
	}
	return opts
}

type SessionPollVote struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	PollID      uuid.UUID `gorm:"type:uuid;not null"`
	UserID      uuid.UUID `gorm:"type:uuid;not null"`
	OptionIndex int       `gorm:"not null"`
	VotedAt     time.Time `gorm:"not null;default:now()"`
}

func (SessionPollVote) TableName() string { return "session_poll_votes" }

// SessionActionItem is a post-session follow-up assigned to a participant or cohort.
type SessionActionItem struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	SessionID     uuid.UUID  `gorm:"type:uuid;not null"`
	ParticipantID *uuid.UUID `gorm:"type:uuid"`
	Description   string     `gorm:"not null"`
	DueDate       *time.Time `gorm:"type:date"`
	Status        string     `gorm:"not null;default:'open'"`
	CreatedBy     uuid.UUID  `gorm:"type:uuid;not null"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func (SessionActionItem) TableName() string { return "session_action_items" }
