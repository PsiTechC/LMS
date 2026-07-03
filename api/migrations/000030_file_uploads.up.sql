-- Migration 000016: file_uploads table (disk-based, no bytea)
-- Files are stored on disk; only the relative path (file_key) is in the DB.
-- This avoids storing large blobs in Postgres and allows range-request streaming.

CREATE TABLE IF NOT EXISTS file_uploads (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    file_key      TEXT         NOT NULL,          -- relative path: "uploads/<uuid>_name.pdf"
    original_name VARCHAR(500) NOT NULL,          -- display filename shown to user
    content_type  VARCHAR(200) NOT NULL,          -- MIME type e.g. "application/pdf"
    size_bytes    BIGINT       NOT NULL,
    uploaded_by   UUID         NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_file_uploads_uploaded_by ON file_uploads(uploaded_by);