package zoom

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"
)

// webhookEnvelope is the common envelope Zoom sends for every webhook event.
type webhookEnvelope struct {
	Event   string          `json:"event"`
	Payload json.RawMessage `json:"payload"`
}

type urlValidationPayload struct {
	PlainToken string `json:"plainToken"`
}

type meetingEventPayload struct {
	Object struct {
		ID string `json:"id"`
	} `json:"object"`
	Participant *struct {
		UserID   string `json:"user_id"`
		UserName string `json:"user_name"`
	} `json:"participant,omitempty"`
}

// VerifyWebhookSignature validates Zoom's x-zm-signature header per
// https://developers.zoom.us/docs/api/rest/webhook-reference/#verify-webhook-events
// header format: "v0:<timestamp>:<hex hmac>"
func VerifyWebhookSignature(header, timestamp, rawBody string) bool {
	secret := os.Getenv("ZOOM_WEBHOOK_SECRET_TOKEN")
	if secret == "" || header == "" || timestamp == "" {
		return false
	}
	message := fmt.Sprintf("v0:%s:%s", timestamp, rawBody)
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(message))
	expected := "v0=" + hex.EncodeToString(mac.Sum(nil))
	return subtle.ConstantTimeCompare([]byte(expected), []byte(header)) == 1
}

// HandleWebhook processes a verified Zoom webhook payload and returns an
// optional response body (used only for the url_validation challenge).
func HandleWebhook(rawBody []byte) (map[string]string, error) {
	var env webhookEnvelope
	if err := json.Unmarshal(rawBody, &env); err != nil {
		return nil, fmt.Errorf("invalid webhook payload: %w", err)
	}

	if env.Event == "endpoint.url_validation" {
		return handleURLValidation(env.Payload)
	}

	switch env.Event {
	case "meeting.started":
		return nil, onMeetingEvent(env.Payload, map[string]any{"status": "live", "started_at": time.Now()})
	case "meeting.ended":
		return nil, onMeetingEvent(env.Payload, map[string]any{"status": "completed", "ended_at": time.Now()})
	case "meeting.participant_joined", "meeting.participant_left":
		// Attendance is recorded by session_attendance today via manual/roster
		// marking; participant join/leave events are accepted and ignored here
		// until per-participant Zoom attendance sync is scoped.
		return nil, nil
	default:
		return nil, nil
	}
}

func handleURLValidation(payload json.RawMessage) (map[string]string, error) {
	var p urlValidationPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return nil, fmt.Errorf("invalid url_validation payload: %w", err)
	}
	secret := os.Getenv("ZOOM_WEBHOOK_SECRET_TOKEN")
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(p.PlainToken))
	encrypted := hex.EncodeToString(mac.Sum(nil))
	return map[string]string{
		"plainToken":     p.PlainToken,
		"encryptedToken": encrypted,
	}, nil
}

func onMeetingEvent(payload json.RawMessage, fields map[string]any) error {
	var p meetingEventPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return fmt.Errorf("invalid meeting event payload: %w", err)
	}
	id := strings.TrimSpace(p.Object.ID)
	if id == "" {
		return nil
	}
	return updateSessionStatusByMeetingID(id, fields)
}
