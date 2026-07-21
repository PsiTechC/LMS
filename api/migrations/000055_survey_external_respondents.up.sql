-- External (non-platform) respondents for a survey activity - facilitator,
-- manager, business sponsor, etc. Invited via a public token link
-- (/survey-external/{token}) instead of logging in, mirroring
-- feedback_raters (000023_feedback_360.up.sql). Only created for activities
-- whose config_json has external_link_enabled = true (see 000054).
--
-- Historical record only - the actual idempotent apply path is
-- api/internal/surveys/init.go's InitSchema(), per CLAUDE.md's Database
-- Migrations convention (this repo's shared DB is not migrated via
-- golang-migrate).

CREATE TABLE IF NOT EXISTS survey_external_respondents (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    activity_id  UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    email        TEXT NOT NULL,
    role_label   TEXT NOT NULL DEFAULT '',
    status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','submitted')),
    invite_token UUID NOT NULL DEFAULT uuid_generate_v4(),
    reminded_at  TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_survey_ext_resp_activity ON survey_external_respondents(activity_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_ext_resp_token ON survey_external_respondents(invite_token);

-- An external respondent's answers reuse survey_responses (participant_id
-- stays NULL for these rows) - only a nullable pointer column is needed.
ALTER TABLE survey_responses
    ADD COLUMN IF NOT EXISTS external_respondent_id UUID REFERENCES survey_external_respondents(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_survey_responses_ext_respondent ON survey_responses(external_respondent_id);
