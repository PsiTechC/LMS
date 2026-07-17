-- Historical record only — schema is actually applied by Go's fixSessionSchema()
-- in api/internal/sessions/handler.go on API boot (see CLAUDE.md Database Migrations).
CREATE INDEX IF NOT EXISTS idx_class_sessions_cohort ON class_sessions(cohort_id);
CREATE INDEX IF NOT EXISTS idx_class_sessions_program ON class_sessions(program_id);
CREATE INDEX IF NOT EXISTS idx_class_sessions_engagement ON class_sessions(engagement_id);
