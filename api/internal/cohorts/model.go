package cohorts

import (
	"time"

	"github.com/google/uuid"
)

type Cohort struct {
	ID          uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ProgramID   uuid.UUID  `gorm:"type:uuid;not null"`
	OrgID       uuid.UUID  `gorm:"type:uuid;not null"`
	Name        string     `gorm:"not null"`
	Description *string
	StartDate   *time.Time `gorm:"type:date"`
	EndDate     *time.Time `gorm:"type:date"`
	MaxSeats    int        `gorm:"not null;default:50"`
	IsActive    bool       `gorm:"not null;default:true"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (Cohort) TableName() string { return "cohorts" }

type Enrollment struct {
	ID                 uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	CohortID           uuid.UUID  `gorm:"type:uuid;not null"`
	UserID             uuid.UUID  `gorm:"type:uuid;not null"`
	Role               string     `gorm:"type:org_member_role;not null;default:participant"`
	Status             string     `gorm:"type:enrollment_status;not null;default:enrolled"`
	CompletionPercent  int        `gorm:"not null;default:0"`
	RiskLevel          string     `gorm:"not null;default:low"`
	EnrolledAt         time.Time
	CompletedAt        *time.Time
	NudgedAt           *time.Time
}

func (Enrollment) TableName() string { return "enrollments" }

// EnrollmentRow is a join result used for the cohort participant table view
type EnrollmentRow struct {
	EnrollmentID      string
	UserID            string
	Name              string
	Email             string
	AvatarURL         *string
	Department        *string
	Role              string
	Status            string
	CompletionPercent int
	RiskLevel         string
	EnrolledAt        time.Time
	NudgedAt          *time.Time
}

// CohortGroup represents a sub-group within a cohort (Coaching Circle, Peer Triad, ALS Team)
type CohortGroup struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	CohortID  uuid.UUID `gorm:"type:uuid;not null"`
	Name      string    `gorm:"not null"`
	GroupType string    `gorm:"not null;default:coaching_circle"` // coaching_circle | peer_triad | als_team | custom
	SortOrder int       `gorm:"not null;default:0"`
	CreatedAt time.Time
}

func (CohortGroup) TableName() string { return "cohort_groups" }

// GroupMemberRow is a scan target for listing members of a group
type GroupMemberRow struct {
	EnrollmentID string
	UserID       string
	Name         string
	Email        string
	Department   *string
	GroupID      string
	GroupName    string
}

// MyEnrollmentRow is a join result for a user's own enrollments (with cohort + program info)
type MyEnrollmentRow struct {
	EnrollmentID          string
	CohortID              string
	Role                  string
	Status                string
	CompletionPercent     int
	RiskLevel             string
	EnrolledAt            time.Time
	CohortName            string
	CohortStartDate       *time.Time
	CohortEndDate         *time.Time
	ProgramID             string
	ProgramTitle          string
	ProgramDescription    *string
	ProgramColor          string
	ProgramDurationWeeks  int
	ProgramStatus         string
}
