-- Role Management (PRD §4.4.3)
-- Custom roles with granular permission sets, time-bound scoped assignments,
-- and per-organization IP allowlist / geo-restriction access rules.
-- All management is superadmin-only (enforced in middleware + service layer).

-- ── Custom roles ────────────────────────────────────────────────────────────
-- A custom role extends one of the four base personas (base_role) and carries
-- an explicit granular permission set (permissions JSONB: array of
-- "resource:action" strings) that is unioned on top of everything the base
-- persona inherits. org_id NULL = platform-global role (superadmin authored).
CREATE TABLE IF NOT EXISTS custom_roles (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id       UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    base_role    user_role NOT NULL DEFAULT 'participant',
    permissions  JSONB NOT NULL DEFAULT '[]',
    is_system    BOOLEAN NOT NULL DEFAULT FALSE,
    created_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A role name is unique within its org (and unique among global roles where org_id IS NULL).
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_roles_org_name
    ON custom_roles (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));
CREATE INDEX IF NOT EXISTS idx_custom_roles_org ON custom_roles (org_id);

-- ── Role assignments ────────────────────────────────────────────────────────
-- Assigns either a custom role (role_id) or a bare base persona (base_role) to
-- a user, optionally scoped to an org and/or program, with optional time-bound
-- validity (valid_from / valid_until). NULL bounds mean "no bound".
CREATE TABLE IF NOT EXISTS role_assignments (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id      UUID REFERENCES custom_roles(id) ON DELETE CASCADE,
    base_role    user_role,
    org_id       UUID REFERENCES organizations(id) ON DELETE CASCADE,
    program_id   UUID,
    valid_from   TIMESTAMPTZ,
    valid_until  TIMESTAMPTZ,
    assigned_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- must reference exactly one of a custom role or a base persona
    CONSTRAINT role_assignment_target CHECK (
        (role_id IS NOT NULL AND base_role IS NULL) OR
        (role_id IS NULL AND base_role IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_role_assignments_user    ON role_assignments (user_id);
CREATE INDEX IF NOT EXISTS idx_role_assignments_org     ON role_assignments (org_id);
CREATE INDEX IF NOT EXISTS idx_role_assignments_program ON role_assignments (program_id);
CREATE INDEX IF NOT EXISTS idx_role_assignments_role    ON role_assignments (role_id);

-- ── Organization access rules ───────────────────────────────────────────────
-- One row per org. IP allowlist (array of CIDR/IP strings) and geo-restriction
-- (allowed / blocked ISO-3166 alpha-2 country codes). Empty arrays = no
-- restriction on that dimension. enforce = master switch.
CREATE TABLE IF NOT EXISTS org_access_rules (
    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id            UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    ip_allowlist      JSONB NOT NULL DEFAULT '[]',
    allowed_countries JSONB NOT NULL DEFAULT '[]',
    blocked_countries JSONB NOT NULL DEFAULT '[]',
    enforce           BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by        UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_access_rules_org ON org_access_rules (org_id);
