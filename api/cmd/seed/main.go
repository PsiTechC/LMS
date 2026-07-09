// Command seed populates one isolated organization with realistic QA test data.
// See /SEED_DATA_PLAN.md at the repo root for the full design rationale — this
// file follows that plan step for step and cites the relevant section (§N) at
// each decision point so the two stay in sync.
package main

import (
	"database/sql"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func main() {
	reset := flag.Bool("reset", false, "tear down the seed org + seed users, then exit (no rebuild)")
	flag.Parse()

	// Loaded the same way api/cmd/server does — DB_URL lives in api/.env.
	_ = godotenv.Load(".env")

	dsn := os.Getenv("DB_URL")
	if dsn == "" {
		log.Fatal("❌ DB_URL not set (expected in api/.env)")
	}
	apiBase := os.Getenv("API_BASE_URL")
	if apiBase == "" {
		apiBase = "http://localhost:8080"
	}

	db, err := sql.Open("postgres", dsn)
	if err != nil {
		log.Fatalf("❌ connect DB: %v", err)
	}
	defer db.Close()
	if err := db.Ping(); err != nil {
		log.Fatalf("❌ ping DB: %v", err)
	}

	if *reset {
		if err := resetSeedData(db); err != nil {
			log.Fatalf("❌ reset failed: %v", err)
		}
		log.Println("✅ reset complete")
		return
	}

	// Hard pre-flight guard — must run before ANY write. Plan §7.
	guardAutomationRules(db)

	// Idempotency: if a previous run left the seed org or real personas behind,
	// clear them first so re-running never errors on a duplicate slug/email.
	log.Println("🧹 clearing any previous seed run...")
	if err := resetSeedData(db); err != nil {
		log.Fatalf("❌ pre-clean failed: %v", err)
	}
	if err := deleteExistingRealPersonas(db, realPersonaEmails()); err != nil {
		log.Fatalf("❌ pre-clean real personas failed: %v", err)
	}

	personas := buildPersonaList()

	bootstrapUsers := make([]bootstrapUser, 0, len(personas))
	for _, p := range personas {
		bootstrapUsers = append(bootstrapUsers, bootstrapUser{Email: p.Email, Name: p.Name, Role: p.Role})
	}

	orgID, userIDs, err := seedOrg(db, bootstrapUsers)
	if err != nil {
		log.Fatalf("❌ seedOrg failed: %v", err)
	}

	// coaches table rows — direct SQL, no API path exists (plan §5, §6-topic7).
	// All start org-wide (program_id NULL) — a program-scoped id doesn't exist yet
	// at this point in the sequence. Personas whose CoachProgramScope names a real
	// program (resolved later, once programs exist) get rescoped via
	// rescopeCoachProgram once that program's real ID is known (see runtime.run).
	for _, p := range personas {
		if !p.IsCoachEligible {
			continue
		}
		if err := addCoachRow(db, orgID, userIDs[p.Email], ""); err != nil {
			log.Fatalf("❌ addCoachRow(%s) failed: %v", p.Email, err)
		}
		log.Printf("✅ coaches row: %s (initially org-wide, scope=%q)", p.Email, p.CoachProgramScope)
	}

	userIDToEmail := make(map[string]string, len(userIDs))
	for email, uid := range userIDs {
		userIDToEmail[uid] = email
	}

	rt := &runtime{
		db:            db,
		apiBase:       apiBase,
		orgID:         orgID,
		userIDs:       userIDs,
		userIDToEmail: userIDToEmail,
		personas:      personas,
		cohortMembers: map[string][]string{},
	}

	if err := rt.run(); err != nil {
		log.Fatalf("❌ seed run failed: %v", err)
	}

	fmt.Println()
	fmt.Println("════════════════════════════════════════════════════════════════")
	fmt.Println("✅ SEED COMPLETE —", seedOrgName, "("+seedOrgSlug+")")
	fmt.Println("════════════════════════════════════════════════════════════════")
	fmt.Println("Login password for every seeded user:", seedPassword)
	fmt.Println()
	fmt.Println("Real-email personas (yours — safe to click through manually):")
	for _, p := range personas {
		if p.IsRealEmail {
			fmt.Printf("  %-14s  %-28s  %s\n", p.Role, p.Email, p.Name)
		}
	}
	fmt.Println()
	fmt.Println("Run with -reset to tear this all down again.")
}
