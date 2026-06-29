-- Extend class_sessions with lifecycle tracking columns
ALTER TABLE class_sessions
  ADD COLUMN IF NOT EXISTS notes      TEXT,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ended_at   TIMESTAMPTZ;

-- Fix agenda default from object to array
UPDATE class_sessions SET agenda = '[]' WHERE agenda::text IN ('{}', 'null', '');
ALTER TABLE class_sessions ALTER COLUMN agenda SET DEFAULT '[]';

-- Live polls for in-session engagement
CREATE TABLE IF NOT EXISTS session_polls (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID        NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
    created_by UUID        NOT NULL REFERENCES users(id),
    question   TEXT        NOT NULL,
    options    JSONB       NOT NULL DEFAULT '[]',
    is_active  BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_session_polls_session ON session_polls(session_id);

-- Poll votes — one per user per poll, updatable (change of mind)
CREATE TABLE IF NOT EXISTS session_poll_votes (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    poll_id      UUID        NOT NULL REFERENCES session_polls(id) ON DELETE CASCADE,
    user_id      UUID        NOT NULL REFERENCES users(id),
    option_index INTEGER     NOT NULL,
    voted_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (poll_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_session_poll_votes_poll ON session_poll_votes(poll_id);

-- Post-session action items and follow-up tagging
CREATE TABLE IF NOT EXISTS session_action_items (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id     UUID        NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
    participant_id UUID        REFERENCES users(id),
    description    TEXT        NOT NULL,
    due_date       DATE,
    status         VARCHAR(20) NOT NULL DEFAULT 'open',
    created_by     UUID        NOT NULL REFERENCES users(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_session_action_items_session ON session_action_items(session_id);
