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
