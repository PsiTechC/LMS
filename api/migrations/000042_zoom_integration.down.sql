DROP INDEX IF EXISTS idx_class_sessions_zoom_meeting_id;
ALTER TABLE class_sessions DROP COLUMN IF EXISTS zoom_password;
ALTER TABLE class_sessions DROP COLUMN IF EXISTS zoom_start_url;
ALTER TABLE class_sessions DROP COLUMN IF EXISTS zoom_join_url;
ALTER TABLE class_sessions DROP COLUMN IF EXISTS zoom_meeting_id;

DROP TABLE IF EXISTS zoom_accounts;
