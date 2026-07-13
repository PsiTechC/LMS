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
