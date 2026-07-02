package audit

import (
	"time"

	"github.com/google/uuid"
)

type AuditLog struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	UserID     uuid.UUID `gorm:"type:uuid;not null"`
	Action     string    `gorm:"not null"`
	Resource   string    `gorm:"not null"`
	ResourceID string    `gorm:"not null"`
	Changes    []byte    `gorm:"type:jsonb"`
	IPAddress  *string
	CreatedAt  time.Time
}

func (AuditLog) TableName() string { return "audit_logs" }

// AuditEvent is the central, cross-cutting audit record emitted by every module
// via audit.Log / audit.LogActor. ActorUserID and OrgID are nullable so
// anonymous or org-less flows (e.g. a failed login) can still be recorded.
type AuditEvent struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ActorUserID *uuid.UUID `gorm:"type:uuid"`
	ActorRole   *string    `gorm:"type:text"`
	OrgID       *uuid.UUID `gorm:"type:uuid"`
	Category    string     `gorm:"type:text;not null"`
	Action      string     `gorm:"type:text;not null"`
	TargetType  *string    `gorm:"type:text"`
	TargetID    *string    `gorm:"type:text"`
	Severity    string     `gorm:"type:text;not null;default:'info'"`
	Detail      []byte     `gorm:"type:jsonb;not null;default:'{}'"`
	CreatedAt   time.Time
}

func (AuditEvent) TableName() string { return "audit_events" }
