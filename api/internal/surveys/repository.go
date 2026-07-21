package surveys

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("not found")

// myProgramRow resolves the participant's program + cohort start date (for due
// date computation from the activity's due_day_offset).
type myProgramRow struct {
	ProgramID   string
	CohortStart *time.Time
}

// findMyProgram resolves the participant's program context. When programID is
// provided (from the program switcher) it scopes to that program so a
// participant enrolled in multiple programs sees the correct surveys. When nil
// it falls back to the most recent enrollment.
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

// surveyActivityRow is a survey activity with its config + start/due offsets.
type surveyActivityRow struct {
	ID           string
	Title        string
	StartDay     int
	DueDayOffset int
	Config       []byte
	ModuleID     *string
	Slot         string
}

func listSurveyActivities(programID uuid.UUID) ([]surveyActivityRow, error) {
	var rows []surveyActivityRow
	err := database.DB.Raw(`
		SELECT a.id::text AS id, a.title, a.start_day AS start_day,
		       a.due_day_offset AS due_day_offset, a.config_json AS config,
		       a.module_id::text AS module_id, a.slot AS slot
		FROM activities a
		JOIN program_phases pp ON pp.id = a.phase_id
		WHERE pp.program_id = ? AND a.type = 'survey'
		ORDER BY a.start_day, a.sort_order
	`, programID).Scan(&rows).Error
	return rows, err
}

// modulePreWorkDoneMap reports, for each distinct module among moduleIDs,
// whether every MANDATORY pre-slot activity in that module (of ANY type, not
// just surveys) is complete for this participant. Optional pre-work
// (is_mandatory=false) never gates the module - one optional or broken item
// must never be able to permanently lock everyone out of the post-work.
// Mirrors programs.activityCompletionMap's per-type completion rules
// (modules can't import each other, so the same 4-table union is duplicated
// here, scoped down to just the pre-work rows of the modules actually being
// asked about). programID additionally scopes the join to the caller's own
// program - the moduleIDs passed in already only ever come from that
// program's own activity list, so this is defense in depth, not a
// functional requirement.
func modulePreWorkDoneMap(participantID, programID uuid.UUID, moduleIDs []string) (map[string]bool, error) {
	out := map[string]bool{}
	if len(moduleIDs) == 0 {
		return out, nil
	}
	type preRow struct {
		ModuleID    string
		IsMandatory bool
		Done        bool
	}
	var rows []preRow
	err := database.DB.Raw(`
		SELECT a.module_id::text AS module_id, a.is_mandatory AS is_mandatory,
		       (
		           a.type IN ('live_session', 'coaching')
		           OR EXISTS (SELECT 1 FROM survey_completions sc WHERE sc.activity_id = a.id AND sc.participant_id = ?)
		           OR EXISTS (SELECT 1 FROM submissions s WHERE s.activity_id = a.id AND s.participant_id = ?)
		           OR EXISTS (SELECT 1 FROM assessment_attempts aa WHERE aa.activity_id = a.id AND aa.participant_id = ?)
		           OR EXISTS (SELECT 1 FROM activity_progress ap WHERE ap.activity_id = a.id AND ap.user_id = ? AND ap.status = 'completed')
		       ) AS done
		FROM activities a
		JOIN program_phases pp ON pp.id = a.phase_id
		WHERE a.module_id IN ? AND a.slot = 'pre' AND pp.program_id = ?
	`, participantID, participantID, participantID, participantID, moduleIDs, programID).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	byModule := map[string][]bool{}
	for _, r := range rows {
		if !r.IsMandatory {
			continue // optional pre-work never gates the module
		}
		byModule[r.ModuleID] = append(byModule[r.ModuleID], r.Done)
	}
	for _, mid := range moduleIDs {
		done := true
		for _, d := range byModule[mid] {
			if !d {
				done = false
				break
			}
		}
		// A module with no mandatory pre-work rows (byModule[mid] empty) is trivially done.
		out[mid] = done
	}
	return out, nil
}

func getSurveyActivity(activityID uuid.UUID) (*surveyActivityRow, error) {
	var row surveyActivityRow
	err := database.DB.Raw(`
		SELECT a.id::text AS id, a.title, a.start_day AS start_day,
		       a.due_day_offset AS due_day_offset, a.config_json AS config
		FROM activities a
		WHERE a.id = ? AND a.type = 'survey'
	`, activityID).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	if row.ID == "" {
		return nil, ErrNotFound
	}
	return &row, nil
}

// ── Questions ─────────────────────────────────────────────────────

func listQuestions(activityID uuid.UUID) ([]SurveyQuestion, error) {
	var qs []SurveyQuestion
	err := database.DB.Where("activity_id = ?", activityID).Order("sort_order, created_at").Find(&qs).Error
	return qs, err
}

func countQuestions(activityID uuid.UUID) (int, error) {
	var n int64
	err := database.DB.Model(&SurveyQuestion{}).Where("activity_id = ?", activityID).Count(&n).Error
	return int(n), err
}

func replaceQuestions(activityID uuid.UUID, qs []SurveyQuestion) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("activity_id = ?", activityID).Delete(&SurveyQuestion{}).Error; err != nil {
			return err
		}
		if len(qs) > 0 {
			return tx.Create(&qs).Error
		}
		return nil
	})
}

// getAssetMeta reads a content_assets row's meta jsonb without importing the
// content package's Go types - the established internal/ai/*, programs,
// and surveys convention for cross-module reads (modules never import each
// other's Go package; see CLAUDE.md).
//
// Scanning a bare []byte var directly via GORM's Raw(...).Scan(&meta) hits
// database/sql's scalar-conversion path (it tries to convert the jsonb bytes
// into a single uint8, not a []byte slice) and fails with "converting
// driver.Value type []uint8 (...) to a uint8: invalid syntax" - silently
// swallowed by every caller here, so ensureQuestionsFromAsset always saw an
// error and never materialized any survey's questions. Scanning into a
// one-field struct instead makes GORM go through its normal column→field
// binding, which handles jsonb→[]byte correctly.
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

// ── Completion ────────────────────────────────────────────────────

func getCompletion(activityID, participantID uuid.UUID) (*SurveyCompletion, error) {
	var c SurveyCompletion
	err := database.DB.Where("activity_id = ? AND participant_id = ?", activityID, participantID).First(&c).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &c, nil
}

// completedActivityIDs returns the set of survey activity IDs a participant has
// completed (for the list view).
func completedActivityIDs(participantID uuid.UUID, activityIDs []uuid.UUID) (map[string]time.Time, error) {
	out := map[string]time.Time{}
	if len(activityIDs) == 0 {
		return out, nil
	}
	type row struct {
		ActivityID  string
		CompletedAt time.Time
	}
	var rows []row
	err := database.DB.Raw(`
		SELECT activity_id::text AS activity_id, completed_at
		FROM survey_completions
		WHERE participant_id = ? AND activity_id IN ?
	`, participantID, activityIDs).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.ActivityID] = r.CompletedAt
	}
	return out, nil
}

// ── Submit ────────────────────────────────────────────────────────

// submitSurvey writes responses + a completion row in one transaction. For
// anonymous surveys, response.participant_id is left NULL.
func submitSurvey(activityID, participantID uuid.UUID, isAnonymous bool, responses []SurveyResponse) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		// Idempotent: clear any prior responses/completion for this participant.
		if err := tx.Where("activity_id = ? AND participant_id = ?", activityID, participantID).Delete(&SurveyResponse{}).Error; err != nil {
			return err
		}
		if err := tx.Where("activity_id = ? AND participant_id = ?", activityID, participantID).Delete(&SurveyCompletion{}).Error; err != nil {
			return err
		}
		if len(responses) > 0 {
			if err := tx.Create(&responses).Error; err != nil {
				return err
			}
		}
		completion := &SurveyCompletion{
			ID: uuid.New(), ActivityID: activityID, ParticipantID: participantID,
			IsAnonymous: isAnonymous, CompletedAt: time.Now(),
		}
		return tx.Create(completion).Error
	})
}

// myAnswers returns the participant's own prior answers for an identified survey
// (so they can review their responses). Empty for anonymous surveys.
func myAnswers(activityID, participantID uuid.UUID) (map[string]SurveyResponse, error) {
	var rows []SurveyResponse
	err := database.DB.Where("activity_id = ? AND participant_id = ?", activityID, participantID).Find(&rows).Error
	if err != nil {
		return nil, err
	}
	out := map[string]SurveyResponse{}
	for _, r := range rows {
		out[r.QuestionID.String()] = r
	}
	return out, nil
}

// programIDForActivity resolves the owning program of a survey activity.
func programIDForActivity(activityID uuid.UUID) (uuid.UUID, error) {
	var raw string
	err := database.DB.Raw(`
		SELECT pp.program_id::text
		FROM activities a
		JOIN program_phases pp ON pp.id = a.phase_id
		WHERE a.id = ?
	`, activityID).Scan(&raw).Error
	if err != nil {
		return uuid.Nil, err
	}
	if raw == "" {
		return uuid.Nil, ErrNotFound
	}
	return uuid.Parse(raw)
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

// cohortStartForActivity returns the start_date of the cohort that links this
// participant to this activity's program - the same anchor
// getMySurveysService uses to compute open/due dates, so the enforcement
// check in submitSurveyService agrees with what the participant was shown.
func cohortStartForActivity(participantID, activityID uuid.UUID) (*time.Time, error) {
	var start *time.Time
	err := database.DB.Raw(`
		SELECT c.start_date
		FROM activities a
		JOIN program_phases pp ON pp.id = a.phase_id
		JOIN cohorts c ON c.program_id = pp.program_id
		JOIN enrollments e ON e.cohort_id = c.id
		WHERE a.id = ? AND e.user_id = ? AND e.role = 'participant'
		ORDER BY e.enrolled_at DESC
		LIMIT 1
	`, activityID, participantID).Scan(&start).Error
	return start, err
}

// ── Admin aggregate (superadmin cross-org survey list) ────────────

// adminSurveyRow is one survey activity joined to its program/org with
// aggregate completion + response counts. Optionally scoped to one org.
type adminSurveyRow struct {
	ActivityID    string
	Title         string
	ProgramID     string
	ProgramTitle  string
	ProgramStatus string
	OrgID         string
	OrgName       string
	SurveyType    string
	TotalEnrolled int
	FacultyCount  int
	CohortCount   int
	Completions   int
	AvgScore      *float64
	CloseDate     *time.Time
}

// listAdminSurveys returns every survey activity (optionally filtered to one
// org) with real enrolment / completion / response aggregates. Close date is
// the latest per-cohort due date (cohort start + activity start_day + due_day_offset).
func listAdminSurveys(orgID string) ([]adminSurveyRow, error) {
	q := `
		SELECT a.id::text                                            AS activity_id,
		       a.title                                               AS title,
		       pr.id::text                                           AS program_id,
		       pr.title                                              AS program_title,
		       pr.status::text                                       AS program_status,
		       o.id::text                                            AS org_id,
		       o.name                                                AS org_name,
		       COALESCE(a.config_json->>'survey_type', 'pulse')      AS survey_type,
		       COALESCE((
		           SELECT COUNT(DISTINCT e.user_id)
		           FROM enrollments e JOIN cohorts c ON c.id = e.cohort_id
		           WHERE c.program_id = pr.id AND e.role = 'participant' AND e.status <> 'withdrawn'
		       ), 0)                                                 AS total_enrolled,
		       COALESCE((
		           SELECT COUNT(DISTINCT e.user_id)
		           FROM enrollments e JOIN cohorts c ON c.id = e.cohort_id
		           WHERE c.program_id = pr.id AND e.role = 'faculty'
		       ), 0)                                                 AS faculty_count,
		       COALESCE((
		           SELECT COUNT(*) FROM cohorts c WHERE c.program_id = pr.id
		       ), 0)                                                 AS cohort_count,
		       COALESCE((
		           SELECT COUNT(*) FROM survey_completions sc WHERE sc.activity_id = a.id
		       ), 0)                                                 AS completions,
		       (
		           SELECT AVG(sr.answer_num) FROM survey_responses sr
		           WHERE sr.activity_id = a.id AND sr.answer_num IS NOT NULL
		       )                                                     AS avg_score,
		       (
		           SELECT MAX(c.start_date + ((a.start_day + a.due_day_offset) * INTERVAL '1 day'))
		           FROM cohorts c WHERE c.program_id = pr.id AND c.start_date IS NOT NULL
		       )                                                     AS close_date
		FROM activities a
		JOIN program_phases ph ON ph.id = a.phase_id
		JOIN programs pr       ON pr.id = ph.program_id
		JOIN organizations o   ON o.id = pr.org_id
		WHERE a.type = 'survey'`
	args := []any{}
	if orgID != "" {
		q += ` AND pr.org_id = ?::uuid`
		args = append(args, orgID)
	}
	q += ` ORDER BY close_date DESC NULLS LAST, a.created_at DESC`

	var rows []adminSurveyRow
	err := database.DB.Raw(q, args...).Scan(&rows).Error
	return rows, err
}

// ── Results + reminders (superadmin) ──────────────────────────────

// adminSurveyMetaRow is a single survey's header info + enrolment/completion
// counts (the single-row form of listAdminSurveys, for the results modal).
type adminSurveyMetaRow struct {
	ActivityID    string
	Title         string
	ProgramTitle  string
	OrgName       string
	SurveyType    string
	TotalEnrolled int
	Completions   int
}

func getAdminSurveyMeta(activityID uuid.UUID) (*adminSurveyMetaRow, error) {
	var row adminSurveyMetaRow
	err := database.DB.Raw(`
		SELECT a.id::text                                       AS activity_id,
		       a.title                                          AS title,
		       pr.title                                         AS program_title,
		       o.name                                           AS org_name,
		       COALESCE(a.config_json->>'survey_type', 'pulse') AS survey_type,
		       COALESCE((
		           SELECT COUNT(DISTINCT e.user_id)
		           FROM enrollments e JOIN cohorts c ON c.id = e.cohort_id
		           WHERE c.program_id = pr.id AND e.role = 'participant' AND e.status <> 'withdrawn'
		       ), 0)                                            AS total_enrolled,
		       COALESCE((
		           SELECT COUNT(*) FROM survey_completions sc WHERE sc.activity_id = a.id
		       ), 0)                                            AS completions
		FROM activities a
		JOIN program_phases ph ON ph.id = a.phase_id
		JOIN programs pr       ON pr.id = ph.program_id
		JOIN organizations o   ON o.id = pr.org_id
		WHERE a.id = ? AND a.type = 'survey'
	`, activityID).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	if row.ActivityID == "" {
		return nil, ErrNotFound
	}
	return &row, nil
}

// rosterRow is one enrolled participant + whether they've completed the survey.
type rosterRow struct {
	Name      string
	Email     string
	Cohort    string
	Responded bool
}

// surveyRoster lists the participants enrolled in the survey's program, with
// their cohort and completion status (responded first, then by name).
func surveyRoster(activityID uuid.UUID) ([]rosterRow, error) {
	var rows []rosterRow
	err := database.DB.Raw(`
		SELECT u.name  AS name,
		       u.email AS email,
		       MIN(c.name) AS cohort,
		       bool_or(EXISTS (
		           SELECT 1 FROM survey_completions sc
		           WHERE sc.activity_id = a.id AND sc.participant_id = e.user_id
		       )) AS responded
		FROM activities a
		JOIN program_phases pp ON pp.id = a.phase_id
		JOIN cohorts c         ON c.program_id = pp.program_id
		JOIN enrollments e     ON e.cohort_id = c.id
		JOIN users u           ON u.id = e.user_id
		WHERE a.id = ? AND e.role = 'participant' AND e.status <> 'withdrawn'
		GROUP BY u.id, u.name, u.email
		ORDER BY responded DESC, u.name
	`, activityID).Scan(&rows).Error
	return rows, err
}

// surveyFaculty lists the names of faculty enrolled in the survey's program.
func surveyFaculty(activityID uuid.UUID) ([]string, error) {
	var names []string
	err := database.DB.Raw(`
		SELECT DISTINCT u.name
		FROM activities a
		JOIN program_phases pp ON pp.id = a.phase_id
		JOIN cohorts c         ON c.program_id = pp.program_id
		JOIN enrollments e     ON e.cohort_id = c.id
		JOIN users u           ON u.id = e.user_id
		WHERE a.id = ? AND e.role = 'faculty'
		ORDER BY u.name
	`, activityID).Scan(&names).Error
	return names, err
}

// listResponsesForActivity returns every recorded answer for a survey (across
// all participants) so the service can aggregate per-question distributions.
func listResponsesForActivity(activityID uuid.UUID) ([]SurveyResponse, error) {
	var rows []SurveyResponse
	err := database.DB.Where("activity_id = ?", activityID).Order("created_at").Find(&rows).Error
	return rows, err
}

// enrolledIncompleteUsers returns the participant user IDs enrolled in the
// survey's program who have NOT yet completed it - the reminder recipients.
func enrolledIncompleteUsers(activityID uuid.UUID) ([]uuid.UUID, error) {
	var ids []uuid.UUID
	err := database.DB.Raw(`
		SELECT DISTINCT e.user_id
		FROM activities a
		JOIN program_phases pp ON pp.id = a.phase_id
		JOIN cohorts c         ON c.program_id = pp.program_id
		JOIN enrollments e     ON e.cohort_id = c.id
		JOIN users u           ON u.id = e.user_id
		WHERE a.id = ?
		  AND e.role = 'participant'
		  AND u.role = 'participant'
		  AND e.status <> 'withdrawn'
		  AND NOT EXISTS (
		      SELECT 1 FROM survey_completions sc
		      WHERE sc.activity_id = a.id AND sc.participant_id = e.user_id
		  )
	`, activityID).Scan(&ids).Error
	return ids, err
}

// ── External respondents (facilitator/manager/business sponsor) ──

func createExternalRespondent(r *SurveyExternalRespondent) error {
	return database.DB.Create(r).Error
}

func listExternalRespondents(activityID uuid.UUID) ([]SurveyExternalRespondent, error) {
	var rows []SurveyExternalRespondent
	err := database.DB.Where("activity_id = ?", activityID).Order("created_at").Find(&rows).Error
	return rows, err
}

func getExternalRespondentByID(id uuid.UUID) (*SurveyExternalRespondent, error) {
	var r SurveyExternalRespondent
	err := database.DB.Where("id = ?", id).First(&r).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &r, nil
}

func getExternalRespondentByToken(token uuid.UUID) (*SurveyExternalRespondent, error) {
	var r SurveyExternalRespondent
	err := database.DB.Where("invite_token = ?", token).First(&r).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &r, nil
}

func deleteExternalRespondent(id uuid.UUID) error {
	return database.DB.Where("id = ?", id).Delete(&SurveyExternalRespondent{}).Error
}

func markExternalRespondentReminded(id uuid.UUID) error {
	return database.DB.Model(&SurveyExternalRespondent{}).Where("id = ?", id).
		Update("reminded_at", time.Now()).Error
}

// submitExternalResponses writes the external respondent's answers + marks
// them submitted, atomically. Re-running (e.g. a retried request before the
// status flip is visible) replaces any prior partial rows for that respondent.
func submitExternalResponses(respondentID uuid.UUID, responses []SurveyResponse) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("external_respondent_id = ?", respondentID).Delete(&SurveyResponse{}).Error; err != nil {
			return err
		}
		if len(responses) > 0 {
			if err := tx.Create(&responses).Error; err != nil {
				return err
			}
		}
		return tx.Model(&SurveyExternalRespondent{}).Where("id = ?", respondentID).
			Updates(map[string]any{"status": "submitted", "submitted_at": time.Now()}).Error
	})
}

// activityTitleAndConfig loads a survey activity's title + raw config,
// regardless of enrollment - used by the external-respondent flow, which has
// no participant/enrollment context of its own.
func activityTitleAndConfig(activityID uuid.UUID) (title string, config []byte, err error) {
	var row struct {
		Title  string
		Config []byte
	}
	err = database.DB.Raw(`
		SELECT title, config_json AS config FROM activities WHERE id = ? AND type = 'survey'
	`, activityID).Scan(&row).Error
	if err != nil {
		return "", nil, err
	}
	if row.Title == "" {
		return "", nil, ErrNotFound
	}
	return row.Title, row.Config, nil
}

// cohortStartForActivityAny returns the earliest cohort start date among the
// activity's program's cohorts - used to gate the external respondent's
// submission window, since (unlike a participant) there is no single
// enrollment row to anchor on. Matches the spirit of cohortStartForActivity:
// the same "opens on start_day" promise shown to participants.
func cohortStartForActivityAny(activityID uuid.UUID) (*time.Time, error) {
	var start *time.Time
	err := database.DB.Raw(`
		SELECT MIN(c.start_date)
		FROM activities a
		JOIN program_phases pp ON pp.id = a.phase_id
		JOIN cohorts c ON c.program_id = pp.program_id
		WHERE a.id = ? AND c.start_date IS NOT NULL
	`, activityID).Scan(&start).Error
	return start, err
}

// inAppNotification maps the communications-owned in_app_notifications table.
// The surveys module writes reminder rows here directly (the notification bell
// reads them via GET /communications/notifications).
type inAppNotification struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	UserID    uuid.UUID `gorm:"type:uuid;not null"`
	Title     string    `gorm:"not null"`
	Body      string    `gorm:"not null"`
	Type      string    `gorm:"not null;default:info"`
	CreatedAt time.Time `gorm:"default:now()"`
}

func (inAppNotification) TableName() string { return "in_app_notifications" }

// createReminders bulk-inserts one in-app notification per recipient.
func createReminders(userIDs []uuid.UUID, title, body string) (int, error) {
	if len(userIDs) == 0 {
		return 0, nil
	}
	batch := make([]inAppNotification, 0, len(userIDs))
	now := time.Now()
	for _, uid := range userIDs {
		batch = append(batch, inAppNotification{
			ID: uuid.New(), UserID: uid, Title: title, Body: body,
			Type: "reminder", CreatedAt: now,
		})
	}
	if err := database.DB.Create(&batch).Error; err != nil {
		return 0, err
	}
	return len(batch), nil
}
