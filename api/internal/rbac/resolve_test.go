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
	// A superadmin that HAS an assignment must NOT get Full — it resolves from
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

func TestResolve_PropagatesErrors(t *testing.T) {
	sentinel := errors.New("boom")
	if _, err := Resolve(fakeStore{hasErr: sentinel}, "superadmin", "u5"); !errors.Is(err, sentinel) {
		t.Fatal("expected HasAssignments error to propagate")
	}
	if _, err := Resolve(fakeStore{has: true, permErr: sentinel}, "faculty", "u6"); !errors.Is(err, sentinel) {
		t.Fatal("expected ResolvedPermissions error to propagate")
	}
}
