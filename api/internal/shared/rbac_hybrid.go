package shared

// Hybrid RBAC enforcement for the persona cutover.
//
// HybridPermission is the drop-in replacement for RequirePermission on gates
// that have been cut over to the dynamic resolver for one or more roles. For a
// listed resolverRole it decides via rbac.Resolve → Access.Can; for EVERY other
// role it uses the static matrix (Can) exactly as before. Since each cutover
// role's system role is seeded from the matrix (PermissionsForRole), a correctly
// backfilled role gets an identical allow/deny - same permissions, different
// mechanism - and untouched roles are byte-for-byte unchanged.

import (
	"log"

	"github.com/labstack/echo/v4"
	"github.com/xa-lms/api/internal/rbac"
)

// HybridPermission enforces resource:action. Requests whose role is in
// resolverRoles are decided by the resolver; all other roles keep the matrix.
func HybridPermission(resource, action string, resolverRoles ...string) echo.MiddlewareFunc {
	roleSet := make(map[string]bool, len(resolverRoles))
	for _, r := range resolverRoles {
		roleSet[r] = true
	}
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			claims, ok := c.Get("claims").(*JWTClaims)
			if !ok || claims == nil {
				return Forbidden(c)
			}

			var allowed bool
			var via string
			if roleSet[claims.Role] {
				access, err := rbac.Resolve(rbac.GormStore{}, claims.Role, claims.UserID)
				if err != nil {
					// Resolver unavailable (transient DB error): fall back to the
					// matrix so availability/behavior are preserved. Logged loudly.
					log.Printf("[rbac hybrid] resolver error user=%s role=%s %s:%s - matrix fallback: %v",
						claims.UserID, claims.Role, resource, action, err)
					allowed = Can(claims.Role, resource, action)
					via = "matrix-fallback"
				} else {
					allowed = access.Can(resource, action)
					via = "resolver"
				}
			} else {
				// Unchanged hardcoded matrix check for every non-cutover role.
				allowed = Can(claims.Role, resource, action)
				via = "matrix"
			}

			if !allowed {
				// Diagnostic: not previously logged. A resolver denial here means
				// the user's role_assignments/custom_roles row (not necessarily the
				// role_assignment's *base_role* the JWT claims) lacked this grant -
				// see rbac.GormStore.ResolvedPermissions, which joins on user_id only.
				log.Printf("[rbac hybrid] DENY user=%s role=%s %s:%s via=%s",
					claims.UserID, claims.Role, resource, action, via)
				return Forbidden(c)
			}
			return next(c)
		}
	}
}
