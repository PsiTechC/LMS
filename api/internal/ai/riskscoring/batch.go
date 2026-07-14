package riskscoring

import (
	"context"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/ai/scope"
	"github.com/xa-lms/api/pkg/database"
)

// RunNightlyBatch scores every active participant and persists the result.
// Intended to run on a daily ticker (see StartNightlyBatch), but is also
// callable directly (e.g. from an admin-triggered recompute endpoint later).
func RunNightlyBatch(ctx context.Context, scorer Scorer) error {
	var subjectIDs []uuid.UUID
	err := database.DB.Raw(`
		SELECT DISTINCT user_id FROM enrollments WHERE status <> 'withdrawn'
	`).Scan(&subjectIDs).Error
	if err != nil {
		return err
	}

	for _, subjectID := range subjectIDs {
		s := scope.Scope{UserID: subjectID}
		score, err := scorer.Score(ctx, s, subjectID)
		if err != nil {
			log.Printf("riskscoring: skip subject %s: %v", subjectID, err)
			continue
		}
		if err := database.DB.Create(&score).Error; err != nil {
			log.Printf("riskscoring: persist failed for subject %s: %v", subjectID, err)
		}
	}
	return nil
}

// StartNightlyBatch runs RunNightlyBatch once every 24h. Follows the same
// goroutine+ticker convention as systemhealth.StartCollector and
// communications.StartRuleEvaluator — call with `go riskscoring.StartNightlyBatch()`
// from main.go.
func StartNightlyBatch() {
	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()
	scorer := NewRuleBasedScorer()
	for range ticker.C {
		if err := RunNightlyBatch(context.Background(), scorer); err != nil {
			log.Printf("riskscoring: nightly batch failed: %v", err)
		}
	}
}
