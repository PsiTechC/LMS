package zoom

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v4"
	"github.com/xa-lms/api/internal/shared"
)

// ErrS2SNotConfigured is returned when ZOOM_S2S_ACCOUNT_ID/CLIENT_ID/CLIENT_SECRET
// env vars are not all set — the administrator must populate api/.env.
var ErrS2SNotConfigured = errors.New("zoom S2S credentials not configured (ZOOM_S2S_ACCOUNT_ID/CLIENT_ID/CLIENT_SECRET)")

// sdkSignatureTTL is deliberately short — the SDK JWT only needs to live long
// enough for the client to start the join handshake.
const sdkSignatureTTL = 3 * time.Minute

// roleHost/roleAttendee are the Meeting SDK's role claim values.
const (
	roleHost     = 1
	roleAttendee = 0
)

const zoomAPIBase = "https://api.zoom.us/v2"

type createMeetingPayload struct {
	Topic     string                  `json:"topic"`
	Type      int                     `json:"type"` // 2 = scheduled meeting
	StartTime string                  `json:"start_time"`
	Duration  int                     `json:"duration"`
	Timezone  string                  `json:"timezone"`
	Settings  createMeetingSettingsPl `json:"settings"`
}

type createMeetingSettingsPl struct {
	JoinBeforeHost bool `json:"join_before_host"`
	WaitingRoom    bool `json:"waiting_room"`
}

type createMeetingResp struct {
	ID       int64  `json:"id"`
	UUID     string `json:"uuid"`
	JoinURL  string `json:"join_url"`
	StartURL string `json:"start_url"`
	Password string `json:"password"`
}

// CreateMeeting creates (or returns the existing) Zoom meeting for a session
// using the backend's central ZOOM_S2S_* credentials (never individual faculty
// OAuth tokens). The meeting is created under the faculty's resolved host
// identity: users.zoom_host_email (if set by a Superadmin) or their LMS email
// as fallback. callerUserID/Role must already be authorized to manage the
// session; this function additionally enforces session ownership.
func CreateMeeting(sessionID, callerUserID, callerRole string, req CreateMeetingRequest) (*MeetingDTO, error) {
	sess, err := getSessionZoomRow(sessionID)
	if err != nil {
		return nil, err
	}

	if !isOwnerOrAdmin(sess.FacultyID, callerUserID, callerRole) {
		return nil, ErrForbidden
	}

	// Idempotent: return the existing meeting instead of creating a duplicate.
	if sess.ZoomMeetingID != nil && *sess.ZoomMeetingID != "" {
		return &MeetingDTO{
			SessionID: sessionID,
			MeetingID: *sess.ZoomMeetingID,
			JoinURL:   deref(sess.ZoomJoinURL),
			// start_url is intentionally omitted from the idempotent path — it
			// is short-lived, rotated by Zoom on every use, and must be fetched
			// fresh via GetFreshStartURL when the faculty actually needs it.
			Password: deref(sess.ZoomPassword),
		}, nil
	}

	// ── Resolve the S2S access token (central backend credentials) ────────────
	cfg := s2sConfigFromEnv()
	if !cfg.valid() {
		return nil, ErrS2SNotConfigured
	}
	token, _, err := fetchAccessTokenWithConfig(cfg)
	if err != nil {
		return nil, err
	}

	// ── Resolve host identity ─────────────────────────────────────────────────
	// users.zoom_host_email (Superadmin-set per-faculty override) →
	// organizations.settings["zoom_host_email"] (Superadmin-set org default) →
	// faculty's LMS email (fallback).
	hostEmail, err := resolveZoomHostEmail(sessionID, sess.FacultyID)
	if err != nil {
		return nil, fmt.Errorf("could not resolve zoom host email for faculty: %w", err)
	}

	payload := createMeetingPayload{
		Topic:     req.Topic,
		Type:      2,
		StartTime: req.StartTime,
		Duration:  req.DurationMinutes,
		Timezone:  req.Timezone,
		// No waiting room / no host-approval gate - anyone with the join link
		// can enter directly, including before the faculty host has started
		// the meeting. Deliberate default: participants shouldn't be blocked
		// waiting on a host who may join a few minutes late.
		Settings: createMeetingSettingsPl{JoinBeforeHost: true, WaitingRoom: false},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	creatURL := meetingCreateURL(hostEmail)
	resp, respBody, err := doWithRetry(func() (*http.Request, error) {
		r, err := http.NewRequest(http.MethodPost, creatURL, bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		r.Header.Set("Authorization", "Bearer "+token)
		r.Header.Set("Content-Type", "application/json")
		return r, nil
	})
	if err != nil {
		return nil, err
	}

	// If Zoom returns 404 User Not Found, fall back to ZOOM_DEFAULT_HOST_EMAIL if configured
	defaultHost := os.Getenv("ZOOM_DEFAULT_HOST_EMAIL")
	if resp.StatusCode == http.StatusNotFound && defaultHost != "" && hostEmail != defaultHost {
		hostEmail = defaultHost
		creatURL = meetingCreateURL(hostEmail)
		resp, respBody, err = doWithRetry(func() (*http.Request, error) {
			r, err := http.NewRequest(http.MethodPost, creatURL, bytes.NewReader(body))
			if err != nil {
				return nil, err
			}
			r.Header.Set("Authorization", "Bearer "+token)
			r.Header.Set("Content-Type", "application/json")
			return r, nil
		})
		if err != nil {
			return nil, err
		}
	}

	switch {
	case resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusOK:
		var mr createMeetingResp
		if err := json.Unmarshal(respBody, &mr); err != nil {
			return nil, fmt.Errorf("failed to parse zoom meeting response: %w", err)
		}
		meetingID := fmt.Sprintf("%d", mr.ID)
		// Persist meeting data — start_url is NOT stored (it's ephemeral/rotated).
		if err := saveSessionZoomMeeting(sessionID, meetingID, mr.JoinURL, "", mr.Password, mr.UUID, hostEmail); err != nil {
			return nil, err
		}
		return &MeetingDTO{
			SessionID: sessionID,
			MeetingID: meetingID,
			JoinURL:   mr.JoinURL,
			// start_url NOT returned here — callers must use GetFreshStartURL.
			Password: mr.Password,
		}, nil
	case resp.StatusCode == http.StatusConflict:
		return nil, ErrMeetingExists
	default:
		return nil, &ZoomAPIError{StatusCode: resp.StatusCode, Message: fmt.Sprintf("zoom meeting creation failed (%d): %s", resp.StatusCode, string(respBody))}
	}
}

// getMeetingResp is the subset of fields from GET /meetings/{meetingId}
// that we care about — specifically start_url which is fresh per-call.
type getMeetingResp struct {
	StartURL string `json:"start_url"`
}

// GetFreshStartURL fetches a fresh, non-stored Zoom start_url (host URL) for
// sessionID. Only the faculty who owns the session (or an admin) may call this.
// The start_url is signed and short-lived — Zoom rotates it on every GET; it
// must never be stored or logged.
func GetFreshStartURL(sessionID, callerUserID, callerRole string) (*StartURLDTO, error) {
	sess, err := getSessionZoomRow(sessionID)
	if err != nil {
		return nil, err
	}
	if !isOwnerOrAdmin(sess.FacultyID, callerUserID, callerRole) {
		return nil, ErrForbidden
	}
	if sess.ZoomMeetingID == nil || *sess.ZoomMeetingID == "" {
		return nil, ErrNoMeetingYet
	}

	cfg := s2sConfigFromEnv()
	if !cfg.valid() {
		return nil, ErrS2SNotConfigured
	}
	token, _, err := fetchAccessTokenWithConfig(cfg)
	if err != nil {
		return nil, err
	}

	getURL := fmt.Sprintf("%s/meetings/%s", zoomAPIBase, url.PathEscape(*sess.ZoomMeetingID))
	resp, respBody, err := doWithRetry(func() (*http.Request, error) {
		r, err := http.NewRequest(http.MethodGet, getURL, nil)
		if err != nil {
			return nil, err
		}
		r.Header.Set("Authorization", "Bearer "+token)
		return r, nil
	})
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == http.StatusNotFound {
		return nil, ErrNotFound
	}
	if resp.StatusCode >= 400 {
		return nil, &ZoomAPIError{StatusCode: resp.StatusCode, Message: "failed to fetch meeting start URL"}
	}

	var mr getMeetingResp
	if err := json.Unmarshal(respBody, &mr); err != nil {
		return nil, fmt.Errorf("failed to parse zoom meeting response: %w", err)
	}
	if mr.StartURL == "" {
		return nil, fmt.Errorf("zoom returned no start_url for meeting %s", *sess.ZoomMeetingID)
	}
	return &StartURLDTO{StartURL: mr.StartURL}, nil
}

// resolveZoomHostEmail picks the Zoom host identity CreateMeeting hosts
// sessionID's meeting under, in priority order:
//  1. users.zoom_host_email — a Superadmin-set override for this specific
//     faculty/coach (see users/service.go's UpdateUser).
//  2. organizations.settings["zoom_host_email"] — a Superadmin-set default
//     for the whole org, when no per-faculty override exists.
//  3. The faculty's own LMS login email.
//
// Tier 2 is a soft fallback: if the org lookup fails or nothing is set there,
// resolution simply proceeds to tier 3 rather than failing the request.
func resolveZoomHostEmail(sessionID, facultyID string) (string, error) {
	identity, err := getUserZoomIdentity(facultyID)
	if err != nil {
		return "", err
	}
	if identity.ZoomHostEmail != nil && *identity.ZoomHostEmail != "" {
		return *identity.ZoomHostEmail, nil
	}
	if orgID, err := getOrgIDForSession(sessionID); err == nil {
		if orgHostEmail, err := getOrgDefaultZoomHostEmail(orgID); err == nil && orgHostEmail != "" {
			return orgHostEmail, nil
		}
	}
	if defaultHost := os.Getenv("ZOOM_DEFAULT_HOST_EMAIL"); defaultHost != "" {
		return defaultHost, nil
	}
	return identity.Email, nil
}

func meetingCreateURL(hostUserIDOrEmail string) string {
	return fmt.Sprintf("%s/users/%s/meetings", zoomAPIBase, url.PathEscape(hostUserIDOrEmail))
}

// tokenRefreshEarlyMargin mirrors the S2S cache's early-refresh margin: never
// hand a token to an in-flight Zoom API call that might expire mid-request.
const tokenRefreshEarlyMargin = 60 * time.Second

// GetValidZoomToken returns a usable OAuth access token for facultyID's
// connected Zoom account, transparently refreshing it first if it's expired
// or close to expiring (Zoom rotates the refresh token on every use - see
// validAccessTokenForAccount). Returns ErrMissingZoomAccount if facultyID has
// never connected a Zoom account.
func GetValidZoomToken(facultyID string) (string, error) {
	account, err := getZoomAccountByUserID(facultyID)
	if err != nil {
		return "", mapAccountLookupError(err)
	}
	return validAccessTokenForAccount(account)
}

// validAccessTokenForAccount returns a usable OAuth access token for a
// connected Zoom account, refreshing it first if it's expired or close to
// expiring. A non-active status, or a failed refresh, both surface as
// ErrMissingZoomAccount - same 422 the caller already handles for "never
// connected" - after marking the account expired so the frontend's status
// indicator shows "Reconnect Zoom".
func validAccessTokenForAccount(account *ZoomAccount) (string, error) {
	if account.Status != ZoomAccountStatusActive {
		return "", ErrMissingZoomAccount
	}
	if account.EncryptedAccessToken == nil || account.EncryptedRefreshToken == nil || account.TokenExpiresAt == nil {
		return "", ErrMissingZoomAccount
	}

	if time.Now().Before(account.TokenExpiresAt.Add(-tokenRefreshEarlyMargin)) {
		token, err := shared.DecryptSecret(*account.EncryptedAccessToken)
		if err != nil {
			return "", err
		}
		return token, nil
	}

	// Expired or about to expire - refresh.
	refreshToken, err := shared.DecryptSecret(*account.EncryptedRefreshToken)
	if err != nil {
		return "", err
	}
	tr, err := RefreshUserToken(refreshToken)
	if err != nil {
		// Refresh token revoked/expired on Zoom's side - the faculty must
		// reconnect. Best-effort status update; the caller's 422 stands either way.
		_ = setZoomAccountStatus(account.UserID.String(), ZoomAccountStatusExpired)
		return "", ErrMissingZoomAccount
	}

	encAccess, err := shared.EncryptSecret(tr.AccessToken)
	if err != nil {
		return "", err
	}
	encRefresh, err := shared.EncryptSecret(tr.RefreshToken)
	if err != nil {
		return "", err
	}
	expiresAt := time.Now().Add(time.Duration(tr.ExpiresIn) * time.Second)
	if err := updateZoomAccountTokens(account.UserID.String(), encAccess, encRefresh, expiresAt); err != nil {
		return "", err
	}
	return tr.AccessToken, nil
}

// ── OAuth connect / disconnect / status ──────────────────────────────────────

// ConnectAuthorizeURL builds the Zoom consent URL for callerUserID to connect
// their own Zoom account, embedding a signed state so the callback can trust
// which user initiated the flow.
func ConnectAuthorizeURL(callerUserID, returnTo string) (string, error) {
	state, err := SignOAuthState(callerUserID, returnTo)
	if err != nil {
		return "", err
	}
	return BuildAuthorizeURL(state)
}

// HandleOAuthCallback validates state, exchanges code for tokens, resolves the
// Zoom user's id/email, and upserts the encrypted tokens onto that user's
// zoom_accounts row. Returns the return_to path (if any) embedded in state.
func HandleOAuthCallback(code, state string) (returnTo string, err error) {
	userID, returnTo, err := VerifyOAuthState(state)
	if err != nil {
		return "", err
	}
	tr, err := ExchangeCodeForToken(code)
	if err != nil {
		return returnTo, err
	}
	me, err := FetchZoomMe(tr.AccessToken)
	if err != nil {
		return returnTo, err
	}
	encAccess, err := shared.EncryptSecret(tr.AccessToken)
	if err != nil {
		return returnTo, err
	}
	encRefresh, err := shared.EncryptSecret(tr.RefreshToken)
	if err != nil {
		return returnTo, err
	}
	expiresAt := time.Now().Add(time.Duration(tr.ExpiresIn) * time.Second)
	var email *string
	if me.Email != "" {
		email = &me.Email
	}
	if err := upsertZoomOAuthAccount(userID, me.ID, email, encAccess, encRefresh, expiresAt); err != nil {
		return returnTo, err
	}
	return returnTo, nil
}

// DisconnectZoomAccount clears callerUserID's stored Zoom tokens.
func DisconnectZoomAccount(callerUserID string) error {
	return disconnectZoomAccount(callerUserID)
}

// GetOAuthStatus reports the calling user's Zoom connection state for the
// frontend status indicator.
func GetOAuthStatus(callerUserID string) (*OAuthStatusDTO, error) {
	account, err := getZoomAccountByUserID(callerUserID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return &OAuthStatusDTO{Connected: false, Status: "not_connected"}, nil
		}
		return nil, err
	}
	return &OAuthStatusDTO{
		Connected: account.Status == ZoomAccountStatusActive,
		Status:    account.Status,
		ZoomEmail: account.ZoomEmail,
	}, nil
}

// isOwnerOrAdmin mirrors the session module's ownership rule: the faculty
// who owns the session, or an admin-tier role, may manage its Zoom meeting.
func isOwnerOrAdmin(facultyID, callerUserID, callerRole string) bool {
	if callerRole == shared.RoleSuperAdmin || callerRole == shared.RoleSuperAdminSecondary || callerRole == shared.RoleProgramManager {
		return true
	}
	return facultyID == callerUserID
}

// mapAccountLookupError turns a missing zoom_accounts row into the caller-facing
// ErrMissingZoomAccount, so a faculty member without a linked Zoom account gets
// a clear 422 instead of a generic not-found/500.
func mapAccountLookupError(err error) error {
	if errors.Is(err, ErrNotFound) {
		return ErrMissingZoomAccount
	}
	return err
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// ErrNoMeetingYet is returned when a signature is requested for a session
// that has no zoom_meeting_id yet.
var ErrNoMeetingYet = errors.New("session has no zoom meeting yet")

// GenerateSignature builds a short-lived Meeting SDK join JWT for callerUserID.
// Role is derived server-side, never from client input: host (1) only if
// callerUserID is the faculty that owns the session, attendee (0) otherwise.
func GenerateSignature(sessionID, callerUserID string) (*SignatureDTO, error) {
	sdkKey := os.Getenv("ZOOM_MEETING_SDK_CLIENT_ID")
	sdkSecret := os.Getenv("ZOOM_MEETING_SDK_CLIENT_SECRET")
	if sdkKey == "" || sdkSecret == "" {
		return nil, errors.New("zoom Meeting SDK is not configured (ZOOM_MEETING_SDK_CLIENT_ID/SECRET)")
	}

	sess, err := getSessionZoomRow(sessionID)
	if err != nil {
		return nil, err
	}
	if sess.ZoomMeetingID == nil || *sess.ZoomMeetingID == "" {
		return nil, ErrNoMeetingYet
	}

	role := resolveSDKRole(sess.FacultyID, callerUserID)
	signature, err := signMeetingSDKJWT(sdkKey, sdkSecret, *sess.ZoomMeetingID, role, time.Now())
	if err != nil {
		return nil, err
	}

	return &SignatureDTO{
		Signature:     signature,
		SdkKey:        sdkKey,
		MeetingNumber: *sess.ZoomMeetingID,
		Role:          role,
	}, nil
}

// resolveSDKRole derives the Meeting SDK role server-side: host (1) only if
// callerUserID is the faculty that owns the session, attendee (0) otherwise.
// Never trust a role value supplied by the client.
func resolveSDKRole(facultyID, callerUserID string) int {
	if facultyID != "" && facultyID == callerUserID {
		return roleHost
	}
	return roleAttendee
}

// signMeetingSDKJWT builds and signs the HS256 Meeting SDK Auth JWT per
// https://developers.zoom.us/docs/meeting-sdk/auth/ (sdkKey, mn, role, iat,
// exp, tokenExp claims). now is a parameter so signature/expiry are deterministic
// in tests.
func signMeetingSDKJWT(sdkKey, sdkSecret, meetingNumber string, role int, now time.Time) (string, error) {
	claims := jwt.MapClaims{
		"sdkKey":   sdkKey,
		"mn":       meetingNumber,
		"role":     role,
		"iat":      now.Unix(),
		"exp":      now.Add(sdkSignatureTTL).Unix(),
		"tokenExp": now.Add(sdkSignatureTTL).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signature, err := token.SignedString([]byte(sdkSecret))
	if err != nil {
		return "", fmt.Errorf("failed to sign meeting sdk jwt: %w", err)
	}
	return signature, nil
}
