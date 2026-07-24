ALTER TABLE class_sessions DROP COLUMN IF EXISTS recording_available_at;
ALTER TABLE class_sessions DROP COLUMN IF EXISTS recording_status;
ALTER TABLE class_sessions DROP COLUMN IF EXISTS transcript_url;
ALTER TABLE class_sessions DROP COLUMN IF EXISTS recording_url;
