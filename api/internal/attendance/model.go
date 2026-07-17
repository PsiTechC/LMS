package attendance

import (
	"time"

	"github.com/google/uuid"
)

const (
	ModeVirtual  = "virtual"
	ModeInPerson = "in_person"

	StatusActive = "active"
	StatusEnded  = "ended"
)

// AttendanceSession is a single QR/code-based check-in window opened against
// a scheduled class_sessions row. OrgID is denormalized from the session's
// cohort/program (matching the payment_orders convention in
// internal/payments/model.go) so attendance queries can filter directly by
// org without a join.
type AttendanceSession struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID          uuid.UUID `gorm:"type:uuid;not null"`
	ClassSessionID uuid.UUID `gorm:"type:uuid;not null"`
	Mode           string    `gorm:"not null"`
	Code           string    `gorm:"not null;uniqueIndex"`
	Token          string    `gorm:"not null;uniqueIndex"`
	StartedAt      time.Time `gorm:"not null;default:now()"`
	EndedAt        *time.Time
	Status         string `gorm:"not null;default:active"`
}

func (AttendanceSession) TableName() string { return "attendance_sessions" }

// AttendanceRecord is one participant's scan against an AttendanceSession.
// The (attendance_session_id, participant_id) unique constraint makes a
// duplicate scan a safe no-op at the repository layer instead of an error.
type AttendanceRecord struct {
	ID                  uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	AttendanceSessionID uuid.UUID `gorm:"type:uuid;not null"`
	ParticipantID       uuid.UUID `gorm:"type:uuid;not null"`
	ScannedAt           time.Time `gorm:"not null;default:now()"`
}

func (AttendanceRecord) TableName() string { return "attendance_records" }
