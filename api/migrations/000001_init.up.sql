-- Enable extensions needed across the full schema
-- Tables will be added module by module in subsequent migrations

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";    -- UUID generation
CREATE EXTENSION IF NOT EXISTS "pg_trgm";      -- Fuzzy text search (user/program search)
CREATE EXTENSION IF NOT EXISTS "vector";       -- pgvector: AI embeddings for coach context (future)
CREATE EXTENSION IF NOT EXISTS "citext";       -- Case-insensitive text (emails)
