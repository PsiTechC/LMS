ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS zoom_meeting_uuid TEXT;
ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS zoom_passcode TEXT;
ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS zoom_host_user_id TEXT;
ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS zoom_provider VARCHAR(32) DEFAULT 'zoom';
ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS meeting_type VARCHAR(32) NOT NULL DEFAULT 'external_link';
