package programs

import (
	"time"

	"github.com/google/uuid"
)

type Program struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID         uuid.UUID `gorm:"type:uuid;not null"`
	CreatedBy     uuid.UUID `gorm:"type:uuid;not null"`
	Title         string    `gorm:"not null"`
	Description   *string
	Status        string     `gorm:"type:program_status;not null;default:draft"`
	Color         string     `gorm:"not null;default:#EF4E24"`
	IsOpen        bool       `gorm:"not null;default:false"` // marketplace: listed on landing page + self-enroll
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
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ProgramID    uuid.UUID `gorm:"type:uuid;not null"`
	Title        string    `gorm:"not null"`
	Description  *string
	PhaseNumber  int `gorm:"not null;default:0"`
	WeekLabel    *string
	Color        string `gorm:"not null;default:#EF4E24"`
	StartDay     int    `gorm:"not null;default:1"`
	EndDay       int    `gorm:"not null;default:14"`
	PhaseType    string `gorm:"column:phase_type;not null;default:custom"` // pre-enrolment | orientation | module-virtual | module-in-person | coaching | capstone | post-program | custom
	DeliveryMode string `gorm:"column:delivery_mode;not null;default:''"`  // virtual | in-person | '' (phase-level; distinct from Activity.DeliveryMode)
	CreatedAt    time.Time
	UpdatedAt    time.Time

	Modules    []ProgramModule `gorm:"foreignKey:PhaseID;constraint:OnDelete:CASCADE"`
	Activities []Activity      `gorm:"foreignKey:PhaseID;constraint:OnDelete:CASCADE"`
}

func (ProgramPhase) TableName() string { return "program_phases" }

// ProgramModule groups activities into PRE-WORK / POST-WORK slots within a
// module-type phase (module-virtual, module-in-person). Activity-only phases
// (pre-enrolment, post-program) don't use modules — their activities attach
// directly to the phase with ModuleID == nil.
type ProgramModule struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	PhaseID      uuid.UUID  `gorm:"type:uuid;not null"`
	Title        string     `gorm:"not null"`
	DeliveryMode string     `gorm:"column:delivery_mode;not null;default:virtual"` // virtual | in-person
	SessionDate  *time.Time `gorm:"column:session_date;type:date"`
	SortOrder    int        `gorm:"not null;default:0"`
	CreatedAt    time.Time
	UpdatedAt    time.Time

	Activities []Activity `gorm:"foreignKey:ModuleID;constraint:OnDelete:CASCADE"`
}

func (ProgramModule) TableName() string { return "program_modules" }

type Activity struct {
	ID           uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	PhaseID      uuid.UUID  `gorm:"type:uuid;not null"`
	ModuleID     *uuid.UUID `gorm:"type:uuid"`           // set when this activity is a module pre/post-work element
	Slot         string     `gorm:"not null;default:''"` // '' | pre | post — only meaningful when ModuleID is set
	Title        string     `gorm:"not null"`
	Description  *string
	Type         string `gorm:"type:activity_type;not null"`
	DeliveryMode string `gorm:"type:delivery_mode;not null;default:self_paced"`
	SortOrder    int    `gorm:"not null;default:0"`
	DurationMins int    `gorm:"not null;default:30"`
	DueDayOffset int    `gorm:"not null;default:7"`
	StartDay     int    `gorm:"not null;default:1"`
	DurationDays int    `gorm:"not null;default:3"`
	IsMandatory  bool   `gorm:"not null;default:true"`
	ConfigJSON   []byte `gorm:"type:jsonb;default:'{}'"`
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

func (Activity) TableName() string { return "activities" }

// ActivityFaculty assigns a faculty user to a live_session / coaching activity.
type ActivityFaculty struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ActivityID    uuid.UUID  `gorm:"type:uuid;not null"`
	FacultyUserID uuid.UUID  `gorm:"type:uuid;not null"`
	CohortID      *uuid.UUID `gorm:"type:uuid"`             // optional — scopes to a specific cohort
	Role          string     `gorm:"not null;default:Lead"` // Lead | Co-Facilitator | Observer
	OverrideNote  *string
	CreatedAt     time.Time
	UpdatedAt     time.Time
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
