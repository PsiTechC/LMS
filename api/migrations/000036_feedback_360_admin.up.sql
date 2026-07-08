-- 360° Feedback — admin-initiated flow (Superadmin / Program Manager).
-- Additive only. Applied idempotently at boot by competencies.InitSchema() and
-- feedback360.InitSchema(); this file is the historical record and does NOT run.

-- Behavior statements under a competency, with rater-facing question wording.
CREATE TABLE IF NOT EXISTS competency_behaviors (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    competency_id UUID NOT NULL REFERENCES competencies(id) ON DELETE CASCADE,
    statement     TEXT NOT NULL,
    question_text TEXT,
    use_statement BOOLEAN NOT NULL DEFAULT FALSE,  -- mirror statement as the question
    mandatory     BOOLEAN NOT NULL DEFAULT TRUE,   -- rater must answer (participant side)
    sort_order    INT  NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comp_behaviors_competency ON competency_behaviors(competency_id);

-- feedback_cycles: admin-flow columns + widened status + nullable participant_id.
ALTER TABLE feedback_cycles ALTER COLUMN participant_id DROP NOT NULL;
ALTER TABLE feedback_cycles ADD COLUMN IF NOT EXISTS name                 TEXT;
ALTER TABLE feedback_cycles ADD COLUMN IF NOT EXISTS initiated_by_user_id UUID;
ALTER TABLE feedback_cycles ADD COLUMN IF NOT EXISTS initiated_by_role    TEXT;
ALTER TABLE feedback_cycles ADD COLUMN IF NOT EXISTS locked_at            TIMESTAMPTZ;
ALTER TABLE feedback_cycles DROP CONSTRAINT IF EXISTS feedback_cycles_status_check;
ALTER TABLE feedback_cycles ADD CONSTRAINT feedback_cycles_status_check
    CHECK (status IN ('draft','open','closed','configuring','locked','active','completed'));

-- Per-cycle quorum config (self fixed at 1, not stored).
CREATE TABLE IF NOT EXISTS feedback_quorum_config (
    cycle_id       UUID PRIMARY KEY REFERENCES feedback_cycles(id) ON DELETE CASCADE,
    skip_manager   INT NOT NULL DEFAULT 0,
    manager        INT NOT NULL DEFAULT 1,
    peer           INT NOT NULL DEFAULT 2,
    direct_report  INT NOT NULL DEFAULT 1,
    others         INT NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Org's most-recently-used quorum values (convenience pre-fill, not a floor).
CREATE TABLE IF NOT EXISTS feedback_org_quorum_defaults (
    org_id         UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
    skip_manager   INT NOT NULL DEFAULT 0,
    manager        INT NOT NULL DEFAULT 1,
    peer           INT NOT NULL DEFAULT 2,
    direct_report  INT NOT NULL DEFAULT 1,
    others         INT NOT NULL DEFAULT 0,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Participants assigned to an admin cycle (program/cohort denormalized snapshot).
CREATE TABLE IF NOT EXISTS feedback_cycle_participants (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cycle_id       UUID NOT NULL REFERENCES feedback_cycles(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES users(id)           ON DELETE CASCADE,
    program_id     UUID REFERENCES programs(id) ON DELETE SET NULL,
    cohort_id      UUID REFERENCES cohorts(id)  ON DELETE SET NULL,
    status         TEXT NOT NULL DEFAULT 'assigned'
                     CHECK (status IN ('assigned','invited','in_progress','completed')),
    added_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    invited_at     TIMESTAMPTZ,
    reminded_at    TIMESTAMPTZ,
    completed_at   TIMESTAMPTZ,
    UNIQUE (cycle_id, participant_id)
);
CREATE INDEX IF NOT EXISTS idx_fcp_cycle       ON feedback_cycle_participants(cycle_id);
CREATE INDEX IF NOT EXISTS idx_fcp_participant ON feedback_cycle_participants(participant_id);

-- Frozen behavior snapshot per locked cycle (decouples from live framework edits).
CREATE TABLE IF NOT EXISTS feedback_cycle_behaviors (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cycle_id         UUID NOT NULL REFERENCES feedback_cycles(id) ON DELETE CASCADE,
    competency_id    UUID NOT NULL,
    competency_title TEXT,
    statement        TEXT NOT NULL,
    question_text    TEXT,
    mandatory        BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order       INT  NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_fcb_cycle ON feedback_cycle_behaviors(cycle_id);
