-- Superadmin moderation: threads can be flagged for review (distinct from pinned
-- and soft-deleted). Populated by user reports (future) or a superadmin flag action.
ALTER TABLE threads ADD COLUMN IF NOT EXISTS is_flagged BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_threads_flagged ON threads (is_flagged) WHERE is_flagged = TRUE;
