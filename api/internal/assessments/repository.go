package assessments

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("not found")

// myProgramRow resolves the participant's program + cohort start date (for
// due date computation from the activity's due_day_offset) - identical
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

// assessmentActivityRow is a quiz-backed activity with its config +
// start/due offsets. AssetID (parsed from Config) may be empty - an
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

// listAssessmentActivities returns every quiz-backed activity in the program:
// standalone assessment-type activities AND any other activity type
// (case_study/video/pdf/content) that has an attached Knowledge Check
// (config_json.knowledge_check.asset_id) - both take/score/grade through this
// same engine keyed by the activity's own id, so both must surface here for
// the participant's Assessments tab to show attached-check results.
func listAssessmentActivities(programID uuid.UUID) ([]assessmentActivityRow, error) {
	var rows []assessmentActivityRow
	err := database.DB.Raw(`
		SELECT a.id::text AS id, a.title, a.start_day AS start_day,
		       a.due_day_offset AS due_day_offset, a.config_json AS config
		FROM activities a
		JOIN program_phases pp ON pp.id = a.phase_id
		WHERE pp.program_id = ?
		  AND (a.type = 'assessment' OR a.config_json->'knowledge_check'->>'asset_id' IS NOT NULL)
		ORDER BY a.start_day, a.sort_order
	`, programID).Scan(&rows).Error
	return rows, err
}

// getAssessmentActivity fetches any activity by id (type-agnostic). It's used
// by the take/submit path, which works for BOTH a standalone assessment
// activity and a knowledge check attached to a content-style activity
// (video/pdf/case_study/eLearning). Whether the activity actually has a quiz is
// enforced downstream by loadQuestions (ErrNotQuizBacked), so no type filter is
// applied here - that's what lets attached checks be taken through this engine.
func getAssessmentActivity(activityID uuid.UUID) (*assessmentActivityRow, error) {
	var row assessmentActivityRow
	err := database.DB.Raw(`
		SELECT a.id::text AS id, a.title, a.start_day AS start_day,
		       a.due_day_offset AS due_day_offset, a.config_json AS config
		FROM activities a
		WHERE a.id = ?
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

// ── Content Library question set (cross-module raw-SQL read - the
// established internal/ai/* and programs/surveys convention: modules never
// import each other's Go package, they read shared tables directly) ───────

// questionSetRaw is the content_assets.meta jsonb column, read without
// importing the content package's Go types.
// Scanning a bare []byte var directly via GORM's Raw(...).Scan(&meta) hits
// database/sql's scalar-conversion path and fails with "converting
// driver.Value type []uint8 (...) to a uint8: invalid syntax" - silently
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

// ── Timer sessions ───────────────────────────────────────────────────────

// getOrCreateAttemptSession anchors the countdown: it returns the existing
// in-progress session's StartedAt (so a refresh resumes the same clock) or
// creates one at now on first open. Idempotent under the (activity,
// participant) unique constraint - a race falls back to re-reading.
func getOrCreateAttemptSession(activityID, participantID uuid.UUID) (*AttemptSession, error) {
	var s AttemptSession
	err := database.DB.Where("activity_id = ? AND participant_id = ?", activityID, participantID).First(&s).Error
	if err == nil {
		return &s, nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}
	s = AttemptSession{ID: uuid.New(), ActivityID: activityID, ParticipantID: participantID, StartedAt: time.Now()}
	if cerr := database.DB.Create(&s).Error; cerr != nil {
		// Race: another request created it - re-read.
		if e2 := database.DB.Where("activity_id = ? AND participant_id = ?", activityID, participantID).First(&s).Error; e2 == nil {
			return &s, nil
		}
		return nil, cerr
	}
	return &s, nil
}

// getAttemptSession returns the in-progress session if one exists (nil, nil
// when none - an untimed assessment or one opened before this feature shipped).
func getAttemptSession(activityID, participantID uuid.UUID) (*AttemptSession, error) {
	var s AttemptSession
	err := database.DB.Where("activity_id = ? AND participant_id = ?", activityID, participantID).First(&s).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &s, nil
}

func deleteAttemptSession(activityID, participantID uuid.UUID) error {
	return database.DB.Where("activity_id = ? AND participant_id = ?", activityID, participantID).
		Delete(&AttemptSession{}).Error
}

func getAttemptByID(id uuid.UUID) (*AssessmentAttempt, error) {
	var a AssessmentAttempt
	if err := database.DB.Where("id = ?", id).First(&a).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &a, nil
}

func updateAttempt(id uuid.UUID, fields map[string]any) error {
	res := database.DB.Model(&AssessmentAttempt{}).Where("id = ?", id).Updates(fields)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// ── Faculty grading queue (cross-module raw-SQL reads) ────────────────────

// gradingQueueRow is one pending-review attempt joined to its activity,
// participant, program and org for the faculty grading queue.
type gradingQueueRow struct {
	AttemptID     string
	ActivityID    string
	ActivityTitle string
	ActivityType  string
	ParticipantID string
	Participant   string
	ProgramID     string
	Program       string
	OrgID         string
	SubmittedAt   time.Time
	Status        string
	ScorePct      float64
}

// listGradingQueue returns attempts awaiting faculty review, scoped to the
// programs the given faculty teaches (via class_sessions.faculty_id, the same
// join facultySubmissionStats uses). status "" defaults to pending_review;
// "graded" returns this faculty's already-graded attempts (history tab).
func listGradingQueue(facultyID uuid.UUID, status string) ([]gradingQueueRow, error) {
	if status == "" {
		status = "pending_review"
	}
	var rows []gradingQueueRow
	q := `
		SELECT DISTINCT
			at.id::text            AS attempt_id,
			a.id::text             AS activity_id,
			a.title                AS activity_title,
			a.type::text           AS activity_type,
			at.participant_id::text AS participant_id,
			COALESCE(pu.name,'Unknown') AS participant,
			pr.id::text            AS program_id,
			pr.title               AS program,
			pr.org_id::text        AS org_id,
			at.submitted_at        AS submitted_at,
			at.status              AS status,
			at.score_pct           AS score_pct
		FROM assessment_attempts at
		JOIN activities a       ON a.id = at.activity_id
		JOIN program_phases pp  ON pp.id = a.phase_id
		JOIN programs pr        ON pr.id = pp.program_id
		JOIN cohorts c          ON c.program_id = pr.id
		JOIN class_sessions cs  ON cs.cohort_id = c.id AND cs.faculty_id = ?
		LEFT JOIN users pu      ON pu.id = at.participant_id
		WHERE at.status = ?
		ORDER BY at.submitted_at DESC`
	err := database.DB.Raw(q, facultyID, status).Scan(&rows).Error
	return rows, err
}

// facultyTeachesAttempt authorizes a faculty member for one attempt: true when
// the attempt's activity belongs to a program the faculty teaches. This is the
// grading authorization boundary - a faculty can only open/grade attempts in
// their own programs.
func facultyTeachesAttempt(facultyID, attemptID uuid.UUID) (bool, error) {
	var n int64
	err := database.DB.Raw(`
		SELECT COUNT(*)
		FROM assessment_attempts at
		JOIN activities a      ON a.id = at.activity_id
		JOIN program_phases pp ON pp.id = a.phase_id
		JOIN cohorts c         ON c.program_id = pp.program_id
		JOIN class_sessions cs ON cs.cohort_id = c.id AND cs.faculty_id = ?
		WHERE at.id = ?
	`, facultyID, attemptID).Scan(&n).Error
	return n > 0, err
}

// attemptContextRow carries the activity + participant identifiers needed to
// build the grading detail and (later) the participant notification.
type attemptContextRow struct {
	ActivityID    string
	ActivityTitle string
	ParticipantID string
	Participant   string
	Config        []byte
}

func getAttemptContext(attemptID uuid.UUID) (*attemptContextRow, error) {
	var row attemptContextRow
	err := database.DB.Raw(`
		SELECT a.id::text AS activity_id, a.title AS activity_title,
		       at.participant_id::text AS participant_id,
		       COALESCE(pu.name,'Unknown') AS participant, a.config_json AS config
		FROM assessment_attempts at
		JOIN activities a  ON a.id = at.activity_id
		LEFT JOIN users pu ON pu.id = at.participant_id
		WHERE at.id = ?
	`, attemptID).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	if row.ActivityID == "" {
		return nil, ErrNotFound
	}
	return &row, nil
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
// participant has at least one attempt and their best score - used to build
// the participant's assessment list without N+1 queries.
type attemptSummaryRow struct {
	ActivityID   string
	AttemptCount int
	BestScorePct float64
	AnyPassed    bool
	AnyPending   bool // any attempt still awaiting faculty review (open questions)
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
		       BOOL_OR(passed) AS any_passed,
		       BOOL_OR(status = 'pending_review') AS any_pending
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
