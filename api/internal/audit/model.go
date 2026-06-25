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
