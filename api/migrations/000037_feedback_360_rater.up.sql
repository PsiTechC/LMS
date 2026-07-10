-- 360° Feedback — participant adaptation + external rater form.
-- Additive only. Applied idempotently at boot by feedback360.InitSchema();
-- this file is the historical record and does NOT run.

-- Raters are EXTERNAL people (name + email, no users FK, no account). Scope each
-- rater to one participant: an admin cycle holds many participants, each
-- nominating their own rater panel.
ALTER TABLE feedback_raters ADD COLUMN IF NOT EXISTS participant_id UUID REFERENCES users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_fb_raters_participant ON feedback_raters(cycle_id, participant_id);

-- Admit the 'others' relationship (cross-functional stakeholders).
ALTER TABLE feedback_raters DROP CONSTRAINT IF EXISTS feedback_raters_relationship_check;
ALTER TABLE feedback_raters ADD CONSTRAINT feedback_raters_relationship_check
    CHECK (relationship IN ('self','manager','peer','direct_report','skip_level','others'));

-- One rater answer per behavior statement from the cycle's frozen snapshot.
-- A NULL score with not_observed = TRUE means "Unable to rate / Not observed"
-- and is excluded from averages (AVG skips NULLs) rather than counted as zero.
-- importance is only collected from manager / skip_level raters.
CREATE TABLE IF NOT EXISTS feedback_behavior_responses (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rater_id          UUID NOT NULL REFERENCES feedback_raters(id)          ON DELETE CASCADE,
    cycle_behavior_id UUID NOT NULL REFERENCES feedback_cycle_behaviors(id) ON DELETE CASCADE,
    competency_id     UUID NOT NULL,
    score             NUMERIC(3,1) CHECK (score IS NULL OR (score >= 1 AND score <= 5)),
    importance        INT          CHECK (importance IS NULL OR (importance >= 1 AND importance <= 5)),
    not_observed      BOOLEAN NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (rater_id, cycle_behavior_id)
);
CREATE INDEX IF NOT EXISTS idx_fbr_rater ON feedback_behavior_responses(rater_id);
CREATE INDEX IF NOT EXISTS idx_fbr_comp  ON feedback_behavior_responses(competency_id);

-- Free-text answers to the cycle's three open-ended questions.
CREATE TABLE IF NOT EXISTS feedback_open_responses (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rater_id         UUID NOT NULL REFERENCES feedback_raters(id)               ON DELETE CASCADE,
    open_question_id UUID NOT NULL REFERENCES feedback_cycle_open_questions(id) ON DELETE CASCADE,
    answer_text      TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (rater_id, open_question_id)
);
CREATE INDEX IF NOT EXISTS idx_for_rater ON feedback_open_responses(rater_id);
