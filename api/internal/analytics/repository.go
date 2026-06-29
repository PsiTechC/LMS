package analytics

import (
	"errors"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// getEngagement computes weekly engagement from class_sessions + session_attendance.
// Engagement % = present attendances / total attendance records marked for sessions that week.
// Returns up to 8 most recent weeks.
func getEngagement(cohortID string) ([]EngagementPoint, error) {
	var rows []EngagementPoint
	err := database.DB.Raw(`
		WITH cohort_session_weeks AS (
			SELECT
				id AS session_id,
				DATE_TRUNC('week', scheduled_at) AS week_start,
				DENSE_RANK() OVER (ORDER BY DATE_TRUNC('week', scheduled_at)) AS relative_week
			FROM class_sessions
			WHERE cohort_id = ?
			  AND status IN ('live', 'completed')
		),
		week_attendance AS (
			SELECT
				sw.relative_week,
				COUNT(sa.user_id) FILTER (WHERE sa.status = 'present') AS present_count,
				COUNT(sa.user_id) AS total_marked
			FROM cohort_session_weeks sw
			LEFT JOIN session_attendance sa ON sa.session_id = sw.session_id
			GROUP BY sw.relative_week
		)
		SELECT
			relative_week::INT                                        AS week_number,
			CONCAT('W', relative_week)                               AS week_label,
			CASE
				WHEN total_marked > 0
				THEN ROUND(present_count * 100.0 / total_marked)::INT
				ELSE 0
			END                                                       AS engagement_pct
		FROM week_attendance
		ORDER BY relative_week
		LIMIT 8
	`, cohortID).Scan(&rows).Error
	return rows, err
}

// getCompetencyScores returns stored pre/current scores for a cohort, joined with competency titles.
func getCompetencyScores(cohortID string) ([]CompetencyScoreResponse, error) {
	var rows []CompetencyScoreResponse
	err := database.DB.Raw(`
		SELECT
			ccs.id,
			ccs.cohort_id,
			ccs.competency_id,
			c.title,
			c.category,
			ccs.pre_program_pct,
			ccs.current_pct,
			ccs.updated_at
		FROM cohort_competency_scores ccs
		JOIN competencies c ON c.id = ccs.competency_id
		WHERE ccs.cohort_id = ?
		ORDER BY c.category, c.title
	`, cohortID).Scan(&rows).Error
	return rows, err
}

// upsertCompetencyScore creates or updates a competency score for a cohort.
func upsertCompetencyScore(req UpsertCompetencyScoreRequest) (*CohortCompetencyScore, error) {
	cID, err := uuid.Parse(req.CohortID)
	if err != nil {
		return nil, errors.New("invalid cohort_id")
	}
	compID, err := uuid.Parse(req.CompetencyID)
	if err != nil {
		return nil, errors.New("invalid competency_id")
	}

	row := CohortCompetencyScore{
		CohortID:      cID,
		CompetencyID:  compID,
		PreProgramPct: req.PreProgramPct,
		CurrentPct:    req.CurrentPct,
	}

	err = database.DB.Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "cohort_id"}, {Name: "competency_id"}},
		DoUpdates: clause.Assignments(map[string]any{
			"pre_program_pct": req.PreProgramPct,
			"current_pct":     req.CurrentPct,
			"updated_at":      gorm.Expr("NOW()"),
		}),
	}).Create(&row).Error
	return &row, err
}

// deleteCompetencyScore removes a score record by id.
func deleteCompetencyScore(id string) error {
	res := database.DB.Where("id = ?", id).Delete(&CohortCompetencyScore{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return errors.New("not found")
	}
	return nil
}
