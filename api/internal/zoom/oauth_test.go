package zoom

import (
	"errors"
	"testing"
	"time"
)

func TestTokenCache_NoRefetchUntilExpiry(t *testing.T) {
	fetchCount := 0
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	tc := &tokenCache{
		now: func() time.Time { return now },
		fetch: func() (string, time.Duration, error) {
			fetchCount++
			return "token-A", time.Hour, nil
		},
	}

	tok, err := tc.get()
	if err != nil || tok != "token-A" {
		t.Fatalf("first get: got (%q, %v)", tok, err)
	}
	if fetchCount != 1 {
		t.Fatalf("expected 1 fetch, got %d", fetchCount)
	}

	// Well within the hour - must reuse the cached token.
	now = now.Add(10 * time.Minute)
	tok, err = tc.get()
	if err != nil || tok != "token-A" {
		t.Fatalf("second get: got (%q, %v)", tok, err)
	}
	if fetchCount != 1 {
		t.Fatalf("expected still 1 fetch after 10m, got %d", fetchCount)
	}
}

func TestTokenCache_RefetchesWithinEarlyRefreshWindow(t *testing.T) {
	fetchCount := 0
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	tc := &tokenCache{
		now: func() time.Time { return now },
		fetch: func() (string, time.Duration, error) {
			fetchCount++
			return "token-B", time.Hour, nil
		},
	}

	if _, err := tc.get(); err != nil {
		t.Fatalf("first get: %v", err)
	}

	// 59m30s later - inside the 60s early-refresh window before the 1h expiry.
	now = now.Add(59*time.Minute + 30*time.Second)
	if _, err := tc.get(); err != nil {
		t.Fatalf("second get: %v", err)
	}
	if fetchCount != 2 {
		t.Fatalf("expected refetch inside early-refresh window, got %d fetches", fetchCount)
	}
}

func TestTokenCache_RefetchesAfterExpiry(t *testing.T) {
	fetchCount := 0
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	tc := &tokenCache{
		now: func() time.Time { return now },
		fetch: func() (string, time.Duration, error) {
			fetchCount++
			return "token-C", time.Hour, nil
		},
	}

	if _, err := tc.get(); err != nil {
		t.Fatalf("first get: %v", err)
	}

	now = now.Add(2 * time.Hour)
	if _, err := tc.get(); err != nil {
		t.Fatalf("second get: %v", err)
	}
	if fetchCount != 2 {
		t.Fatalf("expected refetch after expiry, got %d fetches", fetchCount)
	}
}

func TestTokenCache_PropagatesFetchError(t *testing.T) {
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	tc := &tokenCache{
		now: func() time.Time { return now },
		fetch: func() (string, time.Duration, error) {
			return "", 0, errNetwork
		},
	}
	if _, err := tc.get(); err == nil {
		t.Fatal("expected error to propagate from fetch")
	}
}

var errNetwork = errors.New("network error")
