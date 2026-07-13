ALTER TABLE class_sessions DROP COLUMN IF EXISTS meeting_type;
ALTER TABLE class_sessions DROP COLUMN IF EXISTS zoom_provider;
ALTER TABLE class_sessions DROP COLUMN IF EXISTS zoom_host_user_id;
ALTER TABLE class_sessions DROP COLUMN IF EXISTS zoom_passcode;
ALTER TABLE class_sessions DROP COLUMN IF EXISTS zoom_meeting_uuid;
