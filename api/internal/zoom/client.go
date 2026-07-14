package zoom

import (
	"fmt"
	"io"
	"net/http"
	"time"
)

const requestTimeout = 10 * time.Second

var sharedClient = &http.Client{Timeout: requestTimeout}

func httpClient() *http.Client { return sharedClient }

// ZoomAPIError represents a non-2xx response from Zoom's API.
type ZoomAPIError struct {
	StatusCode int
	Message    string
}

func (e *ZoomAPIError) Error() string {
	return fmt.Sprintf("zoom API error (%d): %s", e.StatusCode, e.Message)
}

// NetworkError wraps a transport-level failure calling Zoom (DNS, timeout, TLS...).
type NetworkError struct {
	Err error
}

func (e *NetworkError) Error() string { return "zoom network error: " + e.Err.Error() }
func (e *NetworkError) Unwrap() error { return e.Err }

// ErrMissingZoomAccount is returned when a faculty user has no zoom_user_id
// mapping — the caller must link a Zoom account before creating a meeting.
//
// Deprecated as of 2026-07-12 — CreateMeeting no longer returns this (see
// ErrOrgZoomNotConfigured). Left defined since GetOAuthStatus/the per-user
// OAuth flow (Phase 1, deprecated but not deleted) still reference it.
var ErrMissingZoomAccount = fmt.Errorf("faculty has no linked Zoom account")

// ErrOrgZoomNotConfigured is returned when the session's organization has no
// (complete) Zoom S2S credentials saved — the caller-facing 422 telling
// whoever's scheduling that their org's Superadmin needs to set up Zoom
// first (org_zoom_credentials, Phase 2), not an individual account link.
var ErrOrgZoomNotConfigured = fmt.Errorf("organization has no Zoom credentials configured")

// ErrMeetingExists is returned when the session already has a Zoom meeting.
var ErrMeetingExists = fmt.Errorf("session already has a Zoom meeting")

// doWithRetry issues req and retries exactly once if Zoom returns a 5xx.
// The request body (if any) must be re-set by newReq on retry since an
// http.Request's body can only be read once.
func doWithRetry(newReq func() (*http.Request, error)) (*http.Response, []byte, error) {
	var lastErr error
	for attempt := 0; attempt < 2; attempt++ {
		req, err := newReq()
		if err != nil {
			return nil, nil, err
		}
		resp, err := httpClient().Do(req)
		if err != nil {
			lastErr = &NetworkError{Err: err}
			continue
		}
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		resp.Body.Close()
		if resp.StatusCode >= 500 && attempt == 0 {
			lastErr = &ZoomAPIError{StatusCode: resp.StatusCode, Message: "server error, retrying"}
			continue
		}
		return resp, body, nil
	}
	return nil, nil, lastErr
}
