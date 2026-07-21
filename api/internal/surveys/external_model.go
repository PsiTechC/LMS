package surveys

import (
	"time"

	"github.com/google/uuid"
)

// SurveyExternalRespondent is a non-platform respondent (facilitator, manager,
// business sponsor, ...) invited to answer a survey's question set via a
// public token link instead of logging in. Mirrors feedback360.FeedbackRater:
// external people, name+email only, no users FK, the token is the only
// credential. Only created for activities whose SurveyConfig has
// ExternalLinkEnabled set.
type SurveyExternalRespondent struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ActivityID  uuid.UUID  `gorm:"type:uuid;not null"`
	Name        string     `gorm:"not null"`
	Email       string     `gorm:"not null"`
	RoleLabel   string     `gorm:"column:role_label;not null;default:''"` // free text, e.g. "Facilitator", "Manager", "Business Sponsor"
	Status      string     `gorm:"not null;default:pending"`              // pending | submitted
	InviteToken uuid.UUID  `gorm:"type:uuid;not null;default:uuid_generate_v4()"`
	RemindedAt  *time.Time `gorm:"column:reminded_at"`
	SubmittedAt *time.Time `gorm:"column:submitted_at"`
	CreatedAt   time.Time
}

func (SurveyExternalRespondent) TableName() string { return "survey_external_respondents" }
