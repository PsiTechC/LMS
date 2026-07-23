-- Historical record only - schema is actually applied by Go InitSchema()
-- (see api/internal/zoom/init.go) on API boot, not this file. See
-- CLAUDE.md "Database Migrations".

ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS recording_url TEXT;
ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS transcript_url TEXT;
ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS recording_status VARCHAR(32) NOT NULL DEFAULT 'none';
ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS recording_available_at TIMESTAMPTZ;
