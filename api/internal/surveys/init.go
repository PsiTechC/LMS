package surveys

import (
	"log"

	"github.com/xa-lms/api/pkg/database"
)

// InitSchema creates survey tables on shared DBs without file migrations.
func InitSchema() {
	sqlDB, err := database.DB.DB()
	if err != nil {
		log.Printf("surveys: schema init failed (get sqlDB): %v", err)
		return
	}
	sqls := []string{
		`CREATE TABLE IF NOT EXISTS survey_questions (
			id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			activity_id UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
			type        TEXT NOT NULL CHECK (type IN ('likert','nps','mcq','rating','open')),
			text        TEXT NOT NULL,
			options     JSONB NOT NULL DEFAULT '[]',
			sort_order  INT  NOT NULL DEFAULT 0,
			created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_survey_questions_activity ON survey_questions(activity_id)`,
		// Section groups a question under a named heading (e.g. Kirkpatrick
		// forms' "Section A - Content & Relevance") - added after initial ship,
		// so it's an idempotent ALTER rather than part of the CREATE TABLE above.
		`ALTER TABLE survey_questions ADD COLUMN IF NOT EXISTS section TEXT NOT NULL DEFAULT ''`,
		`CREATE TABLE IF NOT EXISTS survey_completions (
			id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			activity_id   UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
			participant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			is_anonymous  BOOLEAN NOT NULL DEFAULT FALSE,
			completed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			UNIQUE (activity_id, participant_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_survey_completions_activity ON survey_completions(activity_id)`,
		`CREATE TABLE IF NOT EXISTS survey_responses (
			id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			question_id   UUID NOT NULL REFERENCES survey_questions(id) ON DELETE CASCADE,
			activity_id   UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
			participant_id UUID REFERENCES users(id) ON DELETE SET NULL,
			answer_num    NUMERIC,
			answer_text   TEXT,
			created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_survey_responses_question ON survey_responses(question_id)`,
		`CREATE INDEX IF NOT EXISTS idx_survey_responses_activity ON survey_responses(activity_id)`,
		// External (non-platform) respondents - facilitator/manager/business
		// sponsor - invited via a public token link (see external_service.go).
		// Mirrors feedback_raters: name+email only, no users FK.
		`CREATE TABLE IF NOT EXISTS survey_external_respondents (
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
		)`,
		`CREATE INDEX IF NOT EXISTS idx_survey_ext_resp_activity ON survey_external_respondents(activity_id)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_survey_ext_resp_token ON survey_external_respondents(invite_token)`,
		// An external respondent's answers reuse survey_responses (participant_id
		// stays NULL for these rows) - only a nullable pointer is needed.
		`ALTER TABLE survey_responses ADD COLUMN IF NOT EXISTS external_respondent_id UUID REFERENCES survey_external_respondents(id) ON DELETE CASCADE`,
		`CREATE INDEX IF NOT EXISTS idx_survey_responses_ext_respondent ON survey_responses(external_respondent_id)`,
	}
	for _, s := range sqls {
		if _, err := sqlDB.Exec(s); err != nil {
			log.Printf("surveys: schema init warn: %v", err)
		}
	}
	log.Println("surveys: schema ready")
}
