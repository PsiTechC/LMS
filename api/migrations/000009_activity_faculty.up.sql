-- activity_faculty: assigns a faculty member to a specific activity (live_session / coaching)
-- role = delivery role: Lead | Co-Facilitator | Observer
-- override_note = set when PM overrides a scheduling conflict

CREATE TABLE IF NOT EXISTS activity_faculty (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_id     UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    faculty_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role            VARCHAR(50) NOT NULL DEFAULT 'Lead',
    override_note   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(activity_id, faculty_user_id)
);

CREATE INDEX idx_activity_faculty_activity ON activity_faculty(activity_id);
CREATE INDEX idx_activity_faculty_user    ON activity_faculty(faculty_user_id);
