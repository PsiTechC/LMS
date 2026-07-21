package rbac

import (
	"errors"
	"sort"
	"testing"
)

// fakeStore is an in-memory Store for isolated unit tests (no database).
type fakeStore struct {
	has     bool
	hasErr  error
	perms   []string
	permErr error
}

func (f fakeStore) HasAssignments(string) (bool, error)         { return f.has, f.hasErr }
func (f fakeStore) ResolvedPermissions(string) ([]string, error) { return f.perms, f.permErr }

func TestResolve_SuperadminNoAssignments_FullAccess(t *testing.T) {
	acc, err := Resolve(fakeStore{has: false}, "superadmin", "u1")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if !acc.Full {
		t.Fatal("expected Full access for superadmin with no assignments")
	}
	if !acc.Can("anything", "at-all") {
		t.Fatal("Full access should allow any resource:action")
	}
}

func TestResolve_SuperadminWithAssignments_ResolvesFromRoles(t *testing.T) {
	// A superadmin that HAS an assignment must NOT get Full - it resolves from
	// role_assignments → custom_roles like anyone else.
	acc, err := Resolve(fakeStore{has: true, perms: []string{"programs:read"}}, "superadmin", "u1")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if acc.Full {
		t.Fatal("superadmin WITH assignments must not be Full")
	}
	if !acc.Can("programs", "read") {
		t.Fatal("expected resolved programs:read")
	}
	if acc.Can("programs", "delete") {
		t.Fatal("did not expect programs:delete")
	}
}

func TestResolve_NonSuperadmin_ResolvesFromRoles(t *testing.T) {
	acc, err := Resolve(fakeStore{has: true, perms: []string{"sessions:read", "submissions:grade"}}, "faculty", "u2")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if acc.Full {
		t.Fatal("non-superadmin must never be Full")
	}
	if !acc.Can("sessions", "read") || !acc.Can("submissions", "grade") {
		t.Fatal("expected resolved faculty permissions")
	}
	if acc.Can("organizations", "delete") {
		t.Fatal("unexpected organizations:delete")
	}
}

func TestResolve_NonSuperadminNoAssignments_EmptyAccess(t *testing.T) {
	// The superadmin short-circuit must not apply; with no perms the user has none.
	acc, err := Resolve(fakeStore{has: false, perms: nil}, "participant", "u3")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if acc.Full {
		t.Fatal("participant must never be Full")
	}
	if acc.Can("programs", "read") {
		t.Fatal("expected no permissions")
	}
	if len(acc.Permissions()) != 0 {
		t.Fatalf("expected 0 permissions, got %d", len(acc.Permissions()))
	}
}

func TestResolve_PermissionsDeduped(t *testing.T) {
	acc, err := Resolve(fakeStore{has: true, perms: []string{"a:b", "a:b", "c:d", ""}}, "coach", "u4")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	got := acc.Permissions()
	sort.Strings(got)
	if len(got) != 2 || got[0] != "a:b" || got[1] != "c:d" {
		t.Fatalf("expected deduped [a:b c:d], got %v", got)
	}
}

// TestResolve_UnionsPermissionsAcrossDualRoleAssignments is the crux test for
// the faculty+coach dual-role feature: when a user holds TWO role_assignments
// rows (e.g. base_role=faculty and base_role=coach), GormStore.ResolvedPermissions
// joins role_assignments -> custom_roles with no LIMIT, so it returns one
// permissions array per matched row and unions them all (see the `set` map in
// resolve.go) - the caller-visible contract is that Access.Can allows a
// permission granted by EITHER role, not just the JWT's primary role. This
// simulates that already-unioned result (the part GormStore's SQL performs)
// and asserts the Access built from it grants permissions unique to each
// contributing role.
func TestResolve_UnionsPermissionsAcrossDualRoleAssignments(t *testing.T) {
	facultyOnly := []string{"sessions:read", "sessions:update", "coaching:read", "coaching:write"}
	coachOnly := []string{"coaching:read", "coaching:write", "coaching:self_read"}
	union := append(append([]string{}, facultyOnly...), coachOnly...)

	acc, err := Resolve(fakeStore{has: true, perms: union}, "faculty", "u7")
	if err != nil {
		t.Fatalf("unexpected err: %v", err)
	}
	if acc.Full {
		t.Fatal("dual-role faculty+coach user must not be Full")
	}
	// Faculty-only grant, unaffected by the added coach assignment.
	if !acc.Can("sessions", "update") {
		t.Fatal("expected faculty-only permission sessions:update to still be granted")
	}
	// Coach-only grant, gained purely from the second role_assignments row.
	if !acc.Can("coaching", "self_read") {
		t.Fatal("expected coach-only permission coaching:self_read to be granted via the additional role assignment")
	}
	// Shared grant present in both roles.
	if !acc.Can("coaching", "write") {
		t.Fatal("expected coaching:write (granted by both roles) to be present")
	}
	// Never granted by either role.
	if acc.Can("billing", "manage") {
		t.Fatal("did not expect billing:manage from either role")
	}
}

func TestResolve_PropagatesErrors(t *testing.T) {
	sentinel := errors.New("boom")
	if _, err := Resolve(fakeStore{hasErr: sentinel}, "superadmin", "u5"); !errors.Is(err, sentinel) {
		t.Fatal("expected HasAssignments error to propagate")
	}
	if _, err := Resolve(fakeStore{has: true, permErr: sentinel}, "faculty", "u6"); !errors.Is(err, sentinel) {
		t.Fatal("expected ResolvedPermissions error to propagate")
	}
}
