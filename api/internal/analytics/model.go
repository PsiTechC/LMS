package analytics

import (
	"time"

	"github.com/google/uuid"
)

type CohortCompetencyScore struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	CohortID       uuid.UUID `gorm:"type:uuid;not null"`
	CompetencyID   uuid.UUID `gorm:"type:uuid;not null"`
	PreProgramPct  float64   `gorm:"type:decimal(5,2);not null;default:0"`
	CurrentPct     float64   `gorm:"type:decimal(5,2);not null;default:0"`
	UpdatedAt      time.Time
}

func (CohortCompetencyScore) TableName() string { return "cohort_competency_scores" }
