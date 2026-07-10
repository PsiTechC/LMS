package feedback360

import (
	"time"

	"github.com/google/uuid"
)

// FeedbackCycle is one 360° round. Two flavours share this table:
//
//   - Participant-initiated (legacy): ParticipantID is set, one participant per
//     cycle, Status uses draft/open/closed. Untouched by the admin build.
//   - Admin-initiated: ParticipantID is NULL; the cycle carries a Name, an
//     org_id, an initiated_by identity, an admin Status lifecycle
//     (draft → configuring → locked → active → completed), and many participants
//     via feedback_cycle_participants. Locking snapshots the framework so later
//     edits to the org's live competencies don't mutate an already-locked cycle.
//
// Status is intentionally a plain string (not a hardcoded-irreversible flag) so a
// future "reopen for edit" admin action is an additive status transition.
type FeedbackCycle struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID         uuid.UUID  `gorm:"type:uuid;not null"`
	ParticipantID *uuid.UUID `gorm:"type:uuid"` // nullable: admin cycles have no single participant
	ProgramID     *uuid.UUID `gorm:"type:uuid"`
	CohortID      *uuid.UUID `gorm:"type:uuid"`
	CreatedBy     uuid.UUID  `gorm:"type:uuid;not null"`
	Title         string     `gorm:"not null;default:360° Feedback"`
	Name          *string    `gorm:"column:name"` // admin cycle name, e.g. "Q3 2026 Leadership 360"
	CycleType     string     `gorm:"not null;default:baseline"`
	Status        string     `gorm:"not null;default:open"`
	// Admin-flow provenance.
	InitiatedByUserID *uuid.UUID `gorm:"type:uuid;column:initiated_by_user_id"`
	InitiatedByRole   *string    `gorm:"column:initiated_by_role"` // superadmin | program_manager
	LockedAt          *time.Time `gorm:"column:locked_at"`
	Deadline          *time.Time `gorm:"type:date"`
	AISummary         *string    `gorm:"column:ai_summary"`
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

func (FeedbackCycle) TableName() string { return "feedback_cycles" }

// FeedbackQuorumConfig is the per-cycle minimum-response config for the admin
// flow. self is fixed at 1 and not stored. Set by whoever configures the cycle
// (Superadmin or Program Manager — same access, no tiering).
type FeedbackQuorumConfig struct {
	CycleID      uuid.UUID `gorm:"type:uuid;primaryKey"`
	SkipManager  int       `gorm:"not null;default:0"`
	Manager      int       `gorm:"not null;default:1"`
	Peer         int       `gorm:"not null;default:2"`
	DirectReport int       `gorm:"not null;default:1"`
	Others       int       `gorm:"not null;default:0"`
	// OthersLabel names the "Others" category for participants (e.g. "Customers").
	// One shared label for the whole category, not one per nominated rater.
	OthersLabel *string `gorm:"column:others_label"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (FeedbackQuorumConfig) TableName() string { return "feedback_quorum_config" }

// FeedbackOrgQuorumDefault stores the org's most recently used quorum values, as
// a convenience pre-fill for new cycles. Not an enforced floor — just a starting
// point.
type FeedbackOrgQuorumDefault struct {
	OrgID        uuid.UUID `gorm:"type:uuid;primaryKey"`
	SkipManager  int       `gorm:"not null;default:0"`
	Manager      int       `gorm:"not null;default:1"`
	Peer         int       `gorm:"not null;default:2"`
	DirectReport int       `gorm:"not null;default:1"`
	Others       int       `gorm:"not null;default:0"`
	OthersLabel  *string   `gorm:"column:others_label"`
	UpdatedAt    time.Time
}

func (FeedbackOrgQuorumDefault) TableName() string { return "feedback_org_quorum_defaults" }

// FeedbackCycleParticipant is one participant assigned to an admin-initiated
// cycle. program_id/cohort_id are denormalized snapshots at assignment time (for
// filtering/reporting); the cycle itself is NOT tied to one program.
type FeedbackCycleParticipant struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	CycleID       uuid.UUID  `gorm:"type:uuid;not null"`
	ParticipantID uuid.UUID  `gorm:"type:uuid;not null"`
	ProgramID     *uuid.UUID `gorm:"type:uuid"`
	CohortID      *uuid.UUID `gorm:"type:uuid"`
	Status        string     `gorm:"not null;default:assigned"` // assigned | invited | in_progress | completed
	AddedAt       time.Time  `gorm:"column:added_at"`
	InvitedAt     *time.Time `gorm:"column:invited_at"`
	RemindedAt    *time.Time `gorm:"column:reminded_at"`
	CompletedAt   *time.Time `gorm:"column:completed_at"`
}

func (FeedbackCycleParticipant) TableName() string { return "feedback_cycle_participants" }

// FeedbackCycleCompetency links a cycle to an org competency it rates.
type FeedbackCycleCompetency struct {
	CycleID      uuid.UUID `gorm:"type:uuid;primaryKey"`
	CompetencyID uuid.UUID `gorm:"type:uuid;primaryKey"`
	SortOrder    int       `gorm:"not null;default:0"`
}

func (FeedbackCycleCompetency) TableName() string { return "feedback_cycle_competencies" }

// FeedbackCycleBehavior is a point-in-time snapshot of one behavior statement,
// frozen into the config at lock time. The statement IS the item a rater rates.
// Later edits to the org's live competency_behaviors do NOT retroactively change
// a locked configuration. (The legacy question_text column is no longer written.)
type FeedbackCycleBehavior struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	CycleID         uuid.UUID `gorm:"type:uuid;not null"`
	CompetencyID    uuid.UUID `gorm:"type:uuid;not null"`
	CompetencyTitle string    `gorm:"column:competency_title"`
	Statement       string    `gorm:"not null"`
	Mandatory       bool      `gorm:"not null;default:true"`
	SortOrder       int       `gorm:"not null;default:0"`
}

func (FeedbackCycleBehavior) TableName() string { return "feedback_cycle_behaviors" }

// FeedbackCycleOpenQuestion is one of the cycle's free-text questions, asked once
// at the end of the rater form (after all competencies). Exactly three slots are
// configured in the wizard; each carries its own prompt and mandatory flag.
// No GORM `default:` tag on Mandatory — it would make GORM substitute the column
// default whenever the Go value is false.
type FeedbackCycleOpenQuestion struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	CycleID   uuid.UUID `gorm:"type:uuid;not null"`
	Prompt    string    `gorm:"not null"`
	Mandatory bool      `gorm:"not null"`
	SortOrder int       `gorm:"not null;default:0"`
}

func (FeedbackCycleOpenQuestion) TableName() string { return "feedback_cycle_open_questions" }

// FeedbackOrgOpenQuestionDefault remembers an org's most recently used open-question
// prompts so a new cycle pre-fills them. A convenience starting point, not a floor.
type FeedbackOrgOpenQuestionDefault struct {
	OrgID     uuid.UUID `gorm:"type:uuid;primaryKey"`
	SortOrder int       `gorm:"primaryKey"`
	Prompt    string    `gorm:"not null"`
	Mandatory bool      `gorm:"not null"`
	UpdatedAt time.Time
}

func (FeedbackOrgOpenQuestionDefault) TableName() string { return "feedback_org_open_question_defaults" }

// FeedbackRater is a nominated rater. relationship 'self' is the participant's
// own self-rating. InviteToken drives the login-less rater form.
//
// Raters are EXTERNAL people, not platform users: only name+email are stored,
// there is no users FK, and they are never issued an account or an in-app
// notification. Their only entry point is the emailed /rater/{token} link.
//
// ParticipantID scopes the rater to one person within a cycle — an admin cycle
// has many participants, each nominating their own raters.
type FeedbackRater struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	CycleID       uuid.UUID  `gorm:"type:uuid;not null"`
	ParticipantID *uuid.UUID `gorm:"type:uuid"` // nil on legacy self-initiated cycles
	Name          string     `gorm:"not null"`
	Email         string     `gorm:"not null"`
	// self | manager | peer | direct_report | skip_level | others
	Relationship string     `gorm:"not null;default:peer"`
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

// FeedbackBehaviorResponse is one rater's answer to ONE behavior statement from
// the cycle's frozen snapshot. This is the real unit of a 360 rating; a
// competency's score is the average of its behaviors.
//
//   - Score is 1–5. When NotObserved is true the rater chose
//     "Unable to rate / Not observed" and Score is nil — such rows are excluded
//     from every average rather than counted as zero.
//   - Importance (1–5) is only collected from Manager and Skip-Manager raters;
//     nil for every other category.
//
// No GORM `default:` tag on NotObserved — a default tag makes GORM substitute
// the column default whenever the Go value is false.
type FeedbackBehaviorResponse struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	RaterID         uuid.UUID `gorm:"type:uuid;not null"`
	CycleBehaviorID uuid.UUID `gorm:"type:uuid;not null;column:cycle_behavior_id"`
	CompetencyID    uuid.UUID `gorm:"type:uuid;not null"` // denormalized for fast roll-up
	Score           *float64  `gorm:"type:numeric(3,1)"`
	Importance      *int      `gorm:"column:importance"`
	NotObserved     bool      `gorm:"not null;column:not_observed"`
	CreatedAt       time.Time
}

func (FeedbackBehaviorResponse) TableName() string { return "feedback_behavior_responses" }

// FeedbackOpenResponse is one rater's free-text answer to one of the cycle's
// three open-ended questions.
type FeedbackOpenResponse struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	RaterID        uuid.UUID `gorm:"type:uuid;not null"`
	OpenQuestionID uuid.UUID `gorm:"type:uuid;not null;column:open_question_id"`
	AnswerText     string    `gorm:"column:answer_text"`
	CreatedAt      time.Time
}

func (FeedbackOpenResponse) TableName() string { return "feedback_open_responses" }
