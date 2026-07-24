package programs

import (
	"log"

	"github.com/xa-lms/api/pkg/database"
)

// InitSchema adds the Program Design Studio v2 columns/tables and pricing
// schema changes if they don't already exist, so no manual migration step is
// required at startup. Phase types (pre-enrolment, orientation,
// module-virtual, etc.) drive which UI the Design Studio renders for that
// phase; modules group activities into PRE-WORK / POST-WORK slots within
// module-type phases.
func InitSchema() {
	sqls := []string{
		// admin_task: activity-phase cards (Nomination, Welcome Email, Manager Briefing, etc.)
		// in pre-enrolment/post-program phases - distinct from learning activity types.
		`ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'admin_task'`,

		// content: eLearning/SCORM modules. Previously collapsed onto 'video' in the
		// Design Studio picker (no dedicated enum value existed), which mislabeled
		// eLearning modules as "Video" on the participant side. Distinct from 'video'
		// so eLearning content can be told apart structurally, not just by a
		// client-side config.element_type stash.
		`ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'content'`,

		`ALTER TABLE program_phases ADD COLUMN IF NOT EXISTS phase_type TEXT NOT NULL DEFAULT 'custom'`,
		`ALTER TABLE program_phases ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT ''`,
		`DO $$ BEGIN ALTER TABLE program_phases ADD CONSTRAINT chk_program_phases_phase_type CHECK (phase_type IN ('pre-enrolment', 'orientation', 'module-virtual', 'module-in-person', 'coaching', 'capstone', 'post-program', 'custom')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
		`CREATE TABLE IF NOT EXISTS program_modules (id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), phase_id UUID NOT NULL REFERENCES program_phases(id) ON DELETE CASCADE, title TEXT NOT NULL, delivery_mode TEXT NOT NULL DEFAULT 'virtual', session_date DATE, sort_order INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
		`CREATE INDEX IF NOT EXISTS idx_program_modules_phase_id ON program_modules(phase_id)`,
		`ALTER TABLE activities ADD COLUMN IF NOT EXISTS module_id UUID REFERENCES program_modules(id) ON DELETE CASCADE`,
		`ALTER TABLE activities ADD COLUMN IF NOT EXISTS slot TEXT NOT NULL DEFAULT ''`,
		`DO $$ BEGIN ALTER TABLE activities ADD CONSTRAINT chk_activities_slot CHECK (slot IN ('', 'pre', 'post')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`,
		`CREATE INDEX IF NOT EXISTS idx_activities_module_id ON activities(module_id)`,

		// idx_activities_phase_id/idx_program_phases_program_id were claimed
		// by migrations/000004_programs.up.sql, but per CLAUDE.md that .sql
		// file never actually runs against the shared DB - only this Go code
		// applies schema at boot. Neither was ever backed by Go, so they may
		// be missing on the live table (seen as a 200ms+ slow-query warning
		// from ai/riskscoring's overdue-activities lookup, which joins
		// activities -> program_phases on exactly these columns).
		`CREATE INDEX IF NOT EXISTS idx_activities_phase_id ON activities(phase_id)`,
		`CREATE INDEX IF NOT EXISTS idx_program_phases_program_id ON program_phases(program_id)`,

		// is_open - marketplace flag. When true (and status='active') the program is
		// listed on the public landing page and open for self-enrollment.
		`ALTER TABLE programs ADD COLUMN IF NOT EXISTS is_open BOOLEAN NOT NULL DEFAULT false`,
		`ALTER TABLE programs ADD COLUMN IF NOT EXISTS payment_required BOOLEAN NOT NULL DEFAULT FALSE`,
		`ALTER TABLE programs ADD COLUMN IF NOT EXISTS price_amount BIGINT NOT NULL DEFAULT 0`,
		`ALTER TABLE programs ADD COLUMN IF NOT EXISTS currency CHAR(3) NOT NULL DEFAULT 'INR'`,
		`ALTER TABLE programs ADD COLUMN IF NOT EXISTS gst_inclusive BOOLEAN NOT NULL DEFAULT TRUE`,
		`ALTER TABLE programs ADD COLUMN IF NOT EXISTS gst_rate_bps INT NOT NULL DEFAULT 0`,
		`DO $$ BEGIN
			IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_programs_price_amount_nonnegative') THEN ALTER TABLE programs ADD CONSTRAINT chk_programs_price_amount_nonnegative CHECK (price_amount >= 0); END IF;
			IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_programs_gst_rate_bps_nonnegative') THEN ALTER TABLE programs ADD CONSTRAINT chk_programs_gst_rate_bps_nonnegative CHECK (gst_rate_bps >= 0); END IF;
			IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_programs_currency_code') THEN ALTER TABLE programs ADD CONSTRAINT chk_programs_currency_code CHECK (currency ~ '^[A-Z]{3}$'); END IF;
			IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_programs_paid_price') THEN ALTER TABLE programs ADD CONSTRAINT chk_programs_paid_price CHECK (NOT payment_required OR price_amount > 0); END IF;
		END $$`,
	}
	sqlDB, err := database.DB.DB()
	if err != nil {
		log.Printf("programs: schema init failed (get sqlDB): %v", err)
		return
	}
	for _, s := range sqls {
		if _, err := sqlDB.Exec(s); err != nil {
			log.Printf("programs: schema init warn: %v", err)
		}
	}
	log.Println("programs: schema ready (modules v2)")
}
