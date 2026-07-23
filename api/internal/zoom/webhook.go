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

// recordingCompletedPayload is the subset of Zoom's recording.completed
// payload we need - see
// https://developers.zoom.us/docs/api/rest/webhook-reference/#recording-completed
type recordingCompletedPayload struct {
	Object struct {
		ID             string `json:"id"` // Zoom's numeric meeting id, as a string
		RecordingFiles []struct {
			FileType string `json:"file_type"` // MP4 | M4A | TRANSCRIPT | CHAT | ...
			PlayURL  string `json:"play_url"`
			Status   string `json:"status"` // completed | processing
		} `json:"recording_files"`
	} `json:"object"`
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
	case "recording.completed":
		return nil, onRecordingCompleted(env.Payload)
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

// onRecordingCompleted stores the recording's shareable play_url (never the
// token-gated download_url) and transcript play_url, if present, on the
// class_sessions row matching this Zoom meeting id. If this delivery's file
// list has no usable MP4 (still processing, or a partial/duplicate webhook
// delivery for the same meeting), the row is left untouched rather than
// regressed to "processing" - Zoom is known to redeliver recording.completed
// (e.g. once per recording file, or on retry), and a later delivery lacking
// a completed MP4 must never hide a link an earlier delivery already made
// available. The frontend's "Recording available" link must never render
// for a session with no real link to show, so "available" is only ever set
// alongside a non-empty recording_url.
func onRecordingCompleted(payload json.RawMessage) error {
	var p recordingCompletedPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return fmt.Errorf("invalid recording completed payload: %w", err)
	}
	id := strings.TrimSpace(p.Object.ID)
	if id == "" {
		return nil
	}

	var recordingURL, transcriptURL string
	for _, f := range p.Object.RecordingFiles {
		if f.Status != "" && f.Status != "completed" {
			continue
		}
		switch f.FileType {
		case "MP4":
			if recordingURL == "" {
				recordingURL = f.PlayURL
			}
		case "TRANSCRIPT":
			if transcriptURL == "" {
				transcriptURL = f.PlayURL
			}
		}
	}

	if recordingURL == "" {
		// Nothing usable in this delivery - do not touch recording_status,
		// so a prior delivery's "available" state (or the "none" default)
		// is left exactly as it was.
		return nil
	}

	fields := map[string]any{
		"recording_url":          recordingURL,
		"recording_status":       "available",
		"recording_available_at": time.Now(),
	}
	if transcriptURL != "" {
		fields["transcript_url"] = transcriptURL
	}

	return updateSessionRecordingByMeetingID(id, fields)
}
