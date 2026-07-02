package audit

import (
	"testing"
	"time"
)

func TestParseBoundRFC3339(t *testing.T) {
	in := "2026-07-01T10:30:00Z"
	got, err := parseBound(in, false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got.Equal(time.Date(2026, 7, 1, 10, 30, 0, 0, time.UTC)) {
		t.Errorf("got %v, want 2026-07-01T10:30:00Z", got)
	}
}

func TestParseBoundDateOnlyStartOfDay(t *testing.T) {
	got, err := parseBound("2026-07-01", false)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Hour() != 0 || got.Minute() != 0 || got.Second() != 0 {
		t.Errorf("date-only from-bound should snap to start of day, got %v", got)
	}
}

func TestParseBoundDateOnlyEndOfDayInclusive(t *testing.T) {
	got, err := parseBound("2026-07-01", true)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Must be within 2026-07-01 (before midnight of the 2nd) so the upper
	// bound is inclusive of the whole day.
	next := time.Date(2026, 7, 2, 0, 0, 0, 0, time.UTC)
	if !got.Before(next) || got.Before(time.Date(2026, 7, 1, 23, 59, 59, 0, time.UTC)) {
		t.Errorf("end-of-day bound %v not within 2026-07-01", got)
	}
}

func TestParseBoundInvalid(t *testing.T) {
	if _, err := parseBound("not-a-date", false); err == nil {
		t.Error("expected error for invalid date, got nil")
	}
}

func TestBuildEventFilterNormalizesDates(t *testing.T) {
	f, err := buildEventFilter(ListEventsQuery{
		Category:   "auth",
		DateFrom:   "2026-07-01",
		DateTo:     "2026-07-01",
		UserSearch: "alice",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if f.Category != "auth" || f.UserSearch != "alice" {
		t.Errorf("passthrough fields lost: %+v", f)
	}
	if f.DateFrom == "" || f.DateTo == "" {
		t.Errorf("date bounds not normalized: %+v", f)
	}
	// Both normalized bounds must be valid RFC3339.
	if _, err := time.Parse(time.RFC3339, f.DateFrom); err != nil {
		t.Errorf("DateFrom not RFC3339: %q", f.DateFrom)
	}
	if _, err := time.Parse(time.RFC3339, f.DateTo); err != nil {
		t.Errorf("DateTo not RFC3339: %q", f.DateTo)
	}
}

func TestBuildEventFilterRejectsBadDate(t *testing.T) {
	if _, err := buildEventFilter(ListEventsQuery{DateFrom: "07/01/2026"}); err == nil {
		t.Error("expected error for non-ISO date_from, got nil")
	}
}
