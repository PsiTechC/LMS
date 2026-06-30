package programs

import (
	"time"

	"github.com/google/uuid"
)

type Program struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID         uuid.UUID  `gorm:"type:uuid;not null"`
	CreatedBy     uuid.UUID  `gorm:"type:uuid;not null"`
	Title         string     `gorm:"not null"`
	Description   *string
	Status        string     `gorm:"type:program_status;not null;default:draft"`
	Color         string     `gorm:"not null;default:#EF4E24"`
	DurationWeeks int        `gorm:"not null;default:20"`
	StartDate     *time.Time `gorm:"type:date"`
	EndDate       *time.Time `gorm:"type:date"`
	Settings      []byte     `gorm:"type:jsonb;default:'{}'"`
	PublishedAt   *time.Time
	CreatedAt     time.Time
	UpdatedAt     time.Time

	Phases []ProgramPhase `gorm:"foreignKey:ProgramID;constraint:OnDelete:CASCADE"`
}

func (Program) TableName() string { return "programs" }

type ProgramPhase struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ProgramID   uuid.UUID `gorm:"type:uuid;not null"`
	Title       string    `gorm:"not null"`
	Description *string
	PhaseNumber int       `gorm:"not null;default:0"`
	WeekLabel   *string
	Color       string    `gorm:"not null;default:#EF4E24"`
	StartDay    int       `gorm:"not null;default:1"`
	EndDay      int       `gorm:"not null;default:14"`
	CreatedAt   time.Time
	UpdatedAt   time.Time

	Activities []Activity `gorm:"foreignKey:PhaseID;constraint:OnDelete:CASCADE"`
}

func (ProgramPhase) TableName() string { return "program_phases" }

type Activity struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	PhaseID      uuid.UUID `gorm:"type:uuid;not null"`
	Title        string    `gorm:"not null"`
	Description  *string
	Type         string    `gorm:"type:activity_type;not null"`
	DeliveryMode string    `gorm:"type:delivery_mode;not null;default:self_paced"`
	SortOrder    int       `gorm:"not null;default:0"`
	DurationMins int       `gorm:"not null;default:30"`
	DueDayOffset int       `gorm:"not null;default:7"`
	StartDay     int       `gorm:"not null;default:1"`
	DurationDays int       `gorm:"not null;default:3"`
	IsMandatory  bool      `gorm:"not null;default:true"`
	ConfigJSON   []byte    `gorm:"type:jsonb;default:'{}'"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (Activity) TableName() string { return "activities" }

// ActivityFaculty assigns a faculty user to a live_session / coaching activity.
type ActivityFaculty struct {
	ID             uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ActivityID     uuid.UUID `gorm:"type:uuid;not null"`
	FacultyUserID  uuid.UUID `gorm:"type:uuid;not null"`
	Role           string    `gorm:"not null;default:Lead"` // Lead | Co-Facilitator | Observer
	OverrideNote   *string
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

func (ActivityFaculty) TableName() string { return "activity_faculty" }

// ProgramMaterial is a resource attached directly to a program (not tied to a session).
type ProgramMaterial struct {
	ID         uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ProgramID  uuid.UUID `gorm:"type:uuid;not null"`
	UploadedBy uuid.UUID `gorm:"type:uuid;not null"`
	Title      string    `gorm:"not null"`
	Type       string    `gorm:"not null"`
	URL        string    `gorm:"not null"`
	SizeBytes  *int64
	CreatedAt  time.Time
}

func (ProgramMaterial) TableName() string { return "program_materials" }

