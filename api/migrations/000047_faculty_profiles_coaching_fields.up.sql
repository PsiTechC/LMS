-- Coaching-specific metadata on faculty_profiles, used by both Faculty and
-- Coach onboarding (the shared OnboardFacultyWizard). Coach fields are
-- zero-valued/empty for faculty-only rows.
ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS coaching_years_experience INT NOT NULL DEFAULT 0;
ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS coaching_methodology TEXT NOT NULL DEFAULT '';
ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS max_concurrent_coachees INT NOT NULL DEFAULT 0;
ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS preferred_session_mins INT NOT NULL DEFAULT 0;
ALTER TABLE faculty_profiles ADD COLUMN IF NOT EXISTS time_zone TEXT NOT NULL DEFAULT '';
