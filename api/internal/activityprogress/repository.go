package activityprogress

import (
	"errors"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("activity progress not found")

func getByUserAndActivity(userID, activityID uuid.UUID) (*ActivityProgress, error) {
	var p ActivityProgress
	err := database.DB.
		Where("user_id = ? AND activity_id = ?", userID, activityID).
		First(&p).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &p, nil
}

func createProgress(p *ActivityProgress) error {
	return database.DB.Create(p).Error
}

func updateProgress(id uuid.UUID, fields map[string]any) error {
	res := database.DB.Model(&ActivityProgress{}).Where("id = ?", id).Updates(fields)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// listByUserForProgram returns every progress row a participant has for
// activities that belong to the given program (across all phases/modules).
func listByUserForProgram(userID, programID uuid.UUID) ([]ActivityProgress, error) {
	var rows []ActivityProgress
	err := database.DB.Raw(`
		SELECT ap.*
		FROM activity_progress ap
		JOIN activities a       ON a.id = ap.activity_id
		JOIN program_phases pp  ON pp.id = a.phase_id
		WHERE ap.user_id = ? AND pp.program_id = ?
	`, userID, programID).Scan(&rows).Error
	return rows, err
}

// programIDForActivity resolves the owning program of an activity.
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

// enrollmentForUserProgram returns the participant's enrollment id in a cohort
// of the program - required to write a progress row (FK) and the authorization
// boundary for progress writes. Returns ErrNotFound if the user isn't enrolled.
func enrollmentForUserProgram(userID, programID uuid.UUID) (uuid.UUID, error) {
	var raw string
	err := database.DB.Raw(`
		SELECT e.id::text
		FROM enrollments e
		JOIN cohorts c ON c.id = e.cohort_id
		WHERE e.user_id = ? AND c.program_id = ?
		ORDER BY e.enrolled_at DESC
		LIMIT 1
	`, userID, programID).Scan(&raw).Error
	if err != nil {
		return uuid.Nil, err
	}
	if raw == "" {
		return uuid.Nil, ErrNotFound
	}
	return uuid.Parse(raw)
}

// recomputeEnrollmentCompletion recalculates completion_percent for the given
// enrollment. Completion = share of the program's activities the participant
// has finished - counting completed activity_progress rows AND submissions
// (union, no double count) so content and submittable activities both count.
func recomputeEnrollmentCompletion(enrollmentID, userID, programID uuid.UUID) error {
	return database.DB.Exec(`
		WITH prog_activities AS (
			SELECT a.id
			FROM activities a
			JOIN program_phases pp ON pp.id = a.phase_id
			WHERE pp.program_id = ?
		),
		done AS (
			SELECT DISTINCT act_id FROM (
				SELECT ap.activity_id AS act_id
				FROM activity_progress ap
				WHERE ap.user_id = ? AND ap.status = 'completed'
				  AND ap.activity_id IN (SELECT id FROM prog_activities)
				UNION
				SELECT s.activity_id AS act_id
				FROM submissions s
				WHERE s.participant_id = ?
				  AND s.activity_id IN (SELECT id FROM prog_activities)
			) x
		)
		UPDATE enrollments e
		SET completion_percent = CASE
			WHEN (SELECT COUNT(*) FROM prog_activities) = 0 THEN 0
			ELSE ROUND(
				100.0 * (SELECT COUNT(*) FROM done)
				      / (SELECT COUNT(*) FROM prog_activities)
			)
		END
		WHERE e.id = ?
	`, programID, userID, userID, enrollmentID).Error
}
