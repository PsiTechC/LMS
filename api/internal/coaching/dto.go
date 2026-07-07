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
	Progress      int     `json:"progress"`
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
	HasEngagement     bool                `json:"has_engagement"`
	CoachName         string              `json:"coach_name,omitempty"`
	CoachCredential   string              `json:"coach_credential,omitempty"`
	EngagementName    string              `json:"engagement_name,omitempty"`
	AssignmentType    string              `json:"assignment_type,omitempty"` // individual | group
	Frequency         string              `json:"frequency,omitempty"`
	Status            string              `json:"status,omitempty"`
	TotalSessions     int                 `json:"total_sessions"`
	CompletedSessions int                 `json:"completed_sessions"`
	CoachingScore     *int                `json:"coaching_score,omitempty"`
	Goals             []MyCoachingGoalDTO `json:"goals"`
	SessionNotes      []MyCoachingNoteDTO `json:"session_notes"`
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
	// Type tags a coach option as "coach" or "faculty" so the assign-coach
	// dropdown can show both personas labeled. Empty for participant options.
	Type string `json:"type,omitempty"`
}

// CoachDTO is a coach shown in the org's coach roster on the coaching admin tab.
// OrgID/OrgName are populated for the superadmin "All Orgs" view so the roster
// can show which org each coach belongs to.
type CoachDTO struct {
	UserID  string `json:"user_id"`
	Name    string `json:"name"`
	Email   string `json:"email"`
	Type    string `json:"type"` // coach | faculty
	OrgID   string `json:"org_id"`
	OrgName string `json:"org_name"`
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

// ── Coach dashboard (coach-scoped, keyed by the logged-in coach) ───
// Powers the dedicated coach persona workspace: the engagements they run, their
// upcoming coaching sessions, and pending coachee action items. The engagement
// list reuses CoachingEngagementDTO filtered to coach_id = the caller.

// CoachSummaryDTO drives the four dashboard stat tiles.
type CoachSummaryDTO struct {
	ActiveEngagements    int `json:"active_engagements"`
	ScheduledEngagements int `json:"scheduled_engagements"`
	UpcomingSessions     int `json:"upcoming_sessions"` // scheduled within the next 7 days
	PendingActions       int `json:"pending_actions"`   // open action items across all coachees
	SessionsDone         int `json:"sessions_done"`     // sum of completed_sessions
	SessionsTotal        int `json:"sessions_total"`    // sum of total_sessions
}

// CoachSessionDTO is one upcoming coaching session (from class_sessions). When
// linked to an engagement, engagement_type/engagement_name/coachee_name let the
// UI label a 1:1 by its coachee and a group by the engagement, with the session
// title used as the topic line.
type CoachSessionDTO struct {
	ID               string `json:"id"`
	Title            string `json:"title"`
	SessionType      string `json:"session_type"` // classroom | coaching_group | coaching_individual
	VirtualLink      string `json:"virtual_link,omitempty"`
	ScheduledAt      string `json:"scheduled_at"`
	DurationMins     int    `json:"duration_mins"`
	Status           string `json:"status"`
	CohortID         string `json:"cohort_id,omitempty"`
	CohortName       string `json:"cohort_name,omitempty"`
	ProgramTitle     string `json:"program_title"`
	EngagementID     string `json:"engagement_id,omitempty"`
	EngagementType   string `json:"engagement_type,omitempty"` // individual | group
	EngagementName   string `json:"engagement_name,omitempty"`
	CoacheeName      string `json:"coachee_name,omitempty"`
	ParticipantCount int    `json:"participant_count"`
	Notes            string `json:"notes,omitempty"` // post-session summary (for past sessions)
}

// CoachActionDTO is one pending coachee action item.
type CoachActionDTO struct {
	ID              string `json:"id"`
	Description     string `json:"description"`
	DueDate         string `json:"due_date,omitempty"` // YYYY-MM-DD
	Status          string `json:"status"`
	ParticipantID   string `json:"participant_id,omitempty"`
	ParticipantName string `json:"participant_name,omitempty"`
	SessionTitle    string `json:"session_title"`
}

// ── Session Notes (coach) ──────────────────────────────────────────
// One coaching note the coach authored, joined to its session + coachee, with
// the action items tracked against that session inlined for the action tracker.

type CoachNoteActionDTO struct {
	ID          string `json:"id"`
	Description string `json:"description"`
	DueDate     string `json:"due_date,omitempty"`
	Status      string `json:"status"` // open | completed
}

type CoachNoteDTO struct {
	ID            string               `json:"id"`
	SessionID     string               `json:"session_id"`
	SessionTitle  string               `json:"session_title"`
	ParticipantID string               `json:"participant_id,omitempty"`
	CoacheeName   string               `json:"coachee_name"`
	Notes         string               `json:"notes"`
	CreatedAt     string               `json:"created_at"`
	OpenActions   int                  `json:"open_actions"`
	Actions       []CoachNoteActionDTO `json:"actions"`
}

// UpdateActionStatusRequest toggles a session action item open/completed.
type UpdateActionStatusRequest struct {
	Status string `json:"status"` // open | completed
}

// CreateCoachActionRequest adds a new action item to one of the coach's sessions.
type CreateCoachActionRequest struct {
	SessionID     string  `json:"session_id"`
	Description   string  `json:"description"`
	DueDate       *string `json:"due_date,omitempty"`       // YYYY-MM-DD
	ParticipantID *string `json:"participant_id,omitempty"` // defaults to null
}

// CreateCoachNoteRequest creates a new session note. participant_id is derived
// from the session's engagement when omitted.
type CreateCoachNoteRequest struct {
	SessionID     string  `json:"session_id"`
	Notes         string  `json:"notes"`
	ParticipantID *string `json:"participant_id,omitempty"`
}

// CoachDocumentDTO is a document / psychometric report the coach holds about a
// coachee, with an optional coach-authored summary and/or uploaded file.
type CoachDocumentDTO struct {
	ID            string `json:"id"`
	ParticipantID string `json:"participant_id,omitempty"`
	CoacheeName   string `json:"coachee_name,omitempty"`
	Title         string `json:"title"`
	DocType       string `json:"doc_type"`
	UploadedBy    string `json:"uploaded_by"`
	URL           string `json:"url,omitempty"`
	IsShared      bool   `json:"is_shared"`
	CoachSummary  string `json:"coach_summary,omitempty"`
	HasFile       bool   `json:"has_file"`
	FileName      string `json:"file_name,omitempty"`
	FileSize      int64  `json:"file_size,omitempty"`
	CreatedAt     string `json:"created_at"`
}

// CoachBlockDTO is a personal calendar block reserved by the coach.
type CoachBlockDTO struct {
	ID           string `json:"id"`
	BlockedAt    string `json:"blocked_at"`
	DurationMins int    `json:"duration_mins"`
	Label        string `json:"label,omitempty"`
}

// CreateCoachBlockRequest reserves calendar time. BlockedAt is RFC3339.
type CreateCoachBlockRequest struct {
	BlockedAt    string `json:"blocked_at"`
	DurationMins int    `json:"duration_mins"`
	Label        string `json:"label"`
}

// CreateCoachDocumentRequest creates a coach document (metadata; file optional
// via multipart "file" field).
type CreateCoachDocumentRequest struct {
	ParticipantID string `json:"participant_id" form:"participant_id"`
	Title         string `json:"title" form:"title"`
	DocType       string `json:"doc_type" form:"doc_type"`
	UploadedBy    string `json:"uploaded_by" form:"uploaded_by"`
	URL           string `json:"url" form:"url"`
	IsShared      bool   `json:"is_shared" form:"is_shared"`
	CoachSummary  string `json:"coach_summary" form:"coach_summary"`
}
