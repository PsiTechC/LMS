package leaderboard

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("not found")

// myCohortRow resolves the participant's active cohort + their visibility flag.
type myCohortRow struct {
	CohortID          string
	CohortName        string
	ShowOnLeaderboard bool
}

// findMyCohort resolves the participant's cohort. When programID is provided
// (from the program switcher) it scopes to that program so a participant
// enrolled in multiple programs sees the correct per-program leaderboard.
// When programID is nil it falls back to the most recent enrollment.
func findMyCohort(userID uuid.UUID, programID *uuid.UUID) (*myCohortRow, error) {
	var row myCohortRow
	q := `
		SELECT c.id::text AS cohort_id, c.name AS cohort_name,
		       COALESCE(e.show_on_leaderboard, TRUE) AS show_on_leaderboard
		FROM enrollments e
		JOIN cohorts c ON c.id = e.cohort_id
		WHERE e.user_id = ? AND e.role = 'participant' AND e.status != 'withdrawn'`
	args := []any{userID}
	if programID != nil {
		q += ` AND c.program_id = ?`
		args = append(args, *programID)
	}
	q += ` ORDER BY e.enrolled_at DESC LIMIT 1`

	err := database.DB.Raw(q, args...).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	if row.CohortID == "" {
		return nil, ErrNotFound
	}
	return &row, nil
}

func setVisibility(userID, cohortID uuid.UUID, show bool) error {
	return database.DB.Exec(`
		UPDATE enrollments SET show_on_leaderboard = ?
		WHERE user_id = ? AND cohort_id = ?
	`, show, userID, cohortID).Error
}

// ── Category counts ───────────────────────────────────────────────
// All counts are scoped to activities within the cohort's program (so points
// reflect this program's engagement).

// countsForUser returns the raw per-category activity counts for one user in a
// program.
func countsForUser(userID, programID uuid.UUID) (categoryCounts, error) {
	var c categoryCounts
	// Core counts that always exist (activities/submissions/coaching).
	err := database.DB.Raw(`
		WITH prog_activities AS (
			SELECT a.id, a.type
			FROM activities a
			JOIN program_phases pp ON pp.id = a.phase_id
			WHERE pp.program_id = @pid
		)
		SELECT
			(SELECT COUNT(*) FROM activity_progress ap
			   JOIN prog_activities pa ON pa.id = ap.activity_id
			   WHERE ap.user_id = @uid AND ap.status = 'completed'
			     AND pa.type IN ('video','pdf','case_study'))                       AS modules,
			(SELECT COUNT(DISTINCT s.activity_id) FROM submissions s
			   JOIN prog_activities pa ON pa.id = s.activity_id
			   WHERE s.participant_id = @uid AND pa.type = 'assessment')             AS assessments,
			(SELECT COUNT(DISTINCT s.activity_id) FROM submissions s
			   JOIN prog_activities pa ON pa.id = s.activity_id
			   WHERE s.participant_id = @uid AND pa.type = 'journal')               AS reflections,
			(SELECT COALESCE(SUM(ce.completed_sessions),0) FROM coaching_engagements ce
			   JOIN coaching_engagement_participants cep ON cep.engagement_id = ce.id
			   WHERE cep.participant_id = @uid AND ce.program_id = @pid)             AS coaching
	`, map[string]any{"uid": userID, "pid": programID}).Scan(&c).Error
	if err != nil {
		return c, err
	}
	// Discussions live in a separate module whose tables may not exist on every
	// DB — count them defensively so a missing table doesn't zero out points.
	c.Discussions = discussionCount(userID, programID)
	return c, nil
}

// discussionCount returns threads+replies authored by the user in a program, or
// 0 if the discussions tables aren't present on this DB.
func discussionCount(userID, programID uuid.UUID) int {
	var exists bool
	if e := database.DB.Raw(`SELECT to_regclass('public.threads') IS NOT NULL`).Scan(&exists).Error; e != nil || !exists {
		return 0
	}
	var n int
	err := database.DB.Raw(`
		SELECT
		  (SELECT COUNT(*) FROM threads t WHERE t.author_id = @uid AND t.program_id = @pid AND t.is_deleted = false)
		+ (SELECT COUNT(*) FROM thread_replies tr JOIN threads t2 ON t2.id = tr.thread_id
		     WHERE tr.author_id = @uid AND t2.program_id = @pid AND tr.is_deleted = false)
	`, map[string]any{"uid": userID, "pid": programID}).Scan(&n).Error
	if err != nil {
		return 0
	}
	return n
}

// programIDForCohort resolves the program a cohort belongs to.
func programIDForCohort(cohortID uuid.UUID) (uuid.UUID, error) {
	var raw string
	err := database.DB.Raw(`SELECT program_id::text FROM cohorts WHERE id = ?`, cohortID).Scan(&raw).Error
	if err != nil {
		return uuid.Nil, err
	}
	if raw == "" {
		return uuid.Nil, ErrNotFound
	}
	return uuid.Parse(raw)
}

// ── Cohort members (for ranking) ──────────────────────────────────

type cohortMemberRow struct {
	UserID            string
	Name              string
	ShowOnLeaderboard bool
}

// cohortMembers lists participants in a cohort. The caller is always included
// (so they can see their own rank even when opted out — only OTHERS respect the
// flag when displaying names).
func cohortMembers(cohortID uuid.UUID) ([]cohortMemberRow, error) {
	var rows []cohortMemberRow
	err := database.DB.Raw(`
		SELECT u.id::text AS user_id, u.name,
		       COALESCE(e.show_on_leaderboard, TRUE) AS show_on_leaderboard
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		WHERE e.cohort_id = ? AND e.role = 'participant' AND e.status != 'withdrawn'
	`, cohortID).Scan(&rows).Error
	return rows, err
}

// ── Streak ────────────────────────────────────────────────────────

// activeDays returns the distinct UTC dates the user had any activity_progress
// update — used to compute current/longest engagement streaks.
func activeDays(userID uuid.UUID) ([]time.Time, error) {
	var days []time.Time
	err := database.DB.Raw(`
		SELECT DISTINCT date_trunc('day', GREATEST(ap.updated_at, ap.created_at)) AS d
		FROM activity_progress ap
		WHERE ap.user_id = ?
		ORDER BY d DESC
	`, userID).Scan(&days).Error
	return days, err
}

// maxModuleMinutes returns the longest single content activity duration the user
// completed (for the Deep Diver badge). Uses the activity's duration_mins.
func maxModuleMinutes(userID, programID uuid.UUID) (int, error) {
	var mins int
	err := database.DB.Raw(`
		SELECT COALESCE(MAX(a.duration_mins),0)
		FROM activity_progress ap
		JOIN activities a ON a.id = ap.activity_id
		JOIN program_phases pp ON pp.id = a.phase_id
		WHERE ap.user_id = ? AND ap.status = 'completed' AND pp.program_id = ?
		  AND a.type IN ('video','pdf','case_study')
	`, userID, programID).Scan(&mins).Error
	return mins, err
}

// phase1Complete is true when the user completed every activity in the program's
// first phase (by phase_number).
func phase1Complete(userID, programID uuid.UUID) (bool, error) {
	var row struct {
		Total int
		Done  int
	}
	err := database.DB.Raw(`
		WITH p1 AS (
			SELECT a.id
			FROM activities a
			JOIN program_phases pp ON pp.id = a.phase_id
			WHERE pp.program_id = @pid
			  AND pp.phase_number = (SELECT MIN(phase_number) FROM program_phases WHERE program_id = @pid)
		)
		SELECT
			(SELECT COUNT(*) FROM p1) AS total,
			(SELECT COUNT(DISTINCT x.aid) FROM (
				SELECT ap.activity_id AS aid FROM activity_progress ap WHERE ap.user_id = @uid AND ap.status='completed' AND ap.activity_id IN (SELECT id FROM p1)
				UNION
				SELECT s.activity_id FROM submissions s WHERE s.participant_id = @uid AND s.activity_id IN (SELECT id FROM p1)
			) x) AS done
	`, map[string]any{"uid": userID, "pid": programID}).Scan(&row).Error
	if err != nil {
		return false, err
	}
	return row.Total > 0 && row.Done >= row.Total, nil
}

var _ = gorm.ErrRecordNotFound
