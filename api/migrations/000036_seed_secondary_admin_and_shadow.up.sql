-- Additive groundwork (shadow-mode pass). HISTORICAL RECORD ONLY — not run
-- automatically (see CLAUDE.md → Database Migrations). Applied out of band,
-- idempotently, to the shared DB. No existing table/column/row altered.

-- 1. Delegated super admin custom role: full superadmin permission set MINUS the
--    four locked tabs. billing & integrations have no permission key in the
--    matrix (not permission-gated), so only system_health (system:read) and
--    audit_log (audit:read, audit:admin) are removed from the full set.
INSERT INTO custom_roles (org_id, name, description, base_role, color, permissions, is_system)
VALUES (NULL, 'Super Admin (Secondary)',
  'Delegated super admin: full platform access minus Billing, System Health, Integrations, and Audit Log.',
  'superadmin', '#0052CC',
  '["activity_progress:read","analytics:read","analytics:write","branding:read","capstone:read","coaching:manage","coaching:read","coaching:self_read","coaching:write","cohorts:create","cohorts:delete","cohorts:read","cohorts:update","communications:manage","communications:read","communications:send","competencies:create","competencies:delete","competencies:read","competencies:update","compliance:manage","compliance:read","content:create","content:delete","content:read","content:update","discussions:admin","discussions:announce","discussions:create","discussions:manage","discussions:read","faculty_mgmt:manage","faculty_mgmt:read","faculty_onboard:create","faculty_roster:read","feedback_360:admin","feedback_360:read","grading:admin","leaderboard:admin","leaderboard:read","notifications:read","org_access:manage","org_access:read","organizations:create","organizations:delete","organizations:read","organizations:update","programs:create","programs:delete","programs:read","programs:update","roles:manage","roles:read","sessions:admin","sessions:create","sessions:delete","sessions:read","sessions:update","submissions:grade","submissions:read","surveys:admin","surveys:manage","surveys:read","users:create","users:delete","users:read","users:update"]'::jsonb,
  FALSE)
ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) DO NOTHING;

-- 2. Shadow-mode observability table. Records every program_manager permission
--    check with both the real (enforced) decision and the not-yet-enforced
--    rbac.Resolve decision, so cutover confidence is measurable. Written to only
--    by internal/shared/rbac_shadow.go; never read on the request path.
CREATE TABLE IF NOT EXISTS rbac_shadow_checks (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  checked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id      UUID,
  role         TEXT NOT NULL,
  resource     TEXT NOT NULL,
  action       TEXT NOT NULL,
  real_allow   BOOLEAN NOT NULL,
  shadow_allow BOOLEAN NOT NULL,
  agreed       BOOLEAN NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rbac_shadow_agreed ON rbac_shadow_checks(agreed);
