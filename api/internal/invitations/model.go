package invitations

import (
	"time"

	"github.com/google/uuid"
)

type Invitation struct {
	ID         uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	CohortID   *uuid.UUID `gorm:"type:uuid"` // NULL for org-level faculty invites (no cohort)
	OrgID      uuid.UUID  `gorm:"type:uuid;not null"`
	Email      string     `gorm:"not null"`
	Role       string     `gorm:"type:org_member_role;not null;default:participant"`
	TokenHash  string     `gorm:"not null;uniqueIndex"`
	Status     string     `gorm:"type:invitation_status;not null;default:pending"`
	InvitedBy  uuid.UUID  `gorm:"type:uuid;not null"`
	ExpiresAt  time.Time  `gorm:"not null"`
	AcceptedAt *time.Time
	CreatedAt  time.Time
}

func (Invitation) TableName() string { return "invitations" }
