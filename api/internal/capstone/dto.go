package capstone

// ── Request DTOs ──────────────────────────────────────────────────

type SubmitRequest struct {
	FileURL  string `json:"file_url"`
	FileName string `json:"file_name"`
}

type AddFileRequest struct {
	Title   string `json:"title"`
	FileURL string `json:"file_url"`
}

type SubmitPeerReviewRequest struct {
	AssignmentID string `json:"assignment_id"`
	Rating       int    `json:"rating"`
	Comment      string `json:"comment"`
}

// ── Response DTOs ─────────────────────────────────────────────────

type TeamMemberDTO struct {
	UserID     string `json:"user_id"`
	Name       string `json:"name"`
	Email      string `json:"email"`
	Department string `json:"department,omitempty"`
	IsMe       bool   `json:"is_me"`
}

type TeamFileDTO struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	FileURL      string `json:"file_url"`
	UploadedByID string `json:"uploaded_by_id,omitempty"`
	UploadedBy   string `json:"uploaded_by,omitempty"`
	CreatedAt    string `json:"created_at"`
}

type PeerAssignmentDTO struct {
	AssignmentID string  `json:"assignment_id"`
	TargetTeam   string  `json:"target_team"`
	DueDate      *string `json:"due_date,omitempty"`
	Reviewed     bool    `json:"reviewed"`
	MyRating     *int    `json:"my_rating,omitempty"`
}

type PanelFeedbackDTO struct {
	PanelistName string `json:"panelist_name"`
	PanelistRole string `json:"panelist_role,omitempty"`
	Rating       int    `json:"rating"`
	Comment      string `json:"comment,omitempty"`
	CreatedAt    string `json:"created_at"`
}

// MyCapstoneDTO is the participant's full capstone view (all 4 tabs).
type MyCapstoneDTO struct {
	HasTeam bool `json:"has_team"`

	// My Capstone tab
	TeamID           string  `json:"team_id,omitempty"`
	Title            string  `json:"title,omitempty"`
	TeamName         string  `json:"team_name,omitempty"`
	ProgramName      string  `json:"program_name,omitempty"`
	CohortName       string  `json:"cohort_name,omitempty"`
	// Brief config (nullable until a PM/faculty sets it).
	Description      *string `json:"description,omitempty"`
	Format           *string `json:"format,omitempty"`
	Audience         *string `json:"audience,omitempty"`
	Evaluation       *string `json:"evaluation,omitempty"`
	Deadline         *string `json:"deadline,omitempty"`
	SubmissionStatus string  `json:"submission_status"`
	FileURL          *string `json:"file_url,omitempty"`
	FileName         *string `json:"file_name,omitempty"`
	SubmittedAt      *string `json:"submitted_at,omitempty"`
	AIFeedback       *string `json:"ai_feedback,omitempty"`

	// Team Workspace tab
	Members []TeamMemberDTO `json:"members"`
	Files   []TeamFileDTO   `json:"files"`

	// Peer Review tab
	PeerAssignments []PeerAssignmentDTO `json:"peer_assignments"`

	// Panel Feedback tab (empty until released)
	PanelReleased bool               `json:"panel_released"`
	Panel         []PanelFeedbackDTO `json:"panel"`
	PanelAvg      *float64           `json:"panel_avg,omitempty"`
}
