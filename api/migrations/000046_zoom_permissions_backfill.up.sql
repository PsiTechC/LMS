-- Backfills zoom:manage / zoom:join into the "faculty" and "coach" seeded
-- system roles (custom_roles, is_system=TRUE, org_id IS NULL).
--
-- Root cause: migration 000035_seed_system_roles took a one-time static
-- snapshot of shared/rbac.go's PermissionsForRole() output. Nothing re-syncs
-- that snapshot when the live matrix changes, so any permission added after
-- 000035 (zoom:manage/zoom:join being the first case found) is missing from
-- every user's resolved permission set once they have a role_assignments row
-- pointing at these seeded roles — even though the static matrix (used for
-- non-cutover roles / resolver-error fallback) has always had it correct.
--
-- HISTORICAL RECORD ONLY — like every file in this directory, this .sql is
-- NOT run automatically (see CLAUDE.md → Database Migrations). It documents
-- what was applied out-of-band to the shared DB, mirroring how 000035/37/38
-- (the other permission-seed migrations) were handled. Idempotent: only
-- touches rows that don't already have zoom:manage, and de-duplicates via
-- jsonb_agg(DISTINCT ...), so it's safe to re-run.
--
-- program_manager and participant are deliberately NOT touched: PM isn't in
-- HybridPermission's resolver-cutover role set for the zoom module (still
-- uses the static matrix, unaffected in practice), and participant was never
-- granted zoom:manage/zoom:join in the matrix to begin with.
UPDATE custom_roles
SET permissions = (
    SELECT jsonb_agg(DISTINCT elem)
    FROM jsonb_array_elements(permissions || '["zoom:manage","zoom:join"]'::jsonb) AS t(elem)
), updated_at = NOW()
WHERE is_system = TRUE AND org_id IS NULL AND name IN ('faculty', 'coach')
  AND NOT (permissions @> '["zoom:manage"]'::jsonb);
