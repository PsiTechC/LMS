package capstone

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v4"
	"github.com/xa-lms/api/internal/shared"
)

// Loopback bridge to the communications module's internal notify endpoint -
// modules never import each other's Go packages (CLAUDE.md). Mirrors
// assessments/notify_bridge.go. All in-app-notification logic stays in
// communications; this only fires the HTTP call.

var notifyBridgeClient = &http.Client{Timeout: 10 * time.Second}

// notifyUsers sends the same in-app notification to each user id. Fire-and-forget
// (invoke as `go notifyUsers(...)`) - a slow receiver must never delay the caller.
// link deep-links into the recipient's capstone tab (participant:
// /dashboard/participant?tab=capstone, faculty: /dashboard/faculty?tab=fac-capstone)
// rather than leaving them to hunt for it after clicking the notification.
func notifyUsers(callerID, callerRole string, userIDs []string, title, body, typ, link string) {
	if len(userIDs) == 0 {
		return
	}
	token, err := mintInternalToken(callerID, callerRole)
	if err != nil {
		log.Printf("capstone: could not mint internal token for notify: %v", err)
		return
	}
	for _, uid := range userIDs {
		payload := map[string]any{"user_id": uid, "title": title, "body": body, "type": typ, "link": link}
		b, err := json.Marshal(payload)
		if err != nil {
			continue
		}
		req, err := http.NewRequest(http.MethodPost, internalAPIBaseURL()+"/communications/internal/notify", bytes.NewReader(b))
		if err != nil {
			continue
		}
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")
		resp, err := notifyBridgeClient.Do(req)
		if err != nil {
			log.Printf("capstone: notify call failed for %s: %v", uid, err)
			continue
		}
		if resp.StatusCode >= 400 {
			bb, _ := io.ReadAll(resp.Body)
			log.Printf("capstone: notify failed status=%d body=%s", resp.StatusCode, string(bb))
		}
		resp.Body.Close()
	}
}

func internalAPIBaseURL() string {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	return "http://localhost:" + port + "/api/v1"
}

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
