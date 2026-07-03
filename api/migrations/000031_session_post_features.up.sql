-- Participant reflections on journal/reflection-type agenda blocks
CREATE TABLE IF NOT EXISTS session_reflections (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID        NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
    agenda_item_id  TEXT        NOT NULL, -- id field from agenda JSONB item
    participant_id  UUID        NOT NULL REFERENCES users(id),
    content         TEXT        NOT NULL,
    faculty_comment TEXT,
    commented_by    UUID        REFERENCES users(id),
    commented_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (session_id, agenda_item_id, participant_id)
);
CREATE INDEX IF NOT EXISTS idx_session_reflections_session  ON session_reflections(session_id);
CREATE INDEX IF NOT EXISTS idx_session_reflections_participant ON session_reflections(participant_id);
