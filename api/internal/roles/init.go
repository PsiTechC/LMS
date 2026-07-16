package roles

import (
	"encoding/json"
	"log"

	"github.com/xa-lms/api/internal/shared"
	"github.com/xa-lms/api/pkg/database"
)

// systemRoleReconcileTargets are the 4 platform-global seeded roles
// (is_system=TRUE, org_id IS NULL) whose stored permissions this
// reconciliation keeps in sync with the live matrix.
var systemRoleReconcileTargets = []string{
	shared.RoleProgramManager,
	shared.RoleFaculty,
	shared.RoleCoach,
	shared.RoleParticipant,
}

// systemRoleSeedMeta carries the display metadata migration 000035 used for
// each seeded row (name, description, color) — needed only for the INSERT
// path below, since UPDATE (reconciliation) doesn't touch these columns.
var systemRoleSeedMeta = map[string]struct{ description, color string }{
	shared.RoleProgramManager: {"System role: Program Manager — current platform access", "#1C2551"},
	shared.RoleFaculty:        {"System role: Faculty — current platform access", "#6B73BF"},
	shared.RoleCoach:          {"System role: Coach — current platform access", "#6B73BF"},
	shared.RoleParticipant:    {"System role: Participant — current platform access", "#EF4E24"},
}

// seedMissingSystemRoles inserts any of the 4 platform-global system roles
// that don't yet exist in custom_roles.
//
// WHY THIS EXISTS: migration 000035_seed_system_roles was applied manually,
// out-of-band, directly against the shared dev DB (see that file's header
// comment) — it never ran as idempotent Go boot code, violating this repo's
// own migration convention (CLAUDE.md → Database Migrations: "schema is
// created and evolved by Go code that runs when the API boots"). Any other
// environment pointed at a DB that never had that manual apply run (a fresh
// local Postgres, a new staging DB, etc.) is silently missing these rows,
// which breaks every role_assignments-based grant for that environment —
// including the faculty+coach dual-role feature, since rbac.Resolve can't
// grant permissions for a system role that doesn't exist. This makes the
// seed self-healing on every boot, same as the reconciliation below.
//
// ON CONFLICT DO NOTHING against the same unique index migration 000035
// documents, so this is a no-op wherever the row already exists.
func seedMissingSystemRoles() {
	for _, role := range systemRoleReconcileTargets {
		meta, ok := systemRoleSeedMeta[role]
		if !ok {
			continue
		}
		perms := shared.PermissionsForRole(role)
		permsJSON, err := json.Marshal(perms)
		if err != nil {
			log.Printf("[roles] failed to marshal seed permissions for role=%s: %v", role, err)
			continue
		}
		res := database.DB.Exec(`
			INSERT INTO custom_roles (org_id, name, description, base_role, color, permissions, is_system)
			VALUES (NULL, ?, ?, ?, ?, ?::jsonb, TRUE)
			ON CONFLICT (COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)) DO NOTHING
		`, role, meta.description, role, meta.color, string(permsJSON))
		if res.Error != nil {
			log.Printf("[roles] system role seed failed for role=%s: %v", role, res.Error)
		} else if res.RowsAffected > 0 {
			log.Printf("[roles] seeded missing system role=%s", role)
		}
	}
}

// InitSchema reconciles each seeded system role's stored permissions against
// the live shared/rbac.go matrix, additively, on every boot.
//
// WHY THIS EXISTS — do not remove without understanding this history:
// migration 000035_seed_system_roles took a ONE-TIME static snapshot of
// PermissionsForRole() and wrote it into custom_roles.permissions. Nothing
// kept that snapshot in sync with the live matrix afterward. Every
// permission added to rbac.go since then (zoom:manage, zoom:join,
// feedback_360:assign, feedback_360:configure, ai_coach:use) silently
// vanished for any user resolved via role_assignments → these seeded rows,
// because rbac.Resolve (used by shared.HybridPermission) reads ONLY the
// stored snapshot — it never falls back to the live matrix except on a
// transient resolver error. This caused a real production bug: Faculty and
// Coach users got 403s on the new Zoom OAuth connect route despite the
// matrix having always granted it to them. See migration
// 000046_zoom_permissions_backfill for the one-time fix; this function is
// what makes that fix permanent and self-healing going forward.
//
// This is ADDITIVE-ONLY by design: it unions the live matrix into the
// stored permissions column, never overwrites/replaces it. An admin who
// manually granted an extra permission on one of these system roles keeps
// it forever — this only adds keys that the live matrix grants and the row
// is missing; it never removes a key. It is scoped to exactly
// is_system=TRUE AND org_id IS NULL rows, so it can never touch an org's
// custom roles or a per-user role override (owner_user_id rows).
//
// Do NOT "clean this up" into a one-time migration — the entire point is
// that it re-runs on every boot, so the next permission added to rbac.go is
// backfilled automatically instead of silently regressing the same way.
func InitSchema() {
	seedMissingSystemRoles()

	for _, role := range systemRoleReconcileTargets {
		perms := shared.PermissionsForRole(role)
		if len(perms) == 0 {
			continue
		}
		permsJSON, err := json.Marshal(perms)
		if err != nil {
			log.Printf("[roles] failed to marshal live permissions for role=%s: %v", role, err)
			continue
		}
		res := database.DB.Exec(`
			UPDATE custom_roles
			SET permissions = (
				SELECT jsonb_agg(DISTINCT elem)
				FROM jsonb_array_elements(permissions || ?::jsonb) AS t(elem)
			), updated_at = NOW()
			WHERE is_system = TRUE AND org_id IS NULL AND name = ?
			  AND NOT (permissions @> ?::jsonb)
		`, string(permsJSON), role, string(permsJSON))
		if res.Error != nil {
			log.Printf("[roles] permission reconciliation failed for role=%s: %v", role, res.Error)
		} else if res.RowsAffected > 0 {
			log.Printf("[roles] reconciled seeded system role=%s with newly-added matrix permissions", role)
		}
	}
}
