package assessments

import (
	"time"

	"github.com/google/uuid"
)

// AssessmentAttempt is one participant's attempt at a quiz-backed assessment
// activity. Answers are stored as submitted (jsonb) so a later rescoring pass
// (e.g. a question edited after the fact) can recompute from raw data —
// scoring itself always happens server-side at submit time, never trusted
// from the client.
type AssessmentAttempt struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ActivityID    uuid.UUID `gorm:"type:uuid;not null"`
	ParticipantID uuid.UUID `gorm:"type:uuid;not null"`
	Answers       []byte    `gorm:"type:jsonb;not null;default:'[]'"`
	Score         float64   `gorm:"not null;default:0"` // points earned
	MaxScore      float64   `gorm:"not null;default:0"` // points possible
	ScorePct      float64   `gorm:"not null;default:0"` // score/max_score * 100
	Passed        bool      `gorm:"not null;default:false"`
	AttemptNumber int       `gorm:"not null;default:1"`
	SubmittedAt   time.Time `gorm:"not null;default:now()"`
}

func (AssessmentAttempt) TableName() string { return "assessment_attempts" }
