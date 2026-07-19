// backfill-leaderboard-awards creates missing immutable awards from existing
// source records. It never updates or deletes source data or award rows.
package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/joho/godotenv"
	"github.com/xa-lms/api/internal/leaderboard"
	"github.com/xa-lms/api/pkg/database"
)

type activityRow struct {
	ParticipantID, ActivityID, SourceID uuid.UUID
	CompletedAt                         time.Time
}
type discussionRow struct {
	ParticipantID, ProgramID, CohortID, SourceID uuid.UUID
	CompletedAt                                  time.Time
	Kind                                         string
}
type sessionRow struct {
	ID      uuid.UUID
	EndedAt time.Time
}

func main() {
	dryRun := flag.Bool("dry-run", false, "report eligible records without inserting awards")
	flag.Parse()
	_ = godotenv.Load()
	if _, err := database.Connect(); err != nil {
		log.Fatal(err)
	}
	attempted, failed := 0, 0
	runActivities("activity_progress", `SELECT ap.user_id participant_id, ap.activity_id, ap.id source_id, ap.completed_at FROM activity_progress ap JOIN activities a ON a.id=ap.activity_id WHERE ap.status='completed' AND ap.completed_at IS NOT NULL AND a.type IN ('video','pdf','case_study')`, *dryRun, &attempted, &failed, func(r activityRow) error {
		return leaderboard.AwardActivity(r.ParticipantID, r.ActivityID, r.SourceID, "", 0, r.CompletedAt)
	})
	runActivities("submissions", `SELECT s.participant_id, s.activity_id, s.id source_id, s.submitted_at FROM submissions s JOIN activities a ON a.id=s.activity_id WHERE a.type IN ('assessment','journal')`, *dryRun, &attempted, &failed, func(r activityRow) error {
		return leaderboard.AwardSubmission(r.ParticipantID, r.ActivityID, r.SourceID, r.CompletedAt)
	})
	runActivities("assessment_attempts", `SELECT aa.participant_id, aa.activity_id, aa.activity_id source_id, aa.submitted_at FROM assessment_attempts aa WHERE aa.submitted_at IS NOT NULL`, *dryRun, &attempted, &failed, func(r activityRow) error {
		return leaderboard.AwardActivity(r.ParticipantID, r.ActivityID, r.SourceID, "assessment", leaderboard.PointsPerAssessment, r.CompletedAt)
	})
	var discussions []discussionRow
	if err := database.DB.Raw(`SELECT t.author_id participant_id,t.program_id,t.cohort_id,t.id source_id,t.created_at completed_at,'discussion_post' kind FROM threads t WHERE t.is_deleted=false UNION ALL SELECT r.author_id,t.program_id,t.cohort_id,r.id,r.created_at,'discussion_reply' FROM thread_replies r JOIN threads t ON t.id=r.thread_id WHERE r.is_deleted=false AND t.is_deleted=false`).Scan(&discussions).Error; err != nil {
		log.Printf("discussions skipped: %v", err)
	} else {
		for _, r := range discussions {
			attempted++
			if !*dryRun {
				if err := leaderboard.AwardDiscussion(r.ParticipantID, r.ProgramID, r.CohortID, r.SourceID, r.Kind, r.CompletedAt); err != nil {
					failed++
					log.Printf("discussion %s: %v", r.SourceID, err)
				}
			}
		}
	}
	var sessions []sessionRow
	if err := database.DB.Raw(`SELECT id, ended_at FROM class_sessions WHERE engagement_id IS NOT NULL AND status='completed' AND ended_at IS NOT NULL`).Scan(&sessions).Error; err != nil {
		log.Printf("coaching sessions skipped: %v", err)
	} else {
		for _, r := range sessions {
			attempted++
			if !*dryRun {
				if err := leaderboard.AwardCompletedCoachingSession(r.ID, r.EndedAt); err != nil {
					failed++
					log.Printf("coaching %s: %v", r.ID, err)
				}
			}
		}
	}
	mode := "applied"
	if *dryRun {
		mode = "dry-run"
	}
	fmt.Printf("leaderboard backfill %s: eligible=%d failed=%d\n", mode, attempted, failed)
	if failed > 0 {
		os.Exit(1)
	}
}
func runActivities(name, query string, dry bool, attempted, failed *int, apply func(activityRow) error) {
	var rows []activityRow
	if err := database.DB.Raw(query).Scan(&rows).Error; err != nil {
		*failed++
		log.Printf("%s failed: %v", name, err)
		return
	}
	for _, r := range rows {
		*attempted++
		if !dry {
			if err := apply(r); err != nil {
				*failed++
				log.Printf("%s %s: %v", name, r.SourceID, err)
			}
		}
	}
}
