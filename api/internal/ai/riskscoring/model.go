package riskscoring

import (
	"time"

	"github.com/google/uuid"
)

// Score is a computed risk assessment for one subject (a participant) at a
// point in time. Faculty's At-Risk Learner Alerts and PM's Dropout
// Prediction Model both read this same table — one scoped to a single
// subject, the other aggregated across a cohort/program.
type Score struct {
	ID         uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID      *uuid.UUID `gorm:"type:uuid"`
	ProgramID  *uuid.UUID `gorm:"type:uuid"`
	SubjectID  uuid.UUID  `gorm:"type:uuid;not null"` // participant user_id
	Score      float64    `gorm:"not null"`           // 0-100, higher = more at risk
	Level      string     `gorm:"not null"`           // low | medium | high
	Reasons    string     `gorm:"not null;default:''"` // human-readable explanation, semicolon separated
	ComputedAt time.Time  `gorm:"not null;default:now()"`
}

func (Score) TableName() string { return "ai_risk_scores" }
