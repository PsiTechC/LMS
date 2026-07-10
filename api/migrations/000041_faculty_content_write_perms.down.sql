-- Historical record only (not auto-run). Reverts the faculty system role's
-- permissions to the pre-000041 snapshot from migration 000035.

UPDATE custom_roles
SET permissions = '["activity_progress:read","analytics:read","analytics:write","branding:read","capstone:read","coaching:read","coaching:self_read","coaching:write","cohorts:create","cohorts:read","cohorts:update","competencies:create","competencies:read","competencies:update","content:read","discussions:announce","discussions:create","discussions:manage","discussions:read","faculty_mgmt:read","feedback_360:read","leaderboard:read","notifications:read","programs:create","programs:read","programs:update","sessions:create","sessions:read","sessions:update","submissions:grade","submissions:read","surveys:manage","surveys:read"]'::jsonb,
    updated_at = NOW()
WHERE is_system = TRUE AND org_id IS NULL AND lower(name) = 'faculty';
