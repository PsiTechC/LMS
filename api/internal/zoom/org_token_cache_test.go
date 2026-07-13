package zoom

import (
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func withOrgCacheSeams(t *testing.T, fingerprints map[string]string, fetch func(string) (string, time.Duration, error)) {
	t.Helper()
	oldFingerprint, oldFetch := loadOrgCredentialFingerprint, fetchOrgAccessToken
	orgTokenCachesMu.Lock()
	oldCaches := orgTokenCaches
	orgTokenCaches = map[string]*orgTokenCache{}
	orgTokenCachesMu.Unlock()
	loadOrgCredentialFingerprint = func(orgID string) (string, error) {
		value, ok := fingerprints[orgID]
		if !ok {
			return "", ErrOrgZoomNotConfigured
		}
		return value, nil
	}
	fetchOrgAccessToken = fetch
	t.Cleanup(func() {
		loadOrgCredentialFingerprint, fetchOrgAccessToken = oldFingerprint, oldFetch
		orgTokenCachesMu.Lock()
		orgTokenCaches = oldCaches
		orgTokenCachesMu.Unlock()
	})
}

func TestAccessTokenForOrg_IsolatedCachesAndReplacement(t *testing.T) {
	fingerprints := map[string]string{"a": "a1", "b": "b1"}
	counts := map[string]int{}
	withOrgCacheSeams(t, fingerprints, func(org string) (string, time.Duration, error) {
		counts[org]++
		return org + "-token-" + string(rune('0'+counts[org])), time.Hour, nil
	})
	for _, org := range []string{"a", "b", "a", "b"} {
		got, err := AccessTokenForOrg(org)
		if err != nil {
			t.Fatal(err)
		}
		if got != org+"-token-1" {
			t.Fatalf("%s returned %q", org, got)
		}
	}
	fingerprints["a"] = "a2"
	if got, _ := AccessTokenForOrg("a"); got != "a-token-2" {
		t.Fatalf("updated A returned %q", got)
	}
	if got, _ := AccessTokenForOrg("b"); got != "b-token-1" {
		t.Fatalf("B was affected: %q", got)
	}
	if counts["a"] != 2 || counts["b"] != 1 {
		t.Fatalf("counts: %#v", counts)
	}
}

func TestAccessTokenForOrg_DeletionPreventsStaleReuse(t *testing.T) {
	fingerprints := map[string]string{"a": "a1"}
	withOrgCacheSeams(t, fingerprints, func(string) (string, time.Duration, error) { return "token-a", time.Hour, nil })
	if _, err := AccessTokenForOrg("a"); err != nil {
		t.Fatal(err)
	}
	delete(fingerprints, "a")
	if _, err := AccessTokenForOrg("a"); !errors.Is(err, ErrOrgZoomNotConfigured) {
		t.Fatalf("got %v", err)
	}
	orgTokenCachesMu.Lock()
	_, exists := orgTokenCaches["a"]
	orgTokenCachesMu.Unlock()
	if exists {
		t.Fatal("stale entry remains")
	}
}

func TestAccessTokenForOrg_ConcurrentSameOrgFetchesOnce(t *testing.T) {
	fingerprints := map[string]string{"a": "a1"}
	var count atomic.Int32
	withOrgCacheSeams(t, fingerprints, func(string) (string, time.Duration, error) { count.Add(1); return "token-a", time.Hour, nil })
	var wg sync.WaitGroup
	for range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := AccessTokenForOrg("a"); err != nil {
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if count.Load() != 1 {
		t.Fatalf("got %d exchanges", count.Load())
	}
}

func TestMeetingCreateURLUsesConfiguredEscapedHost(t *testing.T) {
	got := meetingCreateURL("host/example@example.com")
	want := "https://api.zoom.us/v2/users/host%2Fexample@example.com/meetings"
	if got != want {
		t.Fatalf("got %q want %q", got, want)
	}
	if got == "https://api.zoom.us/v2/users/me/meetings" {
		t.Fatal("must not use me")
	}
}
