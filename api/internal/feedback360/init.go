package feedback360

import (
	"log"

	"github.com/xa-lms/api/pkg/database"
)

// InitSchema creates the 360 feedback tables if they don't exist (mirrors the
// coaching/content init pattern for shared DBs without file migrations applied).
func InitSchema() {
	sqlDB, err := database.DB.DB()
	if err != nil {
		log.Printf("feedback_360: schema init failed (get sqlDB): %v", err)
		return
	}
	sqls := []string{
		`CREATE TABLE IF NOT EXISTS feedback_cycles (
			id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
			participant_id UUID NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
			program_id     UUID REFERENCES programs(id) ON DELETE SET NULL,
			cohort_id      UUID REFERENCES cohorts(id)  ON DELETE SET NULL,
			created_by     UUID NOT NULL REFERENCES users(id),
			title          TEXT NOT NULL DEFAULT '360° Feedback',
			cycle_type     TEXT NOT NULL DEFAULT 'baseline'
			                 CHECK (cycle_type IN ('baseline','mid','end','custom')),
			status         TEXT NOT NULL DEFAULT 'open'
			                 CHECK (status IN ('draft','open','closed')),
			deadline       DATE,
			ai_summary     TEXT,
			created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_fb_cycles_participant ON feedback_cycles(participant_id)`,
		`CREATE INDEX IF NOT EXISTS idx_fb_cycles_org         ON feedback_cycles(org_id)`,
		`CREATE TABLE IF NOT EXISTS feedback_cycle_competencies (
			cycle_id      UUID NOT NULL REFERENCES feedback_cycles(id) ON DELETE CASCADE,
			competency_id UUID NOT NULL REFERENCES competencies(id)    ON DELETE CASCADE,
			sort_order    INT  NOT NULL DEFAULT 0,
			PRIMARY KEY (cycle_id, competency_id)
		)`,
		`CREATE TABLE IF NOT EXISTS feedback_raters (
			id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			cycle_id     UUID NOT NULL REFERENCES feedback_cycles(id) ON DELETE CASCADE,
			name         TEXT NOT NULL,
			email        TEXT NOT NULL,
			relationship TEXT NOT NULL DEFAULT 'peer'
			               CHECK (relationship IN ('self','manager','peer','direct_report','skip_level')),
			status       TEXT NOT NULL DEFAULT 'pending'
			               CHECK (status IN ('pending','submitted')),
			invite_token UUID NOT NULL DEFAULT uuid_generate_v4(),
			reminded_at  TIMESTAMPTZ,
			submitted_at TIMESTAMPTZ,
			created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_fb_raters_token ON feedback_raters(invite_token)`,
		`CREATE INDEX IF NOT EXISTS idx_fb_raters_cycle        ON feedback_raters(cycle_id)`,
		`CREATE TABLE IF NOT EXISTS feedback_responses (
			id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			rater_id      UUID NOT NULL REFERENCES feedback_raters(id)   ON DELETE CASCADE,
			competency_id UUID NOT NULL REFERENCES competencies(id)      ON DELETE CASCADE,
			score         NUMERIC(3,1) NOT NULL CHECK (score >= 0 AND score <= 5),
			comment       TEXT,
			created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			UNIQUE (rater_id, competency_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_fb_responses_rater ON feedback_responses(rater_id)`,

		// ── Admin-initiated flow (additive) ───────────────────────────
		// participant_id becomes nullable: admin cycles have many participants
		// (via feedback_cycle_participants) rather than one owner.
		`ALTER TABLE feedback_cycles ALTER COLUMN participant_id DROP NOT NULL`,
		`ALTER TABLE feedback_cycles ADD COLUMN IF NOT EXISTS name                 TEXT`,
		`ALTER TABLE feedback_cycles ADD COLUMN IF NOT EXISTS initiated_by_user_id UUID`,
		`ALTER TABLE feedback_cycles ADD COLUMN IF NOT EXISTS initiated_by_role    TEXT`,
		`ALTER TABLE feedback_cycles ADD COLUMN IF NOT EXISTS locked_at            TIMESTAMPTZ`,
		// Widen the status CHECK to admit the admin lifecycle alongside the legacy
		// participant statuses. Idempotent: drop-if-exists then recreate.
		`DO $$
		 BEGIN
		   IF EXISTS (SELECT 1 FROM information_schema.constraint_column_usage
		              WHERE constraint_name = 'feedback_cycles_status_check') THEN
		     ALTER TABLE feedback_cycles DROP CONSTRAINT feedback_cycles_status_check;
		   END IF;
		   ALTER TABLE feedback_cycles ADD CONSTRAINT feedback_cycles_status_check
		     CHECK (status IN ('draft','open','closed','configuring','locked','active','completed'));
		 END $$`,

		`CREATE TABLE IF NOT EXISTS feedback_quorum_config (
			cycle_id       UUID PRIMARY KEY REFERENCES feedback_cycles(id) ON DELETE CASCADE,
			skip_manager   INT NOT NULL DEFAULT 0,
			manager        INT NOT NULL DEFAULT 1,
			peer           INT NOT NULL DEFAULT 2,
			direct_report  INT NOT NULL DEFAULT 1,
			others         INT NOT NULL DEFAULT 0,
			created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS feedback_org_quorum_defaults (
			org_id         UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
			skip_manager   INT NOT NULL DEFAULT 0,
			manager        INT NOT NULL DEFAULT 1,
			peer           INT NOT NULL DEFAULT 2,
			direct_report  INT NOT NULL DEFAULT 1,
			others         INT NOT NULL DEFAULT 0,
			updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS feedback_cycle_participants (
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
		)`,
		`CREATE INDEX IF NOT EXISTS idx_fcp_cycle       ON feedback_cycle_participants(cycle_id)`,
		`CREATE INDEX IF NOT EXISTS idx_fcp_participant ON feedback_cycle_participants(participant_id)`,
		`CREATE TABLE IF NOT EXISTS feedback_cycle_behaviors (
			id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			cycle_id         UUID NOT NULL REFERENCES feedback_cycles(id) ON DELETE CASCADE,
			competency_id    UUID NOT NULL,
			competency_title TEXT,
			statement        TEXT NOT NULL,
			question_text    TEXT,
			mandatory        BOOLEAN NOT NULL DEFAULT TRUE,
			sort_order       INT  NOT NULL DEFAULT 0
		)`,
		`ALTER TABLE feedback_cycle_behaviors ADD COLUMN IF NOT EXISTS mandatory BOOLEAN NOT NULL DEFAULT TRUE`,
		`CREATE INDEX IF NOT EXISTS idx_fcb_cycle ON feedback_cycle_behaviors(cycle_id)`,
	}
	for _, s := range sqls {
		if _, err := sqlDB.Exec(s); err != nil {
			log.Printf("feedback_360: schema init warn: %v", err)
		}
	}
	log.Println("feedback_360: schema ready")
}
