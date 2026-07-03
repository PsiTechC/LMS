package systemhealth

// ServiceStatusDTO is the health of a single dependency.
// Status is one of: healthy | unhealthy | degraded | not_configured.
type ServiceStatusDTO struct {
	Name      string `json:"name"`
	Status    string `json:"status"`
	Detail    string `json:"detail,omitempty"`
	LatencyMs int64  `json:"latency_ms,omitempty"`
}

// DBPoolDTO surfaces the Postgres connection-pool stats from database/sql.
type DBPoolDTO struct {
	OpenConnections int   `json:"open_connections"`
	InUse           int   `json:"in_use"`
	Idle            int   `json:"idle"`
	MaxOpen         int   `json:"max_open"`
	WaitCount       int64 `json:"wait_count"`
	WaitDurationMs  int64 `json:"wait_duration_ms"`
}

// HealthOverviewDTO is the top-level System Health payload.
type HealthOverviewDTO struct {
	Status        string             `json:"status"` // overall: healthy | degraded | unhealthy
	UptimeSeconds int64              `json:"uptime_seconds"`
	Services      []ServiceStatusDTO `json:"services"`
	DBPool        DBPoolDTO          `json:"db_pool"`
	WindowMins    int                `json:"window_mins"`
	TotalRequests int64              `json:"total_requests"`
	ErrorCount    int64              `json:"error_count"`
	ErrorRate     float64            `json:"error_rate"` // errors / total, 0..1
	AvgLatencyMs  float64            `json:"avg_latency_ms"`
	MaxLatencyMs  float64            `json:"max_latency_ms"` // real peak (p95 needs histogram instrumentation — not yet collected)
}

// TrendPointDTO is one 5-minute point on the historical latency-trend chart.
type TrendPointDTO struct {
	Bucket       string  `json:"bucket"` // RFC3339, start of the 5-min window
	AvgLatencyMs float64 `json:"avg_latency_ms"`
	RequestCount int64   `json:"request_count"`
	ErrorCount   int64   `json:"error_count"`
	ErrorRate    float64 `json:"error_rate"`
}

// EndpointMetricDTO is a per-endpoint aggregate over the requested window.
type EndpointMetricDTO struct {
	Route        string  `json:"route"`
	Method       string  `json:"method"`
	RequestCount int64   `json:"request_count"`
	ErrorCount   int64   `json:"error_count"`
	ErrorRate    float64 `json:"error_rate"`
	AvgLatencyMs float64 `json:"avg_latency_ms"`
	MaxLatencyMs float64 `json:"max_latency_ms"`
}
