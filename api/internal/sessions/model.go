package sessions

import (
	"time"

	"github.com/google/uuid"
)

type ClassSession struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ProgramID    uuid.UUID `gorm:"type:uuid;not null"`
	CohortID     uuid.UUID `gorm:"type:uuid;not null"`
	FacultyID    uuid.UUID `gorm:"type:uuid;not null"`
	Title        string    `gorm:"not null"`
	Description  *string
	SessionType  string    `gorm:"not null;default:'classroom'"`
	VirtualLink  *string
	ScheduledAt  time.Time `gorm:"not null"`
	DurationMins int       `gorm:"not null;default:60"`
	Status       string    `gorm:"not null;default:'scheduled'"`
	Agenda       []byte    `gorm:"type:jsonb;default:'{}'"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (ClassSession) TableName() string { return "class_sessions" }

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
