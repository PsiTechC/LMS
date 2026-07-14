package faculty_management

import (
	"time"

	"github.com/google/uuid"
)

// FacultyProfile is the canonical, faculty-specific profile store. Arrays are
// stored as raw JSONB strings (marshalled in the service layer), matching the
// pattern used by the roles module. Also backs Coach profiles — the
// coaching-specific columns are populated only when the account was onboarded
// with target_role=coach, and are harmlessly zero-valued for faculty rows.
type FacultyProfile struct {
	ID                      uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	UserID                  uuid.UUID `gorm:"type:uuid;not null;uniqueIndex"`
	Specialization          string    `gorm:"type:text;not null;default:''"`
	Certifications          string    `gorm:"type:jsonb;not null;default:'[]'"` // JSONB array of strings
	Bio                     string    `gorm:"type:text;not null;default:''"`
	DeliveryModes           string    `gorm:"type:jsonb;not null;default:'[]'"` // JSONB array: virtual | in-person | hybrid
	Location                string    `gorm:"type:text;not null;default:''"`
	LinkedinURL             string    `gorm:"type:text;not null;default:''"`
	CoachingYearsExperience int       `gorm:"not null;default:0"`
	CoachingMethodology     string    `gorm:"type:text;not null;default:''"`
	MaxConcurrentCoachees   int       `gorm:"not null;default:0"`
	PreferredSessionMins    int       `gorm:"not null;default:0"`
	TimeZone                string    `gorm:"type:text;not null;default:''"`
	CreatedAt               time.Time
	UpdatedAt               time.Time
}

func (FacultyProfile) TableName() string { return "faculty_profiles" }

// OnboardingInvite tracks a faculty member's onboarding lifecycle.
type OnboardingInvite struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	FacultyUserID uuid.UUID  `gorm:"type:uuid;not null"`
	Status        string     `gorm:"type:text;not null;default:'pending'"` // pending | sent | accepted
	SentAt        *time.Time `gorm:"type:timestamptz"`
	AccessLevel   string     `gorm:"type:text;not null;default:'standard'"` // standard | advanced | admin
	CreatedBy     *uuid.UUID `gorm:"type:uuid"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func (OnboardingInvite) TableName() string { return "onboarding_invites" }
