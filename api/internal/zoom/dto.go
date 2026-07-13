package zoom

// CreateMeetingRequest is the input for scheduling a Zoom meeting for a session.
type CreateMeetingRequest struct {
	Topic           string `json:"topic" validate:"required"`
	StartTime       string `json:"start_time" validate:"required"` // ISO8601, e.g. 2026-07-10T15:00:00
	DurationMinutes int    `json:"duration_minutes" validate:"required,min=1"`
	Timezone        string `json:"timezone" validate:"required"`
}

// MeetingDTO is returned after a meeting is created or already exists.
type MeetingDTO struct {
	SessionID string `json:"session_id"`
	MeetingID string `json:"zoom_meeting_id"`
	JoinURL   string `json:"join_url"`
	StartURL  string `json:"start_url"`
	Password  string `json:"password"`
}

// SignatureDTO is returned to a client wanting to join a meeting via the SDK.
type SignatureDTO struct {
	Signature     string `json:"signature"`
	SdkKey        string `json:"sdk_key"`
	MeetingNumber string `json:"meeting_number"`
	Role          int    `json:"role"`
}

// OAuthStatusDTO reports whether the calling faculty user has a Zoom account
// connected, for the frontend's "Connect Zoom" status indicator.
type OAuthStatusDTO struct {
	Connected bool    `json:"connected"`
	Status    string  `json:"status"` // active | expired | disconnected | not_connected
	ZoomEmail *string `json:"zoom_email,omitempty"`
}
