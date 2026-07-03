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
