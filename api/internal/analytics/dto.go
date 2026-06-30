package analytics

import "time"

// ── Engagement ────────────────────────────────────────────────────

type EngagementPoint struct {
	WeekNumber    int    `json:"week_number"    db:"week_number"`
	WeekLabel     string `json:"week_label"     db:"week_label"`
	EngagementPct int    `json:"engagement_pct" db:"engagement_pct"`
}

// ── Competency scores ─────────────────────────────────────────────

type UpsertCompetencyScoreRequest struct {
	CohortID      string  `json:"cohort_id"       validate:"required"`
	CompetencyID  string  `json:"competency_id"   validate:"required"`
	PreProgramPct float64 `json:"pre_program_pct"`
	CurrentPct    float64 `json:"current_pct"`
}

type CompetencyScoreResponse struct {
	ID            string    `json:"id"`
	CohortID      string    `json:"cohort_id"`
	CompetencyID  string    `json:"competency_id"`
	Title         string    `json:"title"`
	Category      string    `json:"category"`
	PreProgramPct float64   `json:"pre_program_pct"`
	CurrentPct    float64   `json:"current_pct"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// ── Program Overview ──────────────────────────────────────────────

type ProgramOverviewResponse struct {
	TotalPrograms     int     `json:"total_programs"`
	ActivePrograms    int     `json:"active_programs"`
	DraftPrograms     int     `json:"draft_programs"`
	DeliveredPrograms int     `json:"delivered_programs"`
	TotalCohorts      int     `json:"total_cohorts"`
	TotalParticipants int     `json:"total_participants"`
	AtRiskCount       int     `json:"at_risk_count"`
	AvgCompletion     float64 `json:"avg_completion"`
}

// ── Cohort Progress ───────────────────────────────────────────────

type ParticipantProgress struct {
	UserID            string     `json:"user_id"`
	Name              string     `json:"name"`
	Email             string     `json:"email"`
	Department        string     `json:"department"`
	EnrolledAt        time.Time  `json:"enrolled_at"`
	CompletionPercent float64    `json:"completion_percent"`
	RiskLevel         string     `json:"risk_level"`
	EnrollmentStatus  string     `json:"enrollment_status"`
	SessionsAttended  int        `json:"sessions_attended"`
	TotalSessions     int        `json:"total_sessions"`
	SubmissionsGraded int        `json:"submissions_graded"`
	TotalSubmissions  int        `json:"total_submissions"`
	LastActive        *time.Time `json:"last_active"`
}

type CohortProgressSummary struct {
	TotalEnrolled int     `json:"total_enrolled"`
	AtRiskCount   int     `json:"at_risk_count"`
	AvgCompletion float64 `json:"avg_completion"`
}

type CohortProgressResponse struct {
	CohortID     string                `json:"cohort_id"`
	Participants []ParticipantProgress `json:"participants"`
	Summary      CohortProgressSummary `json:"summary"`
}

// ── Activity Completion ───────────────────────────────────────────

type ActivityCompletionRow struct {
	ActivityID        string   `json:"activity_id"`
	Title             string   `json:"title"`
	ActivityType      string   `json:"activity_type"`
	TotalParticipants int      `json:"total_participants"`
	CompletedCount    int      `json:"completed_count"`
	CompletionPct     float64  `json:"completion_pct"`
	AvgScore          *float64 `json:"avg_score"`
	OverdueCount      int      `json:"overdue_count"`
	PhaseName         string   `json:"phase_name"`
}

type ActivityCompletionResponse struct {
	CohortID   string                  `json:"cohort_id"`
	Activities []ActivityCompletionRow `json:"activities"`
}

// ── Attendance Heatmap ────────────────────────────────────────────

type SessionAttendanceRow struct {
	SessionID      string    `json:"session_id"`
	Title          string    `json:"title"`
	ScheduledAt    time.Time `json:"scheduled_at"`
	TotalExpected  int       `json:"total_expected"`
	PresentCount   int       `json:"present_count"`
	AbsentCount    int       `json:"absent_count"`
	LateCount      int       `json:"late_count"`
	AttendanceRate float64   `json:"attendance_rate"`
	DurationMins   int       `json:"duration_mins"`
}

type AttendanceHeatmapResponse struct {
	CohortID    string                 `json:"cohort_id"`
	Sessions    []SessionAttendanceRow `json:"sessions"`
	OverallRate float64                `json:"overall_rate"`
}

// ── Submission Grades ─────────────────────────────────────────────

type GradeBucket struct {
	Label string `json:"label"`
	Count int    `json:"count"`
}

type ActivityGradeStats struct {
	ActivityID   string        `json:"activity_id"`
	Title        string        `json:"title"`
	AvgGrade     float64       `json:"avg_grade"`
	PendingCount int           `json:"pending_count"`
	GradedCount  int           `json:"graded_count"`
	Buckets      []GradeBucket `json:"buckets"`
}

type SubmissionGradesResponse struct {
	CohortID   string               `json:"cohort_id"`
	Activities []ActivityGradeStats `json:"activities"`
}

// ── Session Summary ───────────────────────────────────────────────

type SessionSummaryResponse struct {
	CohortID              string  `json:"cohort_id"`
	TotalScheduled        int     `json:"total_scheduled"`
	TotalDelivered        int     `json:"total_delivered"`
	TotalHours            float64 `json:"total_hours"`
	AvgDurationMins       float64 `json:"avg_duration_mins"`
	ActionItemsOpen       int     `json:"action_items_open"`
	ActionItemsClosed     int     `json:"action_items_closed"`
	ActionItemsOverdue    int     `json:"action_items_overdue"`
	PollParticipationRate float64 `json:"poll_participation_rate"`
}

// ── Phase Completion Rollup ───────────────────────────────────────

type PhaseCompletionRow struct {
	PhaseID       string  `json:"phase_id"`
	PhaseName     string  `json:"phase_name"`
	PhaseNumber   int     `json:"phase_number"`
	TotalActivities   int     `json:"total_activities"`
	CompletedActivities int   `json:"completed_activities"`
	CompletionPct float64 `json:"completion_pct"`
}

type TypeCompletionRow struct {
	ActivityType    string  `json:"activity_type"`
	TotalActivities int     `json:"total_activities"`
	CompletedCount  int     `json:"completed_count"`
	CompletionPct   float64 `json:"completion_pct"`
	AvgScore        float64 `json:"avg_score"`
}

type CompletionRollupResponse struct {
	CohortID    string               `json:"cohort_id"`
	OverallPct  float64              `json:"overall_pct"`
	ByPhase     []PhaseCompletionRow `json:"by_phase"`
	ByType      []TypeCompletionRow  `json:"by_type"`
}

// ── Engagement (login + activity) ────────────────────────────────

type EngagementSummaryRow struct {
	UserID       string  `json:"user_id"`
	Name         string  `json:"name"`
	Email        string  `json:"email"`
	LoginCount   int     `json:"login_count"`
	ActivitiesStarted   int `json:"activities_started"`
	ActivitiesCompleted int `json:"activities_completed"`
	AvgProgressPct      float64 `json:"avg_progress_pct"`
}

type EngagementSummaryResponse struct {
	CohortID     string                 `json:"cohort_id"`
	Participants []EngagementSummaryRow `json:"participants"`
}

// ── Assessment Performance ────────────────────────────────────────

type AssessmentPerformer struct {
	UserID    string  `json:"user_id"`
	Name      string  `json:"name"`
	Email     string  `json:"email"`
	AvgGrade  float64 `json:"avg_grade"`
	Submitted int     `json:"submitted"`
	Graded    int     `json:"graded"`
}

type AssessmentPerformanceResponse struct {
	CohortID      string                `json:"cohort_id"`
	CohortAvg     float64               `json:"cohort_avg"`
	TopPerformers []AssessmentPerformer `json:"top_performers"`
	LowPerformers []AssessmentPerformer `json:"low_performers"`
}

// ── At-Risk Detail ────────────────────────────────────────────────

type AtRiskParticipant struct {
	UserID            string  `json:"user_id"`
	Name              string  `json:"name"`
	Email             string  `json:"email"`
	RiskLevel         string  `json:"risk_level"`
	CompletionPercent float64 `json:"completion_percent"`
	SessionsAttended  int     `json:"sessions_attended"`
	TotalSessions     int     `json:"total_sessions"`
	ActivitiesOverdue int     `json:"activities_overdue"`
	DaysSinceActivity int     `json:"days_since_activity"`
}

type AtRiskResponse struct {
	CohortID     string              `json:"cohort_id"`
	Participants []AtRiskParticipant `json:"participants"`
}

// ── Program-level Summary ─────────────────────────────────────────

type ProgramCohortRow struct {
	CohortID          string  `json:"cohort_id"`
	CohortName        string  `json:"cohort_name"`
	StartDate         *string `json:"start_date"`
	EndDate           *string `json:"end_date"`
	TotalEnrolled     int     `json:"total_enrolled"`
	AvgCompletion     float64 `json:"avg_completion"`
	AtRiskCount       int     `json:"at_risk_count"`
	SessionsDelivered int     `json:"sessions_delivered"`
	SessionsScheduled int     `json:"sessions_scheduled"`
}

type ProgramSummaryResponse struct {
	ProgramID        string              `json:"program_id"`
	TotalCohorts     int                 `json:"total_cohorts"`
	TotalParticipants int                `json:"total_participants"`
	AvgCompletion    float64             `json:"avg_completion"`
	AtRiskCount      int                 `json:"at_risk_count"`
	TotalSessions    int                 `json:"total_sessions"`
	SessionsDelivered int                `json:"sessions_delivered"`
	AvgCompetencyImprovement float64     `json:"avg_competency_improvement"`
	Cohorts          []ProgramCohortRow  `json:"cohorts"`
}

// ── ROI / Competency Improvement ─────────────────────────────────

type CompetencyImprovementRow struct {
	CompetencyID  string  `json:"competency_id"`
	Title         string  `json:"title"`
	Category      string  `json:"category"`
	PreProgramPct float64 `json:"pre_program_pct"`
	CurrentPct    float64 `json:"current_pct"`
	ImprovementPct float64 `json:"improvement_pct"`
	ImprovementAbs float64 `json:"improvement_abs"`
}

type ROIResponse struct {
	CohortID       string                     `json:"cohort_id"`
	AvgImprovement float64                    `json:"avg_improvement"`
	Competencies   []CompetencyImprovementRow `json:"competencies"`
}
