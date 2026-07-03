-- Coach persona: a distinct role that delivers coaching engagements. A faculty
-- member can also be a coach; the coaches table is the source of truth for
-- "who can coach", independent of login role.
--
-- NOTE: this repo applies schema via Go on startup (see cmd/server/main.go);
-- this file is the historical record and does not run automatically.

ALTER TYPE user_role       ADD VALUE IF NOT EXISTS 'coach';
ALTER TYPE org_member_role ADD VALUE IF NOT EXISTS 'coach';

CREATE TABLE IF NOT EXISTS coaches (
    id         UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id    UUID        NOT NULL REFERENCES users(id)         ON DELETE CASCADE,
    org_id     UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_coaches_org_id  ON coaches (org_id);
CREATE INDEX IF NOT EXISTS idx_coaches_user_id ON coaches (user_id);
