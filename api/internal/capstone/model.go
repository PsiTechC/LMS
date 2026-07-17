package capstone

import (
	"time"

	"github.com/google/uuid"
)

// CapstoneTeam is one team's capstone within a program. The team maps to a
// cohort_group (als_team); members come from enrollments.group_id. Submission
// is per-team — any member can submit/replace the deck.
type CapstoneTeam struct {
	ID               uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID            uuid.UUID  `gorm:"type:uuid;not null"`
	ProgramID        uuid.UUID  `gorm:"type:uuid;not null"`
	// GroupID is the als_team cohort group for a group capstone; NULL for an
	// individual capstone (which uses IndividualUserID instead).
	GroupID          *uuid.UUID `gorm:"type:uuid;column:group_id"`
	Title            string     `gorm:"not null;default:Capstone Project"`
	// Brief config — set by PM/faculty, read by participants. Nullable until set.
	Description      *string    `gorm:"column:description"`
	Format           *string    `gorm:"column:format"`
	Audience         *string    `gorm:"column:audience"`
	Evaluation       *string    `gorm:"column:evaluation"`
	Deadline         *time.Time `gorm:"column:deadline;type:date"`
	FileURL          *string    `gorm:"column:file_url"`
	FileName         *string    `gorm:"column:file_name"`
	SubmissionStatus string     `gorm:"column:submission_status;not null;default:not_submitted"`
	SubmittedBy      *uuid.UUID `gorm:"type:uuid;column:submitted_by"`
	SubmittedAt      *time.Time `gorm:"column:submitted_at"`
	PanelStatus      string     `gorm:"column:panel_status;not null;default:pending"` // pending | released
	AIFeedback       *string    `gorm:"column:ai_feedback"`
	// Authoring layer (added with the management module). ConfigID links the team
	// to its authored capstone_configs row; IndividualUserID is set instead of a
	// group for individual capstones. CompletionStatus flips to 'complete' when
	// the (team-level) grade clears the config's passing threshold.
	ConfigID         *uuid.UUID `gorm:"type:uuid;column:config_id"`
	IndividualUserID *uuid.UUID `gorm:"type:uuid;column:individual_user_id"`
	CompletionStatus string     `gorm:"column:completion_status;not null;default:in_progress"` // in_progress | complete
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

func (CapstoneTeam) TableName() string { return "capstone_teams" }

type CapstoneFile struct {
	ID             uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	CapstoneTeamID uuid.UUID  `gorm:"type:uuid;not null"`
	Title          string     `gorm:"not null"`
	FileURL        string     `gorm:"column:file_url;not null"`
	UploadedBy     *uuid.UUID `gorm:"type:uuid;column:uploaded_by"`
	// personal | public — group capstones require public so teammates can see
	// each other's work-in-progress uploads.
	Visibility     string     `gorm:"column:visibility;not null;default:public"`
	CreatedAt      time.Time
}

func (CapstoneFile) TableName() string { return "capstone_files" }

type CapstonePeerAssignment struct {
	ID             uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ReviewerTeamID uuid.UUID  `gorm:"type:uuid;not null"`
	TargetTeamID   uuid.UUID  `gorm:"type:uuid;not null"`
	DueDate        *time.Time `gorm:"type:date;column:due_date"`
	CreatedAt      time.Time
}

func (CapstonePeerAssignment) TableName() string { return "capstone_peer_assignments" }

type CapstonePeerReview struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	AssignmentID uuid.UUID `gorm:"type:uuid;not null"`
	ReviewerID   uuid.UUID `gorm:"type:uuid;not null"`
	Rating       int       `gorm:"not null"`
	Comment      *string
	CreatedAt    time.Time
}

func (CapstonePeerReview) TableName() string { return "capstone_peer_reviews" }

type CapstonePanelFeedback struct {
	ID             uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	CapstoneTeamID uuid.UUID  `gorm:"type:uuid;not null"`
	PanelistID     *uuid.UUID `gorm:"type:uuid;column:panelist_id"`
	PanelistName   string     `gorm:"column:panelist_name;not null"`
	PanelistRole   *string    `gorm:"column:panelist_role"`
	Rating         int        `gorm:"not null"`
	Comment        *string
	CreatedAt      time.Time
}

func (CapstonePanelFeedback) TableName() string { return "capstone_panel_feedback" }

// ── Authoring / management layer ──────────────────────────────────────────

// CapstoneConfig is the authored definition of a capstone for one program
// (optionally pinned to a phase/activity). Created by SA/PM (attach), then
// configured by Faculty/SA (rubric, format, threshold, team structure) and
// published (status='assigned') to make it visible participant-side.
type CapstoneConfig struct {
	ID               uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID            uuid.UUID  `gorm:"type:uuid;not null"`
	ProgramID        uuid.UUID  `gorm:"type:uuid;not null"`
	PhaseID          *uuid.UUID `gorm:"type:uuid;column:phase_id"`    // attach point (nullable)
	ActivityID       *uuid.UUID `gorm:"type:uuid;column:activity_id"` // attach point (nullable)
	Title            string     `gorm:"not null;default:Capstone Project"`
	Theme            *string    `gorm:"column:theme"`
	ProblemStatement *string    `gorm:"column:problem_statement"`
	Objectives       *string    `gorm:"column:objectives"`
	// DeliverableFormat is a jsonb array of strings (report/deck/prototype/…).
	DeliverableFormat []byte `gorm:"type:jsonb;column:deliverable_format;default:'[]'"`
	// Rubric is a jsonb array of {criterion, weight} with weights summing to 100.
	Rubric []byte `gorm:"type:jsonb;column:rubric;default:'[]'"`
	// Resources is a jsonb array of {title, url}.
	Resources        []byte     `gorm:"type:jsonb;column:resources;default:'[]'"`
	TeamStructure    string     `gorm:"column:team_structure;not null;default:group"` // individual | group
	PassingThreshold float64    `gorm:"column:passing_threshold;not null;default:6"`  // out of 10
	Deadline         *time.Time `gorm:"column:deadline;type:date"`
	Status           string     `gorm:"not null;default:draft"` // draft | assigned | closed
	CreatedBy        *uuid.UUID `gorm:"type:uuid;column:created_by"`
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

func (CapstoneConfig) TableName() string { return "capstone_configs" }

// CapstoneMilestone is one flat (non-nested) milestone in a capstone's plan.
type CapstoneMilestone struct {
	ID        uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ConfigID  uuid.UUID  `gorm:"type:uuid;not null;column:config_id"`
	Title     string     `gorm:"not null"`
	DueDate   *time.Time `gorm:"type:date;column:due_date"`
	SortOrder int        `gorm:"column:sort_order;not null;default:0"`
	Status    string     `gorm:"not null;default:upcoming"` // upcoming | open | overdue | done
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (CapstoneMilestone) TableName() string { return "capstone_milestones" }

// CapstoneGrade is a faculty grade for a capstone team or an individual within
// a team. ParticipantID nil ⇒ team-level grade. Held until ReleasedAt is set.
type CapstoneGrade struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ConfigID      uuid.UUID  `gorm:"type:uuid;not null;column:config_id"`
	TeamID        uuid.UUID  `gorm:"type:uuid;not null;column:team_id"`
	ParticipantID *uuid.UUID `gorm:"type:uuid;column:participant_id"` // nil = team-level
	Score         float64    `gorm:"not null;default:0"`              // 0..10
	// PerCriterion is a jsonb array of {criterion, score} mirroring the rubric.
	PerCriterion []byte     `gorm:"type:jsonb;column:per_criterion;default:'[]'"`
	Comments     *string    `gorm:"column:comments"`
	GradedBy     *uuid.UUID `gorm:"type:uuid;column:graded_by"`
	GradedAt     time.Time  `gorm:"column:graded_at"`
	ReleasedAt   *time.Time `gorm:"column:released_at"` // nil = held
	UpdatedAt    time.Time
}

func (CapstoneGrade) TableName() string { return "capstone_grades" }

// CapstoneCertificate is a minimal issuance record created when a team/individual
// completes (team-level grade ≥ threshold). A future certificate engine can
// render/deliver from these rows; this build only records issuance.
type CapstoneCertificate struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ConfigID      uuid.UUID  `gorm:"type:uuid;not null;column:config_id"`
	TeamID        uuid.UUID  `gorm:"type:uuid;not null;column:team_id"`
	ParticipantID uuid.UUID  `gorm:"type:uuid;not null;column:participant_id"`
	Score         float64    `gorm:"not null;default:0"`
	SerialNo      string     `gorm:"column:serial_no;not null"`
	IssuedAt      time.Time  `gorm:"column:issued_at"`
}

func (CapstoneCertificate) TableName() string { return "capstone_certificates" }
