DROP INDEX IF EXISTS idx_class_sessions_engagement;
ALTER TABLE class_sessions DROP COLUMN IF EXISTS engagement_id;
