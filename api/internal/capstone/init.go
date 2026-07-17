package capstone

import (
	"log"

	"github.com/xa-lms/api/pkg/database"
)

// InitSchema creates the capstone tables if they don't exist (mirrors the
// coaching/content/feedback360 init pattern for shared DBs).
func InitSchema() {
	sqlDB, err := database.DB.DB()
	if err != nil {
		log.Printf("capstone: schema init failed (get sqlDB): %v", err)
		return
	}
	sqls := []string{
		`CREATE TABLE IF NOT EXISTS capstone_teams (
			id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
			program_id    UUID NOT NULL REFERENCES programs(id)      ON DELETE CASCADE,
			group_id      UUID NOT NULL REFERENCES cohort_groups(id) ON DELETE CASCADE,
			title         TEXT NOT NULL DEFAULT 'Capstone Project',
			file_url      TEXT,
			file_name     TEXT,
			submission_status TEXT NOT NULL DEFAULT 'not_submitted'
			                CHECK (submission_status IN ('not_submitted','submitted')),
			submitted_by  UUID REFERENCES users(id) ON DELETE SET NULL,
			submitted_at  TIMESTAMPTZ,
			panel_status  TEXT NOT NULL DEFAULT 'pending'
			                CHECK (panel_status IN ('pending','released')),
			ai_feedback   TEXT,
			created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			UNIQUE (program_id, group_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_capstone_teams_program ON capstone_teams(program_id)`,
		`CREATE INDEX IF NOT EXISTS idx_capstone_teams_group   ON capstone_teams(group_id)`,
		// Brief columns (added after initial ship — safe on existing tables).
		`ALTER TABLE capstone_teams ADD COLUMN IF NOT EXISTS description TEXT`,
		`ALTER TABLE capstone_teams ADD COLUMN IF NOT EXISTS format TEXT`,
		`ALTER TABLE capstone_teams ADD COLUMN IF NOT EXISTS audience TEXT`,
		`ALTER TABLE capstone_teams ADD COLUMN IF NOT EXISTS evaluation TEXT`,
		`ALTER TABLE capstone_teams ADD COLUMN IF NOT EXISTS deadline DATE`,
		`CREATE TABLE IF NOT EXISTS capstone_files (
			id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			capstone_team_id UUID NOT NULL REFERENCES capstone_teams(id) ON DELETE CASCADE,
			title          TEXT NOT NULL,
			file_url       TEXT NOT NULL,
			uploaded_by    UUID REFERENCES users(id) ON DELETE SET NULL,
			created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_capstone_files_team ON capstone_files(capstone_team_id)`,
		`CREATE TABLE IF NOT EXISTS capstone_peer_assignments (
			id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			reviewer_team_id UUID NOT NULL REFERENCES capstone_teams(id) ON DELETE CASCADE,
			target_team_id  UUID NOT NULL REFERENCES capstone_teams(id)  ON DELETE CASCADE,
			due_date        DATE,
			created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			UNIQUE (reviewer_team_id, target_team_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_capstone_peer_assign_reviewer ON capstone_peer_assignments(reviewer_team_id)`,
		`CREATE TABLE IF NOT EXISTS capstone_peer_reviews (
			id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			assignment_id  UUID NOT NULL REFERENCES capstone_peer_assignments(id) ON DELETE CASCADE,
			reviewer_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			rating         INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
			comment        TEXT,
			created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			UNIQUE (assignment_id, reviewer_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_capstone_peer_reviews_assign ON capstone_peer_reviews(assignment_id)`,
		`CREATE TABLE IF NOT EXISTS capstone_panel_feedback (
			id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			capstone_team_id UUID NOT NULL REFERENCES capstone_teams(id) ON DELETE CASCADE,
			panelist_id    UUID REFERENCES users(id) ON DELETE SET NULL,
			panelist_name  TEXT NOT NULL,
			panelist_role  TEXT,
			rating         INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
			comment        TEXT,
			created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_capstone_panel_team ON capstone_panel_feedback(capstone_team_id)`,

		// ── Authoring / management layer ──────────────────────────────────
		`CREATE TABLE IF NOT EXISTS capstone_configs (
			id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			org_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
			program_id         UUID NOT NULL REFERENCES programs(id)      ON DELETE CASCADE,
			phase_id           UUID,
			activity_id        UUID,
			title              TEXT NOT NULL DEFAULT 'Capstone Project',
			theme              TEXT,
			problem_statement  TEXT,
			objectives         TEXT,
			deliverable_format JSONB NOT NULL DEFAULT '[]',
			rubric             JSONB NOT NULL DEFAULT '[]',
			resources          JSONB NOT NULL DEFAULT '[]',
			team_structure     TEXT NOT NULL DEFAULT 'group'
			                     CHECK (team_structure IN ('individual','group')),
			passing_threshold  NUMERIC NOT NULL DEFAULT 6,
			deadline           DATE,
			status             TEXT NOT NULL DEFAULT 'draft'
			                     CHECK (status IN ('draft','assigned','closed')),
			created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
			created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_capstone_configs_program ON capstone_configs(program_id)`,
		`CREATE INDEX IF NOT EXISTS idx_capstone_configs_org     ON capstone_configs(org_id)`,

		// Link teams/files to the authoring layer (idempotent alters on shipped tables).
		`ALTER TABLE capstone_teams ADD COLUMN IF NOT EXISTS config_id          UUID`,
		`ALTER TABLE capstone_teams ADD COLUMN IF NOT EXISTS individual_user_id UUID REFERENCES users(id) ON DELETE CASCADE`,
		`ALTER TABLE capstone_teams ADD COLUMN IF NOT EXISTS completion_status  TEXT NOT NULL DEFAULT 'in_progress'`,
		`ALTER TABLE capstone_files ADD COLUMN IF NOT EXISTS visibility         TEXT NOT NULL DEFAULT 'public'`,
		// Individual capstones have no cohort_group — group_id must be nullable
		// (it was NOT NULL for the original group-only model). Idempotent guard.
		`DO $$ BEGIN
		   IF EXISTS (SELECT 1 FROM information_schema.columns
		              WHERE table_name='capstone_teams' AND column_name='group_id' AND is_nullable='NO') THEN
		     ALTER TABLE capstone_teams ALTER COLUMN group_id DROP NOT NULL;
		   END IF;
		 END $$`,
		// One individual team per (config, user).
		`CREATE UNIQUE INDEX IF NOT EXISTS uq_capstone_teams_config_individual
		   ON capstone_teams(config_id, individual_user_id) WHERE individual_user_id IS NOT NULL`,

		`CREATE TABLE IF NOT EXISTS capstone_milestones (
			id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			config_id  UUID NOT NULL REFERENCES capstone_configs(id) ON DELETE CASCADE,
			title      TEXT NOT NULL,
			due_date   DATE,
			sort_order INT NOT NULL DEFAULT 0,
			status     TEXT NOT NULL DEFAULT 'upcoming'
			             CHECK (status IN ('upcoming','open','overdue','done')),
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_capstone_milestones_config ON capstone_milestones(config_id)`,

		`CREATE TABLE IF NOT EXISTS capstone_grades (
			id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			config_id      UUID NOT NULL REFERENCES capstone_configs(id) ON DELETE CASCADE,
			team_id        UUID NOT NULL REFERENCES capstone_teams(id)   ON DELETE CASCADE,
			participant_id UUID REFERENCES users(id) ON DELETE CASCADE,
			score          NUMERIC NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 10),
			per_criterion  JSONB NOT NULL DEFAULT '[]',
			comments       TEXT,
			graded_by      UUID REFERENCES users(id) ON DELETE SET NULL,
			graded_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			released_at    TIMESTAMPTZ,
			updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		// One grade row per (team, participant) — participant_id NULL is the
		// team-level grade. Partial unique indexes handle the NULL case.
		`CREATE UNIQUE INDEX IF NOT EXISTS uq_capstone_grades_team_participant
		   ON capstone_grades(team_id, participant_id) WHERE participant_id IS NOT NULL`,
		`CREATE UNIQUE INDEX IF NOT EXISTS uq_capstone_grades_team_level
		   ON capstone_grades(team_id) WHERE participant_id IS NULL`,
		`CREATE INDEX IF NOT EXISTS idx_capstone_grades_config ON capstone_grades(config_id)`,

		`CREATE TABLE IF NOT EXISTS capstone_certificates (
			id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			config_id      UUID NOT NULL REFERENCES capstone_configs(id) ON DELETE CASCADE,
			team_id        UUID NOT NULL REFERENCES capstone_teams(id)   ON DELETE CASCADE,
			participant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			score          NUMERIC NOT NULL DEFAULT 0,
			serial_no      TEXT NOT NULL,
			issued_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			UNIQUE (config_id, participant_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_capstone_certificates_participant ON capstone_certificates(participant_id)`,
	}
	for _, s := range sqls {
		if _, err := sqlDB.Exec(s); err != nil {
			log.Printf("capstone: schema init warn: %v", err)
		}
	}
	log.Println("capstone: schema ready")
}
