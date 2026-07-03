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
	}
	for _, s := range sqls {
		if _, err := sqlDB.Exec(s); err != nil {
			log.Printf("capstone: schema init warn: %v", err)
		}
	}
	log.Println("capstone: schema ready")
}
