-- Fix: coaches tables that predate the (org_id, user_id) UNIQUE key lack it,
-- because the Go startup CREATE TABLE IF NOT EXISTS is a no-op on a pre-existing
-- (drifted) table. The coach invite/enroll paths INSERT ... ON CONFLICT
-- (org_id, user_id), which fails (42P10) without a matching unique index.
-- HISTORICAL RECORD ONLY — applied idempotently by the Go startup block in
-- cmd/server/main.go (see CLAUDE.md → Database Migrations).
DELETE FROM coaches a USING coaches b
    WHERE a.ctid > b.ctid AND a.org_id = b.org_id AND a.user_id = b.user_id;
CREATE UNIQUE INDEX IF NOT EXISTS coaches_org_user_uniq ON coaches (org_id, user_id);
