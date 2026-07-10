package aggregate

import (
	"fmt"
	"strings"

	"github.com/xa-lms/api/internal/ai/scope"
	"github.com/xa-lms/api/pkg/database"
)

// facultyCohortBriefMetrics pulls the real data behind a pre-session brief:
// attendance-based engagement, at-risk participant count, and competency
// gaps if a faculty member has recorded scores for this cohort (that data
// is manually entered via cohort_competency_scores — if none exist yet, the
// gap section is simply omitted, not treated as an error).
func facultyCohortBriefMetrics(s scope.Scope) (string, error) {
	if s.CohortID == nil {
		return "", fmt.Errorf("aggregate: faculty_cohort_brief requires a cohort-scoped Scope")
	}
	cohortID := s.CohortID.String()

	var b strings.Builder

	type engagementRow struct {
		TotalParticipants int
		AttendancePct     float64
		AtRiskCount       int
	}
	var e engagementRow
	err := database.DB.Raw(`
		SELECT
			COUNT(DISTINCT en.user_id) AS total_participants,
			COALESCE(
				(SELECT COUNT(*) FILTER (WHERE sa.status = 'present')::float / NULLIF(COUNT(*), 0) * 100
				 FROM session_attendance sa
				 JOIN class_sessions cs ON cs.id = sa.session_id
				 WHERE cs.cohort_id = ?), 0
			) AS attendance_pct,
			COUNT(DISTINCT en.user_id) FILTER (WHERE en.risk_level IN ('high', 'medium')) AS at_risk_count
		FROM enrollments en
		WHERE en.cohort_id = ? AND en.status <> 'withdrawn'
	`, cohortID, cohortID).Scan(&e).Error
	if err != nil {
		return "", err
	}
	b.WriteString(fmt.Sprintf(
		"Participants: %d\nAttendance-based engagement: %.0f%%\nAt-risk participants: %d\n",
		e.TotalParticipants, e.AttendancePct, e.AtRiskCount,
	))

	type gapRow struct {
		Title      string
		PreProgram float64
		CurrentPct float64
	}
	var gaps []gapRow
	err = database.DB.Raw(`
		SELECT c.title, ccs.pre_program_pct AS pre_program, ccs.current_pct
		FROM cohort_competency_scores ccs
		JOIN competencies c ON c.id = ccs.competency_id
		WHERE ccs.cohort_id = ?
		ORDER BY (ccs.current_pct - ccs.pre_program_pct) ASC
	`, cohortID).Scan(&gaps).Error
	if err != nil {
		return "", err
	}
	if len(gaps) > 0 {
		b.WriteString("\nCompetency scores (pre-program -> current):\n")
		for _, g := range gaps {
			b.WriteString(fmt.Sprintf("  - %s: %.0f%% -> %.0f%%\n", g.Title, g.PreProgram, g.CurrentPct))
		}
	}

	return b.String(), nil
}
