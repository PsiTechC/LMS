package competencies

import (
	"log"

	"github.com/xa-lms/api/pkg/database"
)

// InitSchema creates the competency_behaviors table (behavior statements + the
// rater-facing question_text used by the admin-initiated 360° Configure wizard).
// The competencies table itself predates this and is assumed present on the
// shared DB; everything here is idempotent (IF NOT EXISTS) and additive only.
func InitSchema() {
	sqlDB, err := database.DB.DB()
	if err != nil {
		log.Printf("competencies: schema init failed (get sqlDB): %v", err)
		return
	}
	sqls := []string{
		`CREATE TABLE IF NOT EXISTS competency_behaviors (
			id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			competency_id UUID NOT NULL REFERENCES competencies(id) ON DELETE CASCADE,
			statement     TEXT NOT NULL,
			question_text TEXT,
			sort_order    INT  NOT NULL DEFAULT 0,
			created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_comp_behaviors_competency ON competency_behaviors(competency_id)`,
		// Safe to re-run: adds columns only if an older behaviors table lacks them.
		`ALTER TABLE competency_behaviors ADD COLUMN IF NOT EXISTS question_text TEXT`,
		`ALTER TABLE competency_behaviors ADD COLUMN IF NOT EXISTS use_statement BOOLEAN NOT NULL DEFAULT FALSE`,
		`ALTER TABLE competency_behaviors ADD COLUMN IF NOT EXISTS mandatory     BOOLEAN NOT NULL DEFAULT TRUE`,
	}
	for _, s := range sqls {
		if _, err := sqlDB.Exec(s); err != nil {
			log.Printf("competencies: schema init warn: %v", err)
		}
	}
	log.Println("competencies: schema ready")
}
