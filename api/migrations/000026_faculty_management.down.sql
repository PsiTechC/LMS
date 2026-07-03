DROP TABLE IF EXISTS onboarding_invites;
ALTER TABLE activity_faculty DROP COLUMN IF EXISTS availability;
ALTER TABLE activity_faculty DROP COLUMN IF EXISTS sessions_planned;
ALTER TABLE activity_faculty DROP COLUMN IF EXISTS role_on_program;
DROP TABLE IF EXISTS faculty_profiles;
