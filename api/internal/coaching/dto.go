package coaching

type CreateNoteRequest struct {
	SessionID     string `json:"session_id"`
	ParticipantID string `json:"participant_id"`
	Notes         string `json:"notes"`
	IsPrivate     bool   `json:"is_private"`
}

type UpdateNoteRequest struct {
	Notes     *string `json:"notes"`
	IsPrivate *bool   `json:"is_private"`
}

type CoachingNoteResponse struct {
	ID            string `json:"id"`
	SessionID     string `json:"session_id"`
	FacultyID     string `json:"faculty_id"`
	ParticipantID string `json:"participant_id"`
	Notes         string `json:"notes"`
	IsPrivate     bool   `json:"is_private"`
	CreatedAt     string `json:"created_at"`
	UpdatedAt     string `json:"updated_at"`
}

type ListNotesQuery struct {
	SessionID     string `query:"session_id"`
	ParticipantID string `query:"participant_id"`
	Page          int    `query:"page"`
	Limit         int    `query:"limit"`
}
