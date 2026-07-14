package assessments

import (
	"log"

	"github.com/xa-lms/api/pkg/database"
)

// InitSchema creates assessment tables on shared DBs without file migrations.
func InitSchema() {
	sqlDB, err := database.DB.DB()
	if err != nil {
		log.Printf("assessments: schema init failed (get sqlDB): %v", err)
		return
	}
	sqls := []string{
		`CREATE TABLE IF NOT EXISTS assessment_attempts (
			id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			activity_id    UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
			participant_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			answers        JSONB NOT NULL DEFAULT '[]',
			score          NUMERIC NOT NULL DEFAULT 0,
			max_score      NUMERIC NOT NULL DEFAULT 0,
			score_pct      NUMERIC NOT NULL DEFAULT 0,
			passed         BOOLEAN NOT NULL DEFAULT FALSE,
			attempt_number INT NOT NULL DEFAULT 1,
			submitted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_assessment_attempts_activity ON assessment_attempts(activity_id)`,
		`CREATE INDEX IF NOT EXISTS idx_assessment_attempts_participant ON assessment_attempts(activity_id, participant_id)`,
	}
	for _, s := range sqls {
		if _, err := sqlDB.Exec(s); err != nil {
			log.Printf("assessments: schema init warn: %v", err)
		}
	}
	log.Println("assessments: schema ready")
}
