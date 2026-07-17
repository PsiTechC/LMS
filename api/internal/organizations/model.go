package organizations

import (
	"time"

	"github.com/google/uuid"
)

type Organization struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	Name         string    `gorm:"not null"`
	Slug         string    `gorm:"uniqueIndex;not null"`
	LogoURL      *string
	Plan         string `gorm:"type:org_plan;not null;default:starter"`
	Status       string `gorm:"type:org_status;not null;default:onboarding"`
	Seats        int    `gorm:"not null;default:50"`
	Industry     *string
	Size         *string
	FeatureFlags []byte `gorm:"type:jsonb;default:'{}'"`
	Settings     []byte `gorm:"type:jsonb;default:'{}'"`
	// Billing/contract fields (api/internal/billing consumes these read-only
	// via the Billing page's Organizations table; editing goes through the
	// existing PATCH /organizations/:id, same as every other org field).
	PlanStartDate *time.Time `gorm:"type:date"`
	PlanEndDate   *time.Time `gorm:"type:date"`
	BillingNote   *string    `gorm:"type:text"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func (Organization) TableName() string { return "organizations" }

type OrgMember struct {
	ID       uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID    uuid.UUID `gorm:"type:uuid;not null"`
	UserID   uuid.UUID `gorm:"type:uuid;not null"`
	Role     string    `gorm:"type:org_member_role;not null;default:participant"`
	JoinedAt time.Time
}

func (OrgMember) TableName() string { return "org_members" }
