-- HISTORICAL RECORD ONLY. Like every file in this directory, this .sql is NOT
-- run automatically by the app (see CLAUDE.md → Database Migrations). The
-- actual idempotent schema change lives in api/internal/organizations/init.go
-- (InitSchema, called from main.go on every boot).
--
-- Adds organization_logos, a bytea-backed logo store mirroring
-- content_assets' file-storage pattern (bytes in Postgres, not S3 — no AWS
-- SDK exists anywhere in this repo). Organization.logo_url stores the
-- servable path to the current row, kept off the organizations table itself
-- so a logo swap is a cheap insert + pointer update rather than rewriting a
-- large row on a table read on nearly every page load (branding fetch).

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url text;

CREATE TABLE IF NOT EXISTS organization_logos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    file_name TEXT,
    mime_type TEXT,
    file_size BIGINT,
    file_data BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organization_logos_org ON organization_logos(org_id);
