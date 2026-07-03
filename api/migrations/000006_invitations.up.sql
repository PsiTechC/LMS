CREATE TYPE invitation_status AS ENUM ('pending', 'accepted', 'expired');

CREATE TABLE invitations (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    cohort_id    UUID NOT NULL REFERENCES cohorts(id)       ON DELETE CASCADE,
    org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email        TEXT NOT NULL,
    role         org_member_role NOT NULL DEFAULT 'participant',
    token_hash   TEXT NOT NULL UNIQUE,   -- SHA-256 of the raw JWT, for fast lookup + revocation
    status       invitation_status NOT NULL DEFAULT 'pending',
    invited_by   UUID NOT NULL REFERENCES users(id),
    expires_at   TIMESTAMPTZ NOT NULL,
    accepted_at  TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invitations_cohort_id  ON invitations (cohort_id);
CREATE INDEX idx_invitations_email      ON invitations (email);
CREATE INDEX idx_invitations_token_hash ON invitations (token_hash);
CREATE INDEX idx_invitations_status     ON invitations (status);
