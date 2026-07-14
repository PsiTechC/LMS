package ai

import (
	"fmt"

	"github.com/xa-lms/api/internal/ai/aggregate"
	"github.com/xa-lms/api/internal/ai/classify"
	"github.com/xa-lms/api/internal/ai/notify"
	"github.com/xa-lms/api/internal/ai/rag"
	"github.com/xa-lms/api/internal/ai/riskscoring"
	"github.com/xa-lms/api/internal/ai/rubric"
	"github.com/xa-lms/api/pkg/database"
)

// InitSchema creates every table owned by the ai module and its engine
// subpackages. Idempotent — safe to run against a database that already has
// the tables. Errors are wrapped with the owning engine's name so a failure
// stays attributable to a single package.
func InitSchema() error {
	sqlDB, err := database.DB.DB()
	if err != nil {
		return err
	}
	_, err = sqlDB.Exec(`
		CREATE TABLE IF NOT EXISTS ai_conversations (
		    id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		    org_id     UUID REFERENCES organizations(id) ON DELETE SET NULL,
		    program_id UUID,
		    title      TEXT NOT NULL DEFAULT '',
		    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE TABLE IF NOT EXISTS ai_messages (
		    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		    conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
		    role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
		    content         TEXT NOT NULL,
		    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		CREATE INDEX IF NOT EXISTS idx_ai_conversations_user ON ai_conversations(user_id);
		CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id, created_at);
	`)
	if err != nil {
		return fmt.Errorf("ai: %w", err)
	}

	if err := rag.InitSchema(); err != nil {
		return fmt.Errorf("rag: %w", err)
	}
	if err := riskscoring.InitSchema(); err != nil {
		return fmt.Errorf("riskscoring: %w", err)
	}
	if err := rubric.InitSchema(); err != nil {
		return fmt.Errorf("rubric: %w", err)
	}
	if err := aggregate.InitSchema(); err != nil {
		return fmt.Errorf("aggregate: %w", err)
	}
	if err := notify.InitSchema(); err != nil {
		return fmt.Errorf("notify: %w", err)
	}
	if err := classify.InitSchema(); err != nil {
		return fmt.Errorf("classify: %w", err)
	}
	return nil
}
