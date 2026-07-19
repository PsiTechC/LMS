-- HISTORICAL RECORD ONLY. Like every file in this directory, this .sql is NOT
-- run automatically by the app (see CLAUDE.md → Database Migrations). The
-- actual idempotent schema change lives in api/internal/users/repository.go
-- (fixSchema, called from NewHandler on every boot).
--
-- Adds user_avatars, a bytea-backed profile-picture store mirroring
-- organization_logos' storage pattern (bytes in Postgres, not S3 — no AWS
-- SDK exists anywhere in this repo). users.avatar_url (already present on
-- auth.User) stores the servable path to the current row, kept off the users
-- table itself so an avatar swap is a cheap insert + pointer update rather
-- than rewriting a large row.

ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

CREATE TABLE IF NOT EXISTS user_avatars (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_name TEXT,
    mime_type TEXT,
    file_size BIGINT,
    file_data BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_avatars_user ON user_avatars(user_id);
