DROP TABLE IF EXISTS session_action_items;
DROP TABLE IF EXISTS session_poll_votes;
DROP TABLE IF EXISTS session_polls;
ALTER TABLE class_sessions DROP COLUMN IF EXISTS ended_at;
ALTER TABLE class_sessions DROP COLUMN IF EXISTS started_at;
ALTER TABLE class_sessions DROP COLUMN IF EXISTS notes;
