package coaching

import (
	"time"

	"github.com/google/uuid"
)

type CoachingNote struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	SessionID     uuid.UUID `gorm:"type:uuid;not null"`
	FacultyID     uuid.UUID `gorm:"type:uuid;not null"`
	ParticipantID uuid.UUID `gorm:"type:uuid;not null"`
	Notes         string    `gorm:"not null"`
	IsPrivate     bool      `gorm:"not null;default:false"`
	CreatedAt     time.Time `gorm:"not null;default:now()"`
	UpdatedAt     time.Time `gorm:"not null;default:now()"`
}

func (CoachingNote) TableName() string { return "coaching_notes" }
