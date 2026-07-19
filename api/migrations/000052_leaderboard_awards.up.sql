-- Immutable, idempotent participant leaderboard awards.  Scores are decided
-- at source completion time; reads aggregate these rows and never recalculate
-- a participant's historical timing.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

CREATE TABLE IF NOT EXISTS leaderboard_awards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    enrollment_id UUID REFERENCES enrollments(id) ON DELETE SET NULL,
    program_id UUID REFERENCES programs(id) ON DELETE SET NULL,
    cohort_id UUID REFERENCES cohorts(id) ON DELETE SET NULL,
    activity_id UUID REFERENCES activities(id) ON DELETE SET NULL,
    activity_type TEXT NOT NULL,
    source_record_id UUID NOT NULL,
    base_points INTEGER NOT NULL CHECK (base_points >= 0),
    multiplier NUMERIC(4,2) NOT NULL CHECK (multiplier >= 0),
    scoring_tier TEXT NOT NULL,
    awarded_points INTEGER NOT NULL CHECK (awarded_points >= 0),
    available_at TIMESTAMPTZ,
    due_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ NOT NULL,
    elapsed_calendar_days INTEGER,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, participant_id, activity_type, source_record_id)
);
CREATE INDEX IF NOT EXISTS idx_leaderboard_awards_participant_program ON leaderboard_awards (participant_id, program_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_awards_org_program ON leaderboard_awards (organization_id, program_id);
CREATE INDEX IF NOT EXISTS idx_leaderboard_awards_cohort ON leaderboard_awards (cohort_id);
