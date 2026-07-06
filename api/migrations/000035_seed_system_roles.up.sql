-- Additive groundwork: seed 4 platform-global system roles into custom_roles.
--
-- HISTORICAL RECORD ONLY. Like every file in this directory, this .sql is NOT
-- run automatically by the app (see CLAUDE.md → Database Migrations). The rows
-- were applied idempotently to the shared DB out of band; this file documents
-- exactly what was inserted so it is reproducible.
--
-- Each row mirrors a base persona's CURRENT real access, derived directly from
-- the hardcoded permission matrix (internal/shared/rbac.go, PermissionsForRole).
-- is_system = TRUE, org_id = NULL (platform-global). No existing table, column,
-- or row is modified. Safe to re-run: ON CONFLICT DO NOTHING against the
-- (COALESCE(org_id,'000…'), lower(name)) unique index.

INSERT INTO custom_roles (org_id, name, description, base_role, color, permissions, is_system)
VALUES (NULL, 'program_manager', 'System role: Program Manager — current platform access', 'program_manager', '#1C2551',
  '["activity_progress:read","analytics:read","analytics:write","audit:read","branding:manage","branding:read","capstone:read","coaching:manage","coaching:read","coaching:self_read","cohorts:create","cohorts:read","cohorts:update","communications:manage","communications:read","communications:send","competencies:create","competencies:delete","competencies:read","competencies:update","compliance:manage","compliance:read","content:create","content:read","content:update","discussions:announce","discussions:create","discussions:manage","discussions:read","faculty_mgmt:manage","faculty_mgmt:read","feedback_360:read","leaderboard:read","notifications:read","programs:create","programs:delete","programs:read","programs:update","sessions:create","sessions:delete","sessions:read","sessions:update","submissions:read","surveys:manage","surveys:read","users:create","users:read","users:update"]'::jsonb,
  TRUE)
ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) DO NOTHING;

INSERT INTO custom_roles (org_id, name, description, base_role, color, permissions, is_system)
VALUES (NULL, 'faculty', 'System role: Faculty — current platform access', 'faculty', '#6B73BF',
  '["activity_progress:read","analytics:read","analytics:write","branding:read","capstone:read","coaching:read","coaching:self_read","coaching:write","cohorts:create","cohorts:read","cohorts:update","competencies:create","competencies:read","competencies:update","content:read","discussions:announce","discussions:create","discussions:manage","discussions:read","faculty_mgmt:read","feedback_360:read","leaderboard:read","notifications:read","programs:create","programs:read","programs:update","sessions:create","sessions:read","sessions:update","submissions:grade","submissions:read","surveys:manage","surveys:read"]'::jsonb,
  TRUE)
ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) DO NOTHING;

INSERT INTO custom_roles (org_id, name, description, base_role, color, permissions, is_system)
VALUES (NULL, 'coach', 'System role: Coach — current platform access', 'coach', '#6B73BF',
  '["coaching:read","coaching:self_read","coaching:write","cohorts:read","notifications:read","programs:read","sessions:read"]'::jsonb,
  TRUE)
ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) DO NOTHING;

INSERT INTO custom_roles (org_id, name, description, base_role, color, permissions, is_system)
VALUES (NULL, 'participant', 'System role: Participant — current platform access', 'participant', '#EF4E24',
  '["activity_progress:read","activity_progress:write","branding:read","capstone:read","capstone:write","coaching:self_read","cohorts:read","content:read","discussions:create","discussions:read","feedback_360:read","feedback_360:write","leaderboard:read","leaderboard:write","notifications:read","programs:read","sessions:read","submissions:create","submissions:read","surveys:read","surveys:write"]'::jsonb,
  TRUE)
ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) DO NOTHING;
