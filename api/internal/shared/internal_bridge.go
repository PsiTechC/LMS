package shared

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
)

// internal_bridge.go centralizes the loopback-HTTP pattern already used by
// sessions/zoom_bridge.go (which predates this file and still has its own
// private copy) - modules never import each other's Go packages (root
// CLAUDE.md), so a module needing another module's business logic calls its
// existing, already-tested HTTP endpoint instead of duplicating that logic.
// This file exists so a 2nd/3rd caller of the pattern (the certificates
// module's completion hook, called from activityprogress/assessments/surveys)
// doesn't have to re-implement JWT minting from scratch - CLAUDE.md flags any
// shared/ change as needing team discussion before merging, so treat this
// file as exactly that kind of change.

var internalBridgeClient = &http.Client{Timeout: 15 * time.Second}

// InternalAPIBaseURL returns this process's own API base URL for loopback
// calls (e.g. http://localhost:8080/api/v1).
func InternalAPIBaseURL() string {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	return "http://localhost:" + port + "/api/v1"
}

// MintInternalToken signs a short-lived JWT for userID/role, in the exact
// shape RequireAuth() expects (see JWTClaims) - used only to authenticate a
// process's own loopback call to another module's endpoint, acting as a
// caller who has already been authorized by the original request.
func MintInternalToken(userID, role string) (string, error) {
	secret := os.Getenv("JWT_SECRET")
	if secret == "" {
		return "", errors.New("JWT_SECRET is not configured")
	}
	claims := JWTClaims{
		UserID: userID,
		Role:   role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(2 * time.Minute)),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return tok.SignedString([]byte(secret))
}

// InternalPostResult is the parsed shape of any endpoint using this repo's
// standard response envelope (see the API Conventions section of
// root CLAUDE.md) - Data is left as raw JSON so each caller unmarshals into
// its own expected shape.
type InternalPostResult struct {
	StatusCode int
	Data       json.RawMessage
	ErrorMsg   string
}

// InternalPost mints a short-lived internal token for (callerID, callerRole)
// and POSTs body (JSON-encoded) to path (relative to InternalAPIBaseURL(),
// e.g. "/certificates/internal/issue"). Best-effort callers should treat a
// non-2xx status or transport error as "the other module didn't complete
// its action" and decide for themselves whether that's fatal.
func InternalPost(path, callerID, callerRole string, body any) (*InternalPostResult, error) {
	token, err := MintInternalToken(callerID, callerRole)
	if err != nil {
		return nil, err
	}
	encoded, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest(http.MethodPost, InternalAPIBaseURL()+path, bytes.NewReader(encoded))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := internalBridgeClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to reach internal endpoint %s: %w", path, err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	var envelope struct {
		Data  json.RawMessage `json:"data"`
		Error *ErrorDetail    `json:"error"`
	}
	_ = json.Unmarshal(respBody, &envelope)

	result := &InternalPostResult{StatusCode: resp.StatusCode, Data: envelope.Data}
	if envelope.Error != nil {
		result.ErrorMsg = envelope.Error.Message
	}
	return result, nil
}
