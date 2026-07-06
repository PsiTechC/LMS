package submissions

type CreateSubmissionRequest struct {
	ActivityID string `json:"activity_id"`
	Content    string `json:"content"`
	FileURL    string `json:"file_url"`
}

type GradeRequest struct {
	Grade    float64 `json:"grade"`
	Feedback string  `json:"feedback"`
}

type SubmissionResponse struct {
	ID            string   `json:"id"`
	ActivityID    string   `json:"activity_id"`
	ParticipantID string   `json:"participant_id"`
	Content       *string  `json:"content,omitempty"`
	FileURL       *string  `json:"file_url,omitempty"`
	Status        string   `json:"status"`
	Grade         *float64 `json:"grade,omitempty"`
	Feedback      *string  `json:"feedback,omitempty"`
	GradedBy      *string  `json:"graded_by,omitempty"`
	SubmittedAt   string   `json:"submitted_at"`
}

type ListSubmissionsQuery struct {
	ActivityID string `query:"activity_id"`
	Page       int    `query:"page"`
	Limit      int    `query:"limit"`
}

// GradingAdminDTO is one row of the superadmin cross-org grading view — a union
// of participant submissions and team capstones. All values are real (no dummy).
type GradingAdminDTO struct {
	ID          string   `json:"id"`
	Source      string   `json:"source"` // submission | capstone
	Type        string   `json:"type"`   // Assignment | Reflection | Assessment | Case Study | Capstone
	Participant string   `json:"participant"`
	Org         string   `json:"org"`
	OrgID       string   `json:"org_id"`
	Program     string   `json:"program"`
	Title       string   `json:"title"`
	SubmittedAt string   `json:"submitted_at"` // RFC3339 UTC, "" if not submitted
	Faculty     string   `json:"faculty"`      // grader name, "" if none
	Status      string   `json:"status"`       // raw status (submitted|graded|not_submitted|…)
	Grade       *float64 `json:"grade,omitempty"`
}
