package roles

import (
	"testing"

	"github.com/xa-lms/api/internal/shared"
)

// TestInheritedRoles verifies permission inheritance flows upward:
// Super Admin > Program Manager > Faculty > Coach > Participant.
func TestInheritedRoles(t *testing.T) {
	// Two roles share tier 0 (participant + participant_retailer) and two share
	// the top tier (superadmin + superadmin_secondary), so counts include both.
	cases := map[string]int{
		shared.RoleParticipant:    2, // participant + participant_retailer
		shared.RoleCoach:          3, // + coach
		shared.RoleFaculty:        4, // + faculty
		shared.RoleProgramManager: 5, // + program_manager
		shared.RoleSuperAdmin:     7, // all seven
	}
	for role, want := range cases {
		got := len(inheritedRoles(role))
		if got != want {
			t.Errorf("inheritedRoles(%q): got %d roles, want %d", role, got, want)
		}
	}
}

// TestInheritedRolesUnknownDefaultsToParticipant guards the fallback path.
func TestInheritedRolesUnknownDefaultsToParticipant(t *testing.T) {
	got := inheritedRoles("nonexistent")
	if len(got) != 1 || got[0] != shared.RoleParticipant {
		t.Errorf("unknown base role should fall back to [participant], got %v", got)
	}
}

// TestEffectivePermissionsUnionsGrants ensures explicit grants are added on top
// of the inherited base-persona permissions and the result is de-duplicated.
func TestEffectivePermissionsUnionsGrants(t *testing.T) {
	grant := "custom_resource:do_thing"
	perms := effectivePermissions(shared.RoleFaculty, []string{grant})

	found := false
	seen := map[string]bool{}
	for _, p := range perms {
		if seen[p] {
			t.Errorf("effectivePermissions returned duplicate %q", p)
		}
		seen[p] = true
		if p == grant {
			found = true
		}
	}
	if !found {
		t.Errorf("explicit grant %q missing from effective permissions", grant)
	}

	// A faculty custom role must inherit at least the participant-level grants,
	// so the effective set is strictly larger than the lone explicit grant.
	if len(perms) <= 1 {
		t.Errorf("expected inherited permissions beyond the explicit grant, got %d", len(perms))
	}
}

// TestEffectivePermissionsHigherRoleSupersetsLower confirms the hierarchy:
// a superadmin-based role's effective set is a superset of a participant's.
func TestEffectivePermissionsHigherRoleSupersetsLower(t *testing.T) {
	low := effectivePermissions(shared.RoleParticipant, nil)
	high := effectivePermissions(shared.RoleSuperAdmin, nil)

	highSet := map[string]bool{}
	for _, p := range high {
		highSet[p] = true
	}
	for _, p := range low {
		if !highSet[p] {
			t.Errorf("superadmin effective set missing participant permission %q", p)
		}
	}
	if len(high) <= len(low) {
		t.Errorf("superadmin (%d) should have more permissions than participant (%d)", len(high), len(low))
	}
}
