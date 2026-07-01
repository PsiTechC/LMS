-- Content library: org-scoped reusable assets (files stored as bytea in PostgreSQL)
CREATE TYPE asset_type AS ENUM (
  'quiz', 'elearning', 'assessment', 'video', 'case_study',
  'survey', 'l1_reaction', 'l2_learning', 'l3_behaviour', 'l4_impact', 'certificate'
);

CREATE TYPE asset_status AS ENUM ('draft', 'active', 'archived');

CREATE TABLE IF NOT EXISTS content_assets (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id        UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by    UUID        NOT NULL REFERENCES users(id),
  title         TEXT        NOT NULL,
  description   TEXT,
  asset_type    asset_type  NOT NULL,
  status        asset_status NOT NULL DEFAULT 'draft',

  -- file stored directly in PostgreSQL
  file_name     TEXT,           -- original filename
  file_size     BIGINT,         -- bytes
  mime_type     TEXT,           -- e.g. video/mp4, application/pdf
  file_data     BYTEA,          -- file content stored in DB

  -- metadata JSON (type-specific: questions, duration, scorm_entry, etc.)
  meta          JSONB NOT NULL DEFAULT '{}',

  -- usage tracking
  used_in_count INT NOT NULL DEFAULT 0,

  tags          TEXT[] NOT NULL DEFAULT '{}',

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_content_assets_org    ON content_assets(org_id);
CREATE INDEX idx_content_assets_type   ON content_assets(asset_type);
CREATE INDEX idx_content_assets_status ON content_assets(status);
CREATE INDEX idx_content_assets_creator ON content_assets(created_by);

-- Link assets to programs
CREATE TABLE IF NOT EXISTS content_asset_programs (
  asset_id   UUID NOT NULL REFERENCES content_assets(id) ON DELETE CASCADE,
  program_id UUID NOT NULL REFERENCES programs(id)       ON DELETE CASCADE,
  PRIMARY KEY (asset_id, program_id)
);
