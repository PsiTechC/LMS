-- Participant goals tracked by faculty
CREATE TABLE participant_goals (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    participant_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    faculty_id     UUID        NOT NULL REFERENCES users(id),
    title          TEXT        NOT NULL,
    description    TEXT,
    target_date    DATE,
    status         VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'dropped')),
    pm_can_view    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_participant_goals_participant ON participant_goals(participant_id);
CREATE INDEX idx_participant_goals_faculty     ON participant_goals(faculty_id);

-- Individual development notes per participant (distinct from session notes)
CREATE TABLE coaching_dev_notes (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    participant_id UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    faculty_id     UUID        NOT NULL REFERENCES users(id),
    content        TEXT        NOT NULL,
    pm_can_view    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_coaching_dev_notes_participant ON coaching_dev_notes(participant_id);
CREATE INDEX idx_coaching_dev_notes_faculty     ON coaching_dev_notes(faculty_id);

-- Group coaching participant tagging: store array of tagged user UUIDs on a note
ALTER TABLE coaching_notes ADD COLUMN IF NOT EXISTS tagged_participants UUID[] NOT NULL DEFAULT '{}';
