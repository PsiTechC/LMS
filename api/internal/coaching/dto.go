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
	ParticipantID    string  `json:"participant_id"`
	SessionsDone     int64   `json:"sessions_done"`
	GoalsSet         int64   `json:"goals_set"`
	ActionsPending   int64   `json:"actions_pending"`
	FollowThroughPct float64 `json:"follow_through_pct"`
}

type CoachingKPIDTO struct {
	TotalParticipants  int64   `json:"total_participants"`
	SessionsDone       int64   `json:"sessions_done"`
	ActionsPending     int64   `json:"actions_pending"`
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

// ── Participant self-view (read-only) ─────────────────────────────
// What a participant sees about their OWN coaching: assigned coach, session
// progress, their goals, and session notes authored by the coach. Coach
// private dev-notes are intentionally excluded.

type MyCoachingDTO struct {
	HasEngagement     bool                 `json:"has_engagement"`
	CoachName         string               `json:"coach_name,omitempty"`
	CoachCredential   string               `json:"coach_credential,omitempty"`
	EngagementName    string               `json:"engagement_name,omitempty"`
	AssignmentType    string               `json:"assignment_type,omitempty"` // individual | group
	Frequency         string               `json:"frequency,omitempty"`
	Status            string               `json:"status,omitempty"`
	TotalSessions     int                  `json:"total_sessions"`
	CompletedSessions int                  `json:"completed_sessions"`
	CoachingScore     *int                 `json:"coaching_score,omitempty"`
	Goals             []MyCoachingGoalDTO  `json:"goals"`
	SessionNotes      []MyCoachingNoteDTO  `json:"session_notes"`
}

type MyCoachingGoalDTO struct {
	ID          string  `json:"id"`
	Title       string  `json:"title"`
	Description *string `json:"description,omitempty"`
	TargetDate  *string `json:"target_date,omitempty"`
	Status      string  `json:"status"` // active | completed | ...
}

type MyCoachingNoteDTO struct {
	ID        string `json:"id"`
	Notes     string `json:"notes"`
	CreatedAt string `json:"created_at"`
}

// -- Program Manager coaching admin --------------------------------

type CoachingAdminOptionDTO struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email,omitempty"`
}

type CoachingAdminProgramOptionDTO struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

type CoachingAdminCohortOptionDTO struct {
	ID        string `json:"id"`
	ProgramID string `json:"program_id"`
	Name      string `json:"name"`
}

type CoachingAdminOptionsDTO struct {
	Programs     []CoachingAdminProgramOptionDTO `json:"programs"`
	Cohorts      []CoachingAdminCohortOptionDTO  `json:"cohorts"`
	Participants []CoachingAdminOptionDTO        `json:"participants"`
	Coaches      []CoachingAdminOptionDTO        `json:"coaches"`
}

type CoachingEngagementDTO struct {
	ID                string                   `json:"id"`
	OrgID             string                   `json:"org_id"`
	ProgramID         string                   `json:"program_id"`
	ProgramTitle      string                   `json:"program_title"`
	CohortID          *string                  `json:"cohort_id,omitempty"`
	CohortName        *string                  `json:"cohort_name,omitempty"`
	CoachID           string                   `json:"coach_id"`
	CoachName         string                   `json:"coach_name"`
	AssignedByID      string                   `json:"assigned_by_id"`
	AssignedByName    string                   `json:"assigned_by_name"`
	AssignmentType    string                   `json:"assignment_type"`
	Name              string                   `json:"name"`
	Status            string                   `json:"status"`
	StartDate         *string                  `json:"start_date,omitempty"`
	Frequency         string                   `json:"frequency"`
	TotalSessions     int                      `json:"total_sessions"`
	CompletedSessions int                      `json:"completed_sessions"`
	Goals             []string                 `json:"goals"`
	Participants      []CoachingAdminOptionDTO `json:"participants"`
	CreatedAt         string                   `json:"created_at"`
	UpdatedAt         string                   `json:"updated_at"`
}

type CreateCoachingEngagementRequest struct {
	OrgID          string   `json:"org_id"`
	ProgramID      string   `json:"program_id"`
	CohortID       *string  `json:"cohort_id,omitempty"`
	CoachID        string   `json:"coach_id"`
	AssignmentType string   `json:"assignment_type"`
	Name           string   `json:"name,omitempty"`
	ParticipantIDs []string `json:"participant_ids"`
	StartDate      *string  `json:"start_date,omitempty"`
	Frequency      string   `json:"frequency"`
	TotalSessions  int      `json:"total_sessions"`
	Goals          []string `json:"goals"`
}
