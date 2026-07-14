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

// CreateMeeting creates (or returns the existing) Zoom meeting for a session,
// hosted under the session's ORGANIZATION's own Zoom S2S account (Phase 3) —
// never an individual faculty's personal account (that per-user OAuth path
// is deprecated, see oauth_user.go). callerUserID/Role must already be
// authorized to manage the session (checked by the handler's RBAC
// middleware); this function additionally enforces session ownership.
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
			StartURL:  deref(sess.ZoomStartURL),
			Password:  deref(sess.ZoomPassword),
		}, nil
	}

	orgID, err := getOrgIDForSession(sessionID)
	if err != nil {
		return nil, err
	}
	creds, err := orgZoomCredentialsFor(orgID)
	if err != nil {
		return nil, err
	}

	token, err := AccessTokenForOrg(orgID)
	if err != nil {
		return nil, err
	}

	payload := createMeetingPayload{
		Topic:     req.Topic,
		Type:      2,
		StartTime: req.StartTime,
		Duration:  req.DurationMinutes,
		Timezone:  req.Timezone,
		// No waiting room / no host-approval gate — anyone with the join link
		// can enter directly, including before the faculty host has started
		// the meeting. Deliberate default: participants shouldn't be blocked
		// waiting on a host who may join a few minutes late.
		Settings: createMeetingSettingsPl{JoinBeforeHost: true, WaitingRoom: false},
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	// S2S (account_credentials) tokens have no reliable "me" identity — every
	// meeting is created under the org's explicitly configured host user
	// (Superadmin-entered, Phase 2), never /users/me/meetings.
	url := meetingCreateURL(creds.hostUserIDOrEmail)
	resp, respBody, err := doWithRetry(func() (*http.Request, error) {
		r, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
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

	switch {
	case resp.StatusCode == http.StatusCreated || resp.StatusCode == http.StatusOK:
		var mr createMeetingResp
		if err := json.Unmarshal(respBody, &mr); err != nil {
			return nil, fmt.Errorf("failed to parse zoom meeting response: %w", err)
		}
		meetingID := fmt.Sprintf("%d", mr.ID)
		if err := saveSessionZoomMeeting(sessionID, meetingID, mr.JoinURL, mr.StartURL, mr.Password, mr.UUID, creds.hostUserIDOrEmail); err != nil {
			return nil, err
		}
		return &MeetingDTO{
			SessionID: sessionID,
			MeetingID: meetingID,
			JoinURL:   mr.JoinURL,
			StartURL:  mr.StartURL,
			Password:  mr.Password,
		}, nil
	case resp.StatusCode == http.StatusConflict:
		return nil, ErrMeetingExists
	default:
		return nil, &ZoomAPIError{StatusCode: resp.StatusCode, Message: "zoom meeting creation failed"}
	}
}

func meetingCreateURL(hostUserIDOrEmail string) string {
	return fmt.Sprintf("%s/users/%s/meetings", zoomAPIBase, url.PathEscape(hostUserIDOrEmail))
}

// tokenRefreshEarlyMargin mirrors the S2S cache's early-refresh margin: never
// hand a token to an in-flight Zoom API call that might expire mid-request.
const tokenRefreshEarlyMargin = 60 * time.Second

// validAccessTokenForAccount returns a usable OAuth access token for a
// connected Zoom account, refreshing it first if it's expired or close to
// expiring. A non-active status, or a failed refresh, both surface as
// ErrMissingZoomAccount — same 422 the caller already handles for "never
// connected" — after marking the account expired so the frontend's status
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

	// Expired or about to expire — refresh.
	refreshToken, err := shared.DecryptSecret(*account.EncryptedRefreshToken)
	if err != nil {
		return "", err
	}
	tr, err := RefreshUserToken(refreshToken)
	if err != nil {
		// Refresh token revoked/expired on Zoom's side — the faculty must
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
