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
