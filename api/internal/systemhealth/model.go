package systemhealth

import (
	"time"

	"github.com/google/uuid"
)

// SystemMetric is a rolling 5-minute aggregate of request timing for one
// (route, method) pair. The collector accumulates in memory and flushes
// completed buckets here — one row per window, never per request.
type SystemMetric struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	BucketStart  time.Time `gorm:"column:bucket_start;not null"`
	Route        string    `gorm:"not null"`
	Method       string    `gorm:"not null"`
	RequestCount int64     `gorm:"column:request_count;not null;default:0"`
	ErrorCount   int64     `gorm:"column:error_count;not null;default:0"`
	SumLatencyMs float64   `gorm:"column:sum_latency_ms;not null;default:0"`
	MaxLatencyMs float64   `gorm:"column:max_latency_ms;not null;default:0"`
}

func (SystemMetric) TableName() string { return "system_metrics" }

// SystemHealthTrend is a rolling 5-minute aggregate across ALL endpoints —
// one row per window — powering the historical latency-trend chart. Written by
// the same flush loop that persists SystemMetric.
type SystemHealthTrend struct {
	TimestampBucket time.Time `gorm:"column:timestamp_bucket;primaryKey"`
	AvgLatencyMs    float64   `gorm:"column:avg_latency_ms;not null;default:0"`
	RequestCount    int64     `gorm:"column:request_count;not null;default:0"`
	ErrorCount      int64     `gorm:"column:error_count;not null;default:0"`
}

func (SystemHealthTrend) TableName() string { return "system_health_trend" }
