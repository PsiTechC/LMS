-- Reverse of 000035: remove the 4 seeded platform-global system roles.
-- HISTORICAL RECORD ONLY (not run automatically). Scoped narrowly to the exact
-- rows seeded (is_system, org_id IS NULL, the 4 persona names) so it can never
-- touch org-created custom roles.

DELETE FROM custom_roles
WHERE is_system = TRUE
  AND org_id IS NULL
  AND name IN ('program_manager', 'faculty', 'coach', 'participant');
