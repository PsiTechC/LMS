-- Backfill role_assignments for existing program_manager users, linking each to
-- the seeded program_manager SYSTEM role in custom_roles. Additive only — no
-- existing hardcoded check touched, no table/column altered.
--
-- HISTORICAL RECORD ONLY — not run automatically (see CLAUDE.md → Database
-- Migrations). Applied out of band; idempotent, so safe to re-run.
--
-- Source of truth for the PM persona is users.role (org_members.role carries no
-- program_manager rows). org_id on the assignment is scoped to the user's org
-- membership when present, else NULL (role_assignments.org_id is an optional
-- scope; the resolver does not filter on it). role_id → the platform-global
-- program_manager system role (is_system=true, org_id NULL). Idempotency via
-- NOT EXISTS since role_assignments has no (user_id, role_id) unique constraint.

INSERT INTO role_assignments (user_id, role_id, org_id, assigned_by)
SELECT u.id,
       cr.id,
       (SELECT om.org_id FROM org_members om WHERE om.user_id = u.id LIMIT 1),
       NULL
FROM users u
CROSS JOIN LATERAL (
    SELECT id FROM custom_roles
    WHERE is_system = TRUE AND org_id IS NULL AND name = 'program_manager'
    LIMIT 1
) cr
WHERE u.role = 'program_manager'
  AND NOT EXISTS (
      SELECT 1 FROM role_assignments ra
      WHERE ra.user_id = u.id AND ra.role_id = cr.id
  );
