package analytics

import (
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/cache"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

func getEngagement(cohortID string) ([]EngagementPoint, error) {
	var rows []EngagementPoint
	err := database.DB.Raw(`
		WITH cohort_session_weeks AS (
			SELECT id AS session_id, DATE_TRUNC('week', scheduled_at) AS week_start,
				DENSE_RANK() OVER (ORDER BY DATE_TRUNC('week', scheduled_at)) AS relative_week
			FROM class_sessions WHERE cohort_id = ? AND status IN ('live', 'completed')
		),
		week_attendance AS (
			SELECT sw.relative_week,
				COUNT(sa.user_id) FILTER (WHERE sa.status = 'present') AS present_count,
				COUNT(sa.user_id) AS total_marked
			FROM cohort_session_weeks sw
			LEFT JOIN session_attendance sa ON sa.session_id = sw.session_id
			GROUP BY sw.relative_week
		)
		SELECT relative_week::INT AS week_number, CONCAT('W', relative_week) AS week_label,
			CASE WHEN total_marked > 0 THEN ROUND(present_count * 100.0 / total_marked)::INT ELSE 0 END AS engagement_pct
		FROM week_attendance ORDER BY relative_week LIMIT 8
	`, cohortID).Scan(&rows).Error
	return rows, err
}

func getCompetencyScores(cohortID string) ([]CompetencyScoreResponse, error) {
	var rows []CompetencyScoreResponse
	err := database.DB.Raw(`
		SELECT ccs.id, ccs.cohort_id, ccs.competency_id, c.title, c.category,
			ccs.pre_program_pct, ccs.current_pct, ccs.updated_at
		FROM cohort_competency_scores ccs
		JOIN competencies c ON c.id = ccs.competency_id
		WHERE ccs.cohort_id = ?
		ORDER BY c.category, c.title
	`, cohortID).Scan(&rows).Error
	return rows, err
}

func upsertCompetencyScore(req UpsertCompetencyScoreRequest) (*CohortCompetencyScore, error) {
	cID, err := uuid.Parse(req.CohortID)
	if err != nil { return nil, errors.New("invalid cohort_id") }
	compID, err := uuid.Parse(req.CompetencyID)
	if err != nil { return nil, errors.New("invalid competency_id") }
	row := CohortCompetencyScore{CohortID: cID, CompetencyID: compID, PreProgramPct: req.PreProgramPct, CurrentPct: req.CurrentPct}
	err = database.DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "cohort_id"}, {Name: "competency_id"}},
		DoUpdates: clause.Assignments(map[string]any{
			"pre_program_pct": req.PreProgramPct, "current_pct": req.CurrentPct,
			"updated_at": gorm.Expr("NOW()"),
		}),
	}).Create(&row).Error
	return &row, err
}

func deleteCompetencyScore(id string) error {
	res := database.DB.Where("id = ?", id).Delete(&CohortCompetencyScore{})
	if res.Error != nil { return res.Error }
	if res.RowsAffected == 0 { return errors.New("not found") }
	return nil
}

func getProgramOverview(orgID string) (*ProgramOverviewResponse, error) {
	key := fmt.Sprintf("analytics:overview:org:%s", orgID)
	var cached ProgramOverviewResponse
	if err := cache.Get(key, &cached); err == nil {
		return &cached, nil
	}
	type programRow struct {
		Status string `gorm:"column:status"`
		Count  int    `gorm:"column:count"`
	}
	var programRows []programRow
	err := database.DB.Raw(`
		SELECT status, COUNT(*)::INT AS count FROM programs WHERE org_id = ? GROUP BY status
	`, orgID).Scan(&programRows).Error
	if err != nil { return nil, err }
	resp := &ProgramOverviewResponse{}
	for _, r := range programRows {
		resp.TotalPrograms += r.Count
		switch r.Status {
		case "active": resp.ActivePrograms = r.Count
		case "draft":  resp.DraftPrograms = r.Count
		case "delivered", "archived": resp.DeliveredPrograms += r.Count
		}
	}
	type cohortStats struct {
		TotalCohorts      int     `gorm:"column:total_cohorts"`
		TotalParticipants int     `gorm:"column:total_participants"`
		AtRiskCount       int     `gorm:"column:at_risk_count"`
		AvgCompletion     float64 `gorm:"column:avg_completion"`
	}
	var cs cohortStats
	err = database.DB.Raw(`
		SELECT COUNT(DISTINCT c.id)::INT AS total_cohorts,
			COUNT(DISTINCT e.id)::INT AS total_participants,
			COUNT(DISTINCT e.id) FILTER (WHERE e.risk_level = 'high')::INT AS at_risk_count,
			COALESCE(AVG(e.completion_percent), 0) AS avg_completion
		FROM cohorts c
		LEFT JOIN enrollments e ON e.cohort_id = c.id AND e.role = 'participant'
		WHERE c.org_id = ?
	`, orgID).Scan(&cs).Error
	if err != nil { return nil, err }
	resp.TotalCohorts = cs.TotalCohorts; resp.TotalParticipants = cs.TotalParticipants
	resp.AtRiskCount = cs.AtRiskCount; resp.AvgCompletion = cs.AvgCompletion
	cache.Set(key, resp, 2*time.Minute)
	return resp, nil
}

func getCohortProgress(cohortID string) (*CohortProgressResponse, error) {
	var rows []ParticipantProgress
	err := database.DB.Raw(`
		SELECT u.id AS user_id, u.name, u.email,
			COALESCE(u.department, '') AS department,
			e.enrolled_at,
			e.completion_percent::FLOAT AS completion_percent, e.risk_level, e.status AS enrollment_status,
			COUNT(sa.id) FILTER (WHERE sa.status = 'present')::INT AS sessions_attended,
			(SELECT COUNT(*) FROM class_sessions cs2 WHERE cs2.cohort_id = $1)::INT AS total_sessions,
			COUNT(s.id) FILTER (WHERE s.status = 'graded')::INT AS submissions_graded,
			COUNT(s.id)::INT AS total_submissions,
			NULL::TIMESTAMPTZ AS last_active
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		LEFT JOIN session_attendance sa ON sa.user_id = u.id
			AND sa.session_id IN (SELECT id FROM class_sessions WHERE cohort_id = $2)
		LEFT JOIN submissions s ON s.participant_id = u.id
		WHERE e.cohort_id = $3 AND e.role = 'participant'
		GROUP BY u.id, u.name, u.email, u.department, e.enrolled_at, e.completion_percent, e.risk_level, e.status
		ORDER BY e.completion_percent DESC
	`, cohortID, cohortID, cohortID).Scan(&rows).Error
	if err != nil { return nil, err }
	if rows == nil { rows = []ParticipantProgress{} }
	resp := &CohortProgressResponse{CohortID: cohortID, Participants: rows}
	var totalCompletion float64
	for _, p := range rows {
		resp.Summary.TotalEnrolled++
		if p.RiskLevel == "high" { resp.Summary.AtRiskCount++ }
		totalCompletion += p.CompletionPercent
	}
	if resp.Summary.TotalEnrolled > 0 { resp.Summary.AvgCompletion = totalCompletion / float64(resp.Summary.TotalEnrolled) }
	return resp, nil
}

func getActivityCompletion(cohortID string) (*ActivityCompletionResponse, error) {
	var rows []ActivityCompletionRow
	err := database.DB.Raw(`
		WITH enrolled AS (
			SELECT user_id, id FROM enrollments WHERE cohort_id = $1 AND role = 'participant'
		),
		enrolled_count AS (SELECT COUNT(*) AS cnt FROM enrolled)
		SELECT a.id AS activity_id, a.title, a.type AS activity_type,
			(SELECT cnt FROM enrolled_count)::INT AS total_participants,
			COUNT(ap.id) FILTER (WHERE ap.status = 'completed')::INT AS completed_count,
			CASE WHEN (SELECT cnt FROM enrolled_count) > 0
				THEN ROUND(COUNT(ap.id) FILTER (WHERE ap.status = 'completed') * 100.0 / (SELECT cnt FROM enrolled_count), 1)
				ELSE 0 END AS completion_pct,
			AVG(s.grade) FILTER (WHERE s.status = 'graded') AS avg_score,
			COUNT(en.user_id) FILTER (WHERE ap.id IS NULL OR ap.status != 'completed')::INT AS overdue_count,
			pp.title AS phase_name
		FROM activities a
		JOIN program_phases pp ON pp.id = a.phase_id
		JOIN cohorts c ON c.program_id = pp.program_id AND c.id = $2
		LEFT JOIN activity_progress ap ON ap.activity_id = a.id AND ap.enrollment_id IN (SELECT id FROM enrolled)
		LEFT JOIN enrolled en ON en.user_id IS NOT NULL
		LEFT JOIN submissions s ON s.activity_id = a.id AND s.participant_id IN (SELECT user_id FROM enrolled)
		GROUP BY a.id, a.title, a.type, pp.title, pp.phase_number
		ORDER BY pp.phase_number, a.sort_order
	`, cohortID, cohortID).Scan(&rows).Error
	if err != nil { return nil, err }
	if rows == nil { rows = []ActivityCompletionRow{} }
	return &ActivityCompletionResponse{CohortID: cohortID, Activities: rows}, nil
}

func getAttendanceHeatmap(cohortID string) (*AttendanceHeatmapResponse, error) {
	var rows []SessionAttendanceRow
	err := database.DB.Raw(`
		WITH expected AS (
			SELECT COUNT(*) AS cnt FROM enrollments WHERE cohort_id = $1 AND role = 'participant'
		)
		SELECT cs.id AS session_id, cs.title, cs.scheduled_at,
			(SELECT cnt FROM expected)::INT AS total_expected,
			COUNT(sa.id) FILTER (WHERE sa.status = 'present')::INT AS present_count,
			COUNT(sa.id) FILTER (WHERE sa.status = 'absent')::INT AS absent_count,
			COUNT(sa.id) FILTER (WHERE sa.status = 'late')::INT AS late_count,
			CASE WHEN (SELECT cnt FROM expected) > 0
				THEN ROUND(COUNT(sa.id) FILTER (WHERE sa.status = 'present') * 100.0 / (SELECT cnt FROM expected), 1)
				ELSE 0 END AS attendance_rate,
			cs.duration_mins
		FROM class_sessions cs
		LEFT JOIN session_attendance sa ON sa.session_id = cs.id
		WHERE cs.cohort_id = $2
		GROUP BY cs.id, cs.title, cs.scheduled_at, cs.duration_mins
		ORDER BY cs.scheduled_at ASC
	`, cohortID, cohortID).Scan(&rows).Error
	if err != nil { return nil, err }
	if rows == nil { rows = []SessionAttendanceRow{} }
	var totalPresent, totalExpected int
	for _, r := range rows { totalPresent += r.PresentCount; totalExpected += r.TotalExpected }
	var overallRate float64
	if totalExpected > 0 { overallRate = float64(totalPresent) * 100.0 / float64(totalExpected) }
	return &AttendanceHeatmapResponse{CohortID: cohortID, Sessions: rows, OverallRate: overallRate}, nil
}

func getSubmissionGrades(cohortID string) (*SubmissionGradesResponse, error) {
	type gradeRow struct {
		ActivityID    string  `gorm:"column:activity_id"`
		ActivityTitle string  `gorm:"column:activity_title"`
		Bucket        string  `gorm:"column:bucket"`
		BucketCount   int     `gorm:"column:bucket_count"`
		AvgGrade      float64 `gorm:"column:avg_grade"`
		PendingCount  int     `gorm:"column:pending_count"`
		GradedCount   int     `gorm:"column:graded_count"`
	}
	var rows []gradeRow
	err := database.DB.Raw(`
		WITH cohort_activities AS (
			SELECT a.id, a.title FROM activities a
			JOIN program_phases pp ON pp.id = a.phase_id
			JOIN cohorts c ON c.program_id = pp.program_id AND c.id = $1
		),
		subs AS (
			SELECT s.activity_id,
				CASE WHEN s.grade < 50 THEN '0-49' WHEN s.grade < 60 THEN '50-59'
					WHEN s.grade < 70 THEN '60-69' WHEN s.grade < 80 THEN '70-79'
					WHEN s.grade < 90 THEN '80-89' ELSE '90-100' END AS bucket,
				s.grade, s.status
			FROM submissions s
			WHERE s.activity_id IN (SELECT id FROM cohort_activities)
			  AND s.participant_id IN (SELECT user_id FROM enrollments WHERE cohort_id = $2 AND role = 'participant')
		)
		SELECT ca.id AS activity_id, ca.title AS activity_title,
			COALESCE(s.bucket, 'N/A') AS bucket,
			COUNT(s.grade)::INT AS bucket_count,
			COALESCE(AVG(s.grade) FILTER (WHERE s.status = 'graded'), 0) AS avg_grade,
			COUNT(*) FILTER (WHERE s.status = 'submitted')::INT AS pending_count,
			COUNT(*) FILTER (WHERE s.status = 'graded')::INT AS graded_count
		FROM cohort_activities ca
		LEFT JOIN subs s ON s.activity_id = ca.id
		GROUP BY ca.id, ca.title, s.bucket
		ORDER BY ca.id, s.bucket
	`, cohortID, cohortID).Scan(&rows).Error
	if err != nil { return nil, err }
	bucketOrder := []string{"0-49", "50-59", "60-69", "70-79", "80-89", "90-100"}
	actMap := map[string]*ActivityGradeStats{}
	var actOrder []string
	for _, r := range rows {
		if _, ok := actMap[r.ActivityID]; !ok {
			buckets := make([]GradeBucket, len(bucketOrder))
			for i, b := range bucketOrder { buckets[i] = GradeBucket{Label: b, Count: 0} }
			actMap[r.ActivityID] = &ActivityGradeStats{ActivityID: r.ActivityID, Title: r.ActivityTitle,
				AvgGrade: r.AvgGrade, PendingCount: r.PendingCount, GradedCount: r.GradedCount, Buckets: buckets}
			actOrder = append(actOrder, r.ActivityID)
		}
		for i, b := range bucketOrder { if b == r.Bucket { actMap[r.ActivityID].Buckets[i].Count += r.BucketCount } }
	}
	activities := make([]ActivityGradeStats, 0, len(actOrder))
	for _, id := range actOrder { activities = append(activities, *actMap[id]) }
	return &SubmissionGradesResponse{CohortID: cohortID, Activities: activities}, nil
}

func getSessionSummary(cohortID string) (*SessionSummaryResponse, error) {
	type sessionStats struct {
		TotalScheduled  int     `gorm:"column:total_scheduled"`
		TotalDelivered  int     `gorm:"column:total_delivered"`
		TotalMins       float64 `gorm:"column:total_mins"`
		AvgDurationMins float64 `gorm:"column:avg_duration_mins"`
	}
	var ss sessionStats
	err := database.DB.Raw(`
		SELECT COUNT(*)::INT AS total_scheduled,
			COUNT(*) FILTER (WHERE status = 'completed')::INT AS total_delivered,
			COALESCE(SUM(duration_mins) FILTER (WHERE status = 'completed'), 0) AS total_mins,
			COALESCE(AVG(duration_mins) FILTER (WHERE status = 'completed'), 0) AS avg_duration_mins
		FROM class_sessions WHERE cohort_id = ?
	`, cohortID).Scan(&ss).Error
	if err != nil { return nil, err }
	type actionRow struct {
		Status  string `gorm:"column:status"`
		Count   int    `gorm:"column:count"`
		Overdue int    `gorm:"column:overdue"`
	}
	var actionRows []actionRow
	database.DB.Raw(`
		SELECT status, COUNT(*)::INT AS count,
			COUNT(*) FILTER (WHERE due_date < CURRENT_DATE AND status = 'open')::INT AS overdue
		FROM session_action_items
		WHERE session_id IN (SELECT id FROM class_sessions WHERE cohort_id = ?)
		GROUP BY status
	`, cohortID).Scan(&actionRows)
	var open, closed, overdue int
	for _, a := range actionRows {
		switch a.Status {
		case "open":   open = a.Count; overdue = a.Overdue
		case "closed": closed = a.Count
		}
	}
	type pollStats struct {
		TotalVotes    int `gorm:"column:total_votes"`
		TotalExpected int `gorm:"column:total_expected"`
	}
	var ps pollStats
	database.DB.Raw(`
		SELECT COUNT(DISTINCT spv.user_id)::INT AS total_votes,
			(SELECT COUNT(*) FROM enrollments WHERE cohort_id = $1 AND role = 'participant')::INT AS total_expected
		FROM session_polls sp
		LEFT JOIN session_poll_votes spv ON spv.poll_id = sp.id
		WHERE sp.session_id IN (SELECT id FROM class_sessions WHERE cohort_id = $2)
	`, cohortID, cohortID).Scan(&ps)
	var pollRate float64
	if ps.TotalExpected > 0 { pollRate = float64(ps.TotalVotes) * 100.0 / float64(ps.TotalExpected) }
	return &SessionSummaryResponse{
		CohortID: cohortID, TotalScheduled: ss.TotalScheduled, TotalDelivered: ss.TotalDelivered,
		TotalHours: ss.TotalMins / 60.0, AvgDurationMins: ss.AvgDurationMins,
		ActionItemsOpen: open, ActionItemsClosed: closed, ActionItemsOverdue: overdue,
		PollParticipationRate: pollRate,
	}, nil
}

func getCompletionRollup(cohortID string) (*CompletionRollupResponse, error) {
	// Overall pct
	type overall struct {
		Pct float64 `gorm:"column:pct"`
	}
	var ov overall
	database.DB.Raw(`
		SELECT COALESCE(AVG(completion_percent), 0) AS pct
		FROM enrollments WHERE cohort_id = $1 AND role = 'participant'
	`, cohortID).Scan(&ov)

	// By phase
	type phaseRow struct {
		PhaseID             string  `gorm:"column:phase_id"`
		PhaseName           string  `gorm:"column:phase_name"`
		PhaseNumber         int     `gorm:"column:phase_number"`
		TotalActivities     int     `gorm:"column:total_activities"`
		CompletedActivities int     `gorm:"column:completed_activities"`
		CompletionPct       float64 `gorm:"column:completion_pct"`
	}
	var phaseRows []phaseRow
	database.DB.Raw(`
		WITH enrolled AS (
			SELECT id, user_id FROM enrollments WHERE cohort_id = $1 AND role = 'participant'
		),
		enrolled_count AS (SELECT COUNT(*) AS cnt FROM enrolled)
		SELECT pp.id AS phase_id, pp.title AS phase_name, pp.phase_number,
			COUNT(DISTINCT a.id)::INT AS total_activities,
			COUNT(ap.id) FILTER (WHERE ap.status = 'completed')::INT AS completed_activities,
			CASE WHEN (SELECT cnt FROM enrolled_count) * COUNT(DISTINCT a.id) > 0
				THEN ROUND(COUNT(ap.id) FILTER (WHERE ap.status = 'completed') * 100.0
					/ ((SELECT cnt FROM enrolled_count) * COUNT(DISTINCT a.id)), 1)
				ELSE 0 END AS completion_pct
		FROM program_phases pp
		JOIN cohorts c ON c.program_id = pp.program_id AND c.id = $2
		LEFT JOIN activities a ON a.phase_id = pp.id
		LEFT JOIN activity_progress ap ON ap.activity_id = a.id
			AND ap.enrollment_id IN (SELECT id FROM enrolled)
		GROUP BY pp.id, pp.title, pp.phase_number
		ORDER BY pp.phase_number
	`, cohortID, cohortID).Scan(&phaseRows)

	// By activity type
	type typeRow struct {
		ActivityType    string  `gorm:"column:activity_type"`
		TotalActivities int     `gorm:"column:total_activities"`
		CompletedCount  int     `gorm:"column:completed_count"`
		CompletionPct   float64 `gorm:"column:completion_pct"`
		AvgScore        float64 `gorm:"column:avg_score"`
	}
	var typeRows []typeRow
	database.DB.Raw(`
		WITH enrolled AS (
			SELECT id, user_id FROM enrollments WHERE cohort_id = $1 AND role = 'participant'
		),
		enrolled_count AS (SELECT COUNT(*) AS cnt FROM enrolled)
		SELECT a.type AS activity_type,
			COUNT(DISTINCT a.id)::INT AS total_activities,
			COUNT(ap.id) FILTER (WHERE ap.status = 'completed')::INT AS completed_count,
			CASE WHEN (SELECT cnt FROM enrolled_count) * COUNT(DISTINCT a.id) > 0
				THEN ROUND(COUNT(ap.id) FILTER (WHERE ap.status = 'completed') * 100.0
					/ ((SELECT cnt FROM enrolled_count) * COUNT(DISTINCT a.id)), 1)
				ELSE 0 END AS completion_pct,
			COALESCE(AVG(s.grade) FILTER (WHERE s.status = 'graded'), 0) AS avg_score
		FROM activities a
		JOIN program_phases pp ON pp.id = a.phase_id
		JOIN cohorts c ON c.program_id = pp.program_id AND c.id = $2
		LEFT JOIN activity_progress ap ON ap.activity_id = a.id
			AND ap.enrollment_id IN (SELECT id FROM enrolled)
		LEFT JOIN submissions s ON s.activity_id = a.id
			AND s.participant_id IN (SELECT user_id FROM enrolled)
		GROUP BY a.type
		ORDER BY completion_pct DESC
	`, cohortID, cohortID).Scan(&typeRows)

	byPhase := make([]PhaseCompletionRow, 0, len(phaseRows))
	for _, r := range phaseRows {
		byPhase = append(byPhase, PhaseCompletionRow{
			PhaseID: r.PhaseID, PhaseName: r.PhaseName, PhaseNumber: r.PhaseNumber,
			TotalActivities: r.TotalActivities, CompletedActivities: r.CompletedActivities,
			CompletionPct: r.CompletionPct,
		})
	}
	byType := make([]TypeCompletionRow, 0, len(typeRows))
	for _, r := range typeRows {
		byType = append(byType, TypeCompletionRow{
			ActivityType: r.ActivityType, TotalActivities: r.TotalActivities,
			CompletedCount: r.CompletedCount, CompletionPct: r.CompletionPct, AvgScore: r.AvgScore,
		})
	}
	return &CompletionRollupResponse{CohortID: cohortID, OverallPct: ov.Pct, ByPhase: byPhase, ByType: byType}, nil
}

func getEngagementSummary(cohortID string) (*EngagementSummaryResponse, error) {
	type row struct {
		UserID              string  `gorm:"column:user_id"`
		Name                string  `gorm:"column:name"`
		Email               string  `gorm:"column:email"`
		LoginCount          int     `gorm:"column:login_count"`
		ActivitiesStarted   int     `gorm:"column:activities_started"`
		ActivitiesCompleted int     `gorm:"column:activities_completed"`
		AvgProgressPct      float64 `gorm:"column:avg_progress_pct"`
	}
	var rows []row
	err := database.DB.Raw(`
		SELECT u.id AS user_id, u.name, u.email,
			(SELECT COUNT(*) FROM sessions s WHERE s.user_id = u.id)::INT AS login_count,
			COUNT(ap.id) FILTER (WHERE ap.status != 'not_started')::INT AS activities_started,
			COUNT(ap.id) FILTER (WHERE ap.status = 'completed')::INT AS activities_completed,
			COALESCE(AVG(ap.percent_complete), 0) AS avg_progress_pct
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		LEFT JOIN activity_progress ap ON ap.enrollment_id = e.id
		WHERE e.cohort_id = $1 AND e.role = 'participant'
		GROUP BY u.id, u.name, u.email
		ORDER BY activities_completed DESC, avg_progress_pct DESC
	`, cohortID).Scan(&rows).Error
	if err != nil { return nil, err }
	participants := make([]EngagementSummaryRow, 0, len(rows))
	for _, r := range rows {
		participants = append(participants, EngagementSummaryRow{
			UserID: r.UserID, Name: r.Name, Email: r.Email,
			LoginCount: r.LoginCount, ActivitiesStarted: r.ActivitiesStarted,
			ActivitiesCompleted: r.ActivitiesCompleted, AvgProgressPct: r.AvgProgressPct,
		})
	}
	return &EngagementSummaryResponse{CohortID: cohortID, Participants: participants}, nil
}

func getAssessmentPerformance(cohortID string) (*AssessmentPerformanceResponse, error) {
	type row struct {
		UserID    string  `gorm:"column:user_id"`
		Name      string  `gorm:"column:name"`
		Email     string  `gorm:"column:email"`
		AvgGrade  float64 `gorm:"column:avg_grade"`
		Submitted int     `gorm:"column:submitted"`
		Graded    int     `gorm:"column:graded"`
	}
	var rows []row
	err := database.DB.Raw(`
		SELECT u.id AS user_id, u.name, u.email,
			COALESCE(AVG(s.grade) FILTER (WHERE s.status = 'graded'), 0) AS avg_grade,
			COUNT(s.id)::INT AS submitted,
			COUNT(s.id) FILTER (WHERE s.status = 'graded')::INT AS graded
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		LEFT JOIN submissions s ON s.participant_id = u.id
			AND s.activity_id IN (
				SELECT a.id FROM activities a
				JOIN program_phases pp ON pp.id = a.phase_id
				JOIN cohorts c ON c.program_id = pp.program_id AND c.id = $1
			)
		WHERE e.cohort_id = $2 AND e.role = 'participant'
		GROUP BY u.id, u.name, u.email
		HAVING COUNT(s.id) FILTER (WHERE s.status = 'graded') > 0
		ORDER BY avg_grade DESC
	`, cohortID, cohortID).Scan(&rows).Error
	if err != nil { return nil, err }

	var totalGrade float64
	performers := make([]AssessmentPerformer, 0, len(rows))
	for _, r := range rows {
		totalGrade += r.AvgGrade
		performers = append(performers, AssessmentPerformer{
			UserID: r.UserID, Name: r.Name, Email: r.Email,
			AvgGrade: r.AvgGrade, Submitted: r.Submitted, Graded: r.Graded,
		})
	}
	cohortAvg := 0.0
	if len(performers) > 0 { cohortAvg = totalGrade / float64(len(performers)) }

	top := performers
	if len(top) > 5 { top = top[:5] }
	low := make([]AssessmentPerformer, 0)
	for i := len(performers) - 1; i >= 0 && len(low) < 5; i-- {
		low = append(low, performers[i])
	}
	return &AssessmentPerformanceResponse{CohortID: cohortID, CohortAvg: cohortAvg, TopPerformers: top, LowPerformers: low}, nil
}

func getAtRisk(cohortID string) (*AtRiskResponse, error) {
	key := fmt.Sprintf("analytics:atrisk:cohort:%s", cohortID)
	var cached AtRiskResponse
	if err := cache.Get(key, &cached); err == nil {
		return &cached, nil
	}
	type row struct {
		UserID            string  `gorm:"column:user_id"`
		Name              string  `gorm:"column:name"`
		Email             string  `gorm:"column:email"`
		RiskLevel         string  `gorm:"column:risk_level"`
		CompletionPercent float64 `gorm:"column:completion_percent"`
		SessionsAttended  int     `gorm:"column:sessions_attended"`
		TotalSessions     int     `gorm:"column:total_sessions"`
		ActivitiesOverdue int     `gorm:"column:activities_overdue"`
		DaysSinceActivity int     `gorm:"column:days_since_activity"`
	}
	var rows []row
	err := database.DB.Raw(`
		SELECT u.id AS user_id, u.name, u.email, e.risk_level,
			e.completion_percent::FLOAT AS completion_percent,
			COUNT(sa.id) FILTER (WHERE sa.status = 'present')::INT AS sessions_attended,
			(SELECT COUNT(*) FROM class_sessions cs2 WHERE cs2.cohort_id = $1)::INT AS total_sessions,
			COUNT(ap.id) FILTER (WHERE ap.status NOT IN ('completed') AND ap.status IS NOT NULL)::INT AS activities_overdue,
			COALESCE(
				EXTRACT(DAY FROM NOW() - MAX(ap.started_at))::INT,
				999
			) AS days_since_activity
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		LEFT JOIN session_attendance sa ON sa.user_id = u.id
			AND sa.session_id IN (SELECT id FROM class_sessions WHERE cohort_id = $2)
		LEFT JOIN activity_progress ap ON ap.enrollment_id = e.id
		WHERE e.cohort_id = $3 AND e.role = 'participant'
			AND e.risk_level IN ('high', 'medium')
		GROUP BY u.id, u.name, u.email, e.risk_level, e.completion_percent
		ORDER BY CASE e.risk_level WHEN 'high' THEN 0 ELSE 1 END, e.completion_percent ASC
	`, cohortID, cohortID, cohortID).Scan(&rows).Error
	if err != nil { return nil, err }
	participants := make([]AtRiskParticipant, 0, len(rows))
	for _, r := range rows {
		participants = append(participants, AtRiskParticipant{
			UserID: r.UserID, Name: r.Name, Email: r.Email, RiskLevel: r.RiskLevel,
			CompletionPercent: r.CompletionPercent, SessionsAttended: r.SessionsAttended,
			TotalSessions: r.TotalSessions, ActivitiesOverdue: r.ActivitiesOverdue,
			DaysSinceActivity: r.DaysSinceActivity,
		})
	}
	resp := &AtRiskResponse{CohortID: cohortID, Participants: participants}
	cache.Set(key, resp, 5*time.Minute)
	return resp, nil
}

func getProgramSummary(programID string) (*ProgramSummaryResponse, error) {
	key := fmt.Sprintf("analytics:summary:program:%s", programID)
	var cached ProgramSummaryResponse
	if err := cache.Get(key, &cached); err == nil {
		return &cached, nil
	}
	type cohortRow struct {
		CohortID          string   `gorm:"column:cohort_id"`
		CohortName        string   `gorm:"column:cohort_name"`
		StartDate         *string  `gorm:"column:start_date"`
		EndDate           *string  `gorm:"column:end_date"`
		TotalEnrolled     int      `gorm:"column:total_enrolled"`
		AvgCompletion     float64  `gorm:"column:avg_completion"`
		AtRiskCount       int      `gorm:"column:at_risk_count"`
		SessionsDelivered int      `gorm:"column:sessions_delivered"`
		SessionsScheduled int      `gorm:"column:sessions_scheduled"`
	}
	var rows []cohortRow
	err := database.DB.Raw(`
		SELECT c.id AS cohort_id, c.name AS cohort_name,
			TO_CHAR(c.start_date, 'YYYY-MM-DD') AS start_date,
			TO_CHAR(c.end_date, 'YYYY-MM-DD') AS end_date,
			COUNT(e.id) FILTER (WHERE e.role = 'participant')::INT AS total_enrolled,
			COALESCE(AVG(e.completion_percent) FILTER (WHERE e.role = 'participant'), 0) AS avg_completion,
			COUNT(e.id) FILTER (WHERE e.role = 'participant' AND e.risk_level = 'high')::INT AS at_risk_count,
			COUNT(cs.id) FILTER (WHERE cs.status = 'completed')::INT AS sessions_delivered,
			COUNT(cs.id)::INT AS sessions_scheduled
		FROM cohorts c
		LEFT JOIN enrollments e ON e.cohort_id = c.id
		LEFT JOIN class_sessions cs ON cs.cohort_id = c.id
		WHERE c.program_id = ?
		GROUP BY c.id, c.name, c.start_date, c.end_date
		ORDER BY c.start_date DESC NULLS LAST
	`, programID).Scan(&rows).Error
	if err != nil { return nil, err }

	type compRow struct {
		AvgImprovement float64 `gorm:"column:avg_improvement"`
	}
	var comp compRow
	database.DB.Raw(`
		SELECT COALESCE(AVG(ccs.current_pct - ccs.pre_program_pct), 0) AS avg_improvement
		FROM cohort_competency_scores ccs
		JOIN cohorts c ON c.id = ccs.cohort_id
		WHERE c.program_id = ?
	`, programID).Scan(&comp)

	resp := &ProgramSummaryResponse{ProgramID: programID}
	resp.TotalCohorts = len(rows)
	cohorts := make([]ProgramCohortRow, 0, len(rows))
	for _, r := range rows {
		resp.TotalParticipants += r.TotalEnrolled
		resp.AtRiskCount += r.AtRiskCount
		resp.TotalSessions += r.SessionsScheduled
		resp.SessionsDelivered += r.SessionsDelivered
		cohorts = append(cohorts, ProgramCohortRow{
			CohortID: r.CohortID, CohortName: r.CohortName,
			StartDate: r.StartDate, EndDate: r.EndDate,
			TotalEnrolled: r.TotalEnrolled, AvgCompletion: r.AvgCompletion,
			AtRiskCount: r.AtRiskCount, SessionsDelivered: r.SessionsDelivered,
			SessionsScheduled: r.SessionsScheduled,
		})
	}
	if len(rows) > 0 {
		var totalCompletion float64
		for _, r := range rows { totalCompletion += r.AvgCompletion }
		resp.AvgCompletion = totalCompletion / float64(len(rows))
	}
	resp.AvgCompetencyImprovement = comp.AvgImprovement
	resp.Cohorts = cohorts
	cache.Set(key, resp, 2*time.Minute)
	return resp, nil
}

func getROI(cohortID string) (*ROIResponse, error) {
	type row struct {
		CompetencyID   string  `gorm:"column:competency_id"`
		Title          string  `gorm:"column:title"`
		Category       string  `gorm:"column:category"`
		PreProgramPct  float64 `gorm:"column:pre_program_pct"`
		CurrentPct     float64 `gorm:"column:current_pct"`
	}
	var rows []row
	err := database.DB.Raw(`
		SELECT ccs.competency_id, c.title, c.category,
			ccs.pre_program_pct::FLOAT AS pre_program_pct,
			ccs.current_pct::FLOAT AS current_pct
		FROM cohort_competency_scores ccs
		JOIN competencies c ON c.id = ccs.competency_id
		WHERE ccs.cohort_id = $1
		ORDER BY (ccs.current_pct - ccs.pre_program_pct) DESC
	`, cohortID).Scan(&rows).Error
	if err != nil { return nil, err }

	competencies := make([]CompetencyImprovementRow, 0, len(rows))
	var totalImprovement float64
	for _, r := range rows {
		abs := r.CurrentPct - r.PreProgramPct
		pct := 0.0
		if r.PreProgramPct > 0 { pct = abs / r.PreProgramPct * 100 }
		totalImprovement += abs
		competencies = append(competencies, CompetencyImprovementRow{
			CompetencyID: r.CompetencyID, Title: r.Title, Category: r.Category,
			PreProgramPct: r.PreProgramPct, CurrentPct: r.CurrentPct,
			ImprovementPct: pct, ImprovementAbs: abs,
		})
	}
	avgImprovement := 0.0
	if len(competencies) > 0 { avgImprovement = totalImprovement / float64(len(competencies)) }
	return &ROIResponse{CohortID: cohortID, AvgImprovement: avgImprovement, Competencies: competencies}, nil
}