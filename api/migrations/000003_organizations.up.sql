CREATE TYPE org_plan   AS ENUM ('starter', 'pro', 'enterprise');
CREATE TYPE org_status AS ENUM ('active', 'trial', 'suspended', 'onboarding');

CREATE TABLE organizations (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name         TEXT NOT NULL,
    slug         TEXT NOT NULL UNIQUE,
    logo_url     TEXT,
    plan         org_plan   NOT NULL DEFAULT 'starter',
    status       org_status NOT NULL DEFAULT 'onboarding',
    seats        INT NOT NULL DEFAULT 50,
    industry     TEXT,
    size         TEXT,
    feature_flags JSONB NOT NULL DEFAULT '{}',
    settings      JSONB NOT NULL DEFAULT '{}',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_organizations_slug   ON organizations (slug);
CREATE INDEX idx_organizations_status ON organizations (status);

CREATE TYPE org_member_role AS ENUM ('admin', 'program_manager', 'faculty', 'participant');

CREATE TABLE org_members (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id      UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id     UUID NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
    role        org_member_role NOT NULL DEFAULT 'participant',
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, user_id)
);

CREATE INDEX idx_org_members_org_id  ON org_members (org_id);
CREATE INDEX idx_org_members_user_id ON org_members (user_id);
