package zoom

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

const tokenURL = "https://zoom.us/oauth/token"

// tokenEarlyRefresh is how long before actual expiry we treat the cached
// token as stale, so an in-flight request never gets handed a token that
// expires mid-call.
const tokenEarlyRefresh = 60 * time.Second

type s2sConfig struct {
	accountID    string
	clientID     string
	clientSecret string
}

func s2sConfigFromEnv() s2sConfig {
	return s2sConfig{
		accountID:    os.Getenv("ZOOM_S2S_ACCOUNT_ID"),
		clientID:     os.Getenv("ZOOM_S2S_CLIENT_ID"),
		clientSecret: os.Getenv("ZOOM_S2S_CLIENT_SECRET"),
	}
}

func (c s2sConfig) valid() bool {
	return c.accountID != "" && c.clientID != "" && c.clientSecret != ""
}

type tokenResponse struct {
	AccessToken string `json:"access_token"`
	ExpiresIn   int    `json:"expires_in"`
}

// tokenCache holds a single cached Server-to-Server OAuth access token.
// Zoom S2S tokens carry no refresh token and last ~1 hour, so we cache in
// memory and only re-fetch when expired or within tokenEarlyRefresh of expiry.
type tokenCache struct {
	mu        sync.Mutex
	token     string
	expiresAt time.Time
	now       func() time.Time // overridable for tests
	fetch     func() (string, time.Duration, error)
}

type orgTokenCache struct {
	cache                 *tokenCache
	credentialFingerprint string
}

// Deprecated as of 2026-07-12 - superseded by the per-org token cache below
// (orgTokenCaches / AccessTokenForOrg). CreateMeeting now uses org-level S2S
// credentials (Phase 3), not this single global-env-based account. Left in
// place, unused, in case of rollback - not called from anywhere.
var defaultTokenCache = &tokenCache{now: time.Now}

func init() {
	defaultTokenCache.fetch = fetchAccessToken
}

// AccessToken returns a valid cached access token for the legacy global,
// env-based S2S account. Deprecated - see defaultTokenCache. Not called from
// anywhere in this codebase; kept for rollback only.
func AccessToken() (string, error) {
	return defaultTokenCache.get()
}

func (tc *tokenCache) get() (string, error) {
	tc.mu.Lock()
	defer tc.mu.Unlock()

	now := tc.now()
	if tc.token != "" && now.Before(tc.expiresAt.Add(-tokenEarlyRefresh)) {
		return tc.token, nil
	}

	token, ttl, err := tc.fetch()
	if err != nil {
		return "", err
	}
	tc.token = token
	tc.expiresAt = now.Add(ttl)
	return tc.token, nil
}

// fetchAccessToken is the legacy global path - kept for defaultTokenCache/
// AccessToken() above. Delegates to fetchAccessTokenWithConfig so the actual
// Zoom HTTP call has exactly one implementation, shared with the per-org path.
func fetchAccessToken() (string, time.Duration, error) {
	cfg := s2sConfigFromEnv()
	if !cfg.valid() {
		return "", 0, errors.New("zoom S2S OAuth is not configured (ZOOM_S2S_ACCOUNT_ID/CLIENT_ID/CLIENT_SECRET)")
	}
	return fetchAccessTokenWithConfig(cfg)
}

// fetchAccessTokenWithConfig performs the actual Zoom S2S token exchange
// (grant_type=account_credentials) for the given credentials, regardless of
// whether they came from env vars (legacy) or an org's stored settings.
func fetchAccessTokenWithConfig(cfg s2sConfig) (string, time.Duration, error) {
	form := url.Values{}
	form.Set("grant_type", "account_credentials")
	form.Set("account_id", cfg.accountID)

	req, err := http.NewRequest(http.MethodPost, tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", 0, err
	}
	basic := base64.StdEncoding.EncodeToString([]byte(cfg.clientID + ":" + cfg.clientSecret))
	req.Header.Set("Authorization", "Basic "+basic)
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := httpClient().Do(req)
	if err != nil {
		return "", 0, &NetworkError{Err: err}
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))
	if resp.StatusCode >= 400 {
		// Never log token/secret material - only status + a bounded body.
		return "", 0, &ZoomAPIError{StatusCode: resp.StatusCode, Message: fmt.Sprintf("oauth token request failed (%d): %s", resp.StatusCode, string(body))}
	}

	var tr tokenResponse
	if err := json.Unmarshal(body, &tr); err != nil {
		return "", 0, fmt.Errorf("failed to parse zoom oauth response: %w", err)
	}
	if tr.AccessToken == "" {
		return "", 0, errors.New("zoom oauth response missing access_token")
	}
	return tr.AccessToken, time.Duration(tr.ExpiresIn) * time.Second, nil
}

// ── Per-org S2S token cache (Phase 3) ────────────────────────────────────────
// One org can host many concurrent CreateMeeting calls; a separate
// *tokenCache per org means they never contend on the same mutex the way a
// single global cache would, and one org's token refresh never blocks another
// org's request.

var (
	orgTokenCaches   = map[string]*orgTokenCache{}
	orgTokenCachesMu sync.Mutex

	loadOrgCredentialFingerprint = orgZoomCredentialFingerprintFor
	fetchOrgAccessToken          = fetchAccessTokenForOrg
)

// AccessTokenForOrg returns a valid cached S2S access token for orgID,
// fetching/refreshing from Zoom only when the cached one is missing or about
// to expire. Credentials are read from organizations.settings (Phase 2),
// decrypted per call site as needed - see s2sConfigForOrg.
func AccessTokenForOrg(orgID string) (string, error) {
	fingerprint, err := loadOrgCredentialFingerprint(orgID)
	if err != nil {
		InvalidateOrgTokenCache(orgID)
		return "", err
	}

	orgTokenCachesMu.Lock()
	entry, ok := orgTokenCaches[orgID]
	if !ok || entry.credentialFingerprint != fingerprint {
		tc := &tokenCache{now: time.Now}
		tc.fetch = func() (string, time.Duration, error) { return fetchOrgAccessToken(orgID) }
		entry = &orgTokenCache{cache: tc, credentialFingerprint: fingerprint}
		orgTokenCaches[orgID] = entry
	}
	orgTokenCachesMu.Unlock()
	return entry.cache.get()
}

func InvalidateOrgTokenCache(orgID string) {
	orgTokenCachesMu.Lock()
	delete(orgTokenCaches, orgID)
	orgTokenCachesMu.Unlock()
}

func fetchAccessTokenForOrg(orgID string) (string, time.Duration, error) {
	cfg, err := s2sConfigForOrg(orgID)
	if err != nil {
		return "", 0, err
	}
	return fetchAccessTokenWithConfig(cfg)
}
