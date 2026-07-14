package notify

import (
	"time"

	"github.com/google/uuid"
)

// Cooldown tracks the last time a given rule fired for a given subject, so
// ShouldFire can debounce repeat alerts within a window and only fire on a
// state transition into the alert condition. This is the shared
// alert-decision layer riskscoring fires into, and also backs Participant's
// Goal Tracker & Nudge / Reflection Prompt Engine and PM's Smart
// Notification Optimizer.
type Cooldown struct {
	SubjectID  uuid.UUID `gorm:"type:uuid;primaryKey"`
	RuleKey    string    `gorm:"primaryKey"`
	LastState  string    `gorm:"not null;default:''"` // last known condition state, for transition detection
	LastFiredAt time.Time `gorm:"not null;default:now()"`
}

func (Cooldown) TableName() string { return "ai_notify_cooldowns" }
