package faculty_management

import "github.com/xa-lms/api/pkg/database"

// InitSchema adds the coaching-specific profile columns (used by both Faculty
// and Coach onboarding — coach fields are zero-valued for faculty rows) to
// faculty_profiles on shared DBs that predate this addition.
func InitSchema() error {
	sqlDB, err := database.DB.DB()
	if err != nil {
		return err
	}
	_, err = sqlDB.Exec(`
		ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS coaching_years_experience INT NOT NULL DEFAULT 0;
		ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS coaching_methodology TEXT NOT NULL DEFAULT '';
		ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS max_concurrent_coachees INT NOT NULL DEFAULT 0;
		ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS preferred_session_mins INT NOT NULL DEFAULT 0;
		ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS time_zone TEXT NOT NULL DEFAULT '';
	`)
	return err
}
