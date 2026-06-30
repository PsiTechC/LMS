DROP TABLE IF EXISTS session_reminders;
ALTER TABLE class_sessions DROP COLUMN IF EXISTS reminder_enabled;
