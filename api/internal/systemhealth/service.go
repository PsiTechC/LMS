package systemhealth

import (
	"math"
	"os"
	"sync"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/pkg/cache"
)

const (
	bucketDuration = 5 * time.Minute // rolling aggregate window
	flushInterval  = 60 * time.Second
	defaultWindow  = 60 // minutes, for the overview summary
)

// bucketKey identifies one in-memory aggregate slot.
type bucketKey struct {
	bucket time.Time
	route  string
	method string
}

// collector accumulates request timing in memory and periodically flushes
// completed 5-minute buckets to the database. This keeps writes to at most a
// handful of rows per window instead of one row per request.
type collector struct {
	mu      sync.Mutex
	buckets map[bucketKey]*SystemMetric
	started time.Time
}

var col = &collector{buckets: make(map[bucketKey]*SystemMetric)}

// record ingests a single completed request into the current bucket.
func record(route, method string, status int, latency time.Duration) {
	if route == "" {
		route = "unmatched"
	}
	key := bucketKey{
		bucket: time.Now().UTC().Truncate(bucketDuration),
		route:  route,
		method: method,
	}
	ms := float64(latency.Microseconds()) / 1000.0

	col.mu.Lock()
	defer col.mu.Unlock()
	agg := col.buckets[key]
	if agg == nil {
		agg = &SystemMetric{BucketStart: key.bucket, Route: route, Method: method}
		col.buckets[key] = agg
	}
	agg.RequestCount++
	if status >= 500 {
		agg.ErrorCount++
	}
	agg.SumLatencyMs += ms
	if ms > agg.MaxLatencyMs {
		agg.MaxLatencyMs = ms
	}
}

// Middleware records latency and status for every request under the group it is
// attached to. It reads the matched route pattern (c.Path()) rather than the raw
// URL, so path params like :id don't explode metric cardinality.
func Middleware() echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			start := time.Now()
			err := next(c)

			status := c.Response().Status
			// A returned error may not have been written to the response yet
			// (echo's error handler runs after this middleware), so classify it here.
			if err != nil {
				if he, ok := err.(*echo.HTTPError); ok {
					status = he.Code
				} else {
					status = 500
				}
			}
			record(c.Path(), c.Request().Method, status, time.Since(start))
			return err
		}
	}
}

// StartCollector records the process start time and launches the flush loop.
// Call once at startup after the DB is connected.
func StartCollector() {
	col.mu.Lock()
	col.started = time.Now()
	col.mu.Unlock()

	go func() {
		ticker := time.NewTicker(flushInterval)
		defer ticker.Stop()
		for range ticker.C {
			flush()
		}
	}()
}

// flush persists all completed buckets (those older than the current window)
// and drops them from memory. The in-progress bucket stays until it completes.
func flush() {
	current := time.Now().UTC().Truncate(bucketDuration)

	col.mu.Lock()
	var due []*SystemMetric
	for key, agg := range col.buckets {
		if key.bucket.Before(current) {
			due = append(due, agg)
			delete(col.buckets, key)
		}
	}
	col.mu.Unlock()

	// DB writes happen outside the lock.
	// 1) Per-endpoint rows.
	for _, b := range due {
		if err := upsertBucket(b); err != nil {
			// Metrics are best-effort; don't retry.
			_ = err
		}
	}

	// 2) Overall trend rows: collapse the due per-endpoint buckets into one
	//    aggregate per 5-minute window and persist for the latency-trend chart.
	type tot struct {
		sum float64
		req int64
		err int64
	}
	byBucket := make(map[time.Time]*tot)
	for _, b := range due {
		t := byBucket[b.BucketStart]
		if t == nil {
			t = &tot{}
			byBucket[b.BucketStart] = t
		}
		t.sum += b.SumLatencyMs
		t.req += b.RequestCount
		t.err += b.ErrorCount
	}
	for bucket, t := range byBucket {
		avg := 0.0
		if t.req > 0 {
			avg = round2(t.sum / float64(t.req))
		}
		_ = upsertTrendBucket(bucket, avg, t.req, t.err)
	}
}

func uptimeSeconds() int64 {
	col.mu.Lock()
	started := col.started
	col.mu.Unlock()
	if started.IsZero() {
		return 0
	}
	return int64(time.Since(started).Seconds())
}

// ── Service status checks ──────────────────────────────────────────────────

func checkDatabase() ServiceStatusDTO {
	lat, err := pingDB()
	s := ServiceStatusDTO{Name: "database", LatencyMs: lat.Milliseconds()}
	if err != nil {
		s.Status = statusUnhealthy
		s.Detail = err.Error()
	} else {
		s.Status = statusHealthy
	}
	return s
}

func checkRedis() ServiceStatusDTO {
	s := ServiceStatusDTO{Name: "redis"}
	if !cache.Enabled() {
		s.Status = statusNotConfigured
		s.Detail = "Redis not configured (caching disabled; app degrades gracefully)"
		return s
	}
	start := time.Now()
	if err := cache.Ping(); err != nil {
		s.Status = statusUnhealthy
		s.Detail = err.Error()
	} else {
		s.Status = statusHealthy
		s.LatencyMs = time.Since(start).Milliseconds()
	}
	return s
}

// checkS3 reports honestly: there is no S3 client wired into the codebase yet
// (uploads are stored in Postgres BYTEA), so we never fabricate a ping.
func checkS3() ServiceStatusDTO {
	s := ServiceStatusDTO{Name: "s3", Status: statusNotConfigured}
	if os.Getenv("S3_BUCKET_NAME") == "" {
		s.Detail = "S3 credentials not set"
	} else {
		s.Detail = "credentials present but no S3 client integrated yet (files currently stored in Postgres)"
	}
	return s
}

// checkVideoConferencing: no integration is connected (sessions only store a
// pasted virtual_link URL), so there is nothing to ping.
func checkVideoConferencing() ServiceStatusDTO {
	return ServiceStatusDTO{
		Name:   "video_conferencing",
		Status: statusNotConfigured,
		Detail: "no video-conferencing integration connected",
	}
}

const (
	statusHealthy       = "healthy"
	statusUnhealthy     = "unhealthy"
	statusDegraded      = "degraded"
	statusNotConfigured = "not_configured"
)

// ── Aggregate services ──────────────────────────────────────────────────────

func overviewService() (HealthOverviewDTO, error) {
	since := time.Now().Add(-time.Duration(defaultWindow) * time.Minute)
	totalReq, totalErr, sumLatency, maxLatency, err := windowTotals(since)
	if err != nil {
		return HealthOverviewDTO{}, err
	}

	avg, errRate := 0.0, 0.0
	if totalReq > 0 {
		avg = round2(sumLatency / float64(totalReq))
		errRate = round4(float64(totalErr) / float64(totalReq))
	}

	// Only real infrastructure. Backend API health is derived from the request
	// middleware; DB and Redis have live pings; S3 and video-conferencing are
	// not_configured until those integrations exist.
	services := []ServiceStatusDTO{
		checkBackendAPI(avg, errRate, totalReq),
		checkDatabase(),
		checkRedis(),
		checkS3(),
		checkVideoConferencing(),
	}

	// Overall: DB is the only hard dependency (unhealthy → unhealthy). Any other
	// unhealthy/degraded service pulls the overall down to degraded.
	overall := statusHealthy
	for _, s := range services {
		switch {
		case s.Name == "database" && s.Status == statusUnhealthy:
			overall = statusUnhealthy
		case (s.Status == statusUnhealthy || s.Status == statusDegraded) && overall == statusHealthy:
			overall = statusDegraded
		}
	}

	return HealthOverviewDTO{
		Status:        overall,
		UptimeSeconds: uptimeSeconds(),
		Services:      services,
		DBPool:        dbPoolStats(),
		WindowMins:    defaultWindow,
		TotalRequests: totalReq,
		ErrorCount:    totalErr,
		ErrorRate:     errRate,
		AvgLatencyMs:  avg,
		MaxLatencyMs:  round2(maxLatency),
	}, nil
}

// checkBackendAPI derives the API's own health from observed request metrics.
// The process is obviously serving (this request reached it); we flag degraded
// when the rolling 5xx error rate is elevated.
func checkBackendAPI(avgLatency, errorRate float64, totalReq int64) ServiceStatusDTO {
	s := ServiceStatusDTO{Name: "backend_api", Status: statusHealthy, LatencyMs: int64(math.Round(avgLatency))}
	switch {
	case totalReq == 0:
		s.Detail = "no requests in the current window"
	case errorRate >= 0.05:
		s.Status = statusDegraded
		s.Detail = "elevated 5xx error rate"
	}
	return s
}

// trendService returns the historical latency trend (5-min points). Default
// window is 24h. Points before instrumentation shipped are simply absent — the
// series is never zero-filled or backfilled.
func trendService(windowMins int) ([]TrendPointDTO, error) {
	if windowMins < 1 {
		windowMins = 24 * 60
	}
	since := time.Now().Add(-time.Duration(windowMins) * time.Minute)
	rows, err := trendSince(since)
	if err != nil {
		return nil, err
	}
	out := make([]TrendPointDTO, 0, len(rows))
	for _, r := range rows {
		pt := TrendPointDTO{
			Bucket:       r.TimestampBucket.UTC().Format(time.RFC3339),
			AvgLatencyMs: round2(r.AvgLatencyMs),
			RequestCount: r.RequestCount,
			ErrorCount:   r.ErrorCount,
		}
		if r.RequestCount > 0 {
			pt.ErrorRate = round4(float64(r.ErrorCount) / float64(r.RequestCount))
		}
		out = append(out, pt)
	}
	return out, nil
}

func endpointsService(windowMins, limit int) ([]EndpointMetricDTO, error) {
	if windowMins < 1 {
		windowMins = defaultWindow
	}
	if limit < 1 || limit > 200 {
		limit = 50
	}
	since := time.Now().Add(-time.Duration(windowMins) * time.Minute)
	return endpointAggregates(since, limit)
}

// ── rounding helpers ────────────────────────────────────────────────────────

func round2(v float64) float64 { return math.Round(v*100) / 100 }
func round4(v float64) float64 { return math.Round(v*10000) / 10000 }
