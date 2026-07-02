package programs

import (
	"log"

	"github.com/xa-lms/api/pkg/database"
)

// InitSchema adds the Program Design Studio v2 columns/tables if they don't
// already exist, so no manual migration step is required at startup.
// Phase types (pre-enrolment, orientation, module-virtual, etc.) drive which
// UI the Design Studio renders for that phase; modules group activities into
// PRE-WORK / POST-WORK slots within module-type phases.
func InitSchema() {
	db := database.DB
	sqls := []string{
		// admin_task: activity-phase cards (Nomination, Welcome Email, Manager Briefing, etc.)
		// in pre-enrolment/post-program phases — distinct from learning activity types.
		`ALTER TYPE activity_type ADD VALUE IF NOT EXISTS 'admin_task'`,

		`ALTER TABLE program_phases ADD COLUMN IF NOT EXISTS phase_type TEXT NOT NULL DEFAULT 'custom'`,
		`ALTER TABLE program_phases ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT ''`,

		`DO $$ BEGIN
			ALTER TABLE program_phases ADD CONSTRAINT chk_program_phases_phase_type CHECK (phase_type IN (
				'pre-enrolment', 'orientation', 'module-virtual', 'module-in-person',
				'coaching', 'capstone', 'post-program', 'custom'
			));
		EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

		`CREATE TABLE IF NOT EXISTS program_modules (
			id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			phase_id      UUID NOT NULL REFERENCES program_phases(id) ON DELETE CASCADE,
			title         TEXT NOT NULL,
			delivery_mode TEXT NOT NULL DEFAULT 'virtual',
			session_date  DATE,
			sort_order    INT NOT NULL DEFAULT 0,
			created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,

		`CREATE INDEX IF NOT EXISTS idx_program_modules_phase_id ON program_modules(phase_id)`,

		`ALTER TABLE activities ADD COLUMN IF NOT EXISTS module_id UUID REFERENCES program_modules(id) ON DELETE CASCADE`,
		`ALTER TABLE activities ADD COLUMN IF NOT EXISTS slot TEXT NOT NULL DEFAULT ''`,

		`DO $$ BEGIN
			ALTER TABLE activities ADD CONSTRAINT chk_activities_slot CHECK (slot IN ('', 'pre', 'post'));
		EXCEPTION WHEN duplicate_object THEN NULL; END $$`,

		`CREATE INDEX IF NOT EXISTS idx_activities_module_id ON activities(module_id)`,
	}

	sqlDB, err := db.DB()
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
