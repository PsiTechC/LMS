package submissions

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("submission not found")
var ErrDuplicate = errors.New("submission already exists for this activity")

// gradingAdminRow is one unioned grading item (a submission or a capstone),
// joined to participant/org/program/faculty names.
type gradingAdminRow struct {
	ID          string
	Source      string
	Type        string
	Participant string
	OrgID       string
	Org         string
	Program     string
	Title       string
	SubmittedAt *time.Time
	Faculty     *string
	Status      string
	Grade       *float64
}

// listGradingAdmin unions participant submissions and team capstones into one
// cross-org list. orgID "" = all orgs. status "" = all; otherwise one of
// pending | graded | capstone. Newest submission first (unsubmitted last).
// Returns the page of rows plus the total row count across the full
// (filtered) UNION, computed before OFFSET/LIMIT are applied.
func listGradingAdmin(orgID, status string, offset, limit int) ([]gradingAdminRow, int64, error) {
	q := `
		SELECT * FROM (
			SELECT
				s.id::text                        AS id,
				'submission'                      AS source,
				CASE a.type
					WHEN 'assignment'  THEN 'Assignment'
					WHEN 'journal'     THEN 'Reflection'
					WHEN 'assessment'  THEN 'Assessment'
					WHEN 'case_study'  THEN 'Case Study'
					ELSE initcap(a.type::text)
				END                               AS type,
				COALESCE(pu.name, 'Unknown')      AS participant,
				o.id::text                        AS org_id,
				o.name                            AS org,
				pr.title                          AS program,
				a.title                           AS title,
				s.submitted_at                    AS submitted_at,
				fu.name                           AS faculty,
				s.status                          AS status,
				s.grade                           AS grade
			FROM submissions s
			JOIN activities a       ON a.id = s.activity_id
			JOIN program_phases pp  ON pp.id = a.phase_id
			JOIN programs pr        ON pr.id = pp.program_id
			JOIN organizations o    ON o.id = pr.org_id
			LEFT JOIN users pu      ON pu.id = s.participant_id
			LEFT JOIN users fu      ON fu.id = s.graded_by

			UNION ALL

			SELECT
				ct.id::text                                   AS id,
				'capstone'                                    AS source,
				'Capstone'                                    AS type,
				COALESCE(su.name, cg.name, 'Capstone Team')   AS participant,
				o.id::text                                    AS org_id,
				o.name                                        AS org,
				pr.title                                      AS program,
				ct.title                                      AS title,
				ct.submitted_at                               AS submitted_at,
				NULL::text                                    AS faculty,
				ct.submission_status                          AS status,
				NULL::numeric                                 AS grade
			FROM capstone_teams ct
			JOIN programs pr          ON pr.id = ct.program_id
			JOIN organizations o      ON o.id = ct.org_id
			LEFT JOIN users su        ON su.id = ct.submitted_by
			LEFT JOIN cohort_groups cg ON cg.id = ct.group_id
		) g
		WHERE 1 = 1`
	args := []any{}
	if orgID != "" {
		// g.org_id is o.id::text (cast in the subquery above), so compare as
		// text - a ?::uuid cast on the parameter alone still leaves a
		// text = uuid comparison, which Postgres rejects outright
		// (operator does not exist: text = uuid).
		q += ` AND g.org_id = ?`
		args = append(args, orgID)
	}
	switch status {
	case "pending":
		q += ` AND g.source = 'submission' AND g.status <> 'graded'`
	case "graded":
		q += ` AND g.source = 'submission' AND g.status = 'graded'`
	case "capstone":
		q += ` AND g.source = 'capstone'`
	}

	// Count must run against the identical filtered UNION, before ORDER BY/OFFSET/LIMIT.
	countQ := `SELECT COUNT(*) FROM (` + q + `) c`
	var total int64
	if err := database.DB.Raw(countQ, args...).Scan(&total).Error; err != nil {
		return nil, 0, err
	}

	q += ` ORDER BY g.submitted_at DESC NULLS LAST`
	q += ` OFFSET ? LIMIT ?`
	pageArgs := append(append([]any{}, args...), offset, limit)

	var rows []gradingAdminRow
	err := database.DB.Raw(q, pageArgs...).Scan(&rows).Error
	return rows, total, err
}

func createSubmission(s *Submission) error {
	return database.DB.Create(s).Error
}

func getByID(id string) (*Submission, error) {
	var s Submission
	if err := database.DB.Where("id = ?", id).First(&s).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &s, nil
}

func getByParticipantAndActivity(participantID, activityID string) (*Submission, error) {
	var s Submission
	if err := database.DB.Where("participant_id = ? AND activity_id = ?", participantID, activityID).First(&s).Error; err == nil {
		return &s, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, err
	}

	var scCount int64
	if err := database.DB.Table("survey_completions").Where("participant_id = ? AND activity_id = ?", participantID, activityID).Count(&scCount).Error; err == nil && scCount > 0 {
		return &Submission{
			ID:            uuid.New(),
			ActivityID:    uuid.MustParse(activityID),
			ParticipantID: uuid.MustParse(participantID),
			Status:        "submitted",
			SubmittedAt:   time.Now(),
		}, nil
	}

	var aaCount int64
	if err := database.DB.Table("assessment_attempts").Where("participant_id = ? AND activity_id = ? AND status IN ('auto_scored', 'pending_review', 'graded')", participantID, activityID).Count(&aaCount).Error; err == nil && aaCount > 0 {
		return &Submission{
			ID:            uuid.New(),
			ActivityID:    uuid.MustParse(activityID),
			ParticipantID: uuid.MustParse(participantID),
			Status:        "submitted",
			SubmittedAt:   time.Now(),
		}, nil
	}

	return nil, ErrNotFound
}

func listByActivity(activityID string, offset, limit int) ([]Submission, int64, error) {
	db := database.DB.Model(&Submission{}).Where("activity_id = ?", activityID)
	var total int64
	db.Count(&total)
	var rows []Submission
	err := db.Order("submitted_at desc").Offset(offset).Limit(limit).Find(&rows).Error
	return rows, total, err
}

func gradeSubmission(id string, grade float64, feedback, gradedByID string) error {
	now := time.Now()
	uid, err := uuid.Parse(gradedByID)
	if err != nil {
		return errors.New("invalid graded_by id")
	}
	res := database.DB.Model(&Submission{}).Where("id = ?", id).Updates(map[string]any{
		"grade":     grade,
		"feedback":  feedback,
		"graded_by": uid,
		"graded_at": now,
		"status":    "graded",
	})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func existsByParticipantAndActivity(participantID, activityID string) (bool, error) {
	var count int64
	err := database.DB.Model(&Submission{}).
		Where("participant_id = ? AND activity_id = ?", participantID, activityID).
		Count(&count).Error
	return count > 0, err
}

type StatsRow struct {
	PendingGrades int64 `json:"pending_grades"`
	TotalGraded   int64 `json:"total_graded"`
}

func facultySubmissionStats(facultyID string) (StatsRow, error) {
	var row StatsRow
	err := database.DB.Raw(`
		SELECT
			COUNT(*) FILTER (WHERE s.status = 'submitted') AS pending_grades,
			COUNT(*) FILTER (WHERE s.status = 'graded')   AS total_graded
		FROM submissions s
		JOIN activities a ON a.id = s.activity_id
		JOIN program_phases pp ON pp.id = a.phase_id
		JOIN cohorts c ON c.program_id = pp.program_id
		JOIN class_sessions cs ON cs.cohort_id = c.id AND cs.faculty_id = ?
	`, facultyID).Scan(&row).Error
	return row, err
}
