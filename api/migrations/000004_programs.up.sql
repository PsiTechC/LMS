-- ══════════════════════════════════════════════════════════════════
-- Programs domain: programs → phases → activities
-- Used by: SuperAdmin (view all), PM (design/manage), Faculty (view/deliver), Participant (consume)
-- ══════════════════════════════════════════════════════════════════

CREATE TYPE program_status AS ENUM ('draft', 'active', 'upcoming', 'delivered', 'archived');
CREATE TYPE activity_type  AS ENUM (
    'video', 'pdf', 'case_study', 'assessment', 'survey',
    'live_session', 'coaching', 'journal', 'assignment', 'peer_review'
);
CREATE TYPE delivery_mode AS ENUM ('self_paced', 'live', 'async');

-- ── Programs ──────────────────────────────────────────────────────
CREATE TABLE programs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_by      UUID NOT NULL REFERENCES users(id),
    title           TEXT NOT NULL,
    description     TEXT,
    status          program_status NOT NULL DEFAULT 'draft',
    color           TEXT NOT NULL DEFAULT '#EF4E24',
    duration_weeks  INT  NOT NULL DEFAULT 20,
    start_date      DATE,
    end_date        DATE,
    settings        JSONB NOT NULL DEFAULT '{}',
    published_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_programs_org_id ON programs (org_id);
CREATE INDEX idx_programs_status ON programs (status);

-- ── Program Phases ────────────────────────────────────────────────
CREATE TABLE program_phases (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    program_id   UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    description  TEXT,
    phase_number INT  NOT NULL DEFAULT 0,   -- sort order (0-indexed)
    week_label   TEXT,                       -- e.g. "Wk 1–4", "Wk -4 to -2"
    color        TEXT NOT NULL DEFAULT '#EF4E24',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (program_id, phase_number)
);

CREATE INDEX idx_phases_program_id ON program_phases (program_id);

-- ── Activities ────────────────────────────────────────────────────
-- Core configurable building block — every step in a program is an activity.
-- config_json schema is type-specific (validated in Go service layer).
CREATE TABLE activities (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phase_id      UUID NOT NULL REFERENCES program_phases(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    description   TEXT,
    type          activity_type  NOT NULL,
    delivery_mode delivery_mode  NOT NULL DEFAULT 'self_paced',
    sort_order    INT  NOT NULL DEFAULT 0,
    duration_mins INT  NOT NULL DEFAULT 30,
    due_day_offset INT NOT NULL DEFAULT 7,   -- days from phase start date
    is_mandatory  BOOLEAN NOT NULL DEFAULT TRUE,
    config_json   JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activities_phase_id ON activities (phase_id);
CREATE INDEX idx_activities_type     ON activities (type);

-- ── Cohorts ───────────────────────────────────────────────────────
-- A cohort is one running instance of a program with a batch of participants.
CREATE TABLE cohorts (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    program_id  UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    start_date  DATE,
    end_date    DATE,
    max_seats   INT  NOT NULL DEFAULT 50,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cohorts_program_id ON cohorts (program_id);
CREATE INDEX idx_cohorts_org_id     ON cohorts (org_id);

-- ── Enrollments ───────────────────────────────────────────────────
CREATE TYPE enrollment_status AS ENUM ('enrolled', 'active', 'completed', 'withdrawn', 'on_hold');

CREATE TABLE enrollments (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cohort_id   UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    role        org_member_role NOT NULL DEFAULT 'participant',  -- participant | faculty
    status      enrollment_status NOT NULL DEFAULT 'enrolled',
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    UNIQUE (cohort_id, user_id)
);

CREATE INDEX idx_enrollments_cohort_id ON enrollments (cohort_id);
CREATE INDEX idx_enrollments_user_id   ON enrollments (user_id);
CREATE INDEX idx_enrollments_status    ON enrollments (status);

-- ── Activity Progress ─────────────────────────────────────────────
-- Tracks each participant's progress on each activity (used by Participant + Faculty + PM)
CREATE TYPE progress_status AS ENUM ('not_started', 'in_progress', 'completed', 'skipped');

CREATE TABLE activity_progress (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_id     UUID NOT NULL REFERENCES activities(id)   ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES users(id)        ON DELETE CASCADE,
    enrollment_id   UUID NOT NULL REFERENCES enrollments(id)  ON DELETE CASCADE,
    status          progress_status NOT NULL DEFAULT 'not_started',
    percent_complete INT NOT NULL DEFAULT 0,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    meta_json       JSONB NOT NULL DEFAULT '{}',  -- stores score, attempt count, etc.
    UNIQUE (activity_id, user_id)
);

CREATE INDEX idx_progress_activity_id   ON activity_progress (activity_id);
CREATE INDEX idx_progress_user_id       ON activity_progress (user_id);
CREATE INDEX idx_progress_enrollment_id ON activity_progress (enrollment_id);
