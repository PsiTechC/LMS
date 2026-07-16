package attendance

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
)

// ErrInvalidToken covers any malformed, tampered, or session-mismatched
// attendance token.
var ErrInvalidToken = errors.New("invalid or tampered attendance token")

// tokenPayload is the signed content embedded in a QR token.
type tokenPayload struct {
	SessionID uuid.UUID `json:"session_id"`
	Nonce     string    `json:"nonce"`
	IssuedAt  int64     `json:"issued_at"`
}

// GenerateSignedToken creates a compact, HMAC-SHA256-signed token embedding
// sessionID, for encoding into the attendance QR. Format:
// base64url(payload-json) + "." + base64url(hmac).
func GenerateSignedToken(sessionID uuid.UUID) (string, error) {
	nonceBytes := make([]byte, 9)
	if _, err := rand.Read(nonceBytes); err != nil {
		return "", err
	}
	payloadBytes, err := json.Marshal(tokenPayload{
		SessionID: sessionID,
		Nonce:     base64.RawURLEncoding.EncodeToString(nonceBytes),
		IssuedAt:  time.Now().Unix(),
	})
	if err != nil {
		return "", err
	}
	payloadB64 := base64.RawURLEncoding.EncodeToString(payloadBytes)

	mac, err := signTokenPayload(payloadB64)
	if err != nil {
		return "", err
	}
	return payloadB64 + "." + mac, nil
}

// VerifySignedToken recomputes the HMAC and rejects on any mismatch or
// malformed input, returning the embedded session id on success.
func VerifySignedToken(token string) (uuid.UUID, error) {
	parts := strings.SplitN(token, ".", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return uuid.Nil, ErrInvalidToken
	}
	expectedMAC, err := signTokenPayload(parts[0])
	if err != nil {
		return uuid.Nil, err
	}
	if !hmac.Equal([]byte(expectedMAC), []byte(parts[1])) {
		return uuid.Nil, ErrInvalidToken
	}

	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return uuid.Nil, ErrInvalidToken
	}
	var payload tokenPayload
	if err := json.Unmarshal(payloadBytes, &payload); err != nil {
		return uuid.Nil, ErrInvalidToken
	}
	if payload.SessionID == uuid.Nil {
		return uuid.Nil, ErrInvalidToken
	}
	return payload.SessionID, nil
}

func attendanceSigningSecret() string {
	return os.Getenv("ATTENDANCE_SIGNING_SECRET")
}

func signTokenPayload(payloadB64 string) (string, error) {
	secret := attendanceSigningSecret()
	if secret == "" {
		return "", errors.New("ATTENDANCE_SIGNING_SECRET is not configured")
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payloadB64))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

// codeAlphabet excludes visually ambiguous characters (0/O, 1/I/L) since
// these codes are meant to be read off a screen and typed by hand.
const codeAlphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const codeLength = 6

// GenerateSessionCode generates a random 6-character human-readable join
// code (uppercase letters + digits, ambiguous characters excluded). Callers
// retry on a unique-constraint collision against attendance_sessions.code.
func GenerateSessionCode() (string, error) {
	buf := make([]byte, codeLength)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	out := make([]byte, codeLength)
	for i, v := range buf {
		out[i] = codeAlphabet[int(v)%len(codeAlphabet)]
	}
	return string(out), nil
}
