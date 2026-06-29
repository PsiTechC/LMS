-- Faculty domain: class_sessions, materials, attendance, submissions, coaching notes
-- NOTE: 'sessions' table = auth refresh tokens. Classroom events use 'class_sessions'.

CREATE TABLE class_sessions (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    program_id      UUID        NOT NULL REFERENCES programs(id)  ON DELETE CASCADE,
    cohort_id       UUID        NOT NULL REFERENCES cohorts(id)   ON DELETE CASCADE,
    faculty_id      UUID        NOT NULL REFERENCES users(id),
    title           TEXT        NOT NULL,
    description     TEXT,
    session_type    TEXT        NOT NULL DEFAULT 'classroom', -- 'classroom' | 'coaching_group' | 'coaching_individual'
    virtual_link    TEXT,
    scheduled_at    TIMESTAMPTZ NOT NULL,
    duration_mins   INT         NOT NULL DEFAULT 60,
    status          TEXT        NOT NULL DEFAULT 'scheduled', -- 'scheduled' | 'live' | 'completed' | 'cancelled'
    agenda          JSONB       NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_class_sessions_faculty   ON class_sessions(faculty_id);
CREATE INDEX idx_class_sessions_cohort    ON class_sessions(cohort_id);
CREATE INDEX idx_class_sessions_scheduled ON class_sessions(scheduled_at);

CREATE TABLE session_materials (
    id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id   UUID        NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
    uploaded_by  UUID        NOT NULL REFERENCES users(id),
    title        TEXT        NOT NULL,
    type         TEXT        NOT NULL, -- 'pdf' | 'ppt' | 'video' | 'link'
    url          TEXT        NOT NULL,
    size_bytes   BIGINT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_session_materials_session ON session_materials(session_id);

CREATE TABLE session_attendance (
    id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id  UUID        NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES users(id),
    status      TEXT        NOT NULL DEFAULT 'present', -- 'present' | 'absent' | 'late'
    marked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, user_id)
);

CREATE INDEX idx_session_attendance_session ON session_attendance(session_id);

CREATE TABLE submissions (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_id     UUID        NOT NULL REFERENCES activities(id),
    participant_id  UUID        NOT NULL REFERENCES users(id),
    content         TEXT,
    file_url        TEXT,
    status          TEXT        NOT NULL DEFAULT 'submitted', -- 'submitted' | 'graded' | 'returned'
    grade           NUMERIC(5,2),
    feedback        TEXT,
    graded_by       UUID        REFERENCES users(id),
    graded_at       TIMESTAMPTZ,
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(activity_id, participant_id)
);

CREATE INDEX idx_submissions_activity    ON submissions(activity_id);
CREATE INDEX idx_submissions_participant ON submissions(participant_id);

CREATE TABLE coaching_notes (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id      UUID        NOT NULL REFERENCES class_sessions(id),
    faculty_id      UUID        NOT NULL REFERENCES users(id),
    participant_id  UUID        NOT NULL REFERENCES users(id),
    notes           TEXT        NOT NULL,
    is_private      BOOLEAN     NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_coaching_notes_session     ON coaching_notes(session_id);
CREATE INDEX idx_coaching_notes_participant ON coaching_notes(participant_id);
