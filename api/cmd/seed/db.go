package main

import (
	"database/sql"
	"fmt"
	"log"

	"github.com/google/uuid"
	_ "github.com/lib/pq"
	"github.com/xa-lms/api/internal/auth"
)

const (
	seedOrgSlug    = "xa-lms-qa-seed"
	seedOrgName    = "XA-LMS QA Seed Org"
	seedFakeDomain = "qa.psitech.co.in"
	seedPassword   = "QaSeed!2026"
)

// guardAutomationRules aborts the whole run with no writes if any automation_rules
// row is active anywhere on the instance. listActiveRules() in the real evaluator
// (communications/repository.go) has no org_id filter — a rule for ANY org runs
// against the whole DB's live data hourly. See SEED_DATA_PLAN.md §7.
func guardAutomationRules(db *sql.DB) {
	var count int
	if err := db.QueryRow(`SELECT COUNT(*) FROM automation_rules WHERE is_active = true`).Scan(&count); err != nil {
		log.Fatalf("❌ automation_rules pre-flight check failed: %v", err)
	}
	if count != 0 {
		log.Fatalf("❌ ABORTING — %d active automation_rules row(s) found. The hourly rule "+
			"evaluator scans globally with no org filter, so seeding now risks emailing real "+
			"people. Resolve this by hand (inspect/deactivate the rule) before re-running.", count)
	}
	log.Println("✅ automation_rules pre-flight: 0 active rows, safe to proceed")
}

// bootstrapUser is a seed persona to be created directly via SQL — the one
// narrow exception (plan §5) for roles/rows with no email-safe API path:
// plain participant/PM users (no safe register endpoint) and the initial
// superadmin (nothing can create the first superadmin except direct SQL).
type bootstrapUser struct {
	Email string
	Name  string
	Role  string // matches the user_role enum
}

// seedOrg creates the isolated seed organization + every bootstrap user +
// org_members rows, all in one transaction. Returns orgID and a map of
// email -> userID for the HTTP-calling phase to use.
func seedOrg(db *sql.DB, users []bootstrapUser) (orgID string, userIDs map[string]string, err error) {
	tx, err := db.Begin()
	if err != nil {
		return "", nil, err
	}
	defer func() {
		if err != nil {
			_ = tx.Rollback()
		}
	}()

	oid := uuid.New().String()
	if _, err = tx.Exec(`
		INSERT INTO organizations (id, name, slug, plan, status, seats)
		VALUES ($1, $2, $3, 'pro', 'active', 200)
	`, oid, seedOrgName, seedOrgSlug); err != nil {
		return "", nil, fmt.Errorf("insert organization: %w", err)
	}

	userIDs = make(map[string]string, len(users))
	hash, err := auth.HashPassword(seedPassword)
	if err != nil {
		return "", nil, fmt.Errorf("hash password: %w", err)
	}

	for _, u := range users {
		uid := uuid.New().String()
		if _, err = tx.Exec(`
			INSERT INTO users (id, email, name, password_hash, role, is_active, is_verified)
			VALUES ($1, $2, $3, $4, $5, true, true)
		`, uid, u.Email, u.Name, hash, u.Role); err != nil {
			return "", nil, fmt.Errorf("insert user %s: %w", u.Email, err)
		}
		userIDs[u.Email] = uid

		orgMemberRole := "participant"
		switch u.Role {
		case "superadmin", "superadmin_secondary", "program_manager":
			orgMemberRole = "admin"
		case "faculty":
			orgMemberRole = "faculty"
		case "coach":
			orgMemberRole = "coach"
		}
		if _, err = tx.Exec(`
			INSERT INTO org_members (id, org_id, user_id, role)
			VALUES ($1, $2, $3, $4)
		`, uuid.New().String(), oid, uid, orgMemberRole); err != nil {
			return "", nil, fmt.Errorf("insert org_member for %s: %w", u.Email, err)
		}

		// Mirrors rbac.EnsureBaseRoleAssignment (api/internal/rbac/assign.go),
		// reimplemented as plain SQL here rather than importing gorm into the seed
		// binary. Real signup paths (register, verify-email, faculty onboard,
		// invite-accept) all call the real function; this script bypasses every
		// one of them via direct SQL (plan §5 — no email-safe API path exists for
		// bulk user creation), so it must replicate this step by hand or every
		// cutover-persona user (program_manager/faculty/coach/participant) is
		// permanently denied on any HybridPermission-gated route — a real 403, not
		// just a cosmetic "0" on the Role Management screen. Idempotent + a no-op
		// for personas not in rbac.cutoverPersonas (superadmin/superadmin_secondary),
		// exactly matching the real function's behavior.
		if err = ensureBaseRoleAssignment(tx, uid, u.Role, oid); err != nil {
			return "", nil, fmt.Errorf("ensure role_assignments for %s: %w", u.Email, err)
		}
	}

	if err = tx.Commit(); err != nil {
		return "", nil, err
	}
	log.Printf("✅ seed org created: %s (id=%s), %d users", seedOrgSlug, oid, len(users))
	return oid, userIDs, nil
}

// seedCutoverPersonas mirrors rbac.cutoverPersonas (api/internal/rbac/assign.go)
// — must stay in lock-step with that map. Extend both together if more
// personas are cut over.
var seedCutoverPersonas = map[string]bool{
	"faculty":         true,
	"program_manager": true,
	"coach":           true,
	"participant":     true,
}

// ensureBaseRoleAssignment is a plain-SQL reimplementation of
// rbac.EnsureBaseRoleAssignment for use inside the seed script's *sql.Tx (the
// real function takes *gorm.DB, which the seed binary doesn't otherwise
// depend on). Links a newly-created user to the seeded platform-global system
// role matching their base persona, idempotently. No-op for personas not in
// seedCutoverPersonas. If the system role isn't seeded yet, skips rather than
// failing user creation — matching the real function's behavior exactly.
func ensureBaseRoleAssignment(tx *sql.Tx, userID, role, orgID string) error {
	if !seedCutoverPersonas[role] {
		return nil
	}
	var roleID string
	err := tx.QueryRow(
		`SELECT id::text FROM custom_roles WHERE is_system = TRUE AND org_id IS NULL AND name = $1 LIMIT 1`,
		role,
	).Scan(&roleID)
	if err == sql.ErrNoRows {
		return nil // system role not seeded — skip rather than fail user creation
	}
	if err != nil {
		return err
	}
	_, err = tx.Exec(`
		INSERT INTO role_assignments (user_id, role_id, org_id, assigned_by)
		SELECT $1::uuid, $2::uuid, NULLIF($3, '')::uuid, NULL
		WHERE NOT EXISTS (
			SELECT 1 FROM role_assignments ra
			WHERE ra.user_id = $1::uuid AND ra.role_id = $2::uuid
		)`,
		userID, roleID, orgID,
	)
	return err
}

// addCoachRow inserts directly into `coaches` — no API endpoint exists for this
// except via an invite-accept email round-trip (plan §5, §6 topic 7). programID
// empty string means org-wide (NULL).
func addCoachRow(db *sql.DB, orgID, userID, programID string) error {
	var progArg any
	if programID != "" {
		progArg = programID
	}
	_, err := db.Exec(`
		INSERT INTO coaches (id, org_id, user_id, program_id)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT DO NOTHING
	`, uuid.New().String(), orgID, userID, progArg)
	return err
}

// syncCompletedSessions writes coaching_engagements.completed_sessions directly —
// confirmed no API endpoint ever writes this column (plan §8), yet 4 frontend
// screens read it. count = number of class_sessions with status='completed'
// under this engagement.
func syncCompletedSessions(db *sql.DB, engagementID string, count int) error {
	_, err := db.Exec(`UPDATE coaching_engagements SET completed_sessions = $1 WHERE id = $2`, count, engagementID)
	return err
}

// rescopeCoachProgram updates an existing coaches row's program_id after the
// program it should be scoped to has been created (addCoachRow runs during
// bootstrap, before any program exists). email must already have a coaches row.
func rescopeCoachProgram(db *sql.DB, orgID, userID, programID string) error {
	_, err := db.Exec(`
		UPDATE coaches SET program_id = $1 WHERE org_id = $2 AND user_id = $3
	`, programID, orgID, userID)
	return err
}

// resetSeedData tears down the seed org and seed (fake-domain) users, in the
// order proven safe against the live schema's FK delete rules (plan §4):
// organizations MUST be deleted before users, never the reverse, since several
// FKs from data tables to users are NO ACTION rather than CASCADE.
//
// coaching_notes.session_id REFERENCES class_sessions(id) with NO CASCADE
// (migrations/000007_faculty.up.sql:69 — unlike session_materials/
// session_attendance on the same table, which do cascade). The seed script
// itself creates a coaching_notes row (buildMidwayCohortActivity), so once
// that's run once, the plain `organizations` cascade can no longer delete
// class_sessions until coaching_notes is cleared first by hand. Delete it
// explicitly, scoped to this seed org's sessions, before the org cascade.
func resetSeedData(db *sql.DB) error {
	if _, err := db.Exec(`
		DELETE FROM coaching_notes
		WHERE session_id IN (
			SELECT cs.id FROM class_sessions cs
			JOIN cohorts co ON co.id = cs.cohort_id
			JOIN programs p ON p.id = co.program_id
			JOIN organizations o ON o.id = p.org_id
			WHERE o.slug = $1
		)
	`, seedOrgSlug); err != nil {
		return fmt.Errorf("delete coaching_notes (pre-cascade, no ON DELETE CASCADE on session_id): %w", err)
	}

	res, err := db.Exec(`DELETE FROM organizations WHERE slug = $1`, seedOrgSlug)
	if err != nil {
		return fmt.Errorf("delete organizations: %w", err)
	}
	n, _ := res.RowsAffected()
	log.Printf("🗑  deleted organizations rows: %d", n)

	res, err = db.Exec(`DELETE FROM users WHERE email LIKE $1`, "%@"+seedFakeDomain)
	if err != nil {
		return fmt.Errorf("delete seed-domain users (real persona emails are preserved): %w", err)
	}
	n, _ = res.RowsAffected()
	log.Printf("🗑  deleted fake-domain users: %d", n)
	return nil
}

// deleteExistingRealPersonas removes any leftover rows for the 7 real persona
// emails from a previous run, so re-running the seed is idempotent (delete +
// recreate) rather than erroring on a duplicate email uniqueIndex. Only called
// for the small real-persona list, never for arbitrary users.
func deleteExistingRealPersonas(db *sql.DB, emails []string) error {
	for _, e := range emails {
		if _, err := db.Exec(`DELETE FROM users WHERE email = $1`, e); err != nil {
			return fmt.Errorf("delete existing persona %s: %w", e, err)
		}
	}
	return nil
}
