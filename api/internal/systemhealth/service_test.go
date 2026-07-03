package systemhealth

import (
	"testing"
	"time"
)

// resetCollector clears in-memory state between tests.
func resetCollector() {
	col.mu.Lock()
	col.buckets = make(map[bucketKey]*SystemMetric)
	col.mu.Unlock()
}

func TestRecordAggregatesIntoBucket(t *testing.T) {
	resetCollector()

	record("/api/v1/programs", "GET", 200, 10*time.Millisecond)
	record("/api/v1/programs", "GET", 200, 30*time.Millisecond)
	record("/api/v1/programs", "GET", 500, 50*time.Millisecond) // an error

	col.mu.Lock()
	defer col.mu.Unlock()
	if len(col.buckets) != 1 {
		t.Fatalf("expected 1 bucket, got %d", len(col.buckets))
	}
	for _, agg := range col.buckets {
		if agg.RequestCount != 3 {
			t.Errorf("request_count: got %d, want 3", agg.RequestCount)
		}
		if agg.ErrorCount != 1 {
			t.Errorf("error_count: got %d, want 1 (only the 5xx)", agg.ErrorCount)
		}
		if agg.MaxLatencyMs != 50 {
			t.Errorf("max_latency_ms: got %v, want 50", agg.MaxLatencyMs)
		}
		if agg.SumLatencyMs != 90 {
			t.Errorf("sum_latency_ms: got %v, want 90", agg.SumLatencyMs)
		}
	}
}

func TestRecordSeparatesRouteAndMethod(t *testing.T) {
	resetCollector()
	record("/api/v1/programs", "GET", 200, time.Millisecond)
	record("/api/v1/programs", "POST", 200, time.Millisecond)
	record("/api/v1/cohorts", "GET", 200, time.Millisecond)

	col.mu.Lock()
	defer col.mu.Unlock()
	if len(col.buckets) != 3 {
		t.Errorf("expected 3 distinct (route,method) aggregates, got %d", len(col.buckets))
	}
}

func TestRecordEmptyRouteFallsBack(t *testing.T) {
	resetCollector()
	record("", "GET", 200, time.Millisecond)

	col.mu.Lock()
	defer col.mu.Unlock()
	for k := range col.buckets {
		if k.route != "unmatched" {
			t.Errorf("empty route should fall back to 'unmatched', got %q", k.route)
		}
	}
}

func TestStatusClassificationBoundary(t *testing.T) {
	// 4xx must not count as an error; 500 must.
	resetCollector()
	record("/x", "GET", 404, time.Millisecond)
	record("/x", "GET", 500, time.Millisecond)

	col.mu.Lock()
	defer col.mu.Unlock()
	for _, agg := range col.buckets {
		if agg.ErrorCount != 1 {
			t.Errorf("only 5xx counts as error: got error_count %d, want 1", agg.ErrorCount)
		}
	}
}

func TestRoundHelpers(t *testing.T) {
	if got := round2(12.3456); got != 12.35 {
		t.Errorf("round2(12.3456) = %v, want 12.35", got)
	}
	if got := round4(0.123456); got != 0.1235 {
		t.Errorf("round4(0.123456) = %v, want 0.1235", got)
	}
}
