-- Additive only. Applied idempotently at boot by zoom.InitSchema(); this file
-- is the historical record and does not run automatically (see CLAUDE.md).
ALTER TABLE zoom_accounts ADD COLUMN IF NOT EXISTS encrypted_access_token TEXT;
ALTER TABLE zoom_accounts ADD COLUMN IF NOT EXISTS encrypted_refresh_token TEXT;
ALTER TABLE zoom_accounts ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMPTZ;
ALTER TABLE zoom_accounts ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'disconnected';
ALTER TABLE zoom_accounts ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ;
