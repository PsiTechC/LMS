package leaderboard

import (
	"log"

	"github.com/xa-lms/api/pkg/database"
)

// InitActivityScoresSchema creates the activity_scores table used by the new
// engagement/speed/quality scoring model (see scoring.go). It is the
// idempotent Go counterpart to api/migrations/000056_activity_scores.up.sql -
// per api/CLAUDE.md's "Database Migrations" section, that .sql file is a
// historical paper trail only and is never executed automatically; this
// function is what actually applies the schema, the same way InitSchema()
// in init.go already does for leaderboard_awards/show_on_leaderboard.
//
// DELIBERATELY NOT CALLED FROM main.go YET. This function is written for
// review only, per the task's phased-rollout instructions ("do not run the
// migration automatically... provide the command for the developer to run
// after team approval"). Once reviewed and approved:
//
//  1. Add a call to leaderboard.InitActivityScoresSchema() in api/cmd/server/main.go,
//     right next to the existing leaderboard.InitSchema() call.
//  2. Restart/redeploy the API - the CREATE TABLE IF NOT EXISTS runs on boot
//     against the shared dev database, exactly like every other module's
//     schema init. There is no separate "migrate" CLI in this repo to invoke
//     (see api/CLAUDE.md - no golang-migrate wiring, no schema_migrations
//     table); wiring this call in and redeploying IS the migration command.
//
// This is purely additive (a new table, no ALTER of any existing one) and
// safe to run any number of times against a database that already has it.
func InitActivityScoresSchema() {
	sqlDB, err := database.DB.DB()
	if err != nil {
		log.Printf("leaderboard: activity_scores schema init failed (get sqlDB): %v", err)
		return
	}
	if _, err := sqlDB.Exec(`
		CREATE TABLE IF NOT EXISTS activity_scores (
			id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
			participant_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			enrollment_id      UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
			program_id         UUID REFERENCES programs(id) ON DELETE SET NULL,
			cohort_id          UUID REFERENCES cohorts(id) ON DELETE SET NULL,
			activity_id        UUID NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
			engagement_score   INTEGER NOT NULL CHECK (engagement_score >= 0),
			speed_score        INTEGER NOT NULL CHECK (speed_score >= 0),
			quality_score      INTEGER NOT NULL CHECK (quality_score >= 0),
			earned_total       INTEGER NOT NULL CHECK (earned_total >= 0),
			maximum_total      INTEGER NOT NULL CHECK (maximum_total > 0),
			calculation_reason TEXT NOT NULL,
			calculated_at      TIMESTAMPTZ NOT NULL,
			created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			UNIQUE (organization_id, participant_id, enrollment_id, activity_id)
		)`); err != nil {
		log.Printf("leaderboard: activity_scores schema init warn (table): %v", err)
	}
	if _, err := sqlDB.Exec(`CREATE INDEX IF NOT EXISTS idx_activity_scores_participant_program ON activity_scores (participant_id, program_id)`); err != nil {
		log.Printf("leaderboard: activity_scores schema init warn (idx participant_program): %v", err)
	}
	if _, err := sqlDB.Exec(`CREATE INDEX IF NOT EXISTS idx_activity_scores_org_program ON activity_scores (organization_id, program_id)`); err != nil {
		log.Printf("leaderboard: activity_scores schema init warn (idx org_program): %v", err)
	}
	if _, err := sqlDB.Exec(`CREATE INDEX IF NOT EXISTS idx_activity_scores_cohort ON activity_scores (cohort_id)`); err != nil {
		log.Printf("leaderboard: activity_scores schema init warn (idx cohort): %v", err)
	}
	if _, err := sqlDB.Exec(`CREATE INDEX IF NOT EXISTS idx_activity_scores_enrollment ON activity_scores (enrollment_id)`); err != nil {
		log.Printf("leaderboard: activity_scores schema init warn (idx enrollment): %v", err)
	}
	log.Println("leaderboard: activity_scores schema ready")
}
