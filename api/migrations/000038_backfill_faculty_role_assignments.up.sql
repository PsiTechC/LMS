-- Backfill role_assignments for existing faculty users, linking each to the
-- seeded faculty SYSTEM role in custom_roles. Additive only — no existing
-- hardcoded check touched, no table/column altered. Mirrors 000037 (PM backfill).
--
-- HISTORICAL RECORD ONLY — not run automatically (see CLAUDE.md → Database
-- Migrations). Applied out of band; idempotent, so safe to re-run.
--
-- Source of truth for the faculty persona is users.role. org_id on the
-- assignment is scoped to the user's org membership when present, else NULL
-- (role_assignments.org_id is an optional scope; the resolver does not filter on
-- it). role_id → the platform-global faculty system role (is_system=true,
-- org_id NULL). Idempotency via NOT EXISTS since role_assignments has no
-- (user_id, role_id) unique constraint. Guard matches on the specific
-- faculty-system role_id, so a faculty user who already holds a DIFFERENT
-- assignment still receives the faculty-system link (not a duplicate of it).

INSERT INTO role_assignments (user_id, role_id, org_id, assigned_by)
SELECT u.id,
       cr.id,
       (SELECT om.org_id FROM org_members om WHERE om.user_id = u.id LIMIT 1),
       NULL
FROM users u
CROSS JOIN LATERAL (
    SELECT id FROM custom_roles
    WHERE is_system = TRUE AND org_id IS NULL AND name = 'faculty'
    LIMIT 1
) cr
WHERE u.role = 'faculty'
  AND NOT EXISTS (
      SELECT 1 FROM role_assignments ra
      WHERE ra.user_id = u.id AND ra.role_id = cr.id
  );
