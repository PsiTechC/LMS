package assessments

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v4"
	"github.com/xa-lms/api/internal/shared"
)

// This file lets the grading service notify a participant that their
// assessment was graded WITHOUT importing the communications package — modules
// never import each other's Go packages (CLAUDE.md). It calls communications'
// internal-only POST /communications/internal/notify over loopback HTTP,
// mirroring sessions/notify_bridge.go exactly. All in-app-notification write
// logic stays in the communications module.

var notifyBridgeClient = &http.Client{Timeout: 10 * time.Second}

// notifyGraded fires the loopback notification. Meant to be invoked as
// `go notifyGraded(...)` so a slow receiver never delays the grading response.
// callerID/callerRole are the grading faculty's identity — they've already
// been authorized to grade this attempt on this same request.
func notifyGraded(callerID, callerRole, participantID, activityTitle string, scorePct float64) {
	token, err := mintInternalToken(callerID, callerRole)
	if err != nil {
		log.Printf("assessments: could not mint internal token for grade notify: %v", err)
		return
	}

	payload := map[string]any{
		"user_id": participantID,
		"title":   fmt.Sprintf("%s graded — %.0f%%", activityTitle, scorePct),
		"body":    fmt.Sprintf("Your submission for \"%s\" has been graded. You scored %.0f%%. See your results for the full breakdown.", activityTitle, scorePct),
		"type":    "grade",
	}
	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("assessments: grade notify payload build failed: %v", err)
		return
	}

	req, err := http.NewRequest(http.MethodPost, internalAPIBaseURL()+"/communications/internal/notify", bytes.NewReader(body))
	if err != nil {
		log.Printf("assessments: grade notify request build failed: %v", err)
		return
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := notifyBridgeClient.Do(req)
	if err != nil {
		log.Printf("assessments: failed to reach communications module for grade notify: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		log.Printf("assessments: grade notify call failed status=%d body=%s", resp.StatusCode, string(b))
	}
}

func internalAPIBaseURL() string {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	return "http://localhost:" + port + "/api/v1"
}

// mintInternalToken signs a short-lived JWT for userID/role in the shape
// shared.RequireAuth() expects — used only to authenticate this process's own
// loopback call as the grading faculty. Mirrors sessions/zoom_bridge.go.
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
