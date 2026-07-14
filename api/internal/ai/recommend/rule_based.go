package recommend

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/ai/scope"
	"github.com/xa-lms/api/pkg/database"
)

// RuleBasedRecommender suggests the next few incomplete activities in
// program order — the simplest useful "adaptive path" step before any real
// personalization model exists.
type RuleBasedRecommender struct{}

func (RuleBasedRecommender) Recommend(_ context.Context, s scope.Scope, subjectID uuid.UUID) ([]Recommendation, error) {
	if s.ProgramID == nil {
		return nil, fmt.Errorf("recommend: subject has no program-scoped enrollment")
	}

	type row struct {
		Title  string
		Type   string
		SortOrder int
	}
	var rows []row
	err := database.DB.Raw(`
		SELECT a.title, a.type, a.sort_order
		FROM activities a
		JOIN program_phases ph ON ph.id = a.phase_id
		LEFT JOIN enrollments e ON e.user_id = ? AND e.cohort_id IN (
			SELECT id FROM cohorts WHERE program_id = ?
		)
		LEFT JOIN activity_progress ap ON ap.activity_id = a.id AND ap.enrollment_id = e.id AND ap.status = 'completed'
		WHERE ph.program_id = ? AND ap.id IS NULL
		ORDER BY ph.phase_number, a.sort_order
		LIMIT 3
	`, subjectID, *s.ProgramID, *s.ProgramID).Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	out := make([]Recommendation, 0, len(rows))
	for i, r := range rows {
		out = append(out, Recommendation{
			Title:    r.Title,
			Reason:   fmt.Sprintf("Next incomplete %s in your program sequence.", r.Type),
			Priority: i + 1,
		})
	}
	return out, nil
}
