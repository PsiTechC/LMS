package systemhealth

import (
	"context"
	"log"
	"time"

	"github.com/xa-lms/api/pkg/database"
)

// fixSchema creates the system_metrics table idempotently on startup, mirroring
// migrations/000023_system_metrics.up.sql (same pattern as compliance/roles/audit).
func fixSchema() {
	db := database.DB
	sqls := []string{
		`CREATE TABLE IF NOT EXISTS system_metrics (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			bucket_start TIMESTAMPTZ NOT NULL,
			route TEXT NOT NULL,
			method TEXT NOT NULL,
			request_count BIGINT NOT NULL DEFAULT 0,
			error_count BIGINT NOT NULL DEFAULT 0,
			sum_latency_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
			max_latency_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
			UNIQUE (bucket_start, route, method)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_system_metrics_bucket ON system_metrics (bucket_start DESC)`,
		`CREATE TABLE IF NOT EXISTS system_health_trend (
			timestamp_bucket TIMESTAMPTZ PRIMARY KEY,
			avg_latency_ms DOUBLE PRECISION NOT NULL DEFAULT 0,
			request_count BIGINT NOT NULL DEFAULT 0,
			error_count BIGINT NOT NULL DEFAULT 0
		)`,
		`CREATE INDEX IF NOT EXISTS idx_system_health_trend_bucket ON system_health_trend (timestamp_bucket DESC)`,
	}
	for _, sql := range sqls {
		if err := db.Exec(sql).Error; err != nil {
			log.Printf("systemhealth fixSchema: %v", err)
		}
	}
	log.Println("systemhealth: schema ready")
}

// upsertBucket accumulates a flushed in-memory bucket into its persistent row.
// Counts and latency sums are added; max latency is maxed — so re-flushing the
// same window (e.g. after a restart) stays correct.
func upsertBucket(b *SystemMetric) error {
	sql := `
		INSERT INTO system_metrics
			(bucket_start, route, method, request_count, error_count, sum_latency_ms, max_latency_ms)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (bucket_start, route, method) DO UPDATE SET
			request_count  = system_metrics.request_count  + EXCLUDED.request_count,
			error_count    = system_metrics.error_count    + EXCLUDED.error_count,
			sum_latency_ms = system_metrics.sum_latency_ms + EXCLUDED.sum_latency_ms,
			max_latency_ms = GREATEST(system_metrics.max_latency_ms, EXCLUDED.max_latency_ms)`
	return database.DB.Exec(sql, b.BucketStart, b.Route, b.Method,
		b.RequestCount, b.ErrorCount, b.SumLatencyMs, b.MaxLatencyMs).Error
}

// windowTotals returns aggregate counts/latency across all endpoints since `since`.
func windowTotals(since time.Time) (totalReq, totalErr int64, sumLatency, maxLatency float64, err error) {
	var row struct {
		TotalReq   int64
		TotalErr   int64
		SumLatency float64
		MaxLatency float64
	}
	err = database.DB.
		Table("system_metrics").
		Select("COALESCE(SUM(request_count),0) AS total_req, COALESCE(SUM(error_count),0) AS total_err, COALESCE(SUM(sum_latency_ms),0) AS sum_latency, COALESCE(MAX(max_latency_ms),0) AS max_latency").
		Where("bucket_start >= ?", since).
		Scan(&row).Error
	return row.TotalReq, row.TotalErr, row.SumLatency, row.MaxLatency, err
}

// upsertTrendBucket writes one overall 5-minute trend row. On the rare re-flush
// of the same bucket (safety net), request_count / error_count are added and
// avg_latency_ms is recombined as a request-weighted average (exact, since
// avg*count == sum).
func upsertTrendBucket(bucket time.Time, avg float64, reqCount, errCount int64) error {
	sql := `
		INSERT INTO system_health_trend (timestamp_bucket, avg_latency_ms, request_count, error_count)
		VALUES (?, ?, ?, ?)
		ON CONFLICT (timestamp_bucket) DO UPDATE SET
			avg_latency_ms = CASE
				WHEN (system_health_trend.request_count + EXCLUDED.request_count) > 0
				THEN (system_health_trend.avg_latency_ms * system_health_trend.request_count
					+ EXCLUDED.avg_latency_ms * EXCLUDED.request_count)
					/ (system_health_trend.request_count + EXCLUDED.request_count)
				ELSE 0 END,
			request_count = system_health_trend.request_count + EXCLUDED.request_count,
			error_count   = system_health_trend.error_count   + EXCLUDED.error_count`
	return database.DB.Exec(sql, bucket, avg, reqCount, errCount).Error
}

// trendSince returns overall trend rows since `since`, oldest first (chart order).
func trendSince(since time.Time) ([]SystemHealthTrend, error) {
	var rows []SystemHealthTrend
	err := database.DB.
		Where("timestamp_bucket >= ?", since).
		Order("timestamp_bucket ASC").
		Find(&rows).Error
	return rows, err
}

// endpointAggregates returns per-(route,method) rollups since `since`, busiest first.
func endpointAggregates(since time.Time, limit int) ([]EndpointMetricDTO, error) {
	type aggRow struct {
		Route        string
		Method       string
		RequestCount int64
		ErrorCount   int64
		SumLatencyMs float64
		MaxLatencyMs float64
	}
	var rows []aggRow
	err := database.DB.
		Table("system_metrics").
		Select(`route, method,
			SUM(request_count) AS request_count,
			SUM(error_count) AS error_count,
			SUM(sum_latency_ms) AS sum_latency_ms,
			MAX(max_latency_ms) AS max_latency_ms`).
		Where("bucket_start >= ?", since).
		Group("route, method").
		Order("request_count DESC").
		Limit(limit).
		Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	out := make([]EndpointMetricDTO, 0, len(rows))
	for _, r := range rows {
		m := EndpointMetricDTO{
			Route:        r.Route,
			Method:       r.Method,
			RequestCount: r.RequestCount,
			ErrorCount:   r.ErrorCount,
			MaxLatencyMs: round2(r.MaxLatencyMs),
		}
		if r.RequestCount > 0 {
			m.AvgLatencyMs = round2(r.SumLatencyMs / float64(r.RequestCount))
			m.ErrorRate = round4(float64(r.ErrorCount) / float64(r.RequestCount))
		}
		out = append(out, m)
	}
	return out, nil
}

// pingDB checks Postgres connectivity with a short timeout and returns latency.
func pingDB() (time.Duration, error) {
	sqlDB, err := database.DB.DB()
	if err != nil {
		return 0, err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	start := time.Now()
	err = sqlDB.PingContext(ctx)
	return time.Since(start), err
}

// dbPoolStats reads the live connection-pool stats from database/sql.
func dbPoolStats() DBPoolDTO {
	sqlDB, err := database.DB.DB()
	if err != nil {
		return DBPoolDTO{}
	}
	s := sqlDB.Stats()
	return DBPoolDTO{
		OpenConnections: s.OpenConnections,
		InUse:           s.InUse,
		Idle:            s.Idle,
		MaxOpen:         s.MaxOpenConnections,
		WaitCount:       s.WaitCount,
		WaitDurationMs:  s.WaitDuration.Milliseconds(),
	}
}
