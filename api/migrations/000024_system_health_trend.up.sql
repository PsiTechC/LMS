-- System Health latency/error trend (PRD §4.4.5).
-- One row per rolling 5-minute window aggregating ALL endpoints, written by the
-- request-timing middleware's flush loop. Powers the historical latency-trend
-- chart. Backfill is impossible — history begins when this ships; earlier
-- buckets are simply absent (never zero-filled or fabricated).
CREATE TABLE IF NOT EXISTS system_health_trend (
    timestamp_bucket TIMESTAMPTZ PRIMARY KEY,          -- start of the 5-min window (UTC)
    avg_latency_ms   DOUBLE PRECISION NOT NULL DEFAULT 0,
    request_count    BIGINT NOT NULL DEFAULT 0,
    error_count      BIGINT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_system_health_trend_bucket
    ON system_health_trend (timestamp_bucket DESC);
