package leaderboard

import (
	"log"

	"github.com/xa-lms/api/pkg/database"
)

// InitSchema adds the leaderboard opt-in column on shared DBs without file
// migrations applied. Points are derived — no tables to create.
func InitSchema() {
	sqlDB, err := database.DB.DB()
	if err != nil {
		log.Printf("leaderboard: schema init failed (get sqlDB): %v", err)
		return
	}
	if _, err := sqlDB.Exec(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS show_on_leaderboard BOOLEAN NOT NULL DEFAULT TRUE`); err != nil {
		log.Printf("leaderboard: schema init warn: %v", err)
	}
	log.Println("leaderboard: schema ready")
}
