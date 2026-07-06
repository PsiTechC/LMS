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
	// AssignRoleID (nullable) is a custom_roles id to attach to the invitee ON
	// ACCEPT via a role_assignments row. NULL = normal participant. Used by the
	// "Participant Retail" enroll variant. Inert until participants are cut over
	// to the resolver — the assignment is recorded but not enforced yet.
	AssignRoleID *uuid.UUID `gorm:"type:uuid;column:assign_role_id"`
}

func (Invitation) TableName() string { return "invitations" }
