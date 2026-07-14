package riskscoring

import (
	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
)

// features are the raw signals the rule-based scorer reasons over. Kept as
// a plain struct (not exported query builders) since only this package's
// scorer consumes them today.
type features struct {
	EnrollmentID      uuid.UUID
	OrgID             *uuid.UUID
	ProgramID         *uuid.UUID
	CompletionPercent float64
	DaysSinceActivity int
	MissedSessions    int
	OverdueActivities int
}

// loadFeatures pulls the current feature snapshot for one participant's
// active enrollment. Returns ok=false if the subject has no active enrollment.
func loadFeatures(subjectID uuid.UUID) (features, bool) {
	var f features
	err := database.DB.Raw(`
		SELECT e.id AS enrollment_id,
		       pr.org_id AS org_id,
		       pr.id AS program_id,
		       COALESCE(e.completion_percent, 0)::float8 AS completion_percent,
		       COALESCE(EXTRACT(DAY FROM NOW() - MAX(ap.started_at))::int, 999) AS days_since_activity,
		       COALESCE((
		           SELECT COUNT(*) FROM class_sessions cs
		           WHERE cs.cohort_id = e.cohort_id AND cs.scheduled_at < NOW() AND cs.status = 'completed'
		       ), 0) AS missed_sessions,
		       COALESCE((
		           SELECT COUNT(*) FROM activities a
		           JOIN program_phases ph ON ph.id = a.phase_id
		           LEFT JOIN activity_progress ap2 ON ap2.activity_id = a.id AND ap2.enrollment_id = e.id AND ap2.status = 'completed'
		           WHERE ph.program_id = pr.id AND ap2.id IS NULL
		       ), 0) AS overdue_activities
		FROM enrollments e
		JOIN cohorts c   ON c.id = e.cohort_id
		JOIN programs pr ON pr.id = c.program_id
		LEFT JOIN activity_progress ap ON ap.enrollment_id = e.id
		WHERE e.user_id = ? AND e.status <> 'withdrawn'
		GROUP BY e.id, pr.org_id, pr.id, e.completion_percent, e.cohort_id
		ORDER BY e.enrolled_at DESC
		LIMIT 1
	`, subjectID).Scan(&f).Error
	if err != nil || f.EnrollmentID == uuid.Nil {
		return features{}, false
	}
	return f, true
}
