package coaching

import "github.com/xa-lms/api/pkg/database"

// InitSchema keeps the PM coaching admin tables available on shared DBs that
// may not have had file migrations applied yet.
func InitSchema() error {
	sqlDB, err := database.DB.DB()
	if err != nil {
		return err
	}
	_, err = sqlDB.Exec(`
		CREATE TABLE IF NOT EXISTS coaching_engagements (
		    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		    org_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
		    program_id         UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
		    cohort_id          UUID REFERENCES cohorts(id) ON DELETE SET NULL,
		    coach_id           UUID NOT NULL REFERENCES users(id),
		    assigned_by        UUID NOT NULL REFERENCES users(id),
		    assignment_type    TEXT NOT NULL CHECK (assignment_type IN ('individual', 'group')),
		    name               TEXT NOT NULL,
		    status             TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'active', 'completed', 'cancelled')),
		    start_date         DATE,
		    frequency          TEXT NOT NULL DEFAULT 'Bi-weekly',
		    total_sessions     INT NOT NULL DEFAULT 6 CHECK (total_sessions > 0),
		    completed_sessions INT NOT NULL DEFAULT 0 CHECK (completed_sessions >= 0),
		    goals_json         JSONB NOT NULL DEFAULT '[]',
		    created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		    updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS coaching_engagement_participants (
		    engagement_id UUID NOT NULL REFERENCES coaching_engagements(id) ON DELETE CASCADE,
		    participant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		    PRIMARY KEY (engagement_id, participant_id)
		);

		CREATE INDEX IF NOT EXISTS idx_coaching_engagements_org ON coaching_engagements(org_id);
		CREATE INDEX IF NOT EXISTS idx_coaching_engagements_program ON coaching_engagements(program_id);
		CREATE INDEX IF NOT EXISTS idx_coaching_engagements_coach ON coaching_engagements(coach_id);
		CREATE INDEX IF NOT EXISTS idx_coaching_engagements_status ON coaching_engagements(status);
		CREATE INDEX IF NOT EXISTS idx_coaching_engagement_participants_user ON coaching_engagement_participants(participant_id);

		-- Link a class_session to the coaching engagement it belongs to, so a
		-- coach's dedicated dashboard can resolve the coach (engagement.coach_id)
		-- and coachee(s) through the engagement. NULL = a normal classroom session.
		ALTER TABLE class_sessions
		    ADD COLUMN IF NOT EXISTS engagement_id UUID REFERENCES coaching_engagements(id) ON DELETE SET NULL;
		CREATE INDEX IF NOT EXISTS idx_class_sessions_engagement ON class_sessions(engagement_id);

		-- Per-goal completion percentage for the coach's program-outline goal bars.
		ALTER TABLE participant_goals ADD COLUMN IF NOT EXISTS progress INT NOT NULL DEFAULT 0;

		-- Documents / psychometric reports a coach holds about a coachee, with an
		-- optional coach-authored summary and a shared-with-coachee flag.
		CREATE TABLE IF NOT EXISTS coach_documents (
		    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		    participant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		    coach_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		    title          TEXT NOT NULL,
		    doc_type       TEXT NOT NULL DEFAULT 'report',
		    uploaded_by    TEXT NOT NULL DEFAULT '',
		    url            TEXT NOT NULL DEFAULT '',
		    is_shared      BOOLEAN NOT NULL DEFAULT FALSE,
		    coach_summary  TEXT NOT NULL DEFAULT '',
		    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_coach_documents_participant ON coach_documents(participant_id);

		-- Personal calendar blocks a coach reserves (not a coaching session).
		CREATE TABLE IF NOT EXISTS coach_blocked_time (
		    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		    coach_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		    blocked_at    TIMESTAMPTZ NOT NULL,
		    duration_mins INT NOT NULL DEFAULT 60,
		    label         TEXT NOT NULL DEFAULT '',
		    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_coach_blocked_time_coach ON coach_blocked_time(coach_id);

		-- Optional stored file (uploaded document bytes), mirroring content_assets.
		ALTER TABLE coach_documents ADD COLUMN IF NOT EXISTS file_data BYTEA;
		ALTER TABLE coach_documents ADD COLUMN IF NOT EXISTS file_name TEXT NOT NULL DEFAULT '';
		ALTER TABLE coach_documents ADD COLUMN IF NOT EXISTS file_size BIGINT NOT NULL DEFAULT 0;
		ALTER TABLE coach_documents ADD COLUMN IF NOT EXISTS mime_type TEXT NOT NULL DEFAULT '';
		CREATE INDEX IF NOT EXISTS idx_coach_documents_coach ON coach_documents(coach_id);
	`)
	return err
}
