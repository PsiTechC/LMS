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

// ── Participant (coaching roster) ─────────────────────────────────

type CoachingParticipantDTO struct {
	UserID    string `json:"user_id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	AvatarURL string `json:"avatar_url"`
}

// ── Tracker ───────────────────────────────────────────────────────

type CoachingTrackerDTO struct {
	ParticipantID   string  `json:"participant_id"`
	SessionsDone    int64   `json:"sessions_done"`
	GoalsSet        int64   `json:"goals_set"`
	ActionsPending  int64   `json:"actions_pending"`
	FollowThroughPct float64 `json:"follow_through_pct"`
}

type CoachingKPIDTO struct {
	TotalParticipants int64   `json:"total_participants"`
	SessionsDone      int64   `json:"sessions_done"`
	ActionsPending    int64   `json:"actions_pending"`
	AvgGoalProgressPct float64 `json:"avg_goal_progress_pct"`
}

// ── Goals ─────────────────────────────────────────────────────────

type CreateGoalRequest struct {
	ParticipantID string  `json:"participant_id"`
	Title         string  `json:"title"`
	Description   *string `json:"description,omitempty"`
	TargetDate    *string `json:"target_date,omitempty"` // YYYY-MM-DD
	PmCanView     bool    `json:"pm_can_view"`
}

type UpdateGoalRequest struct {
	Title       *string `json:"title,omitempty"`
	Description *string `json:"description,omitempty"`
	TargetDate  *string `json:"target_date,omitempty"`
	Status      *string `json:"status,omitempty"`
	PmCanView   *bool   `json:"pm_can_view,omitempty"`
}

type GoalDTO struct {
	ID            string  `json:"id"`
	ParticipantID string  `json:"participant_id"`
	FacultyID     string  `json:"faculty_id"`
	Title         string  `json:"title"`
	Description   *string `json:"description,omitempty"`
	TargetDate    *string `json:"target_date,omitempty"`
	Status        string  `json:"status"`
	PmCanView     bool    `json:"pm_can_view"`
	CreatedAt     string  `json:"created_at"`
	UpdatedAt     string  `json:"updated_at"`
}

// ── Dev Notes ─────────────────────────────────────────────────────

type CreateDevNoteRequest struct {
	ParticipantID string `json:"participant_id"`
	Content       string `json:"content"`
	PmCanView     bool   `json:"pm_can_view"`
}

type UpdateDevNoteRequest struct {
	Content   *string `json:"content,omitempty"`
	PmCanView *bool   `json:"pm_can_view,omitempty"`
}

type DevNoteDTO struct {
	ID            string `json:"id"`
	ParticipantID string `json:"participant_id"`
	FacultyID     string `json:"faculty_id"`
	Content       string `json:"content"`
	PmCanView     bool   `json:"pm_can_view"`
	CreatedAt     string `json:"created_at"`
	UpdatedAt     string `json:"updated_at"`
}
