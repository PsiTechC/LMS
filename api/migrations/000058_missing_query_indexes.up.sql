-- Historical record only - schema is actually applied by Go InitSchema()/
-- schema-fix code (see api/internal/activityprogress/handler.go and
-- api/internal/programs/init.go) on API boot, not this file. See
-- CLAUDE.md "Database Migrations".
--
-- These indexes were originally declared in migrations/000004_programs.up.sql
-- but no Go code ever created them, so they may be missing on the live
-- (shared, already-bootstrapped) database - surfaced as a 200ms+ slow-query
-- warning from ai/riskscoring's per-user feature query.

CREATE INDEX IF NOT EXISTS idx_activity_progress_activity ON activity_progress(activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_progress_user ON activity_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_progress_enrollment ON activity_progress(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_activity_progress_activity_enrollment_status ON activity_progress(activity_id, enrollment_id, status);

CREATE INDEX IF NOT EXISTS idx_activities_phase_id ON activities(phase_id);
CREATE INDEX IF NOT EXISTS idx_program_phases_program_id ON program_phases(program_id);
