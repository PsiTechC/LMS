-- System Health metrics (PRD §4.4.5).
-- Stores rolling 5-minute AGGREGATES of request timing per endpoint — never raw
-- per-request rows — to avoid table bloat. One row per (bucket_start, route,
-- method); the collector upserts accumulated counts/latency on flush.
CREATE TABLE IF NOT EXISTS system_metrics (
    id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    bucket_start   TIMESTAMPTZ NOT NULL,        -- start of the 5-min window (UTC)
    route          TEXT NOT NULL,               -- echo route pattern, e.g. /api/v1/programs/:id
    method         TEXT NOT NULL,
    request_count  BIGINT NOT NULL DEFAULT 0,
    error_count    BIGINT NOT NULL DEFAULT 0,   -- responses with status >= 500
    sum_latency_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
    max_latency_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
    UNIQUE (bucket_start, route, method)
);

CREATE INDEX IF NOT EXISTS idx_system_metrics_bucket ON system_metrics (bucket_start DESC);
