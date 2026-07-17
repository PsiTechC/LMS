package roles

import (
	"log"

	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
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
			base_role TEXT NOT NULL DEFAULT 'participant',
			color TEXT NOT NULL DEFAULT '#EF4E24',
			permissions JSONB NOT NULL DEFAULT '[]',
			is_system BOOLEAN NOT NULL DEFAULT FALSE,
			created_by UUID REFERENCES users(id) ON DELETE SET NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		// Idempotent upgrades for pre-existing installs.
		`ALTER TABLE custom_roles ADD COLUMN IF NOT EXISTS color TEXT NOT NULL DEFAULT '#EF4E24'`,
		`ALTER TABLE custom_roles ALTER COLUMN base_role TYPE TEXT USING base_role::text`,
		// Marks a role as personal to exactly one account (Members-tab "Edit
		// Permissions" flow) — NULL for every ordinary shared/system role.
		`ALTER TABLE custom_roles ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE CASCADE`,
		`CREATE INDEX IF NOT EXISTS idx_custom_roles_owner ON custom_roles (owner_user_id)`,
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
		// Explicit, single-source-of-truth flag for "is this account the org's
		// Primary PM" — replaces re-deriving it ad hoc from effective_role/
		// base_role comparisons at every call site (the exact drift that broke
		// Parth's Primary tag earlier: those comparisons disagreed with each
		// other once he had a personal per-account role). Nullable + defaults
		// FALSE, so every pre-existing row is safe; backfilled once below.
		`ALTER TABLE role_assignments ADD COLUMN IF NOT EXISTS is_primary_pm BOOLEAN DEFAULT FALSE`,
		// One-time backfill: run only if no row has ever been marked Primary
		// yet, so this never re-derives (and potentially overwrites a future
		// deliberate change) on every subsequent boot — after this first run,
		// is_primary_pm is authoritative and this block is a no-op forever.
		// Matches the UI's existing LOOSE definition: PM-tier (base_role
		// program_manager, whether via the bare persona or a custom role
		// built on it) AND not specifically the shared "Secondary PM" role.
		`DO $$
		BEGIN
			IF NOT EXISTS (SELECT 1 FROM role_assignments WHERE is_primary_pm = TRUE) THEN
				UPDATE role_assignments ra
				SET is_primary_pm = TRUE
				WHERE (
					ra.base_role = 'program_manager'
					OR EXISTS (
						SELECT 1 FROM custom_roles cr
						WHERE cr.id = ra.role_id AND cr.base_role = 'program_manager'
					)
				)
				AND NOT EXISTS (
					SELECT 1 FROM custom_roles cr2
					WHERE cr2.id = ra.role_id AND cr2.name = 'Secondary PM'
				);
			END IF;
		END $$`,
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
// roles (org_id IS NULL) are always included. Personal, per-account roles
// (owner_user_id set — created via the Members-tab permission editor) are
// always excluded: they belong to exactly one account and must never appear
// in the shared Roles catalog.
func listRoles(orgID string) ([]CustomRole, error) {
	var rows []CustomRole
	q := database.DB.Where("owner_user_id IS NULL").Order("created_at desc")
	if orgID != "" {
		q = q.Where("org_id = ? OR org_id IS NULL", orgID)
	}
	err := q.Find(&rows).Error
	return rows, err
}

// getPersonalRoleForUser returns the personal, per-account custom role
// already created for this user in this org (if any), from a prior
// Members-tab permission edit — so a repeat edit updates it in place instead
// of creating a duplicate row.
func getPersonalRoleForUser(userID, orgID string) (*CustomRole, error) {
	var r CustomRole
	err := database.DB.
		Where("owner_user_id = ? AND org_id = ?", userID, orgID).
		First(&r).Error
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// getUserNameAndBaseRole reads the display name and persona enum for a user —
// used to seed a new personal custom role's name/base_role on first edit.
func getUserNameAndBaseRole(userID string) (name, role string, err error) {
	var row struct {
		Name string
		Role string
	}
	err = database.DB.Raw(`SELECT name, role FROM users WHERE id = ?`, userID).Scan(&row).Error
	return row.Name, row.Role, err
}

func updateRole(id string, fields map[string]any) error {
	return database.DB.Model(&CustomRole{}).Where("id = ?", id).Updates(fields).Error
}

func deleteRole(id string) error {
	return database.DB.Where("id = ?", id).Delete(&CustomRole{}).Error
}

// ── Primary PM uniqueness ─────────────────────────────────────────────────────
// is_primary_pm on role_assignments is the single source of truth for "is this
// account the org's Primary PM" — see api/migrations/000041. Everything below
// reads/writes that one column; nothing here re-derives it from role names or
// permission sets.

// IsPrimaryPM is a trivial lookup — exported so the future PM-scoped Role
// Management tab's backend guard, and any other caller, can check this
// directly instead of comparing role names.
func IsPrimaryPM(userID, orgID string) (bool, error) {
	var isPrimary bool
	var err error
	if orgID == "" {
		err = database.DB.Raw(`
			SELECT COALESCE(is_primary_pm, FALSE) FROM role_assignments
			WHERE user_id = ? AND org_id IS NULL LIMIT 1`, userID).Scan(&isPrimary).Error
	} else {
		err = database.DB.Raw(`
			SELECT COALESCE(is_primary_pm, FALSE) FROM role_assignments
			WHERE user_id = ? AND org_id = ? LIMIT 1`, userID, orgID).Scan(&isPrimary).Error
	}
	return isPrimary, err
}

// primaryPMUserID returns the user_id of the org's current Primary PM, or ""
// if none exists yet. orgID "" means the platform-scoped (org_id IS NULL)
// bucket, matching EnsureBaseRoleAssignment's convention. Built as two
// explicit branches rather than a single `org_id = NULLIF(?, '')::uuid`
// query — an empty string cast to uuid throws before Postgres ever reaches
// the NULLIF, the same eager-evaluation gotcha documented for the audit
// summary query.
func primaryPMUserID(orgID string) (string, error) {
	var uid string
	var err error
	if orgID == "" {
		err = database.DB.Raw(`
			SELECT user_id::text FROM role_assignments
			WHERE is_primary_pm = TRUE AND org_id IS NULL LIMIT 1`).Scan(&uid).Error
	} else {
		err = database.DB.Raw(`
			SELECT user_id::text FROM role_assignments
			WHERE is_primary_pm = TRUE AND org_id = ?::uuid LIMIT 1`, orgID).Scan(&uid).Error
	}
	return uid, err
}

// lookupSecondaryPMRoleID resolves the shared, platform-global "Secondary PM"
// custom role's id — the role a second PM gets redirected to instead of the
// base persona. Returns ("", nil) if it doesn't exist rather than erroring,
// so a missing seed role degrades to "assignment rejected" upstream instead
// of a 500.
func lookupSecondaryPMRoleID() (string, error) {
	var id string
	err := database.DB.Raw(`
		SELECT id::text FROM custom_roles
		WHERE name = 'Secondary PM' AND owner_user_id IS NULL
		LIMIT 1`).Scan(&id).Error
	return id, err
}

// primaryPMOwnOrgID resolves the org a Primary PM belongs to, straight from
// their OWN is_primary_pm=true role_assignments row. This doubles as the
// authorization check for every Primary PM-scoped route: if no such row
// exists, the caller isn't a Primary PM (ok=false) — Secondary PM, faculty,
// coach, participant, and superadmin all fail this the same way. The org_id
// returned here is the ONLY org_id the PM routes ever use — never a
// client-supplied parameter.
func primaryPMOwnOrgID(userID string) (orgID string, ok bool, err error) {
	var raw string
	err = database.DB.Raw(`
		SELECT COALESCE(org_id::text, '') FROM role_assignments
		WHERE user_id = ? AND is_primary_pm = TRUE LIMIT 1`, userID).Scan(&raw).Error
	if err != nil {
		return "", false, err
	}
	if raw == "" {
		return "", false, nil
	}
	return raw, true, nil
}

// requireTargetInOrgAndManageable guards every Primary PM action against a
// target account: the target must actually belong to orgID (never trust a
// client-supplied user_id blindly), must not itself be a Primary PM (a PM
// can't touch another org's PM or a peer PM), and must not be superadmin-
// tier. This is the only place these three checks are enforced — every PM
// route below calls this before doing anything else.
func requireTargetInOrgAndManageable(targetUserID, orgID string) error {
	var inOrg bool
	if err := database.DB.Raw(`
		SELECT EXISTS(SELECT 1 FROM org_members WHERE user_id = ? AND org_id = ?)`,
		targetUserID, orgID).Scan(&inOrg).Error; err != nil {
		return err
	}
	if !inOrg {
		return errForbidden
	}
	isPrimary, err := IsPrimaryPM(targetUserID, orgID)
	if err != nil {
		return err
	}
	if isPrimary {
		return errForbidden
	}
	baseRole, err := getUserBaseRole(targetUserID)
	if err != nil {
		return err
	}
	if baseRole == "superadmin" {
		return errForbidden
	}
	return nil
}

// ── Role Assignments ──────────────────────────────────────────────────────────

func insertAssignment(a *RoleAssignment) error {
	return database.DB.Create(a).Error
}

// findActiveBaseRoleAssignment looks up an existing active role_assignments
// row for (userID, baseRole, orgID), so granting the same additional persona
// twice is a no-op (idempotent) instead of creating a duplicate row — there
// is no unique constraint on role_assignments, so callers must dedupe
// themselves.
func findActiveBaseRoleAssignment(userID, baseRole, orgID string) (*RoleAssignment, error) {
	var rows []RoleAssignment
	q := database.DB.
		Where("user_id = ? AND base_role = ?", userID, baseRole).
		Where("valid_from IS NULL OR valid_from <= NOW()").
		Where("valid_until IS NULL OR valid_until >= NOW()")
	if orgID == "" {
		q = q.Where("org_id IS NULL")
	} else {
		q = q.Where("org_id = ?", orgID)
	}
	if err := q.Order("created_at desc").Limit(1).Find(&rows).Error; err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, nil
	}
	return &rows[0], nil
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

// replaceOrgMemberAssignment atomically REPLACES a member's role_assignment
// GLOBALLY: deletes ALL existing role_assignments rows for user_id
// (regardless of org_id), then inserts the new one — same underlying gorm
// Create() call insertAssignment uses, just wrapped in a transaction with
// the delete so a member can never end up with two active assignments.
// rbac.Resolve()/myEffectivePermissionsService resolve a user's permissions
// user-wide, not scoped to one org, so a leftover assignment in ANY org (or
// a platform-wide org_id IS NULL one) unions into their resolved
// permissions no differently than one in the org currently being edited —
// scoping this delete to just (user_id, org_id) missed exactly that case:
// it's how shreyaskatole33@gmail.com ended up with both a platform-wide
// "Secondary PM" assignment AND a later org-scoped personal-role assignment
// simultaneously. Deleting only by user_id (this fix) closes that gap —
// same underlying bug class as shubham@convis.ai, one edge case wider.
func replaceOrgMemberAssignment(userID, orgID string, a *RoleAssignment) error {
	_ = orgID // kept in the signature — callers pass it, but the delete is user-wide (see above)
	return database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("user_id = ?", userID).Delete(&RoleAssignment{}).Error; err != nil {
			return err
		}
		return tx.Create(a).Error
	})
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

// ── Counts & user lists for the Role Management page ────────────────────────

// countUsersByBaseRole counts users whose persona enum equals `role`.
func countUsersByBaseRole(role string) (int64, error) {
	var n int64
	err := database.DB.Raw(`SELECT COUNT(*) FROM users WHERE role = ?`, role).Scan(&n).Error
	return n, err
}

// countAssignmentUsers counts distinct users assigned a given custom role.
func countAssignmentUsers(roleID string) (int64, error) {
	var n int64
	err := database.DB.Raw(
		`SELECT COUNT(DISTINCT user_id) FROM role_assignments WHERE role_id = ?`, roleID).Scan(&n).Error
	return n, err
}

// countAllCustomRoles counts TRUE custom roles only (is_system = false),
// excluding both personal per-account roles (owner_user_id set) and the
// seeded system rows (participant/coach/faculty/program_manager) that also
// live in this table — those are counted separately as "built-in personas"
// by rolesSummaryService, so including them here would double-count them.
// "Secondary PM" is also excluded: it's a flavor of the program_manager
// persona (surfaced via a Primary/Secondary tag on the Members tab), not a
// distinct role concept, so it shouldn't inflate this count either.
func countAllCustomRoles() (int64, error) {
	var n int64
	err := database.DB.Model(&CustomRole{}).
		Where("owner_user_id IS NULL AND is_system = false AND name != 'Secondary PM'").
		Count(&n).Error
	return n, err
}

// countAllAssignmentUsers counts distinct users across all custom-role assignments.
func countAllAssignmentUsers() (int64, error) {
	var n int64
	err := database.DB.Raw(
		`SELECT COUNT(DISTINCT user_id) FROM role_assignments WHERE role_id IS NOT NULL`).Scan(&n).Error
	return n, err
}

// listUsersByBaseRole returns users holding a built-in persona (read-only
// list), each annotated with their org (via org_members) so the Users view
// can group them by organization. A user with no org membership gets an
// empty org_id/org_name (rendered as an "unassigned" bucket).
func listUsersByBaseRole(role string) ([]RoleUserDTO, error) {
	var rows []RoleUserDTO
	err := database.DB.Raw(`
		SELECT u.id, u.name, u.email,
		       COALESCE(o.id::text, '') AS org_id, COALESCE(o.name, '') AS org_name
		FROM users u
		LEFT JOIN org_members om ON om.user_id = u.id
		LEFT JOIN organizations o ON o.id = om.org_id
		WHERE u.role = ?
		ORDER BY o.name ASC NULLS LAST, u.name ASC`, role).Scan(&rows).Error
	return rows, err
}

// listAssignmentUsers returns users assigned a custom role, with the
// assignment id so the UI can Remove them, and their org for grouping —
// preferring the assignment's own org_id (role_assignments.org_id) since
// that's the org the role grant actually applies to, falling back to the
// user's org_members organization for platform-scoped assignments.
func listAssignmentUsers(roleID string) ([]RoleUserDTO, error) {
	var rows []RoleUserDTO
	err := database.DB.Raw(`
		SELECT DISTINCT ON (u.id) u.id, u.name, u.email, ra.id AS assignment_id,
		       COALESCE(oa.id::text, ob.id::text, '') AS org_id,
		       COALESCE(oa.name, ob.name, '') AS org_name
		FROM role_assignments ra
		JOIN users u ON u.id = ra.user_id
		LEFT JOIN organizations oa ON oa.id = ra.org_id
		LEFT JOIN org_members om ON om.user_id = u.id
		LEFT JOIN organizations ob ON ob.id = om.org_id
		WHERE ra.role_id = ?
		ORDER BY u.id, ra.created_at DESC`, roleID).Scan(&rows).Error
	return rows, err
}

// ── Org-scoped role view (GET /roles/by-org) ─────────────────────────────────

// countOrgUsersByBuiltinRole counts distinct users, scoped to orgID, whose
// active role_assignment resolves to the given built-in persona — matched
// either via role_id (the seeded system custom_roles row for that persona)
// or via the legacy base_role column, whichever path the assignment used.
func countOrgUsersByBuiltinRole(orgID, persona string) (int64, error) {
	var n int64
	err := database.DB.Raw(`
		SELECT COUNT(DISTINCT ra.user_id)
		FROM role_assignments ra
		LEFT JOIN custom_roles cr ON cr.id = ra.role_id
		WHERE ra.org_id = ?
		  AND (
		        (ra.role_id IS NOT NULL AND cr.is_system = TRUE AND cr.org_id IS NULL AND cr.name = ?)
		     OR (ra.base_role IS NOT NULL AND ra.base_role::text = ?)
		  )`,
		orgID, persona, persona,
	).Scan(&n).Error
	return n, err
}

// ── Organization Members (GET /orgs/:id/members) ────────────────────────────

// listOrgMembers returns every user in org_members for orgID, with each
// user's currently resolved effective role: an org-scoped role_assignment
// first, falling back to a platform-wide (org_id IS NULL) assignment, and
// finally to the raw users.role enum if somehow neither exists.
func listOrgMembers(orgID string) ([]OrgMemberDTO, error) {
	var rows []OrgMemberDTO
	err := database.DB.Raw(`
		SELECT
			u.id::text AS user_id,
			u.name     AS name,
			u.email    AS email,
			COALESCE(
				(SELECT cr.name FROM role_assignments ra
				   JOIN custom_roles cr ON cr.id = ra.role_id
				  WHERE ra.user_id = u.id AND ra.org_id = om.org_id
				  ORDER BY ra.created_at DESC LIMIT 1),
				(SELECT ra.base_role::text FROM role_assignments ra
				  WHERE ra.user_id = u.id AND ra.base_role IS NOT NULL AND ra.org_id = om.org_id
				  ORDER BY ra.created_at DESC LIMIT 1),
				(SELECT cr.name FROM role_assignments ra
				   JOIN custom_roles cr ON cr.id = ra.role_id
				  WHERE ra.user_id = u.id AND ra.org_id IS NULL
				  ORDER BY ra.created_at DESC LIMIT 1),
				(SELECT ra.base_role::text FROM role_assignments ra
				  WHERE ra.user_id = u.id AND ra.base_role IS NOT NULL AND ra.org_id IS NULL
				  ORDER BY ra.created_at DESC LIMIT 1),
				u.role::text
			) AS effective_role,
			-- Same resolution order as effective_role above, but selecting the
			-- underlying PERSONA (cr.base_role) instead of the custom role's own
			-- display name — so a "Secondary PM" member's base_role still reads
			-- "program_manager", not "Secondary PM".
			COALESCE(
				(SELECT cr.base_role FROM role_assignments ra
				   JOIN custom_roles cr ON cr.id = ra.role_id
				  WHERE ra.user_id = u.id AND ra.org_id = om.org_id
				  ORDER BY ra.created_at DESC LIMIT 1),
				(SELECT ra.base_role::text FROM role_assignments ra
				  WHERE ra.user_id = u.id AND ra.base_role IS NOT NULL AND ra.org_id = om.org_id
				  ORDER BY ra.created_at DESC LIMIT 1),
				(SELECT cr.base_role FROM role_assignments ra
				   JOIN custom_roles cr ON cr.id = ra.role_id
				  WHERE ra.user_id = u.id AND ra.org_id IS NULL
				  ORDER BY ra.created_at DESC LIMIT 1),
				(SELECT ra.base_role::text FROM role_assignments ra
				  WHERE ra.user_id = u.id AND ra.base_role IS NOT NULL AND ra.org_id IS NULL
				  ORDER BY ra.created_at DESC LIMIT 1),
				u.role::text
			) AS base_role,
			-- Single source of truth for the Primary/Secondary PM UI tag —
			-- same resolution order (org-scoped assignment first, then
			-- platform-wide), reading the actual column instead of comparing
			-- role names. Defaults FALSE when no assignment row exists at all.
			COALESCE(
				(SELECT ra.is_primary_pm FROM role_assignments ra
				  WHERE ra.user_id = u.id AND ra.org_id = om.org_id
				  ORDER BY ra.created_at DESC LIMIT 1),
				(SELECT ra.is_primary_pm FROM role_assignments ra
				  WHERE ra.user_id = u.id AND ra.org_id IS NULL
				  ORDER BY ra.created_at DESC LIMIT 1),
				FALSE
			) AS is_primary_pm
		FROM org_members om
		JOIN users u ON u.id = om.user_id
		WHERE om.org_id = ?
		ORDER BY u.name ASC`,
		orgID,
	).Scan(&rows).Error
	return rows, err
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
