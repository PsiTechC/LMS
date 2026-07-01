package content

import (
	"log"

	"github.com/xa-lms/api/pkg/database"
)

// InitSchema creates the content library tables and types if they don't exist.
// Called once at server startup so no manual migration step is required.
func InitSchema() {
	db := database.DB
	sqls := []string{
		`DO $$ BEGIN
			CREATE TYPE asset_type AS ENUM (
				'quiz','elearning','assessment','video','case_study',
				'survey','l1_reaction','l2_learning','l3_behaviour','l4_impact','certificate'
			);
		EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

		`DO $$ BEGIN
			CREATE TYPE asset_status AS ENUM ('draft','active','archived');
		EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

		`CREATE TABLE IF NOT EXISTS content_assets (
			id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			org_id        UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
			created_by    UUID        NOT NULL REFERENCES users(id),
			title         TEXT        NOT NULL,
			description   TEXT,
			asset_type    asset_type  NOT NULL,
			status        asset_status NOT NULL DEFAULT 'draft',
			file_name     TEXT,
			file_size     BIGINT,
			mime_type     TEXT,
			file_data     BYTEA,
			meta          JSONB NOT NULL DEFAULT '{}',
			used_in_count INT NOT NULL DEFAULT 0,
			tags          TEXT[] NOT NULL DEFAULT '{}',
			created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,

		`CREATE INDEX IF NOT EXISTS idx_content_assets_org     ON content_assets(org_id)`,
		`CREATE INDEX IF NOT EXISTS idx_content_assets_type    ON content_assets(asset_type)`,
		`CREATE INDEX IF NOT EXISTS idx_content_assets_status  ON content_assets(status)`,
		`CREATE INDEX IF NOT EXISTS idx_content_assets_creator ON content_assets(created_by)`,

		`CREATE TABLE IF NOT EXISTS content_asset_programs (
			asset_id   UUID NOT NULL REFERENCES content_assets(id) ON DELETE CASCADE,
			program_id UUID NOT NULL REFERENCES programs(id)       ON DELETE CASCADE,
			PRIMARY KEY (asset_id, program_id)
		)`,

		// Add file_data if table existed with old storage_path column
		`DO $$ BEGIN
			IF NOT EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'content_assets' AND column_name = 'file_data'
			) THEN
				ALTER TABLE content_assets ADD COLUMN file_data BYTEA;
			END IF;
		END $$`,

		`DO $$ BEGIN
			IF EXISTS (
				SELECT 1 FROM information_schema.columns
				WHERE table_name = 'content_assets' AND column_name = 'storage_path'
			) THEN
				ALTER TABLE content_assets DROP COLUMN storage_path;
			END IF;
		END $$`,
	}

	sqlDB, err := db.DB()
	if err != nil {
		log.Printf("content: schema init failed (get sqlDB): %v", err)
		return
	}
	for _, s := range sqls {
		if _, err := sqlDB.Exec(s); err != nil {
			log.Printf("content: schema init warn: %v", err)
		}
	}
	log.Println("content: schema ready")
}
