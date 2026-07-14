package riskscoring

import "github.com/xa-lms/api/pkg/database"

// InitSchema creates the risk-scoring table. Idempotent.
func InitSchema() error {
	sqlDB, err := database.DB.DB()
	if err != nil {
		return err
	}
	_, err = sqlDB.Exec(`
		CREATE TABLE IF NOT EXISTS ai_risk_scores (
		    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		    org_id      UUID REFERENCES organizations(id) ON DELETE CASCADE,
		    program_id  UUID,
		    subject_id  UUID NOT NULL,
		    score       DOUBLE PRECISION NOT NULL,
		    level       TEXT NOT NULL,
		    reasons     TEXT NOT NULL DEFAULT '',
		    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE INDEX IF NOT EXISTS idx_ai_risk_scores_subject ON ai_risk_scores(subject_id, computed_at DESC);
		CREATE INDEX IF NOT EXISTS idx_ai_risk_scores_program ON ai_risk_scores(program_id, computed_at DESC);
	`)
	return err
}
