-- HISTORICAL RECORD ONLY. Like every file in this directory, this .sql is NOT
-- run automatically by the app (see CLAUDE.md → Database Migrations).
--
-- The system "faculty" custom_roles row seeded by migration 000035 was a
-- frozen snapshot of shared.PermissionsForRole("faculty") at that time, which
-- did not include content:create/content:update. The Content Library was
-- later opened up to Faculty (own-org authoring of quizzes, surveys,
-- Kirkpatrick L1-L4, certificates, case studies), and the hardcoded
-- permissionMatrix in internal/shared/rbac.go was updated accordingly — but
-- since custom_roles.permissions is a one-time seed with no re-sync path,
-- the DB row went stale and Faculty kept getting FORBIDDEN on save. This was
-- applied idempotently to the shared DB out of band; this file documents
-- exactly what changed so it is reproducible.

UPDATE custom_roles
SET permissions = '["activity_progress:read","analytics:read","analytics:write","branding:read","capstone:read","coaching:read","coaching:self_read","coaching:write","cohorts:create","cohorts:read","cohorts:update","competencies:create","competencies:read","competencies:update","content:create","content:read","content:update","discussions:announce","discussions:create","discussions:manage","discussions:read","faculty_mgmt:read","feedback_360:read","leaderboard:read","notifications:read","programs:create","programs:read","programs:update","sessions:create","sessions:read","sessions:update","submissions:grade","submissions:read","surveys:manage","surveys:read"]'::jsonb,
    updated_at = NOW()
WHERE is_system = TRUE AND org_id IS NULL AND lower(name) = 'faculty';
