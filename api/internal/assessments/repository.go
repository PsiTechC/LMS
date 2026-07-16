package assessments

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
)

var ErrNotFound = errors.New("not found")

// myProgramRow resolves the participant's program + cohort start date (for
// due date computation from the activity's due_day_offset) — identical
// pattern to surveys.findMyProgram (modules can't share code across
// packages, so this is intentionally duplicated rather than imported).
type myProgramRow struct {
	ProgramID   string
	CohortStart *time.Time
}

func findMyProgram(userID uuid.UUID, programID *uuid.UUID) (*myProgramRow, error) {
	var row myProgramRow
	q := `
		SELECT c.program_id::text AS program_id, c.start_date AS cohort_start
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
	if row.ProgramID == "" {
		return nil, ErrNotFound
	}
	return &row, nil
}

// assessmentActivityRow is an assessment-type activity with its config +
// start/due offsets. AssetID (parsed from Config) may be empty — an
// assessment activity with no linked content_assets quiz is a free-text/
// file assessment handled entirely by the existing submissions module, not
// this one; callers filter those out.
type assessmentActivityRow struct {
	ID           string
	Title        string
	StartDay     int
	DueDayOffset int
	Config       []byte
}

func listAssessmentActivities(programID uuid.UUID) ([]assessmentActivityRow, error) {
	var rows []assessmentActivityRow
	err := database.DB.Raw(`
		SELECT a.id::text AS id, a.title, a.start_day AS start_day,
		       a.due_day_offset AS due_day_offset, a.config_json AS config
		FROM activities a
		JOIN program_phases pp ON pp.id = a.phase_id
		WHERE pp.program_id = ? AND a.type = 'assessment'
		ORDER BY a.start_day, a.sort_order
	`, programID).Scan(&rows).Error
	return rows, err
}

func getAssessmentActivity(activityID uuid.UUID) (*assessmentActivityRow, error) {
	var row assessmentActivityRow
	err := database.DB.Raw(`
		SELECT a.id::text AS id, a.title, a.start_day AS start_day,
		       a.due_day_offset AS due_day_offset, a.config_json AS config
		FROM activities a
		WHERE a.id = ? AND a.type = 'assessment'
	`, activityID).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	if row.ID == "" {
		return nil, ErrNotFound
	}
	return &row, nil
}

func isEnrolledInActivityProgram(participantID, activityID uuid.UUID) (bool, error) {
	var n int64
	err := database.DB.Raw(`
		SELECT COUNT(*)
		FROM activities a
		JOIN program_phases pp ON pp.id = a.phase_id
		JOIN cohorts c ON c.program_id = pp.program_id
		JOIN enrollments e ON e.cohort_id = c.id
		WHERE a.id = ? AND e.user_id = ? AND e.role = 'participant'
	`, activityID, participantID).Scan(&n).Error
	return n > 0, err
}

// ── Content Library question set (cross-module raw-SQL read — the
// established internal/ai/* and programs/surveys convention: modules never
// import each other's Go package, they read shared tables directly) ───────

// questionSetRaw is the content_assets.meta jsonb column, read without
// importing the content package's Go types.
// Scanning a bare []byte var directly via GORM's Raw(...).Scan(&meta) hits
// database/sql's scalar-conversion path and fails with "converting
// driver.Value type []uint8 (...) to a uint8: invalid syntax" — silently
// swallowed by loadQuestions, so every quiz-backed assessment always fell
// back to ErrNotQuizBacked regardless of its linked asset's real content.
// Scanning into a one-field struct routes through GORM's normal column→field
// binding, which handles jsonb→[]byte correctly (same fix as surveys'
// getAssetMeta).
func getAssetMeta(assetID uuid.UUID) ([]byte, error) {
	var row struct{ Meta []byte }
	err := database.DB.Raw(`SELECT meta FROM content_assets WHERE id = ?`, assetID).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	if len(row.Meta) == 0 {
		return nil, ErrNotFound
	}
	return row.Meta, nil
}

// ── Attempts ──────────────────────────────────────────────────────

func listAttempts(activityID, participantID uuid.UUID) ([]AssessmentAttempt, error) {
	var rows []AssessmentAttempt
	err := database.DB.Where("activity_id = ? AND participant_id = ?", activityID, participantID).
		Order("attempt_number ASC").Find(&rows).Error
	return rows, err
}

func countAttempts(activityID, participantID uuid.UUID) (int, error) {
	var n int64
	err := database.DB.Model(&AssessmentAttempt{}).
		Where("activity_id = ? AND participant_id = ?", activityID, participantID).Count(&n).Error
	return int(n), err
}

func createAttempt(a *AssessmentAttempt) error {
	return database.DB.Create(a).Error
}

// bestAttempt returns the highest-scoring attempt (used for "highest" scoring
// method and for the participant list's best-score display).
func bestAttempt(activityID, participantID uuid.UUID) (*AssessmentAttempt, error) {
	var a AssessmentAttempt
	err := database.DB.Where("activity_id = ? AND participant_id = ?", activityID, participantID).
		Order("score_pct DESC").First(&a).Error
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// attemptsCompletedByActivity returns, for a set of activities, whether this
// participant has at least one attempt and their best score — used to build
// the participant's assessment list without N+1 queries.
type attemptSummaryRow struct {
	ActivityID   string
	AttemptCount int
	BestScorePct float64
	AnyPassed    bool
}

func attemptSummaries(participantID uuid.UUID, activityIDs []uuid.UUID) (map[string]attemptSummaryRow, error) {
	out := map[string]attemptSummaryRow{}
	if len(activityIDs) == 0 {
		return out, nil
	}
	var rows []attemptSummaryRow
	err := database.DB.Raw(`
		SELECT activity_id::text AS activity_id, COUNT(*) AS attempt_count,
		       COALESCE(MAX(score_pct), 0) AS best_score_pct,
		       BOOL_OR(passed) AS any_passed
		FROM assessment_attempts
		WHERE participant_id = ? AND activity_id IN ?
		GROUP BY activity_id
	`, participantID, activityIDs).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.ActivityID] = r
	}
	return out, nil
}
