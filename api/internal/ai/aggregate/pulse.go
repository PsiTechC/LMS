package aggregate

import (
	"fmt"

	"github.com/xa-lms/api/internal/ai/scope"
	"github.com/xa-lms/api/pkg/database"
)

// cohortPulseMetrics reports unassigned-participant counts and per-cohort
// load, program-scoped — the "AI Cohort Pulse" card on Cohort Management.
func cohortPulseMetrics(s scope.Scope) (string, error) {
	if s.ProgramID == nil {
		return "", fmt.Errorf("aggregate: cohort_pulse requires a program-scoped Scope")
	}

	var programTitle string
	if err := database.DB.Raw(`SELECT title FROM programs WHERE id = ?`, *s.ProgramID).
		Scan(&programTitle).Error; err != nil {
		return "", err
	}

	type cohortLoad struct {
		Name     string
		Enrolled int
		MaxSeats *int
	}
	var cohorts []cohortLoad
	err := database.DB.Raw(`
		SELECT c.name AS name,
			COUNT(e.id) FILTER (WHERE e.status <> 'withdrawn') AS enrolled,
			c.max_seats AS max_seats
		FROM cohorts c
		LEFT JOIN enrollments e ON e.cohort_id = c.id
		WHERE c.program_id = ?
		GROUP BY c.id, c.name, c.max_seats
		ORDER BY c.name
	`, *s.ProgramID).Scan(&cohorts).Error
	if err != nil {
		return "", err
	}

	// Unassigned: participants belonging to this program's org (or already
	// enrolled somewhere under it) who have no active enrollment in ANY
	// cohort under this program — same definition listPoolForProgram uses.
	var unassigned int
	err = database.DB.Raw(`
		SELECT COUNT(DISTINCT u.id)
		FROM users u
		WHERE u.role IN ('participant', 'participant_retailer')
		  AND EXISTS (
		    SELECT 1 FROM enrollments e2
		    JOIN cohorts c2 ON c2.id = e2.cohort_id
		    WHERE e2.user_id = u.id AND c2.program_id = ? AND e2.status != 'withdrawn'
		  ) IS FALSE
		  AND EXISTS (
		    SELECT 1 FROM org_members om
		    JOIN programs p ON p.org_id = om.org_id
		    WHERE om.user_id = u.id AND p.id = ?
		  )
	`, *s.ProgramID, *s.ProgramID).Scan(&unassigned).Error
	if err != nil {
		return "", err
	}

	out := fmt.Sprintf("Program: %s\nUnassigned participants: %d\nCohorts:\n", programTitle, unassigned)
	if len(cohorts) == 0 {
		out += "  (no cohorts yet)\n"
	}
	for _, c := range cohorts {
		if c.MaxSeats != nil {
			out += fmt.Sprintf("  %s: %d enrolled / %d seats\n", c.Name, c.Enrolled, *c.MaxSeats)
		} else {
			out += fmt.Sprintf("  %s: %d enrolled (no seat cap)\n", c.Name, c.Enrolled)
		}
	}
	return out, nil
}

// analyticsInsightMetrics reports the same engagement/completion/at-risk
// signals already shown on the Analytics page's KPI tiles, program-scoped
// (or org-wide when ProgramID is nil) — the "AI Insight" card.
func analyticsInsightMetrics(s scope.Scope) (string, error) {
	programFilter := "TRUE"
	args := []any{}
	if s.ProgramID != nil {
		programFilter = "c.program_id = ?"
		args = append(args, *s.ProgramID)
	} else if s.OrgID != nil {
		programFilter = "c.program_id IN (SELECT id FROM programs WHERE org_id = ?)"
		args = append(args, *s.OrgID)
	}

	type row struct {
		TotalEnrolled int
		AvgCompletion float64
		HighRisk      int
		MediumRisk    int
		LowRisk       int
	}
	var r row
	err := database.DB.Raw(`
		SELECT
			COUNT(*) FILTER (WHERE e.status <> 'withdrawn') AS total_enrolled,
			COALESCE(AVG(e.completion_percent) FILTER (WHERE e.status <> 'withdrawn'), 0) AS avg_completion,
			COUNT(*) FILTER (WHERE e.risk_level = 'high' AND e.status <> 'withdrawn') AS high_risk,
			COUNT(*) FILTER (WHERE e.risk_level = 'medium' AND e.status <> 'withdrawn') AS medium_risk,
			COUNT(*) FILTER (WHERE e.risk_level = 'low' AND e.status <> 'withdrawn') AS low_risk
		FROM enrollments e
		JOIN cohorts c ON c.id = e.cohort_id
		WHERE `+programFilter, args...).Scan(&r).Error
	if err != nil {
		return "", err
	}

	var attendancePct float64
	err = database.DB.Raw(`
		SELECT COALESCE(
			(SELECT COUNT(*) FILTER (WHERE sa.status = 'present')::float / NULLIF(COUNT(*), 0) * 100
			 FROM session_attendance sa
			 JOIN class_sessions cs ON cs.id = sa.session_id
			 JOIN cohorts c ON c.id = cs.cohort_id
			 WHERE `+programFilter+`), 0
		)
	`, args...).Scan(&attendancePct).Error
	if err != nil {
		return "", err
	}

	return fmt.Sprintf(
		"Total enrolled: %d\nAverage completion: %.1f%%\nAttendance-based engagement: %.0f%%\nRisk distribution: %d high, %d medium, %d low",
		r.TotalEnrolled, r.AvgCompletion, attendancePct, r.HighRisk, r.MediumRisk, r.LowRisk,
	), nil
}

// dailyFocusMetrics reports the participant's active program, completion
// percentage, and next incomplete activity (if any progress rows exist) —
// the "AI Daily Focus" card on My Journey.
func dailyFocusMetrics(s scope.Scope) (string, error) {
	type enrollmentRow struct {
		ProgramTitle      string
		CompletionPercent int
		EnrollmentID      string
	}
	var e enrollmentRow
	err := database.DB.Raw(`
		SELECT p.title AS program_title, en.completion_percent AS completion_percent, en.id AS enrollment_id
		FROM enrollments en
		JOIN cohorts c ON c.id = en.cohort_id
		JOIN programs p ON p.id = c.program_id
		WHERE en.user_id = ? AND en.role = 'participant' AND en.status <> 'withdrawn'
		ORDER BY en.enrolled_at DESC
		LIMIT 1
	`, s.UserID).Scan(&e).Error
	if err != nil {
		return "", err
	}
	if e.EnrollmentID == "" {
		return "", fmt.Errorf("aggregate: daily_focus found no active enrollment for this participant")
	}

	var nextActivity string
	_ = database.DB.Raw(`
		SELECT a.title
		FROM activities a
		JOIN program_phases pp ON pp.id = a.phase_id
		JOIN cohorts c ON c.program_id = pp.program_id
		JOIN enrollments en ON en.cohort_id = c.id
		LEFT JOIN activity_progress ap ON ap.activity_id = a.id AND ap.enrollment_id = en.id
		WHERE en.id = ? AND (ap.status IS NULL OR ap.status <> 'completed')
		ORDER BY pp.phase_number, a.sort_order
		LIMIT 1
	`, e.EnrollmentID).Scan(&nextActivity).Error

	out := fmt.Sprintf("Program: %s\nCompletion: %d%%\n", e.ProgramTitle, e.CompletionPercent)
	if nextActivity != "" {
		out += fmt.Sprintf("Next incomplete activity: %s\n", nextActivity)
	} else {
		out += "Next incomplete activity: (none found — may be fully complete or activities not yet loaded)\n"
	}
	return out, nil
}

// surveyInsightMetrics reports how many surveys are awaiting the
// participant's response — the "Survey Insights" card on the Surveys tab.
// Mirrors getMySurveysService's scoping exactly (findMyProgram +
// listSurveyActivities + completedActivityIDs in surveys/repository.go): the
// participant's single most-recent active program, survey-type activities
// under THAT program only (joined via program_phases, never via cohorts —
// joining cohorts here previously fanned the count out across every cohort
// in the program and inflated "total surveys"), completion checked against
// survey_completions (not submissions, a different table entirely).
func surveyInsightMetrics(s scope.Scope) (string, error) {
	var programID string
	err := database.DB.Raw(`
		SELECT c.program_id::text AS program_id
		FROM enrollments e
		JOIN cohorts c ON c.id = e.cohort_id
		WHERE e.user_id = ? AND e.role = 'participant' AND e.status <> 'withdrawn'
		ORDER BY e.enrolled_at DESC
		LIMIT 1
	`, s.UserID).Scan(&programID).Error
	if err != nil {
		return "", err
	}
	if programID == "" {
		return "", fmt.Errorf("aggregate: survey_insight found no active program for this participant")
	}

	type row struct {
		Total          int
		Completed      int
		ActionRequired int
	}
	var r row
	err = database.DB.Raw(`
		SELECT
			COUNT(*) AS total,
			COUNT(*) FILTER (WHERE sc.id IS NOT NULL) AS completed,
			COUNT(*) FILTER (WHERE sc.id IS NULL) AS action_required
		FROM activities a
		JOIN program_phases pp ON pp.id = a.phase_id
		LEFT JOIN survey_completions sc ON sc.activity_id = a.id AND sc.participant_id = ?
		WHERE pp.program_id = ? AND a.type = 'survey'
	`, s.UserID, programID).Scan(&r).Error
	if err != nil {
		return "", err
	}

	return fmt.Sprintf(
		"Total surveys: %d\nCompleted: %d\nAwaiting response: %d",
		r.Total, r.Completed, r.ActionRequired,
	), nil
}

// coachingPulseMetrics reports each active coachee engagement's completion
// percentage and the count of pending coachee actions — the "Coaching
// Pulse" card on the Coach dashboard. When a coach has no active engagement
// yet (status only flips scheduled->active once its first session actually
// starts — see sessions.startSessionService), this falls back to reporting
// their upcoming scheduled engagements/sessions instead of going silent, so
// a coach who's fully booked but hasn't started coaching yet still gets a
// useful pulse rather than a dead "no coachees" line.
func coachingPulseMetrics(s scope.Scope) (string, error) {
	type engagementRow struct {
		Name              string
		CompletedSessions int
		TotalSessions     int
	}
	var engagements []engagementRow
	err := database.DB.Raw(`
		SELECT ce.name AS name, ce.completed_sessions AS completed_sessions, ce.total_sessions AS total_sessions
		FROM coaching_engagements ce
		WHERE ce.coach_id = ? AND ce.status = 'active'
		ORDER BY ce.name
	`, s.UserID).Scan(&engagements).Error
	if err != nil {
		return "", err
	}

	var pendingActions int
	err = database.DB.Raw(`
		SELECT COUNT(*)
		FROM session_action_items sai
		JOIN class_sessions cs ON cs.id = sai.session_id
		LEFT JOIN coaching_engagements ce ON ce.id = cs.engagement_id
		WHERE (ce.coach_id = ? OR cs.faculty_id = ?) AND sai.status = 'open'
	`, s.UserID, s.UserID).Scan(&pendingActions).Error
	if err != nil {
		return "", err
	}

	out := fmt.Sprintf("Pending coachee actions: %d\nActive coachees:\n", pendingActions)
	if len(engagements) == 0 {
		out += "  (none active yet)\n"
	}
	for _, e := range engagements {
		pct := 0
		if e.TotalSessions > 0 {
			pct = e.CompletedSessions * 100 / e.TotalSessions
		}
		out += fmt.Sprintf("  %s: %d%% complete (%d of %d sessions)\n", e.Name, pct, e.CompletedSessions, e.TotalSessions)
	}

	// Scheduled (not yet active) engagements + their next upcoming session,
	// if any — gives the model something concrete to say when there's
	// nothing active yet.
	type scheduledRow struct {
		Name            string
		NextSessionDate *string
	}
	var scheduled []scheduledRow
	err = database.DB.Raw(`
		SELECT ce.name AS name,
		       (SELECT MIN(cs.scheduled_at)::text FROM class_sessions cs
		        WHERE cs.engagement_id = ce.id AND cs.status = 'scheduled' AND cs.scheduled_at >= NOW()) AS next_session_date
		FROM coaching_engagements ce
		WHERE ce.coach_id = ? AND ce.status = 'scheduled'
		ORDER BY ce.name
	`, s.UserID).Scan(&scheduled).Error
	if err != nil {
		return "", err
	}
	out += fmt.Sprintf("\nScheduled (not yet started) coachees: %d\n", len(scheduled))
	for _, r := range scheduled {
		if r.NextSessionDate != nil {
			out += fmt.Sprintf("  %s: first session on %s\n", r.Name, *r.NextSessionDate)
		} else {
			out += fmt.Sprintf("  %s: no session scheduled yet\n", r.Name)
		}
	}

	return out, nil
}
