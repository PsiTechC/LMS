package activityprogress

import (
	"time"

	"github.com/google/uuid"
)

// ActivityProgress maps to the canonical activity_progress table (defined in
// migration 000004_programs). It tracks one participant's progress through one
// activity - video watch %, PDF/case read, resume position, personal notes.
// Analytics and cohort-risk queries already read this table, so this module
// reuses it rather than introducing a parallel one.
//
// Column notes:
//   - status is the progress_status enum: not_started | in_progress | completed | skipped
//   - percent_complete is 0-100
//   - meta_json holds ad-hoc fields (last_position for resume, notes text)
type ActivityProgress struct {
	ID              uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	ActivityID      uuid.UUID  `gorm:"type:uuid;not null"`
	UserID          uuid.UUID  `gorm:"type:uuid;not null"`
	EnrollmentID    uuid.UUID  `gorm:"type:uuid;not null"`
	Status          string     `gorm:"type:progress_status;not null;default:not_started"`
	PercentComplete int        `gorm:"column:percent_complete;not null;default:0"`
	StartedAt       *time.Time `gorm:"column:started_at"`
	CompletedAt     *time.Time `gorm:"column:completed_at"`
	MetaJSON        []byte     `gorm:"column:meta_json;type:jsonb;default:'{}'"`
}

func (ActivityProgress) TableName() string { return "activity_progress" }

// progressMeta is the shape stored inside meta_json for content consumption.
type progressMeta struct {
	LastPosition int    `json:"last_position,omitempty"`
	Notes        string `json:"notes,omitempty"`
}
