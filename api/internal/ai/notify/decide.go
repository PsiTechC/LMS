package notify

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

// ShouldFire reports whether an alert for (subjectID, ruleKey) should fire
// right now, given the caller's current condition state (e.g. "high_risk",
// "on_track" — any string the caller's rule logic produces). It only fires
// on a transition into a non-empty/alerting state, and never re-fires for
// the same subject+rule within cooldown of the last fire. On fire, it
// records the new state and timestamp; callers must not call ShouldFire
// twice for the same decision (it is not idempotent — it's a decide-and-record
// call).
func ShouldFire(ctx context.Context, subjectID uuid.UUID, ruleKey, currentState string, cooldown time.Duration) (bool, error) {
	var existing Cooldown
	err := database.DB.WithContext(ctx).
		Where("subject_id = ? AND rule_key = ?", subjectID, ruleKey).
		First(&existing).Error

	switch {
	case errors.Is(err, gorm.ErrRecordNotFound):
		if currentState == "" {
			return false, nil
		}
		return true, upsert(ctx, subjectID, ruleKey, currentState)
	case err != nil:
		return false, err
	}

	// No transition — same state as last time.
	if existing.LastState == currentState {
		return false, nil
	}
	// Transitioned out of the alert condition — record it, don't fire.
	if currentState == "" {
		return false, upsert(ctx, subjectID, ruleKey, currentState)
	}
	// Transitioned into (or changed within) an alert condition — respect cooldown.
	if time.Since(existing.LastFiredAt) < cooldown {
		return false, nil
	}
	return true, upsert(ctx, subjectID, ruleKey, currentState)
}

func upsert(ctx context.Context, subjectID uuid.UUID, ruleKey, state string) error {
	return database.DB.WithContext(ctx).Exec(`
		INSERT INTO ai_notify_cooldowns (subject_id, rule_key, last_state, last_fired_at)
		VALUES (?, ?, ?, NOW())
		ON CONFLICT (subject_id, rule_key)
		DO UPDATE SET last_state = EXCLUDED.last_state, last_fired_at = NOW()
	`, subjectID, ruleKey, state).Error
}
