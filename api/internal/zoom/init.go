package zoom

import "github.com/xa-lms/api/pkg/database"

// InitSchema creates the zoom_accounts mapping table and adds the Zoom
// meeting columns to class_sessions, idempotently, per project convention
// (only this Go code applies schema at boot — see CLAUDE.md).
func InitSchema() error {
	sqlDB, err := database.DB.DB()
	if err != nil {
		return err
	}
	_, err = sqlDB.Exec(`
		CREATE TABLE IF NOT EXISTS zoom_accounts (
		    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		    user_id      UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
		    zoom_user_id TEXT NOT NULL,
		    zoom_email   TEXT,
		    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_zoom_accounts_user ON zoom_accounts(user_id);

		ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS zoom_meeting_id TEXT;
		ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS zoom_join_url TEXT;
		ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS zoom_start_url TEXT;
		ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS zoom_password TEXT;
		CREATE UNIQUE INDEX IF NOT EXISTS idx_class_sessions_zoom_meeting_id
		    ON class_sessions(zoom_meeting_id) WHERE zoom_meeting_id IS NOT NULL;

		ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS zoom_meeting_uuid TEXT;
		ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS zoom_passcode TEXT;
		ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS zoom_host_user_id TEXT;
		ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS zoom_provider VARCHAR(32) DEFAULT 'zoom';
		ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS meeting_type VARCHAR(32) NOT NULL DEFAULT 'external_link';

		ALTER TABLE zoom_accounts ADD COLUMN IF NOT EXISTS encrypted_access_token TEXT;
		ALTER TABLE zoom_accounts ADD COLUMN IF NOT EXISTS encrypted_refresh_token TEXT;
		ALTER TABLE zoom_accounts ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
		ALTER TABLE zoom_accounts ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'disconnected';
		ALTER TABLE zoom_accounts ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ;
	`)
	return err
}
