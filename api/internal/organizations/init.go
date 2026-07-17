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
func InitSchema() {
	stmts := []string{
		`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_start_date date`,
		`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_end_date date`,
		`ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_note text`,
	}
	for _, stmt := range stmts {
		if err := database.DB.Exec(stmt).Error; err != nil {
			log.Printf("[organizations] schema init statement failed (%s): %v", stmt, err)
		}
	}
}
