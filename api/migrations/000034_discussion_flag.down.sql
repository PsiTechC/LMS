DROP INDEX IF EXISTS idx_threads_flagged;
ALTER TABLE threads DROP COLUMN IF EXISTS is_flagged;
