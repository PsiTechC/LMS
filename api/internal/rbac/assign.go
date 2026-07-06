package rbac

import "gorm.io/gorm"

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
