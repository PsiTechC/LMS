package roles

import (
	"time"

	"github.com/google/uuid"
)

// CustomRole is an org-scoped (or platform-global when OrgID is nil) role that
// extends a base persona (BaseRole) with an explicit granular permission set.
type CustomRole struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID       *uuid.UUID `gorm:"type:uuid"`
	Name        string     `gorm:"type:text;not null"`
	Description string     `gorm:"type:text;not null;default:''"`
	BaseRole    string     `gorm:"type:user_role;not null;default:'participant'"`
	// Permissions is a JSONB array of "resource:action" strings, stored raw.
	Permissions string     `gorm:"type:jsonb;not null;default:'[]'"`
	IsSystem    bool       `gorm:"not null;default:false"`
	CreatedBy   *uuid.UUID `gorm:"type:uuid"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (CustomRole) TableName() string { return "custom_roles" }

// RoleAssignment binds a user to either a custom role (RoleID) or a bare base
// persona (BaseRole), optionally scoped to an org and/or program and optionally
// time-bound via ValidFrom / ValidUntil.
type RoleAssignment struct {
	ID         uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	UserID     uuid.UUID  `gorm:"type:uuid;not null"`
	RoleID     *uuid.UUID `gorm:"type:uuid"`
	BaseRole   *string    `gorm:"type:user_role"`
	OrgID      *uuid.UUID `gorm:"type:uuid"`
	ProgramID  *uuid.UUID `gorm:"type:uuid"`
	ValidFrom  *time.Time `gorm:"type:timestamptz"`
	ValidUntil *time.Time `gorm:"type:timestamptz"`
	AssignedBy *uuid.UUID `gorm:"type:uuid"`
	CreatedAt  time.Time
}

func (RoleAssignment) TableName() string { return "role_assignments" }

// OrgAccessRule holds the IP allowlist and geo-restriction configuration for a
// single organization. There is exactly one row per org.
type OrgAccessRule struct {
	ID               uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID            uuid.UUID  `gorm:"type:uuid;not null;uniqueIndex"`
	IPAllowlist      string     `gorm:"type:jsonb;not null;default:'[]'"` // JSONB array of CIDR/IP strings
	AllowedCountries string     `gorm:"type:jsonb;not null;default:'[]'"` // JSONB array of ISO alpha-2 codes
	BlockedCountries string     `gorm:"type:jsonb;not null;default:'[]'"` // JSONB array of ISO alpha-2 codes
	Enforce          bool       `gorm:"not null;default:false"`
	UpdatedBy        *uuid.UUID `gorm:"type:uuid"`
	UpdatedAt        time.Time
}

func (OrgAccessRule) TableName() string { return "org_access_rules" }
