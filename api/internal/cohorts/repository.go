package cohorts

import (
	"errors"

	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("not found")
var ErrAlreadyEnrolled = errors.New("user already enrolled in this cohort")

// ── Cohorts ───────────────────────────────────────────────────────

func listCohortsByOrg(orgID string) ([]Cohort, error) {
	var list []Cohort
	err := database.DB.Where("org_id = ?", orgID).Order("created_at desc").Find(&list).Error
	return list, err
}

func listCohortsByProgram(programID string) ([]Cohort, error) {
	var list []Cohort
	err := database.DB.Where("program_id = ?", programID).Order("created_at desc").Find(&list).Error
	return list, err
}

func getCohortByID(id string) (*Cohort, error) {
	var c Cohort
	err := database.DB.Where("id = ?", id).First(&c).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &c, err
}

func createCohort(c *Cohort) error {
	return database.DB.Create(c).Error
}

func saveCohort(c *Cohort) error {
	return database.DB.Save(c).Error
}

func countEnrollments(cohortID string) (int, error) {
	var count int64
	err := database.DB.Model(&Enrollment{}).
		Where("cohort_id = ? AND status != 'withdrawn'", cohortID).
		Count(&count).Error
	return int(count), err
}

// ── Enrollments ───────────────────────────────────────────────────

func listParticipants(cohortID string) ([]EnrollmentRow, error) {
	var rows []EnrollmentRow
	err := database.DB.Raw(`
		SELECT
			e.id              AS enrollment_id,
			u.id              AS user_id,
			u.name            AS name,
			u.email           AS email,
			u.avatar_url      AS avatar_url,
			u.department      AS department,
			e.role            AS role,
			e.status          AS status,
			e.completion_percent AS completion_percent,
			e.risk_level      AS risk_level,
			e.enrolled_at     AS enrolled_at,
			e.nudged_at       AS nudged_at
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		WHERE e.cohort_id = ?
		ORDER BY e.enrolled_at ASC
	`, cohortID).Scan(&rows).Error
	return rows, err
}

func enrollUser(e *Enrollment) error {
	// Check for duplicate
	var count int64
	database.DB.Model(&Enrollment{}).
		Where("cohort_id = ? AND user_id = ?", e.CohortID, e.UserID).
		Count(&count)
	if count > 0 {
		return ErrAlreadyEnrolled
	}
	return database.DB.Create(e).Error
}

func getEnrollmentByID(id string) (*Enrollment, error) {
	var e Enrollment
	err := database.DB.Where("id = ?", id).First(&e).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &e, err
}

func saveEnrollment(e *Enrollment) error {
	return database.DB.Save(e).Error
}

func setNudgedAt(enrollmentID string) error {
	return database.DB.Model(&Enrollment{}).
		Where("id = ?", enrollmentID).
		Update("nudged_at", gorm.Expr("NOW()")).Error
}

func getCohortStats(cohortID string) (*CohortStatsDTO, error) {
	type row struct {
		Status            string
		Count             int
		AvgCompletion     float64
		AtRiskCount       int
		MediumRiskCount   int
	}
	var rows []row
	err := database.DB.Raw(`
		SELECT
			status,
			COUNT(*)                                           AS count,
			COALESCE(AVG(completion_percent),0)::int          AS avg_completion,
			SUM(CASE WHEN risk_level='high'   THEN 1 ELSE 0 END) AS at_risk_count,
			SUM(CASE WHEN risk_level='medium' THEN 1 ELSE 0 END) AS medium_risk_count
		FROM enrollments
		WHERE cohort_id = ?
		GROUP BY status
	`, cohortID).Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	stats := &CohortStatsDTO{CohortID: cohortID}
	var totalCompletion int64
	var totalRows int
	for _, r := range rows {
		switch r.Status {
		case "completed":
			stats.Completed = r.Count
		case "active", "enrolled":
			stats.Active += r.Count
		case "withdrawn":
			stats.Withdrawn = r.Count
		case "on_hold":
			stats.OnHold = r.Count
		}
		stats.TotalEnrolled += r.Count
		stats.AtRiskCount += r.AtRiskCount
		stats.MediumRiskCount += r.MediumRiskCount
		totalCompletion += int64(r.AvgCompletion * float64(r.Count))
		totalRows += r.Count
	}
	if totalRows > 0 {
		stats.AvgCompletion = int(totalCompletion / int64(totalRows))
	}
	return stats, nil
func getMyEnrollments(userID string) ([]MyEnrollmentRow, error) {
	var rows []MyEnrollmentRow
	err := database.DB.Raw(`
		SELECT
			e.id                  AS enrollment_id,
			e.cohort_id           AS cohort_id,
			e.role                AS role,
			e.status              AS status,
			e.completion_percent  AS completion_percent,
			e.risk_level          AS risk_level,
			e.enrolled_at         AS enrolled_at,
			c.name                AS cohort_name,
			c.start_date          AS cohort_start_date,
			c.end_date            AS cohort_end_date,
			c.program_id          AS program_id,
			p.title               AS program_title,
			p.description         AS program_description,
			p.color               AS program_color,
			p.duration_weeks      AS program_duration_weeks,
			p.status              AS program_status
		FROM enrollments e
		JOIN cohorts c ON c.id = e.cohort_id
		JOIN programs p ON p.id = c.program_id
		WHERE e.user_id = ? AND e.status != 'withdrawn'
		ORDER BY e.enrolled_at DESC
	`, userID).Scan(&rows).Error
	return rows, err
}
