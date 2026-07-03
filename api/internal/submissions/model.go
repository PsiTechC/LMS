package submissions

import (
	"time"

	"github.com/google/uuid"
)

type Submission struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ActivityID    uuid.UUID  `gorm:"type:uuid;not null"`
	ParticipantID uuid.UUID  `gorm:"type:uuid;not null"`
	Content       *string
	FileURL       *string
	Status        string     `gorm:"not null;default:'submitted'"`
	Grade         *float64   `gorm:"type:numeric(5,2)"`
	Feedback      *string
	GradedBy      *uuid.UUID `gorm:"type:uuid"`
	GradedAt      *time.Time
	SubmittedAt   time.Time  `gorm:"not null;default:now()"`
}

func (Submission) TableName() string { return "submissions" }
