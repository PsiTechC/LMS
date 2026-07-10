package rbac

import (
	"log"

	"gorm.io/gorm"
)

// cutoverPersonas are base roles now ENFORCED via the resolver — a user with one
// of these roles must have a role_assignments row or they'll be denied. Extend
// this set as more personas are cut over (coach, participant).
var cutoverPersonas = map[string]bool{
	"faculty":         true,
	"program_manager": true,
	"coach":           true,
	"participant":     true,
}

// EnsureBaseRoleAssignment idempotently links a newly-created user to the seeded
// platform system role matching their base persona, so a cut-over persona is
// never denied for lack of an assignment. It is a no-op for personas that are
// not yet cut over (participant, coach, superadmin).
//
// Pass a *gorm.DB transaction to make it atomic with user creation. orgID "" →
// NULL (platform-scoped), matching the manual backfills. Idempotent via
// NOT EXISTS (role_assignments has no unique constraint). If the system role
// isn't seeded it returns nil rather than blocking user creation.
func EnsureBaseRoleAssignment(db *gorm.DB, userID, role, orgID string) error {
	if !cutoverPersonas[role] {
		return nil
	}
	var roleID string
	if err := db.Raw(
		`SELECT id::text FROM custom_roles WHERE is_system = TRUE AND org_id IS NULL AND name = ? LIMIT 1`,
		role,
	).Scan(&roleID).Error; err != nil {
		return err
	}
	if roleID == "" {
		return nil // system role not seeded — skip rather than fail user creation
	}
	return db.Exec(`
		INSERT INTO role_assignments (user_id, role_id, org_id, assigned_by)
		SELECT ?::uuid, ?::uuid, NULLIF(?, '')::uuid, NULL
		WHERE NOT EXISTS (
			SELECT 1 FROM role_assignments ra
			WHERE ra.user_id = ?::uuid AND ra.role_id = ?::uuid
		)`,
		userID, roleID, orgID, userID, roleID,
	).Error
}

// WarnOrphanedRoleAssignments is a READ-ONLY, warn-only boot-time signal. It
// logs any non-superadmin user that has zero role_assignments rows so an
// orphan is visible in the startup logs immediately, instead of being
// discovered later by a locked-out user.
//
// This is deliberately NOT an enforcement mechanism: it must never block
// server startup, never return an error the caller treats as fatal, and
// never touch user-creation requests. Any failure of the check itself
// (e.g. a transient DB hiccup during boot) is swallowed and logged as a
// single warning — a broken CHECK must never be worse than the orphan
// problem it's trying to surface. Callers should invoke this in a goroutine
// or otherwise never gate startup on its result.
func WarnOrphanedRoleAssignments(db *gorm.DB) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("⚠️  [rbac] orphan check panicked (ignored, non-fatal): %v", r)
		}
	}()

	type orphan struct {
		Email string
		Role  string
	}
	var orphans []orphan
	err := db.Raw(`
		SELECT u.email, u.role::text AS role
		FROM users u
		WHERE u.role::text <> 'superadmin'
		  AND NOT EXISTS (SELECT 1 FROM role_assignments ra WHERE ra.user_id = u.id)
		ORDER BY u.role::text, u.email
	`).Scan(&orphans).Error
	if err != nil {
		log.Printf("⚠️  [rbac] orphan check query failed (non-fatal, informational only): %v", err)
		return
	}
	if len(orphans) == 0 {
		log.Printf("✅ [rbac] role_assignments coverage check: 0 orphaned non-superadmin users")
		return
	}
	log.Printf("⚠️  [rbac] %d non-superadmin user(s) have NO role_assignments row (will resolve to zero permissions):", len(orphans))
	for _, o := range orphans {
		log.Printf("⚠️  [rbac]   orphan: %s (role=%s)", o.Email, o.Role)
	}
}
