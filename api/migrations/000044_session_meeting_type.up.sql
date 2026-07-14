-- meeting_type already exists on class_sessions as of 000043_zoom_meeting_type
-- (applied by zoom.InitSchema()). This migration documents the sessions module
-- taking read/write ownership of the column via its own create/update paths;
-- the ADD COLUMN is repeated defensively (IF NOT EXISTS) so this migration is
-- self-contained and safe to run standalone against a DB that never ran 000043.
ALTER TABLE class_sessions ADD COLUMN IF NOT EXISTS meeting_type VARCHAR(32) NOT NULL DEFAULT 'external_link';
