package compliance

import (
	"time"

	"github.com/google/uuid"
)

// CompletionGate enforces mandatory activity prerequisites within a program.
// A learner cannot access ActivityID until PrereqActivityID is completed.
type CompletionGate struct {
	ID               uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID            uuid.UUID `gorm:"type:uuid;not null"`
	ProgramID        uuid.UUID `gorm:"type:uuid;not null"`
	ActivityID       uuid.UUID `gorm:"type:uuid;not null"`       // the locked activity
	PrereqActivityID uuid.UUID `gorm:"type:uuid;not null"`       // must complete first
	EscalationEmail  string    `gorm:"type:text"`                // email for escalation alerts
	EscalationDays   int       `gorm:"default:3"`                // days overdue before escalating
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

func (CompletionGate) TableName() string { return "completion_gates" }

// DataRetentionPolicy defines per-program data lifespan settings
// controlling how long different categories of data are retained.
type DataRetentionPolicy struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID           uuid.UUID `gorm:"type:uuid;not null"`
	ProgramID       uuid.UUID `gorm:"type:uuid;not null;uniqueIndex"`
	SubmissionsDays int       `gorm:"default:365"` // retention for assessment submissions
	RecordingsDays  int       `gorm:"default:90"`  // retention for session recordings
	ChatLogsDays    int       `gorm:"default:30"`  // retention for AI coach chat logs
	UpdatedAt       time.Time
	UpdatedBy       uuid.UUID `gorm:"type:uuid"`
}

func (DataRetentionPolicy) TableName() string { return "data_retention_policies" }

// GDPRAcknowledgement records when a program manager explicitly acknowledged
// a GDPR warning before performing a sensitive data operation.
type GDPRAcknowledgement struct {
	ID      uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	UserID  uuid.UUID `gorm:"type:uuid;not null"`
	Context string    `gorm:"not null"` // e.g. "export:attendance", "edit:pii_field"
	AckedAt time.Time
}

func (GDPRAcknowledgement) TableName() string { return "gdpr_acknowledgements" }
