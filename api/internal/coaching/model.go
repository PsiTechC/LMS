package coaching

import (
	"time"

	"github.com/google/uuid"
)

type CoachingNote struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	SessionID     uuid.UUID `gorm:"type:uuid;not null"`
	FacultyID     uuid.UUID `gorm:"type:uuid;not null"`
	ParticipantID uuid.UUID `gorm:"type:uuid;not null"`
	Notes         string    `gorm:"not null"`
	IsPrivate     bool      `gorm:"not null;default:false"`
	CreatedAt     time.Time `gorm:"not null;default:now()"`
	UpdatedAt     time.Time `gorm:"not null;default:now()"`
}

func (CoachingNote) TableName() string { return "coaching_notes" }

// TaggedParticipants is stored as a native UUID array in Postgres.
// GORM scans it via the pq.GenericArray driver.

// ParticipantGoal tracks a goal set for a participant by a faculty member.
type ParticipantGoal struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ParticipantID uuid.UUID `gorm:"type:uuid;not null"`
	FacultyID     uuid.UUID `gorm:"type:uuid;not null"`
	Title         string    `gorm:"not null"`
	Description   *string
	TargetDate    *time.Time `gorm:"type:date"`
	Status        string     `gorm:"not null;default:active"`
	PmCanView     bool       `gorm:"not null;default:false"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func (ParticipantGoal) TableName() string { return "participant_goals" }

// CoachingDevNote is a private development note per participant, separate from session notes.
type CoachingDevNote struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ParticipantID uuid.UUID `gorm:"type:uuid;not null"`
	FacultyID     uuid.UUID `gorm:"type:uuid;not null"`
	Content       string    `gorm:"not null"`
	PmCanView     bool      `gorm:"not null;default:false"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

func (CoachingDevNote) TableName() string { return "coaching_dev_notes" }

// CoachingParticipantRow is a projection used by the participants list query.
type CoachingParticipantRow struct {
	UserID    uuid.UUID `gorm:"column:user_id"`
	Name      string
	Email     string
	AvatarURL string `gorm:"column:avatar_url"`
}

// CoachingTrackerRow holds aggregated per-participant coaching stats.
type CoachingTrackerRow struct {
	ParticipantID   uuid.UUID `gorm:"column:participant_id"`
	SessionsDone    int64     `gorm:"column:sessions_done"`
	GoalsSet        int64     `gorm:"column:goals_set"`
	ActionsPending  int64     `gorm:"column:actions_pending"`
	ActionsTotal    int64     `gorm:"column:actions_total"`
	ActionsComplete int64     `gorm:"column:actions_complete"`
}

// CoachingEngagementRow is the PM admin assignment projection.
type CoachingEngagementRow struct {
	ID                uuid.UUID  `gorm:"column:id"`
	OrgID             uuid.UUID  `gorm:"column:org_id"`
	ProgramID         uuid.UUID  `gorm:"column:program_id"`
	ProgramTitle      string     `gorm:"column:program_title"`
	CohortID          *uuid.UUID `gorm:"column:cohort_id"`
	CohortName        *string    `gorm:"column:cohort_name"`
	CoachID           uuid.UUID  `gorm:"column:coach_id"`
	CoachName         string     `gorm:"column:coach_name"`
	AssignedByID      uuid.UUID  `gorm:"column:assigned_by_id"`
	AssignedByName    string     `gorm:"column:assigned_by_name"`
	AssignmentType    string     `gorm:"column:assignment_type"`
	Name              string     `gorm:"column:name"`
	Status            string     `gorm:"column:status"`
	StartDate         *time.Time `gorm:"column:start_date"`
	Frequency         string     `gorm:"column:frequency"`
	TotalSessions     int        `gorm:"column:total_sessions"`
	CompletedSessions int        `gorm:"column:completed_sessions"`
	GoalsJSON         string     `gorm:"column:goals_json"`
	CreatedAt         time.Time  `gorm:"column:created_at"`
	UpdatedAt         time.Time  `gorm:"column:updated_at"`
}

type CoachingEngagementParticipantRow struct {
	EngagementID uuid.UUID `gorm:"column:engagement_id"`
	UserID       uuid.UUID `gorm:"column:user_id"`
	Name         string    `gorm:"column:name"`
	Email        string    `gorm:"column:email"`
}
