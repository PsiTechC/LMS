package notify

import "github.com/xa-lms/api/pkg/database"

// InitSchema creates the cooldown-tracking table. Idempotent.
func InitSchema() error {
	sqlDB, err := database.DB.DB()
	if err != nil {
		return err
	}
	_, err = sqlDB.Exec(`
		CREATE TABLE IF NOT EXISTS ai_notify_cooldowns (
		    subject_id    UUID NOT NULL,
		    rule_key      TEXT NOT NULL,
		    last_state    TEXT NOT NULL DEFAULT '',
		    last_fired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		    PRIMARY KEY (subject_id, rule_key)
		);
	`)
	return err
}
