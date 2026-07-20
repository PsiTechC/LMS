// Package rbac contains additive, not-yet-wired groundwork for resolving a
// user's effective permissions from the custom_roles / role_assignments tables.
//
// IMPORTANT: As of this pass nothing in the application calls this package. It
// is inert scaffolding - no existing handler, middleware, or route references
// it. Wiring it in (module by module, replacing hardcoded role checks) is a
// deliberate follow-up decision, not part of this change.
package rbac

import (
	"encoding/json"

	"github.com/xa-lms/api/pkg/database"
)

// roleSuperAdmin is duplicated locally (rather than imported from shared) to keep
// this package standalone and dependency-light. It must match the "superadmin"
// value used by the auth/JWT layer.
const roleSuperAdmin = "superadmin"

// Access is the resolved permission decision for a user. Full == true means
// unrestricted access (the bootstrap superadmin case); otherwise Perms holds the
// exact "resource:action" grants resolved from the user's role assignments.
type Access struct {
	Full  bool
	perms map[string]bool
}

// Can reports whether the access allows a given resource:action. A Full access
// allows everything; otherwise it checks the resolved permission set.
func (a Access) Can(resource, action string) bool {
	if a.Full {
		return true
	}
	return a.perms[resource+":"+action]
}

// Permissions returns the resolved "resource:action" grants (empty for Full,
// since Full is unrestricted and not enumerated).
func (a Access) Permissions() []string {
	out := make([]string, 0, len(a.perms))
	for k := range a.perms {
		out = append(out, k)
	}
	return out
}

// Store abstracts the two reads Resolve needs, so the resolution logic is unit
// testable in isolation without a live database (tests inject a fake).
type Store interface {
	// HasAssignments reports whether ANY role_assignments row exists for userID.
	HasAssignments(userID string) (bool, error)
	// ResolvedPermissions returns the union of "resource:action" grants from the
	// user's ACTIVE role assignments, following role_assignments → custom_roles
	// (custom role by role_id, or the seeded system role matching base_role).
	ResolvedPermissions(userID string) ([]string, error)
}

// Resolve computes a user's effective access.
//
//   - If userRole == "superadmin" AND the user has NO role_assignments rows,
//     access is Full (bootstrap superadmin - unrestricted).
//   - Otherwise, permissions are resolved from role_assignments → custom_roles.
//
// This is the single entry point described by the groundwork task. It is not
// called anywhere yet.
func Resolve(store Store, userRole, userID string) (Access, error) {
	if userRole == roleSuperAdmin {
		has, err := store.HasAssignments(userID)
		if err != nil {
			return Access{}, err
		}
		if !has {
			return Access{Full: true}, nil
		}
	}

	perms, err := store.ResolvedPermissions(userID)
	if err != nil {
		return Access{}, err
	}
	set := make(map[string]bool, len(perms))
	for _, p := range perms {
		if p != "" {
			set[p] = true
		}
	}
	return Access{perms: set}, nil
}

// SecondaryBaseRoles returns the distinct base_role values (as plain persona
// strings, e.g. "coach") from every ACTIVE role_assignments row for userID
// that is NOT primaryRole - i.e. every additional persona this user holds on
// top of their primary users.role, such as a faculty user who also holds the
// "coach" persona via pmGrantCoachRoleService / POST /role_assignments.
// Scoped to platform-wide assignments (org_id IS NULL) plus assignments for
// orgID (pass "" to include only platform-wide ones). Unlike Resolve/
// ResolvedPermissions this is UI-facing metadata only - it is never used for
// an authorization decision (that's always rbac.Resolve).
func SecondaryBaseRoles(userID, orgID, primaryRole string) ([]string, error) {
	var roles []string
	err := database.DB.Raw(`
		SELECT DISTINCT base_role::text
		FROM role_assignments
		WHERE user_id = ?::uuid
		  AND base_role IS NOT NULL
		  AND base_role::text <> ?
		  AND (org_id IS NULL OR org_id = NULLIF(?, '')::uuid)
		  AND (valid_from IS NULL OR valid_from <= NOW())
		  AND (valid_until IS NULL OR valid_until >= NOW())
	`, userID, primaryRole, orgID).Scan(&roles).Error
	return roles, err
}

// ── Concrete gorm-backed Store (also inert; provided for the future wiring
// pass so callers don't have to hand-write these queries) ─────────────────────

// GormStore implements Store against the shared database.DB connection. It reads
// only; it never writes. Nothing constructs or calls it yet.
type GormStore struct{}

// HasAssignments implements Store.
func (GormStore) HasAssignments(userID string) (bool, error) {
	var exists bool
	err := database.DB.Raw(
		`SELECT EXISTS(SELECT 1 FROM role_assignments WHERE user_id = ?::uuid)`, userID,
	).Scan(&exists).Error
	return exists, err
}

// ResolvedPermissions implements Store. It unions the permissions JSONB of every
// custom_roles row reachable from the user's ACTIVE assignments - matched either
// directly by role_id, or (for base_role assignments) by the seeded platform
// system role whose name equals the base_role.
func (GormStore) ResolvedPermissions(userID string) ([]string, error) {
	var raws []string
	err := database.DB.Raw(`
		SELECT cr.permissions::text
		FROM role_assignments ra
		JOIN custom_roles cr ON (
		        (ra.role_id IS NOT NULL AND cr.id = ra.role_id)
		     OR (ra.base_role IS NOT NULL AND cr.is_system = TRUE AND cr.org_id IS NULL
		         AND cr.name = ra.base_role::text)
		)
		WHERE ra.user_id = ?::uuid
		  AND (ra.valid_from IS NULL OR ra.valid_from <= NOW())
		  AND (ra.valid_until IS NULL OR ra.valid_until >= NOW())
	`, userID).Scan(&raws).Error
	if err != nil {
		return nil, err
	}

	set := map[string]bool{}
	for _, raw := range raws {
		var perms []string
		if json.Unmarshal([]byte(raw), &perms) == nil {
			for _, p := range perms {
				set[p] = true
			}
		}
	}
	out := make([]string, 0, len(set))
	for k := range set {
		out = append(out, k)
	}
	return out, nil
}
