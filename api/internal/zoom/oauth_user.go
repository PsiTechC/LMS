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
	"time"

	"github.com/golang-jwt/jwt/v4"
)

// This file implements Zoom's user-authorization OAuth grant (a faculty
// member explicitly connecting their own Zoom account), a THIRD, distinct
// flow from oauth.go's Server-to-Server account_credentials token manager.
// Do not confuse the two: oauth.go's AccessToken()/fetchAccessToken() are
// unrelated to anything in this file and are never called from here.

const (
	userOAuthTokenURL     = "https://zoom.us/oauth/token"
	userOAuthAuthorizeURL = "https://zoom.us/oauth/authorize"
	zoomMeURL             = "https://api.zoom.us/v2/users/me"
)

// oauthStateTTL bounds how long a signed state param (and therefore the
// authorize→callback round trip) remains valid.
const oauthStateTTL = 10 * time.Minute

// userOAuthConfig holds the Zoom OAuth app credentials for the user-grant
// flow - distinct from s2sConfig in oauth.go.
type userOAuthConfig struct {
	clientID     string
	clientSecret string
	redirectURI  string
}

func userOAuthConfigFromEnv() userOAuthConfig {
	return userOAuthConfig{
		clientID:     os.Getenv("ZOOM_OAUTH_CLIENT_ID"),
		clientSecret: os.Getenv("ZOOM_OAUTH_CLIENT_SECRET"),
		redirectURI:  os.Getenv("ZOOM_OAUTH_REDIRECT_URI"),
	}
}

func (c userOAuthConfig) valid() bool {
	return c.clientID != "" && c.clientSecret != "" && c.redirectURI != ""
}

// ── Signed state param ──────────────────────────────────────────────────────

// oauthStateClaims embeds the initiating faculty user's id (and an optional
// return_to path for the frontend to redirect back to) in a short-lived,
// server-signed JWT, so the callback can't be spoofed into linking a Zoom
// account to a user who never asked for it.
type oauthStateClaims struct {
	UserID   string `json:"uid"`
	ReturnTo string `json:"rt,omitempty"`
	jwt.RegisteredClaims
}

// SignOAuthState builds a short-lived, signed state param for userID.
func SignOAuthState(userID, returnTo string) (string, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return "", errors.New("JWT_SECRET is not configured")
	}
	claims := oauthStateClaims{
		UserID:   userID,
		ReturnTo: returnTo,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(oauthStateTTL)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// VerifyOAuthState validates a state param minted by SignOAuthState and
// returns the userID (and return_to, if present) it was signed for.
func VerifyOAuthState(state string) (userID, returnTo string, err error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return "", "", errors.New("JWT_SECRET is not configured")
	}
	var claims oauthStateClaims
	_, err = jwt.ParseWithClaims(state, &claims, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(secret), nil
	})
	if err != nil {
		return "", "", fmt.Errorf("invalid or expired state: %w", err)
	}
	if claims.UserID == "" {
		return "", "", errors.New("state missing user id")
	}
	return claims.UserID, claims.ReturnTo, nil
}

// ── Authorize URL ────────────────────────────────────────────────────────────

// BuildAuthorizeURL returns the Zoom user-consent URL the browser should be
// redirected to, with the given signed state.
func BuildAuthorizeURL(state string) (string, error) {
	cfg := userOAuthConfigFromEnv()
	if !cfg.valid() {
		return "", errors.New("zoom user OAuth is not configured (ZOOM_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI)")
	}
	q := url.Values{}
	q.Set("response_type", "code")
	q.Set("client_id", cfg.clientID)
	q.Set("redirect_uri", cfg.redirectURI)
	q.Set("state", state)
	return userOAuthAuthorizeURL + "?" + q.Encode(), nil
}

// ── Token exchange / refresh ─────────────────────────────────────────────────

type userTokenResponse struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in"`
}

func (cfg userOAuthConfig) basicAuthHeader() string {
	return "Basic " + base64.StdEncoding.EncodeToString([]byte(cfg.clientID+":"+cfg.clientSecret))
}

// ExchangeCodeForToken trades an authorization code for an access+refresh
// token pair (grant_type=authorization_code).
func ExchangeCodeForToken(code string) (*userTokenResponse, error) {
	cfg := userOAuthConfigFromEnv()
	if !cfg.valid() {
		return nil, errors.New("zoom user OAuth is not configured (ZOOM_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI)")
	}
	form := url.Values{}
	form.Set("grant_type", "authorization_code")
	form.Set("code", code)
	form.Set("redirect_uri", cfg.redirectURI)
	return postUserOAuthToken(cfg, form)
}

// RefreshUserToken exchanges a stored refresh token for a fresh access+refresh
// token pair (grant_type=refresh_token). Zoom rotates the refresh token on
// every use, so the caller must persist the new one, not just the access token.
func RefreshUserToken(refreshToken string) (*userTokenResponse, error) {
	cfg := userOAuthConfigFromEnv()
	if !cfg.valid() {
		return nil, errors.New("zoom user OAuth is not configured (ZOOM_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI)")
	}
	form := url.Values{}
	form.Set("grant_type", "refresh_token")
	form.Set("refresh_token", refreshToken)
	return postUserOAuthToken(cfg, form)
}

func postUserOAuthToken(cfg userOAuthConfig, form url.Values) (*userTokenResponse, error) {
	req, err := http.NewRequest(http.MethodPost, userOAuthTokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", cfg.basicAuthHeader())
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := httpClient().Do(req)
	if err != nil {
		return nil, &NetworkError{Err: err}
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))
	if resp.StatusCode >= 400 {
		// Never log token material - only status + a bounded, generic body.
		return nil, &ZoomAPIError{StatusCode: resp.StatusCode, Message: fmt.Sprintf("oauth token request failed with status %d", resp.StatusCode)}
	}

	var tr userTokenResponse
	if err := json.Unmarshal(body, &tr); err != nil {
		return nil, fmt.Errorf("failed to parse zoom oauth token response: %w", err)
	}
	if tr.AccessToken == "" || tr.RefreshToken == "" {
		return nil, errors.New("zoom oauth token response missing access_token or refresh_token")
	}
	return &tr, nil
}

// ── Zoom user profile ────────────────────────────────────────────────────────

type zoomMeResponse struct {
	ID    string `json:"id"`
	Email string `json:"email"`
}

// FetchZoomMe looks up the Zoom user id/email for the given access token.
func FetchZoomMe(accessToken string) (*zoomMeResponse, error) {
	req, err := http.NewRequest(http.MethodGet, zoomMeURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)

	resp, err := httpClient().Do(req)
	if err != nil {
		return nil, &NetworkError{Err: err}
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 8192))
	if resp.StatusCode >= 400 {
		return nil, &ZoomAPIError{StatusCode: resp.StatusCode, Message: fmt.Sprintf("zoom users/me request failed with status %d", resp.StatusCode)}
	}

	var me zoomMeResponse
	if err := json.Unmarshal(body, &me); err != nil {
		return nil, fmt.Errorf("failed to parse zoom users/me response: %w", err)
	}
	if me.ID == "" {
		return nil, errors.New("zoom users/me response missing id")
	}
	return &me, nil
}
