package feedback360

import (
	"time"

	"github.com/google/uuid"
)

// FeedbackCycle is one 360° round for a participant. Program/cohort are optional
// so a cycle can be program-driven (Phase 2 baseline / Phase 7 end) or
// self-initiated by the participant. created_by keeps room for PM/SuperAdmin to
// create/assign cycles later without a schema change.
type FeedbackCycle struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID         uuid.UUID  `gorm:"type:uuid;not null"`
	ParticipantID uuid.UUID  `gorm:"type:uuid;not null"`
	ProgramID     *uuid.UUID `gorm:"type:uuid"`
	CohortID      *uuid.UUID `gorm:"type:uuid"`
	CreatedBy     uuid.UUID  `gorm:"type:uuid;not null"`
	Title         string     `gorm:"not null;default:360° Feedback"`
	CycleType     string     `gorm:"not null;default:baseline"` // baseline | mid | end | custom
	Status        string     `gorm:"not null;default:open"`     // draft | open | closed
	Deadline      *time.Time `gorm:"type:date"`
	AISummary     *string    `gorm:"column:ai_summary"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func (FeedbackCycle) TableName() string { return "feedback_cycles" }

// FeedbackCycleCompetency links a cycle to an org competency it rates.
type FeedbackCycleCompetency struct {
	CycleID      uuid.UUID `gorm:"type:uuid;primaryKey"`
	CompetencyID uuid.UUID `gorm:"type:uuid;primaryKey"`
	SortOrder    int       `gorm:"not null;default:0"`
}

func (FeedbackCycleCompetency) TableName() string { return "feedback_cycle_competencies" }

// FeedbackRater is a nominated rater. relationship 'self' is the participant's
// own self-rating. InviteToken drives the login-less rater form.
type FeedbackRater struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	CycleID      uuid.UUID  `gorm:"type:uuid;not null"`
	Name         string     `gorm:"not null"`
	Email        string     `gorm:"not null"`
	Relationship string     `gorm:"not null;default:peer"` // self | manager | peer | direct_report | skip_level
	Status       string     `gorm:"not null;default:pending"`
	InviteToken  uuid.UUID  `gorm:"type:uuid;not null;default:uuid_generate_v4()"`
	RemindedAt   *time.Time `gorm:"column:reminded_at"`
	SubmittedAt  *time.Time `gorm:"column:submitted_at"`
	CreatedAt    time.Time
}

func (FeedbackRater) TableName() string { return "feedback_raters" }

// FeedbackResponse is one competency score (0-5) from one rater.
type FeedbackResponse struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	RaterID      uuid.UUID `gorm:"type:uuid;not null"`
	CompetencyID uuid.UUID `gorm:"type:uuid;not null"`
	Score        float64   `gorm:"type:numeric(3,1);not null"`
	Comment      *string
	CreatedAt    time.Time
}

func (FeedbackResponse) TableName() string { return "feedback_responses" }
