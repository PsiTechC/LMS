package shared

import (
	"log"

	"github.com/xa-lms/api/internal/rbac"
	"github.com/xa-lms/api/pkg/database"
)

// shadowRoles are the personas currently under shadow evaluation. Only requests
// from these roles are observed; every other role is completely untouched by
// this file. Each role's rbac.Resolve decision is compared against the live
// hardcoded matrix and logged on disagreement - never enforced. Add a role here
// to begin shadow-testing it ahead of a cutover. See ShadowCheck.
var shadowRoles = map[string]bool{
	"program_manager": true, // cut over for programs; still shadowed on non-cutover modules
	"faculty":         true, // cut over for the 6 modules below; still shadowed elsewhere
	"participant":     true, // shadow-only: collecting pre-cutover signal, not yet enforced anywhere
}

// modulesWithScopedShadow lists resources whose gates are now ENFORCED via the
// hybrid resolver (shared.HybridPermission) rather than the matrix - i.e. cut
// over for at least one shadowed role. The global hook skips these resources so
// a cut-over gate isn't also shadow-logged. Shadow stays fully active for every
// other resource, so roles not yet cut over there still accumulate signal.
// (These gates no longer call RequirePermission, so this is also defensive.)
var modulesWithScopedShadow = map[string]bool{
	"programs":    true, // program_manager + faculty (hybrid)
	"coaching":    true, // faculty (hybrid)
	"sessions":    true, // faculty (hybrid)
	"submissions": true, // faculty (hybrid)
	"discussions": true, // faculty (hybrid)
	"analytics":   true, // faculty (hybrid)
}

// ShadowCheck runs the not-yet-enforced rbac.Resolve path IN PARALLEL with the
// live hardcoded decision, purely to observe whether they would agree. It NEVER
// affects the request outcome - the caller has already computed and will act on
// `realAllow`; this function only records/logs.
//
// It is gated to a single role (shadowRole) so no other persona's request does
// any extra work. All work is best-effort and fully guarded: any error or panic
// in the shadow path is swallowed so it can never surface to a real request.
func ShadowCheck(userID, role, resource, action string, realAllow bool) {
	if !shadowRoles[role] {
		return // one cheap map lookup for every non-shadowed request; nothing else
	}
	if modulesWithScopedShadow[resource] {
		// This module has its own scoped shadow middleware (e.g. programs), which
		// already logs this check. Skip here to avoid double-logging. Shadow-mode
		// stays active for program_manager on every other module.
		return
	}
	// Fire-and-forget: the observation runs off the request goroutine so it adds
	// zero latency and can never affect the request. Primitives are copied by
	// value into the closure, so this is safe after the handler returns.
	go func() {
		defer func() { _ = recover() }() // shadow path must never crash anything

		access, err := rbac.Resolve(rbac.GormStore{}, role, userID)
		if err != nil {
			// Resolver error is itself signal - note it, disturb nothing.
			log.Printf("[rbac shadow-mode] resolver error for user=%s %s:%s - %v", userID, resource, action, err)
			return
		}
		shadowAllow := access.Can(resource, action)
		agreed := shadowAllow == realAllow

		// Persist every shadow-checked request so cutover confidence is measurable.
		database.DB.Exec(`
			INSERT INTO rbac_shadow_checks (user_id, role, resource, action, real_allow, shadow_allow, agreed)
			VALUES (?::uuid, ?, ?, ?, ?, ?, ?)
		`, userID, role, resource, action, realAllow, shadowAllow, agreed)

		if !agreed {
			log.Printf("shadow-mode diff: %s resource=%s action=%s user=%s real_allow=%v shadow_allow=%v",
				role, resource, action, userID, realAllow, shadowAllow)
		}
	}()
}
