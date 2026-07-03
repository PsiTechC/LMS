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
	ProgramID    string
	CohortStart  *time.Time
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
}

func listSurveyActivities(programID uuid.UUID) ([]surveyActivityRow, error) {
	var rows []surveyActivityRow
	err := database.DB.Raw(`
		SELECT a.id::text AS id, a.title, a.start_day AS start_day,
		       a.due_day_offset AS due_day_offset, a.config_json AS config
		FROM activities a
		JOIN program_phases pp ON pp.id = a.phase_id
		WHERE pp.program_id = ? AND a.type = 'survey'
		ORDER BY a.start_day, a.sort_order
	`, programID).Scan(&rows).Error
	return rows, err
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
