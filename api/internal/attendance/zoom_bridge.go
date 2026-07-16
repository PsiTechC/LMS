package attendance

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v4"
	"github.com/xa-lms/api/internal/shared"
)

// This file lets StartSession ensure a Zoom meeting exists for a virtual
// attendance session WITHOUT importing the zoom package — modules never
// import each other's Go packages (CLAUDE.md). All Zoom-calling logic
// (per-faculty OAuth tokens, retry, idempotency) stays exclusively in the
// zoom module; this calls its existing, already-tested
// POST /sessions/:id/zoom-meeting endpoint over loopback HTTP instead of
// duplicating any of that logic here. Mirrors sessions/zoom_bridge.go.

var attendanceZoomBridgeClient = &http.Client{Timeout: 15 * time.Second}

// ensureZoomMeetingForClassSession calls zoom's own meeting-creation endpoint
// for the given class session, acting as callerID/callerRole (a short-lived
// internal token is minted for this). Returns the join URL.
func ensureZoomMeetingForClassSession(classSessionID, title string, scheduledAt time.Time, durationMins int, callerID, callerRole string) (string, error) {
	token, err := mintInternalToken(callerID, callerRole)
	if err != nil {
		return "", err
	}

	payload := map[string]any{
		"topic":            title,
		"start_time":       scheduledAt.UTC().Format(time.RFC3339),
		"duration_minutes": durationMins,
		"timezone":         "UTC",
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}

	req, err := http.NewRequest(http.MethodPost, internalAPIBaseURL()+"/sessions/"+classSessionID+"/zoom-meeting", bytes.NewReader(body))
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := attendanceZoomBridgeClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to reach zoom module: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	var envelope struct {
		Data struct {
			JoinURL string `json:"join_url"`
		} `json:"data"`
		Error *struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	_ = json.Unmarshal(respBody, &envelope)

	if resp.StatusCode >= 400 {
		// A meeting already existing for this session is not a failure —
		// the zoom module's own idempotency (CreateMeeting) already returns
		// the existing meeting with 201/200, so a 4xx here is a real error.
		//
		// ZOOM_ACCOUNT_NOT_LINKED is distinguished from every other failure
		// (upstream Zoom API errors, network issues, org misconfiguration)
		// because it's the one case with a clear fix ("connect your Zoom
		// account") rather than "something went wrong, try again later".
		if envelope.Error != nil && envelope.Error.Code == "ZOOM_ACCOUNT_NOT_LINKED" {
			return "", ErrZoomAccountNotLinked
		}
		if envelope.Error != nil && envelope.Error.Message != "" {
			return "", errors.New(envelope.Error.Message)
		}
		return "", fmt.Errorf("failed to create zoom meeting (status %d)", resp.StatusCode)
	}
	if envelope.Data.JoinURL == "" {
		return "", errors.New("zoom meeting created but no join url was returned")
	}
	return envelope.Data.JoinURL, nil
}

func internalAPIBaseURL() string {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	return "http://localhost:" + port + "/api/v1"
}

// mintInternalToken signs a short-lived JWT for userID/role, in the exact
// shape shared.RequireAuth() expects — used only to authenticate this
// process's own loopback call to zoom's endpoint as the original caller, who
// has already been authorized to start this attendance session by this same
// request.
func mintInternalToken(userID, role string) (string, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return "", errors.New("JWT_SECRET is not configured")
	}
	claims := shared.JWTClaims{
		UserID: userID,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(2 * time.Minute)),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return tok.SignedString([]byte(secret))
}
