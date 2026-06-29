package sessions

type CreateSessionRequest struct {
	ProgramID    string `json:"program_id"`
	CohortID     string `json:"cohort_id"`
	Title        string `json:"title"`
	Description  string `json:"description"`
	SessionType  string `json:"session_type"`
	VirtualLink  string `json:"virtual_link"`
	ScheduledAt  string `json:"scheduled_at"` // RFC3339
	DurationMins int    `json:"duration_mins"`
}

type UpdateSessionRequest struct {
	Title        string `json:"title"`
	Description  string `json:"description"`
	VirtualLink  string `json:"virtual_link"`
	ScheduledAt  string `json:"scheduled_at"`
	DurationMins int    `json:"duration_mins"`
	Status       string `json:"status"`
}

type SessionResponse struct {
	ID           string  `json:"id"`
	ProgramID    string  `json:"program_id"`
	CohortID     string  `json:"cohort_id"`
	FacultyID    string  `json:"faculty_id"`
	Title        string  `json:"title"`
	Description  *string `json:"description,omitempty"`
	SessionType  string  `json:"session_type"`
	VirtualLink  *string `json:"virtual_link,omitempty"`
	ScheduledAt  string  `json:"scheduled_at"`
	DurationMins int     `json:"duration_mins"`
	Status       string  `json:"status"`
	CreatedAt    string  `json:"created_at"`
}

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

type AttendanceEntry struct {
	UserID string `json:"user_id"`
	Status string `json:"status"` // 'present' | 'absent' | 'late'
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
