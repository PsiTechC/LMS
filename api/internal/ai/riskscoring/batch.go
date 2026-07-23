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

// StartNightlyBatch runs RunNightlyBatch immediately, then once every 24h.
// Follows the same goroutine+ticker convention as systemhealth.StartCollector
// and communications.StartRuleEvaluator - call with
// `go riskscoring.StartNightlyBatch()` from main.go.
//
// time.Ticker fires its first tick only after the full interval elapses, so
// a plain `for range ticker.C` left ai_risk_scores empty until the process
// had been running continuously for 24h - in a dev environment restarted
// often (air live-reload) that meant the table effectively never populated,
// which is what left every consumer of this data (Nudge & Comms at-risk
// list, Faculty At-Risk Alerts, PM Dropout Prediction) permanently empty.
func StartNightlyBatch() {
	scorer := NewRuleBasedScorer()
	if err := RunNightlyBatch(context.Background(), scorer); err != nil {
		log.Printf("riskscoring: initial batch failed: %v", err)
	}

	ticker := time.NewTicker(24 * time.Hour)
	defer ticker.Stop()
	for range ticker.C {
		if err := RunNightlyBatch(context.Background(), scorer); err != nil {
			log.Printf("riskscoring: nightly batch failed: %v", err)
		}
	}
}
