package competencies

import (
	"time"

	"github.com/google/uuid"
)

type Competency struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID       uuid.UUID `gorm:"type:uuid;not null"`
	Title       string    `gorm:"not null"`
	Description *string
	Category    string    `gorm:"not null;default:leadership"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (Competency) TableName() string { return "competencies" }

// CompetencyBehavior is one behavior statement under a competency.
// The statement IS the question a rater answers. The legacy question_text /
// use_statement columns remain in the table but are no longer read or written.
type CompetencyBehavior struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	CompetencyID uuid.UUID `gorm:"type:uuid;not null"`
	Statement    string    `gorm:"not null"`
	// Mandatory drives whether a rater must answer this item (participant side).
	Mandatory bool `gorm:"not null"`
	SortOrder int  `gorm:"not null;default:0"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (CompetencyBehavior) TableName() string { return "competency_behaviors" }

type ActivityCompetency struct {
	ActivityID   uuid.UUID `gorm:"type:uuid;primaryKey"`
	CompetencyID uuid.UUID `gorm:"type:uuid;primaryKey"`
	Level        string    `gorm:"not null;default:intermediate"`
	CreatedAt    time.Time
}

func (ActivityCompetency) TableName() string { return "activity_competencies" }

type ProgramTemplate struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID         *uuid.UUID `gorm:"type:uuid"`
	Title         string    `gorm:"not null"`
	Description   *string
	Category      string    `gorm:"not null;default:leadership"`
	DurationWeeks int       `gorm:"not null;default:12"`
	StructureJSON []byte    `gorm:"type:jsonb;default:'{}'"`
	IsSystem      bool      `gorm:"not null;default:false"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func (ProgramTemplate) TableName() string { return "program_templates" }
