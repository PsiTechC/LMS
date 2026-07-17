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
	// BaseRole is the persona whose permissions are inherited, or "none" for no
	// inheritance. Stored as TEXT (not the user_role enum) to allow "none".
	BaseRole string `gorm:"type:text;not null;default:'participant'"`
	// Color is a display accent for the role chip in the UI.
	Color string `gorm:"type:text;not null;default:'#C8A860'"`
	// Permissions is a JSONB array of "resource:action" strings, stored raw.
	Permissions string     `gorm:"type:jsonb;not null;default:'[]'"`
	IsSystem    bool       `gorm:"not null;default:false"`
	// OwnerUserID marks this role as a PERSONAL, per-account role created by
	// the Members-tab "Edit Permissions" flow — never shown in the shared
	// Roles table / Role Management catalog, never assignable to anyone else.
	// nil for every ordinary shared/system custom role.
	OwnerUserID *uuid.UUID `gorm:"type:uuid"`
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
	// IsPrimaryPM is the single source of truth for "is this account the
	// org's Primary PM" (api/migrations/000041) — set explicitly by
	// createOrgService and the assignment services below, never re-derived
	// from role names or permission sets elsewhere.
	IsPrimaryPM bool `gorm:"column:is_primary_pm;default:false"`
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
