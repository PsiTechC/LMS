package roles

import (
	"log"

	"github.com/xa-lms/api/pkg/database"
)

// fixSchema creates all role-management tables idempotently on startup.
// Mirrors the migration in api/migrations/000021_role_management.up.sql so the
// module is runnable even before a manual migrate step (same pattern as the
// compliance and content modules).
func fixSchema() {
	db := database.DB

	sqls := []string{
		`CREATE TABLE IF NOT EXISTS custom_roles (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
			name TEXT NOT NULL,
			description TEXT NOT NULL DEFAULT '',
			base_role user_role NOT NULL DEFAULT 'participant',
			permissions JSONB NOT NULL DEFAULT '[]',
			is_system BOOLEAN NOT NULL DEFAULT FALSE,
			created_by UUID REFERENCES users(id) ON DELETE SET NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_roles_org_name
			ON custom_roles (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name))`,
		`CREATE INDEX IF NOT EXISTS idx_custom_roles_org ON custom_roles (org_id)`,
		`CREATE TABLE IF NOT EXISTS role_assignments (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			role_id UUID REFERENCES custom_roles(id) ON DELETE CASCADE,
			base_role user_role,
			org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
			program_id UUID,
			valid_from TIMESTAMPTZ,
			valid_until TIMESTAMPTZ,
			assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			CONSTRAINT role_assignment_target CHECK (
				(role_id IS NOT NULL AND base_role IS NULL) OR
				(role_id IS NULL AND base_role IS NOT NULL)
			)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_role_assignments_user ON role_assignments (user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_role_assignments_org ON role_assignments (org_id)`,
		`CREATE INDEX IF NOT EXISTS idx_role_assignments_program ON role_assignments (program_id)`,
		`CREATE INDEX IF NOT EXISTS idx_role_assignments_role ON role_assignments (role_id)`,
		`CREATE TABLE IF NOT EXISTS org_access_rules (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			org_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
			ip_allowlist JSONB NOT NULL DEFAULT '[]',
			allowed_countries JSONB NOT NULL DEFAULT '[]',
			blocked_countries JSONB NOT NULL DEFAULT '[]',
			enforce BOOLEAN NOT NULL DEFAULT FALSE,
			updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_org_access_rules_org ON org_access_rules (org_id)`,
	}

	for _, sql := range sqls {
		if err := db.Exec(sql).Error; err != nil {
			log.Printf("roles fixSchema: %v", err)
		}
	}
	log.Println("roles: schema ready")
}

// ── Custom Roles ──────────────────────────────────────────────────────────────

func insertRole(r *CustomRole) error {
	return database.DB.Create(r).Error
}

func getRoleByID(id string) (*CustomRole, error) {
	var r CustomRole
	if err := database.DB.Where("id = ?", id).First(&r).Error; err != nil {
		return nil, err
	}
	return &r, nil
}

// listRoles returns custom roles, optionally scoped to an org. Platform-global
// roles (org_id IS NULL) are always included.
func listRoles(orgID string) ([]CustomRole, error) {
	var rows []CustomRole
	q := database.DB.Order("created_at desc")
	if orgID != "" {
		q = q.Where("org_id = ? OR org_id IS NULL", orgID)
	}
	err := q.Find(&rows).Error
	return rows, err
}

func updateRole(id string, fields map[string]any) error {
	return database.DB.Model(&CustomRole{}).Where("id = ?", id).Updates(fields).Error
}

func deleteRole(id string) error {
	return database.DB.Where("id = ?", id).Delete(&CustomRole{}).Error
}

// ── Role Assignments ──────────────────────────────────────────────────────────

func insertAssignment(a *RoleAssignment) error {
	return database.DB.Create(a).Error
}

// listAssignments returns assignments filtered by any combination of user/org/program.
func listAssignments(userID, orgID, programID string) ([]RoleAssignment, error) {
	var rows []RoleAssignment
	q := database.DB.Order("created_at desc")
	if userID != "" {
		q = q.Where("user_id = ?", userID)
	}
	if orgID != "" {
		q = q.Where("org_id = ?", orgID)
	}
	if programID != "" {
		q = q.Where("program_id = ?", programID)
	}
	err := q.Find(&rows).Error
	return rows, err
}

// listActiveAssignmentsForUser returns a user's assignments whose validity
// window currently contains NOW() (NULL bounds are treated as open).
func listActiveAssignmentsForUser(userID string) ([]RoleAssignment, error) {
	var rows []RoleAssignment
	err := database.DB.
		Where("user_id = ?", userID).
		Where("(valid_from IS NULL OR valid_from <= NOW())").
		Where("(valid_until IS NULL OR valid_until >= NOW())").
		Find(&rows).Error
	return rows, err
}

func deleteAssignment(id string) error {
	return database.DB.Where("id = ?", id).Delete(&RoleAssignment{}).Error
}

// roleNamesByIDs resolves custom-role display names for a set of ids.
func roleNamesByIDs(ids []string) (map[string]string, error) {
	out := map[string]string{}
	if len(ids) == 0 {
		return out, nil
	}
	var rows []CustomRole
	if err := database.DB.Select("id", "name").Where("id IN ?", ids).Find(&rows).Error; err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.ID.String()] = r.Name
	}
	return out, nil
}

// getUserBaseRole reads the persona enum stored on the users table.
func getUserBaseRole(userID string) (string, error) {
	var role string
	err := database.DB.Raw(`SELECT role FROM users WHERE id = ?`, userID).Scan(&role).Error
	return role, err
}

// ── Organization Access Rules ─────────────────────────────────────────────────

func getAccessRuleByOrg(orgID string) (*OrgAccessRule, error) {
	var r OrgAccessRule
	if err := database.DB.Where("org_id = ?", orgID).First(&r).Error; err != nil {
		return nil, err
	}
	return &r, nil
}

// upsertAccessRule inserts or updates the single access-rule row for an org.
func upsertAccessRule(r *OrgAccessRule) error {
	sql := `
		INSERT INTO org_access_rules
			(org_id, ip_allowlist, allowed_countries, blocked_countries, enforce, updated_by, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, NOW())
		ON CONFLICT (org_id) DO UPDATE SET
			ip_allowlist      = EXCLUDED.ip_allowlist,
			allowed_countries = EXCLUDED.allowed_countries,
			blocked_countries = EXCLUDED.blocked_countries,
			enforce           = EXCLUDED.enforce,
			updated_by        = EXCLUDED.updated_by,
			updated_at        = NOW()`
	return database.DB.Exec(sql, r.OrgID, r.IPAllowlist, r.AllowedCountries, r.BlockedCountries, r.Enforce, r.UpdatedBy).Error
}
