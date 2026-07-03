-- Faculty Management (per the schema audit — adds only what was missing).
--
-- NOTE: users already carries specialization/bio/location/linkedin_url/certifications
-- (from 000017). This dedicated faculty_profiles table is the canonical, normalized
-- faculty profile store and additionally introduces delivery_modes, which did not
-- exist anywhere. It does NOT drop the users columns (non-destructive).
CREATE TABLE IF NOT EXISTS faculty_profiles (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id        UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    specialization TEXT  NOT NULL DEFAULT '',
    certifications JSONB NOT NULL DEFAULT '[]',   -- array of strings
    bio            TEXT  NOT NULL DEFAULT '',
    delivery_modes JSONB NOT NULL DEFAULT '[]',   -- array of: virtual | in-person | hybrid
    location       TEXT  NOT NULL DEFAULT '',
    linkedin_url   TEXT  NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_faculty_profiles_user ON faculty_profiles (user_id);

-- Extend activity_faculty with program-level assignment attributes.
ALTER TABLE activity_faculty ADD COLUMN IF NOT EXISTS role_on_program  TEXT  NOT NULL DEFAULT '';
ALTER TABLE activity_faculty ADD COLUMN IF NOT EXISTS sessions_planned INT   NOT NULL DEFAULT 0;
ALTER TABLE activity_faculty ADD COLUMN IF NOT EXISTS availability     JSONB NOT NULL DEFAULT '{}';

-- Faculty onboarding lifecycle.
CREATE TABLE IF NOT EXISTS onboarding_invites (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    faculty_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'sent', 'accepted')),
    sent_at         TIMESTAMPTZ,
    access_level    TEXT NOT NULL DEFAULT 'standard'
                    CHECK (access_level IN ('standard', 'advanced', 'admin')),
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_onboarding_invites_faculty ON onboarding_invites (faculty_user_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_invites_status  ON onboarding_invites (status);
