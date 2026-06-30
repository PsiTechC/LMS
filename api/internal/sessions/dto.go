package sessions

// ── Session ────────────────────────────────────────────────────────────────

type CreateSessionRequest struct {
	ProgramID    string `json:"program_id"`
	CohortID     string `json:"cohort_id"`
	ActivityID   string `json:"activity_id"`  // links session to a specific live_session/coaching activity
	FacultyID    string `json:"faculty_id"`   // explicit faculty; falls back to caller when empty
	Title        string `json:"title"`
	Description  string `json:"description"`
	SessionType  string `json:"session_type"`
	VirtualLink  string `json:"virtual_link"`
	ScheduledAt  string `json:"scheduled_at"` // RFC3339
	DurationMins int    `json:"duration_mins"`
}

type UpdateSessionRequest struct {
	Title         string `json:"title"`
	Description   string `json:"description"`
	VirtualLink   string `json:"virtual_link"`
	WhiteboardURL string `json:"whiteboard_url"`
	ScheduledAt   string `json:"scheduled_at"`
	DurationMins  int    `json:"duration_mins"`
	Status        string `json:"status"`
}

type SessionResponse struct {
	ID            string       `json:"id"`
	ProgramID     string       `json:"program_id"`
	CohortID      string       `json:"cohort_id"`
	ActivityID    string       `json:"activity_id,omitempty"`
	FacultyID     string       `json:"faculty_id"`
	FacultyName   string       `json:"faculty_name,omitempty"`
	Title         string       `json:"title"`
	Description   *string      `json:"description,omitempty"`
	SessionType   string       `json:"session_type"`
	VirtualLink   *string      `json:"virtual_link,omitempty"`
	WhiteboardURL *string      `json:"whiteboard_url,omitempty"`
	ScheduledAt   string       `json:"scheduled_at"`
	DurationMins  int          `json:"duration_mins"`
	Status        string       `json:"status"`
	Agenda        []AgendaItem `json:"agenda"`
	Notes         *string      `json:"notes,omitempty"`
	StartedAt     *string      `json:"started_at,omitempty"`
	EndedAt       *string      `json:"ended_at,omitempty"`
	CreatedAt     string       `json:"created_at"`
}

// ── Agenda ─────────────────────────────────────────────────────────────────

type UpdateAgendaRequest struct {
	Items []AgendaItem `json:"items"`
}

// ── Notes ──────────────────────────────────────────────────────────────────

type UpdateNotesRequest struct {
	Notes string `json:"notes"`
}

// ── Materials ──────────────────────────────────────────────────────────────

type AddMaterialRequest struct {
	Title     string `json:"title"`
	Type      string `json:"type"`
	URL       string `json:"url"`
	SizeBytes *int64 `json:"size_bytes,omitempty"`
}

type MaterialResponse struct {
	ID         string `json:"id"`
	SessionID  string `json:"session_id"`
	UploadedBy string `json:"uploaded_by"`
	Title      string `json:"title"`
	Type       string `json:"type"`
	URL        string `json:"url"`
	CreatedAt  string `json:"created_at"`
}

// ── Attendance ─────────────────────────────────────────────────────────────

type AttendanceEntry struct {
	UserID string `json:"user_id"`
	Status string `json:"status"` // present | absent | late
}

type MarkAttendanceRequest struct {
	Entries []AttendanceEntry `json:"entries"`
}

type AttendanceResponse struct {
	SessionID string `json:"session_id"`
	UserID    string `json:"user_id"`
	Status    string `json:"status"`
	MarkedAt  string `json:"marked_at"`
}

type ListSessionsQuery struct {
	CohortID  string `query:"cohort_id"`
	FacultyID string `query:"faculty_id"`
	Status    string `query:"status"`
	Page      int    `query:"page"`
	Limit     int    `query:"limit"`
}

// ── Polls ──────────────────────────────────────────────────────────────────

type CreatePollRequest struct {
	Question string   `json:"question"`
	Options  []string `json:"options"`
}

type PollResponse struct {
	ID        string   `json:"id"`
	SessionID string   `json:"session_id"`
	Question  string   `json:"question"`
	Options   []string `json:"options"`
	IsActive  bool     `json:"is_active"`
	CreatedAt string   `json:"created_at"`
}

type VoteCount struct {
	OptionIndex int    `json:"option_index"`
	Option      string `json:"option"`
	Count       int    `json:"count"`
}

type PollResultsResponse struct {
	PollID   string      `json:"poll_id"`
	Question string      `json:"question"`
	Options  []string    `json:"options"`
	Votes    []VoteCount `json:"votes"`
	Total    int         `json:"total"`
}

type SubmitVoteRequest struct {
	OptionIndex int `json:"option_index"`
}

// ── Action Items ───────────────────────────────────────────────────────────

type CreateActionItemRequest struct {
	ParticipantID string `json:"participant_id,omitempty"`
	Description   string `json:"description"`
	DueDate       string `json:"due_date,omitempty"`
}

type UpdateActionItemRequest struct {
	Status      string `json:"status,omitempty"`
	Description string `json:"description,omitempty"`
}

type ActionItemResponse struct {
	ID            string  `json:"id"`
	SessionID     string  `json:"session_id"`
	ParticipantID *string `json:"participant_id,omitempty"`
	Description   string  `json:"description"`
	DueDate       *string `json:"due_date,omitempty"`
	Status        string  `json:"status"`
	CreatedBy     string  `json:"created_by"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
}
