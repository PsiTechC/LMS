-- Central audit logging system.
-- A richer, cross-cutting event log than the legacy audit_logs table: every
-- module emits structured events here via the audit.Log / audit.LogActor helpers.
-- actor_user_id is nullable so anonymous flows (e.g. a failed login with an
-- unknown email) can still be recorded.
CREATE TABLE IF NOT EXISTS audit_events (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_user_id  UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_role     TEXT,
    org_id         UUID REFERENCES organizations(id) ON DELETE SET NULL,
    category       TEXT NOT NULL,
    action         TEXT NOT NULL,
    target_type    TEXT,
    target_id      TEXT,
    severity       TEXT NOT NULL DEFAULT 'info'
                   CHECK (severity IN ('info', 'warning', 'error', 'success')),
    detail         JSONB NOT NULL DEFAULT '{}',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_actor    ON audit_events (actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_org      ON audit_events (org_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_category ON audit_events (category);
CREATE INDEX IF NOT EXISTS idx_audit_events_action   ON audit_events (action);
CREATE INDEX IF NOT EXISTS idx_audit_events_severity ON audit_events (severity);
CREATE INDEX IF NOT EXISTS idx_audit_events_created  ON audit_events (created_at DESC);
