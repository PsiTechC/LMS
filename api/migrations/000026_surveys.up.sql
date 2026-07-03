-- Survey engine. Questions attach to a 'survey' activity (already in the
-- activities table). Responses are per-participant, per-question. Anonymity is
-- a survey-level flag (activity config) — anonymous responses record completion
-- for the participant's own status but are not attributable in aggregate reports.

CREATE TABLE IF NOT EXISTS survey_questions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    type        TEXT NOT NULL CHECK (type IN ('likert','nps','mcq','rating','open')),
    text        TEXT NOT NULL,
    options     JSONB NOT NULL DEFAULT '[]',  -- for mcq: ["Option A","Option B",...]
    sort_order  INT  NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_survey_questions_activity ON survey_questions(activity_id);

-- A participant's completion of a survey (one row per participant per survey).
-- Exists even for anonymous surveys so the participant sees their own "Completed"
-- status; for anonymous surveys the responses below are not linked to answers in
-- an attributable way (aggregate-only).
CREATE TABLE IF NOT EXISTS survey_completions (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_id   UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    participant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_anonymous  BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (activity_id, participant_id)
);
CREATE INDEX IF NOT EXISTS idx_survey_completions_activity ON survey_completions(activity_id);

-- Individual answers. participant_id is NULL for anonymous surveys (aggregate
-- analytics only); non-null for identified surveys (so participants can review
-- their own responses).
CREATE TABLE IF NOT EXISTS survey_responses (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    question_id   UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
    activity_id   UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES users(id) ON DELETE SET NULL,
    -- Answer stored generically: numeric for likert/nps/rating/mcq-index; text for open.
    answer_num    NUMERIC,
    answer_text   TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_survey_responses_question ON survey_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_survey_responses_activity ON survey_responses(activity_id);
