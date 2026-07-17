package organizations

import (
	"log"

	"github.com/xa-lms/api/pkg/database"
)

// InitSchema idempotently adds the billing/contract columns to organizations
// (plan_start_date, plan_end_date, billing_note) — additive-only, safe to
// re-run on every boot per this repo's migration convention (see CLAUDE.md
// → Database Migrations). A matching historical-record .sql pair lives at
// api/migrations/000050_organizations_billing_fields.
//
// Also creates organization_logos (bytea logo storage, see logo_model.go) —
// matching historical-record .sql pair at
// api/migrations/000051_organization_logos.
func InitSchema() {
	stmts := []string{
		`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_start_date date`,
		`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_end_date date`,
		`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_note text`,
		`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url text`,
		`CREATE TABLE IF NOT EXISTS organization_logos (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
			file_name TEXT,
			mime_type TEXT,
			file_size BIGINT,
			file_data BYTEA,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_organization_logos_org ON organization_logos(org_id)`,
	}
	for _, stmt := range stmts {
		if err := database.DB.Exec(stmt).Error; err != nil {
			log.Printf("[organizations] schema init statement failed (%s): %v", stmt, err)
		}
	}
}
