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
	GroupID          uuid.UUID  `gorm:"type:uuid;not null"`
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
