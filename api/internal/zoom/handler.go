package zoom

import (
	"errors"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/shared"
)

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) Register(v1 *echo.Group) {
	sessions := v1.Group("/sessions", shared.RequireAuth())
	sessions.POST("/:id/zoom-meeting", h.createMeeting, shared.HybridPermission("zoom", "manage", shared.RoleFaculty, shared.RoleCoach))
	sessions.POST("/:id/zoom-signature", h.signature, shared.HybridPermission("zoom", "join", shared.RoleFaculty, shared.RoleCoach, shared.RoleParticipant))
	// Faculty-only: fetch the private, fresh Zoom host start_url for a session.
	// Never exposed in list APIs — callers must request it explicitly.
	sessions.GET("/:id/zoom-start-url", h.zoomStartURL, shared.HybridPermission("zoom", "manage", shared.RoleFaculty, shared.RoleCoach))

	// Public webhook receiver — verified via x-zm-signature, not user auth.
	v1.POST("/zoom/webhooks", h.webhook)

	// Faculty Zoom account connect/disconnect/status — user-authorization
	// OAuth grant, distinct from the S2S token manager in oauth.go.
	zoomAuthed := v1.Group("/zoom/oauth", shared.RequireAuth())
	zoomAuthed.GET("/authorize", h.oauthAuthorize, shared.HybridPermission("zoom", "manage", shared.RoleFaculty, shared.RoleCoach))
	zoomAuthed.POST("/disconnect", h.oauthDisconnect, shared.HybridPermission("zoom", "manage", shared.RoleFaculty, shared.RoleCoach))
	zoomAuthed.GET("/status", h.oauthStatus, shared.HybridPermission("zoom", "manage", shared.RoleFaculty, shared.RoleCoach))

	// Public — Zoom redirects the browser here directly; trust comes from the
	// signed state param, not a session/auth header.
	v1.GET("/zoom/oauth/callback", h.oauthCallback)
}

func (h *Handler) createMeeting(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	var req CreateMeetingRequest
	if err := c.Bind(&req); err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "invalid request body", "")
	}
	if req.Topic == "" || req.StartTime == "" || req.Timezone == "" || req.DurationMinutes < 1 {
		return shared.BadRequest(c, "VALIDATION_ERROR", "topic, start_time, timezone and duration_minutes are required", "")
	}

	m, err := CreateMeeting(c.Param("id"), claims.UserID, claims.Role, req)
	if err != nil {
		switch {
		case errors.Is(err, ErrNotFound):
			return shared.NotFound(c, "session not found")
		case errors.Is(err, ErrForbidden):
			return shared.Forbidden(c)
		case errors.Is(err, ErrS2SNotConfigured):
			return shared.UnprocessableEntity(c, "ZOOM_S2S_NOT_CONFIGURED", "Zoom backend credentials are not configured — contact your administrator", "")
		case errors.Is(err, ErrOrgZoomNotConfigured):
			return shared.UnprocessableEntity(c, "ORG_ZOOM_NOT_CONFIGURED", "this organization hasn't configured Zoom yet — contact your administrator", "")
		case errors.Is(err, ErrMissingZoomAccount):
			return shared.UnprocessableEntity(c, "ZOOM_ACCOUNT_NOT_LINKED", "this faculty member has no linked Zoom account — link one before scheduling a meeting", "")
		case errors.Is(err, ErrMeetingExists):
			return shared.Conflict(c, "a zoom meeting already exists for this session")
		default:
			var apiErr *ZoomAPIError
			if errors.As(err, &apiErr) {
				return c.JSON(http.StatusBadGateway, map[string]any{
					"data": nil, "meta": nil,
					"error": shared.ErrorDetail{Code: "ZOOM_UPSTREAM_ERROR", Message: "zoom API request failed"},
				})
			}
			log.Printf("[zoom] create meeting failed session=%s: %v", c.Param("id"), err)
			return shared.InternalError(c, "failed to create zoom meeting")
		}
	}
	return shared.Created(c, m)
}

func (h *Handler) signature(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	sig, err := GenerateSignature(c.Param("id"), claims.UserID)
	if err != nil {
		switch {
		case errors.Is(err, ErrNotFound):
			return shared.NotFound(c, "session not found")
		case errors.Is(err, ErrNoMeetingYet):
			return shared.BadRequest(c, "NO_ZOOM_MEETING", "this session has no zoom meeting yet", "")
		default:
			log.Printf("[zoom] signature generation failed session=%s: %v", c.Param("id"), err)
			return shared.InternalError(c, "failed to generate zoom signature")
		}
	}
	return shared.OK(c, sig)
}

// zoomStartURL returns a fresh, private Zoom host start_url for the session.
// Only the owning faculty member (or an admin) can call this — the URL
// contains a signed Zoom host token that must not be shared with participants.
func (h *Handler) zoomStartURL(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	dto, err := GetFreshStartURL(c.Param("id"), claims.UserID, claims.Role)
	if err != nil {
		switch {
		case errors.Is(err, ErrNotFound):
			return shared.NotFound(c, "session not found")
		case errors.Is(err, ErrForbidden):
			return shared.Forbidden(c)
		case errors.Is(err, ErrNoMeetingYet):
			return shared.UnprocessableEntity(c, "NO_ZOOM_MEETING", "this session has no zoom meeting yet — create one first", "")
		case errors.Is(err, ErrS2SNotConfigured):
			return shared.UnprocessableEntity(c, "ZOOM_S2S_NOT_CONFIGURED", "Zoom backend credentials are not configured — contact your administrator", "")
		default:
			var apiErr *ZoomAPIError
			if errors.As(err, &apiErr) {
				return c.JSON(http.StatusBadGateway, map[string]any{
					"data": nil, "meta": nil,
					"error": shared.ErrorDetail{Code: "ZOOM_UPSTREAM_ERROR", Message: "zoom API request failed"},
				})
			}
			log.Printf("[zoom] start-url fetch failed session=%s: %v", c.Param("id"), err)
			return shared.InternalError(c, "failed to fetch zoom start url")
		}
	}
	return shared.OK(c, dto)
}

// frontendCallbackURL returns the frontend page that lands the Zoom OAuth
// redirect result and forwards the user back to where they started.
func frontendCallbackURL() string {
	base := os.Getenv("NEXTAUTH_URL")
	if base == "" {
		base = "http://localhost:3000"
	}
	return base + "/zoom/callback"
}

// oauthAuthorize redirects the browser to Zoom's consent screen. return_to is
// an optional frontend path (e.g. the session-creation screen) to bounce back
// to once the connection completes; it's carried inside the signed state, so
// it can't be tampered with in transit.
//
// Returns the Zoom URL as JSON rather than issuing a 302 itself: this route
// requires a Bearer Authorization header (shared.RequireAuth()), which a
// plain top-level browser navigation cannot carry (no cookies in this app's
// auth model). The frontend calls this via an authenticated fetch, then does
// the actual top-level navigation to the returned Zoom URL itself.
func (h *Handler) oauthAuthorize(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	returnTo := c.QueryParam("return_to")
	url, err := ConnectAuthorizeURL(claims.UserID, returnTo)
	if err != nil {
		log.Printf("[zoom] oauth authorize failed: %v", err)
		return shared.InternalError(c, "failed to start zoom connection")
	}
	return shared.OK(c, map[string]string{"url": url})
}

// oauthCallback is hit directly by Zoom's redirect after the user grants (or
// denies) consent — it is a browser navigation, not an API call, so every
// outcome (including errors) ends in a redirect back to the frontend, never
// a JSON body.
func (h *Handler) oauthCallback(c echo.Context) error {
	if errParam := c.QueryParam("error"); errParam != "" {
		return c.Redirect(http.StatusFound, frontendCallbackURL()+"?status=error&message="+errParam)
	}
	code := c.QueryParam("code")
	state := c.QueryParam("state")
	if code == "" || state == "" {
		return c.Redirect(http.StatusFound, frontendCallbackURL()+"?status=error&message=missing_code_or_state")
	}

	returnTo, err := HandleOAuthCallback(code, state)
	dest := frontendCallbackURL() + "?"
	if returnTo != "" {
		dest += "return_to=" + url.QueryEscape(returnTo) + "&"
	}
	if err != nil {
		log.Printf("[zoom] oauth callback failed: %v", err)
		return c.Redirect(http.StatusFound, dest+"status=error&message=connection_failed")
	}
	return c.Redirect(http.StatusFound, dest+"status=success")
}

// oauthDisconnect clears the calling user's stored Zoom tokens.
func (h *Handler) oauthDisconnect(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	if err := DisconnectZoomAccount(claims.UserID); err != nil {
		if errors.Is(err, ErrNotFound) {
			return shared.NotFound(c, "no zoom account connected")
		}
		log.Printf("[zoom] oauth disconnect failed: %v", err)
		return shared.InternalError(c, "failed to disconnect zoom account")
	}
	return shared.OK(c, map[string]bool{"disconnected": true})
}

// oauthStatus reports the calling user's Zoom connection state.
func (h *Handler) oauthStatus(c echo.Context) error {
	claims := shared.ClaimsFrom(c)
	status, err := GetOAuthStatus(claims.UserID)
	if err != nil {
		log.Printf("[zoom] oauth status lookup failed: %v", err)
		return shared.InternalError(c, "failed to load zoom connection status")
	}
	return shared.OK(c, status)
}

// webhook is intentionally unauthenticated (no RequireAuth) — Zoom calls it
// directly. Trust is established solely via x-zm-signature verification.
func (h *Handler) webhook(c echo.Context) error {
	body, err := io.ReadAll(c.Request().Body)
	if err != nil {
		return shared.BadRequest(c, "VALIDATION_ERROR", "unable to read request body", "")
	}

	sig := c.Request().Header.Get("x-zm-signature")
	ts := c.Request().Header.Get("x-zm-request-timestamp")
	if !VerifyWebhookSignature(sig, ts, string(body)) {
		return shared.Unauthorized(c, "invalid webhook signature")
	}

	resp, err := HandleWebhook(body)
	if err != nil {
		log.Printf("[zoom] webhook processing failed: %v", err)
		return shared.BadRequest(c, "VALIDATION_ERROR", "unable to process webhook", "")
	}
	if resp != nil {
		return c.JSON(http.StatusOK, resp)
	}
	return c.NoContent(http.StatusOK)
}
