package seed

import (
	"errors"
	"log"
	"os"

	"github.com/xa-lms/api/internal/auth"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

// SuperAdmin ensures a default superadmin exists for development.
func SuperAdmin() error {
	// ── Schema fixes — idempotent ALTERs run once on every startup ──────────
	fixSchema()

	email := os.Getenv("SUPERADMIN_EMAIL")
	if email == "" {
		email = "superadmin@xa-lms.dev"
	}
	password := os.Getenv("SUPERADMIN_PASSWORD")
	if password == "" {
		password = "XA@SuperAdmin2025"
	}

	var existing auth.User
	err := database.DB.Where("email = ?", email).First(&existing).Error
	if err == nil {
		log.Printf("✅ Superadmin already exists: %s", email)
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}

	u := &auth.User{
		Email:        email,
		Name:         "XA Super Admin",
		PasswordHash: hash,
		Role:         "superadmin",
		IsActive:     true,
		IsVerified:   true,
	}
	if err := database.DB.Create(u).Error; err != nil {
		return err
	}

	log.Printf("✅ Default superadmin created → email: %s | password: %s", email, password)
	return nil
}

// fixSchema applies missing columns to the shared VPS DB.
// All statements use IF NOT EXISTS / safe defaults so re-running is harmless.
func fixSchema() {
	stmts := []string{
		// users — email verification columns
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN NOT NULL DEFAULT false`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token TEXT`,
		`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_expires_at TIMESTAMPTZ`,
		`UPDATE users SET is_verified = true WHERE is_verified = false`,

		// program_phases — timeline columns + drop redundant unique constraint on phase_number
		`ALTER TABLE program_phases ADD COLUMN IF NOT EXISTS start_day INT NOT NULL DEFAULT 1`,
		`ALTER TABLE program_phases ADD COLUMN IF NOT EXISTS end_day INT NOT NULL DEFAULT 14`,
		`ALTER TABLE program_phases DROP CONSTRAINT IF EXISTS program_phases_program_id_phase_number_key`,

		// activities — timeline columns
		`ALTER TABLE activities ADD COLUMN IF NOT EXISTS start_day INT NOT NULL DEFAULT 1`,
		`ALTER TABLE activities ADD COLUMN IF NOT EXISTS duration_days INT NOT NULL DEFAULT 3`,

		// activity_faculty — faculty session assignment
		`CREATE TABLE IF NOT EXISTS activity_faculty (
			id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			activity_id     UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
			faculty_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			role            VARCHAR(50) NOT NULL DEFAULT 'Lead',
			override_note   TEXT,
			created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			UNIQUE(activity_id, faculty_user_id)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_activity_faculty_activity ON activity_faculty(activity_id)`,
		`CREATE INDEX IF NOT EXISTS idx_activity_faculty_user ON activity_faculty(faculty_user_id)`,
	}

	for _, s := range stmts {
		if err := database.DB.Exec(s).Error; err != nil {
			log.Printf("⚠️  fixSchema: %v", err)
		}
	}
	log.Println("✅ Schema up to date")
}
