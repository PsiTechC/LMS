package roles

import (
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/audit"
	"github.com/xa-lms/api/internal/rbac"
	"github.com/xa-lms/api/internal/shared"
)

var errForbidden = errors.New("only superadmin can manage roles and org access rules")

// myEffectivePermissionsService returns the CALLER's own effective permission
// set using the resolver semantic (a role assignment REPLACES the base persona,
// so a "Participant Retail" assignment restricts rather than adds). Falls back to
// the base persona matrix when the user has no assignment, so un-assigned users
// (the common case) are never locked out. Superadmin without an assignment is
// Full. Used by the frontend to gate nav tabs by permission.
func myEffectivePermissionsService(role, userID string) (full bool, perms []string) {
	access, err := rbac.Resolve(rbac.GormStore{}, role, userID)
	if err == nil {
		if access.Full {
			return true, []string{}
		}
		if p := access.Permissions(); len(p) > 0 {
			sort.Strings(p)
			return false, p
		}
	}
	// No assignment, empty resolution, or resolver error → base persona (matrix).
	if role == shared.RoleSuperAdmin {
		return true, []string{}
	}
	base := shared.PermissionsForRole(role)
	sort.Strings(base)
	return false, base
}

// requireSuperadmin mirrors the existing guard pattern in users/service.go —
// defense-in-depth on top of the route middleware.
func requireSuperadmin(callerRole string) error {
	if callerRole != shared.RoleSuperAdmin {
		return errForbidden
	}
	return nil
}

// ── Permission inheritance ────────────────────────────────────────────────────

// inheritedRoles returns base and every persona ranked below it, so a role
// inherits all permissions of lower roles (Super Admin > PM > Faculty > Participant).
func inheritedRoles(base string) []string {
	// "none" (or empty) = no inheritance; effective permissions are just the
	// role's explicit grants.
	if base == "" || base == "none" {
		return nil
	}
	rank, ok := shared.RoleHierarchy[base]
	if !ok {
		return []string{shared.RoleParticipant}
	}
	var out []string
	for role, r := range shared.RoleHierarchy {
		if r <= rank {
			out = append(out, role)
		}
	}
	return out
}

// effectivePermissions unions the inherited base-persona permissions with the
// role's explicit granular grants, returning a sorted, de-duplicated set.
func effectivePermissions(base string, grants []string) []string {
	set := map[string]bool{}
	for _, r := range inheritedRoles(base) {
		for _, p := range shared.PermissionsForRole(r) {
			set[p] = true
		}
	}
	for _, g := range grants {
		if g != "" {
			set[g] = true
		}
	}
	return sortedKeys(set)
}

func sortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

func validBaseRole(role string) bool {
	if role == "none" {
		return true
	}
	_, ok := shared.RoleHierarchy[role]
	return ok
}

// ── Permission grid (module × action) ───────────────────────────────────────

var gridModules = []string{
	"dashboard", "programs", "participants", "assessments", "coaching",
	"analytics", "communications", "billing", "platform_config", "users",
}
var gridActions = []string{"read", "create", "update", "delete", "admin"}

// moduleResource maps a grid module to the closest real RBAC resource, so a
// built-in persona's grid can be derived honestly from shared.Can(). Modules
// with no backing resource (dashboard/billing/platform_config) resolve only for
// Super Admin.
var moduleResource = map[string]string{
	"programs":       "programs",
	"participants":   "cohorts",
	"assessments":    "submissions",
	"coaching":       "coaching",
	"analytics":      "analytics",
	"communications": "communications",
	"users":          "users",
}
var actionKey = map[string]string{
	"read": "read", "create": "create", "update": "update", "delete": "delete", "admin": "manage",
}

func emptyGrid() map[string]map[string]bool {
	g := make(map[string]map[string]bool, len(gridModules))
	for _, m := range gridModules {
		g[m] = make(map[string]bool, len(gridActions))
		for _, a := range gridActions {
			g[m][a] = false
		}
	}
	return g
}

// gridForBuiltin derives a built-in persona's grid from real Can() checks.
func gridForBuiltin(role string) map[string]map[string]bool {
	g := emptyGrid()
	if role == shared.RoleSuperAdmin {
		for _, m := range gridModules {
			for _, a := range gridActions {
				g[m][a] = true
			}
		}
		return g
	}
	if role == "observer" {
		for _, m := range gridModules {
			g[m]["read"] = true // read-only across the board
		}
		return g
	}
	for _, m := range gridModules {
		res := moduleResource[m]
		if res == "" {
			continue
		}
		for _, a := range gridActions {
			if shared.Can(role, res, actionKey[a]) {
				g[m][a] = true
			}
		}
	}
	return g
}

// gridForCustom builds a grid from a custom role's stored "module:action" grants.
func gridForCustom(grants []string) map[string]map[string]bool {
	g := emptyGrid()
	for _, p := range grants {
		parts := strings.SplitN(p, ":", 2)
		if len(parts) != 2 {
			continue
		}
		if row, ok := g[parts[0]]; ok {
			if _, ok := row[parts[1]]; ok {
				row[parts[1]] = true
			}
		}
	}
	return g
}

func countGrid(g map[string]map[string]bool) int {
	n := 0
	for _, row := range g {
		for _, on := range row {
			if on {
				n++
			}
		}
	}
	return n
}

// ── Custom Roles ──────────────────────────────────────────────────────────────

// errSuperadminBaseRoleNotAllowed guards custom-role create/edit against
// base_role="superadmin". Only program_manager, faculty, coach, or
// participant may back a NEW or edited custom role through this flow.
// Existing custom roles already built on superadmin (e.g. "Super Admin
// (Secondary)") are untouched by this — it only blocks future writes that
// explicitly set base_role to superadmin.
var errSuperadminBaseRoleNotAllowed = errors.New("base_role cannot be superadmin for a custom role; use program_manager, faculty, coach, or participant")

// errCustomRoleCreationDisabled blocks POST /roles entirely, for every
// caller and every base_role. This closes only the "create new custom role"
// path — existing custom roles (Participant Retail, Super Admin (Secondary))
// remain fully editable via PATCH /roles/:id and assignable as before; this
// does not touch updateRoleService, deleteRoleService, or the superadmin
// bootstrap in rbac.Resolve().
var errCustomRoleCreationDisabled = errors.New("creating new custom roles is currently disabled; existing custom roles remain fully editable")

func createRoleService(req CreateRoleRequest, callerRole, callerID string) (*CustomRoleDTO, error) {
	return nil, errCustomRoleCreationDisabled
}

// listBasePersonasService returns the four built-in system personas with their
// real permission sets derived from the RBAC matrix. Read-only (not editable /
// deletable) — they back every user's base role.
func listBasePersonasService(callerRole string) ([]CustomRoleDTO, error) {
	if err := requireSuperadmin(callerRole); err != nil {
		return nil, err
	}
	personas := []struct {
		role, label, color, desc string
		enum                     bool // true if backed by the users.role enum (countable)
	}{
		{shared.RoleSuperAdmin, "Super Admin", "#0052CC", "Full platform access across all organizations.", true},
		{shared.RoleProgramManager, "Program Manager (Business Admin)", "#1C2551", "Manage programs, cohorts, analytics and comms for their org.", true},
		{shared.RoleFaculty, "Faculty", "#6B73BF", "Run sessions, grade submissions, manage coaching.", true},
		{shared.RoleParticipant, "Participant", "#EF4E24", "Access assigned learning content, assessments, and coaching.", true},
		{"observer", "Observer", "#8b90a7", "Read-only access to dashboards and reports; no editing.", false},
	}
	out := make([]CustomRoleDTO, 0, len(personas))
	for _, p := range personas {
		grid := gridForBuiltin(p.role)
		var count int64
		if p.enum {
			count, _ = countUsersByBaseRole(p.role)
		}
		out = append(out, CustomRoleDTO{
			ID:             p.role,
			Name:           p.label,
			Description:    p.desc,
			BaseRole:       p.role,
			Color:          p.color,
			Permissions:    []string{},
			Effective:      []string{},
			PermissionGrid: grid,
			UserCount:      int(count),
			IsSystem:       true,
		})
	}
	return out, nil
}

// rolesSummaryService computes the four summary-card totals from real data.
func rolesSummaryService(callerRole string) (*RolesSummaryDTO, error) {
	if err := requireSuperadmin(callerRole); err != nil {
		return nil, err
	}
	customCount, err := countAllCustomRoles()
	if err != nil {
		return nil, err
	}
	// Built-in personas: 4 enum-backed + Observer.
	builtInUsers := int64(0)
	for _, role := range []string{shared.RoleSuperAdmin, shared.RoleProgramManager, shared.RoleFaculty, shared.RoleParticipant} {
		n, _ := countUsersByBaseRole(role)
		builtInUsers += n
	}
	assignedUsers, _ := countAllAssignmentUsers()

	return &RolesSummaryDTO{
		TotalRoles:         5 + int(customCount), // 5 built-in personas + custom
		CustomRoles:        int(customCount),
		TotalUsersAssigned: int(builtInUsers + assignedUsers),
		PermissionsDefined: shared.PermissionKeyCount(),
	}, nil
}

// roleUsersService lists the users under a role. Built-in personas list users
// by their enum role (read-only); custom roles list their assignees (removable).
func roleUsersService(roleID, callerRole string) ([]RoleUserDTO, error) {
	if err := requireSuperadmin(callerRole); err != nil {
		return nil, err
	}
	if isBuiltinRoleID(roleID) {
		if roleID == "observer" {
			return []RoleUserDTO{}, nil // not enum-backed → no users yet
		}
		return listUsersByBaseRole(roleID)
	}
	return listAssignmentUsers(roleID)
}

func isBuiltinRoleID(id string) bool {
	switch id {
	case shared.RoleSuperAdmin, shared.RoleProgramManager, shared.RoleFaculty, shared.RoleParticipant, "observer":
		return true
	}
	return false
}

func listRolesService(orgID, callerRole string) ([]CustomRoleDTO, error) {
	if err := requireSuperadmin(callerRole); err != nil {
		return nil, err
	}
	rows, err := listRoles(orgID)
	if err != nil {
		return nil, err
	}
	out := make([]CustomRoleDTO, 0, len(rows))
	for _, r := range rows {
		dto := roleToDTO(r)
		if n, err := countAssignmentUsers(r.ID.String()); err == nil {
			dto.UserCount = int(n)
		}
		out = append(out, *dto)
	}
	return out, nil
}

func getRoleService(id, callerRole string) (*CustomRoleDTO, error) {
	if err := requireSuperadmin(callerRole); err != nil {
		return nil, err
	}
	r, err := getRoleByID(id)
	if err != nil {
		return nil, err
	}
	dto := roleToDTO(*r)
	if n, err := countAssignmentUsers(r.ID.String()); err == nil {
		dto.UserCount = int(n)
	}
	return dto, nil
}

func updateRoleService(id string, req UpdateRoleRequest, callerRole string) (*CustomRoleDTO, error) {
	if err := requireSuperadmin(callerRole); err != nil {
		return nil, err
	}
	fields := map[string]any{}
	if req.Name != nil {
		fields["name"] = *req.Name
	}
	if req.Description != nil {
		fields["description"] = *req.Description
	}
	if req.BaseRole != nil {
		if *req.BaseRole == shared.RoleSuperAdmin {
			return nil, errSuperadminBaseRoleNotAllowed
		}
		if !validBaseRole(*req.BaseRole) {
			return nil, errors.New("base_role must be one of none, superadmin, program_manager, faculty, participant")
		}
		fields["base_role"] = *req.BaseRole
	}
	if req.Color != nil {
		fields["color"] = *req.Color
	}
	if req.Permissions != nil {
		permsJSON, err := marshalPerms(*req.Permissions)
		if err != nil {
			return nil, err
		}
		fields["permissions"] = permsJSON
	}
	if len(fields) == 0 {
		return nil, errors.New("no fields to update")
	}
	fields["updated_at"] = time.Now()
	if err := updateRole(id, fields); err != nil {
		return nil, err
	}
	return getRoleService(id, callerRole)
}

func deleteRoleService(id, callerRole string) error {
	if err := requireSuperadmin(callerRole); err != nil {
		return err
	}
	return deleteRole(id)
}

// ── Role Assignments ──────────────────────────────────────────────────────────

func createAssignmentService(req CreateAssignmentRequest, callerRole, callerID string) (*RoleAssignmentDTO, error) {
	if err := requireSuperadmin(callerRole); err != nil {
		return nil, err
	}
	if req.UserID == "" {
		return nil, errors.New("user_id is required")
	}
	if (req.RoleID == "") == (req.BaseRole == "") {
		return nil, errors.New("exactly one of role_id or base_role must be supplied")
	}

	uid, err := uuid.Parse(req.UserID)
	if err != nil {
		return nil, errors.New("invalid user_id")
	}
	a := &RoleAssignment{UserID: uid}

	if req.RoleID != "" {
		rid, err := parseUUIDPtr(req.RoleID)
		if err != nil {
			return nil, errors.New("invalid role_id")
		}
		if _, err := getRoleByID(req.RoleID); err != nil {
			return nil, errors.New("role_id does not exist")
		}
		a.RoleID = rid
	} else {
		if !validBaseRole(req.BaseRole) {
			return nil, errors.New("base_role must be one of superadmin, program_manager, faculty, participant")
		}
		// Primary PM uniqueness: an org gets at most one is_primary_pm=true
		// account. If assigning the bare program_manager persona and this
		// org already has a DIFFERENT Primary PM, silently redirect this
		// assignment to the shared "Secondary PM" custom role instead of
		// the base persona — same outcome a superadmin gets today by using
		// the "+ Add" Secondary PM invite flow, just reached through the
		// generic assignment endpoint too.
		if req.BaseRole == shared.RoleProgramManager {
			existingPrimary, perr := primaryPMUserID(req.OrgID)
			if perr == nil && existingPrimary != "" && existingPrimary != req.UserID {
				secondaryID, serr := lookupSecondaryPMRoleID()
				if serr != nil || secondaryID == "" {
					return nil, errors.New("this org already has a Primary PM, and the Secondary PM role is not available to redirect to")
				}
				rid, rerr := parseUUIDPtr(secondaryID)
				if rerr != nil {
					return nil, rerr
				}
				a.RoleID = rid
			} else {
				br := req.BaseRole
				a.BaseRole = &br
				a.IsPrimaryPM = true
			}
		} else {
			br := req.BaseRole
			a.BaseRole = &br
		}
	}

	if a.OrgID, err = parseUUIDPtr(req.OrgID); err != nil {
		return nil, errors.New("invalid org_id")
	}
	if a.ProgramID, err = parseUUIDPtr(req.ProgramID); err != nil {
		return nil, errors.New("invalid program_id")
	}
	if a.ValidFrom, err = parseTimePtr(req.ValidFrom); err != nil {
		return nil, errors.New("valid_from must be RFC3339")
	}
	if a.ValidUntil, err = parseTimePtr(req.ValidUntil); err != nil {
		return nil, errors.New("valid_until must be RFC3339")
	}
	if a.ValidFrom != nil && a.ValidUntil != nil && a.ValidUntil.Before(*a.ValidFrom) {
		return nil, errors.New("valid_until must be after valid_from")
	}
	if cid, err := parseUUIDPtr(callerID); err == nil {
		a.AssignedBy = cid
	}

	if err := insertAssignment(a); err != nil {
		return nil, err
	}
	names, _ := roleNamesByIDs(collectRoleIDs([]RoleAssignment{*a}))
	return assignmentToDTO(*a, names), nil
}

func listAssignmentsService(userID, orgID, programID, callerRole string) ([]RoleAssignmentDTO, error) {
	if err := requireSuperadmin(callerRole); err != nil {
		return nil, err
	}
	rows, err := listAssignments(userID, orgID, programID)
	if err != nil {
		return nil, err
	}
	names, _ := roleNamesByIDs(collectRoleIDs(rows))
	out := make([]RoleAssignmentDTO, 0, len(rows))
	for _, r := range rows {
		out = append(out, *assignmentToDTO(r, names))
	}
	return out, nil
}

func deleteAssignmentService(id, callerRole string) error {
	if err := requireSuperadmin(callerRole); err != nil {
		return err
	}
	return deleteAssignment(id)
}

// effectivePermissionsService resolves the union of a user's base persona plus
// every currently-active assigned custom role, with full inheritance applied.
func effectivePermissionsService(userID, callerRole string) (*EffectivePermissionsDTO, error) {
	if err := requireSuperadmin(callerRole); err != nil {
		return nil, err
	}
	base, err := getUserBaseRole(userID)
	if err != nil || base == "" {
		base = shared.RoleParticipant
	}

	set := map[string]bool{}
	for _, p := range effectivePermissions(base, nil) {
		set[p] = true
	}

	active, err := listActiveAssignmentsForUser(userID)
	if err != nil {
		return nil, err
	}
	roleNames := []string{}
	for _, a := range active {
		if a.BaseRole != nil {
			for _, p := range effectivePermissions(*a.BaseRole, nil) {
				set[p] = true
			}
			continue
		}
		if a.RoleID != nil {
			r, err := getRoleByID(a.RoleID.String())
			if err != nil {
				continue
			}
			roleNames = append(roleNames, r.Name)
			for _, p := range effectivePermissions(r.BaseRole, unmarshalPerms(r.Permissions)) {
				set[p] = true
			}
		}
	}

	return &EffectivePermissionsDTO{
		UserID:      userID,
		BaseRole:    base,
		Roles:       roleNames,
		Permissions: sortedKeys(set),
	}, nil
}

// ── Org-scoped role view ──────────────────────────────────────────────────────

// orgBuiltinPersonas are the org-level personas shown in the "by org" view.
// Deliberately excludes superadmin and Super Admin (Secondary): both are
// platform-level roles, not scoped to any single organization.
var orgBuiltinPersonas = []struct{ role, label, color string }{
	{shared.RoleProgramManager, "Program Manager (Business Admin)", "#1C2551"},
	{shared.RoleFaculty, "Faculty", "#6B73BF"},
	{shared.RoleCoach, "Coach", "#0891B2"},
	{shared.RoleParticipant, "Participant", "#EF4E24"},
}

// rolesByOrgService returns the built-in org-level personas with their
// per-org user counts (via role_assignments.org_id = orgID). Read-only;
// does not alter listRolesService or any other existing endpoint's behavior.
func rolesByOrgService(orgID, callerRole string) ([]OrgScopedRoleDTO, error) {
	if err := requireSuperadmin(callerRole); err != nil {
		return nil, err
	}
	if orgID == "" {
		return nil, errors.New("org_id is required")
	}
	out := make([]OrgScopedRoleDTO, 0, len(orgBuiltinPersonas))
	for _, p := range orgBuiltinPersonas {
		count, err := countOrgUsersByBuiltinRole(orgID, p.role)
		if err != nil {
			return nil, err
		}
		out = append(out, OrgScopedRoleDTO{
			Role:      p.role,
			Label:     p.label,
			Color:     p.color,
			UserCount: int(count),
		})
	}
	return out, nil
}

// ── Organization Members ──────────────────────────────────────────────────────

// orgMembersService lists every user belonging to orgID (via org_members),
// each annotated with their currently resolved effective role. Read-only.
func orgMembersService(orgID, callerRole string) ([]OrgMemberDTO, error) {
	if err := requireSuperadmin(callerRole); err != nil {
		return nil, err
	}
	if orgID == "" {
		return nil, errors.New("org id is required")
	}
	return listOrgMembers(orgID)
}

// errSuperadminNotAssignable guards PATCH /orgs/:id/members/:userId/role
// against assigning any superadmin-tier role (built-in superadmin, or a
// custom role whose base_role is superadmin, e.g. "Super Admin (Secondary)")
// from the org-scoped member view. Those are managed separately.
var errSuperadminNotAssignable = errors.New("superadmin-tier roles cannot be assigned from the org member view; manage them separately")

// assignOrgMemberRoleService assigns a role (built-in or custom, scoped to
// orgID) to a member by REPLACING their role_assignments row for that org —
// never editing permissions directly; the role's own permissions (already
// defined in custom_roles / the base persona) apply automatically via the
// existing resolver. Reuses the exact same validation and insert path as
// the existing "assign role" action (createAssignmentService/insertAssignment);
// the only addition here is the superadmin-tier guard and the atomic
// replace (via replaceOrgMemberAssignment) so a member can never end up with
// two active assignments for the same org.
func assignOrgMemberRoleService(orgID, userID string, req AssignMemberRoleRequest, callerRole, callerID string) (*RoleAssignmentDTO, error) {
	if err := requireSuperadmin(callerRole); err != nil {
		return nil, err
	}
	oid, err := uuid.Parse(orgID)
	if err != nil {
		return nil, errors.New("invalid org id")
	}
	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil, errors.New("invalid user id")
	}
	// Same "exactly one of role_id or base_role" contract as createAssignmentService.
	if (req.RoleID == "") == (req.BaseRole == "") {
		return nil, errors.New("exactly one of role_id or base_role must be supplied")
	}

	a := &RoleAssignment{UserID: uid, OrgID: &oid}

	if req.RoleID != "" {
		role, err := getRoleByID(req.RoleID)
		if err != nil {
			return nil, errors.New("role_id does not exist")
		}
		if role.BaseRole == shared.RoleSuperAdmin {
			return nil, errSuperadminNotAssignable
		}
		rid, err := parseUUIDPtr(req.RoleID)
		if err != nil {
			return nil, errors.New("invalid role_id")
		}
		a.RoleID = rid
	} else {
		if req.BaseRole == shared.RoleSuperAdmin {
			return nil, errSuperadminNotAssignable
		}
		if !validBaseRole(req.BaseRole) {
			return nil, errors.New("base_role must be one of program_manager, faculty, coach, participant")
		}
		// Same Primary PM uniqueness redirect as createAssignmentService —
		// see that function's comment for the full rationale.
		if req.BaseRole == shared.RoleProgramManager {
			existingPrimary, perr := primaryPMUserID(orgID)
			if perr == nil && existingPrimary != "" && existingPrimary != userID {
				secondaryID, serr := lookupSecondaryPMRoleID()
				if serr != nil || secondaryID == "" {
					return nil, errors.New("this org already has a Primary PM, and the Secondary PM role is not available to redirect to")
				}
				rid, rerr := parseUUIDPtr(secondaryID)
				if rerr != nil {
					return nil, rerr
				}
				a.RoleID = rid
			} else {
				br := req.BaseRole
				a.BaseRole = &br
				a.IsPrimaryPM = true
			}
		} else {
			br := req.BaseRole
			a.BaseRole = &br
		}
	}

	if cid, err := parseUUIDPtr(callerID); err == nil {
		a.AssignedBy = cid
	}

	if err := replaceOrgMemberAssignment(userID, orgID, a); err != nil {
		return nil, err
	}
	names, _ := roleNamesByIDs(collectRoleIDs([]RoleAssignment{*a}))
	return assignmentToDTO(*a, names), nil
}

// ── Per-account permission editing (Members tab) ─────────────────────────────
// This is deliberately separate from createRoleService/updateRoleService: it
// never edits a SHARED custom role (Participant Retail, Super Admin
// (Secondary), or a built-in persona) and never affects any other user. It
// creates or updates exactly one custom_roles row scoped to a single account
// (owner_user_id) and reassigns only that account to it.

// memberPermissionsService returns a specific account's CURRENT effective
// permission set via rbac.Resolve — reflecting whatever they're actually
// resolved to right now (base persona, a shared custom role, or an existing
// personal role from a prior edit), not a static role definition.
// Superadmin-only entry point — the gate-free core (resolveMemberPermissions)
// is also reused directly by the Primary PM-scoped routes, which apply their
// own, different authorization instead of requireSuperadmin.
func memberPermissionsService(userID, callerRole string) (*MemberPermissionsDTO, error) {
	if err := requireSuperadmin(callerRole); err != nil {
		return nil, err
	}
	return resolveMemberPermissions(userID)
}

// resolveMemberPermissions is the actual "what can this account currently do"
// lookup, with NO authorization check of its own — callers are responsible
// for gating access before calling this. Kept separate from
// memberPermissionsService so the Primary PM routes and the superadmin routes
// share this one implementation instead of two copies drifting apart.
func resolveMemberPermissions(userID string) (*MemberPermissionsDTO, error) {
	base, err := getUserBaseRole(userID)
	if err != nil || base == "" {
		base = shared.RoleParticipant
	}
	access, err := rbac.Resolve(rbac.GormStore{}, base, userID)
	if err != nil {
		return nil, err
	}
	perms := access.Permissions()
	sort.Strings(perms)
	return &MemberPermissionsDTO{UserID: userID, Full: access.Full, Permissions: perms}, nil
}

// updateMemberPermissionsService sets a specific account's permission set by
// creating (first edit) or updating (subsequent edits) a PERSONAL custom role
// scoped to exactly that account, then reassigning only that account to it —
// via the same atomic replace used by assignOrgMemberRoleService, so this can
// never leave the account with two active assignments and never touches
// role_assignments or custom_roles for anyone else.
// Superadmin-only entry point — see applyMemberPermissionsUpdate for the
// gate-free core the Primary PM routes also call directly, after their own
// authorization AND the escalation-ceiling cap superadmin doesn't need.
func updateMemberPermissionsService(orgID, userID string, perms []string, callerRole, callerID string) (*MemberPermissionsDTO, error) {
	if err := requireSuperadmin(callerRole); err != nil {
		return nil, err
	}
	return applyMemberPermissionsUpdate(orgID, userID, perms, callerRole, callerID)
}

// applyMemberPermissionsUpdate is the actual write path — create-or-update a
// personal custom role, reassign the account to it, audit-log the change —
// with NO authorization check of its own. callerRole/callerID are used only
// for the "before" snapshot and the audit record's actor fields, never to
// gate anything here; callers must authorize before calling this.
func applyMemberPermissionsUpdate(orgID, userID string, perms []string, callerRole, callerID string) (*MemberPermissionsDTO, error) {
	oid, err := uuid.Parse(orgID)
	if err != nil {
		return nil, errors.New("invalid org id")
	}
	uid, err := uuid.Parse(userID)
	if err != nil {
		return nil, errors.New("invalid user id")
	}

	before, err := resolveMemberPermissions(userID)
	if err != nil {
		return nil, err
	}

	permsJSON, err := marshalPerms(perms)
	if err != nil {
		return nil, err
	}

	role, err := getPersonalRoleForUser(userID, orgID)
	if err != nil {
		// No personal role yet for this account in this org — create one,
		// seeded from their current base persona.
		name, base, uerr := getUserNameAndBaseRole(userID)
		if uerr != nil {
			return nil, uerr
		}
		if base == "" {
			base = shared.RoleParticipant
		}
		if name == "" {
			name = "Member"
		}
		cid, _ := parseUUIDPtr(callerID)
		newRole := &CustomRole{
			OrgID:       &oid,
			Name:        name + " — Custom",
			Description: "Personal permission override, created from the Members tab.",
			BaseRole:    base,
			Permissions: permsJSON,
			IsSystem:    false,
			OwnerUserID: &uid,
			CreatedBy:   cid,
		}
		if err := insertRole(newRole); err != nil {
			return nil, err
		}
		role = newRole
	} else {
		if err := updateRole(role.ID.String(), map[string]any{
			"permissions": permsJSON,
			"updated_at":  time.Now(),
		}); err != nil {
			return nil, err
		}
	}

	assignment := &RoleAssignment{UserID: uid, OrgID: &oid, RoleID: &role.ID}
	if cid, err := parseUUIDPtr(callerID); err == nil {
		assignment.AssignedBy = cid
	}
	if err := replaceOrgMemberAssignment(userID, orgID, assignment); err != nil {
		return nil, err
	}

	audit.LogActor(callerID, callerRole, orgID, audit.Event{
		Category:   "roles",
		Action:     "member.permissions.update",
		Severity:   audit.SeveritySuccess,
		TargetType: "user",
		TargetID:   userID,
		OrgID:      orgID,
		Detail: map[string]any{
			"role_id": role.ID.String(),
			"before":  before.Permissions,
			"after":   perms,
		},
	})

	return &MemberPermissionsDTO{UserID: userID, Full: false, Permissions: perms}, nil
}

// ── Primary PM-scoped org role management ────────────────────────────────────
// A Primary PM's cut-down equivalent of the superadmin Members tab, for their
// OWN org only. Every function here re-derives org_id from the caller's own
// is_primary_pm=true role_assignments row (primaryPMOwnOrgID) — never from a
// request parameter — and reuses listOrgMembers/resolveMemberPermissions/
// applyMemberPermissionsUpdate rather than re-implementing them. There is no
// PM-facing route for creating/editing a shared custom role or changing
// anyone's base persona: these three functions are strictly account-scoped
// permission edits, the same hard boundary the Members-tab editor already
// enforces for superadmin.

// pmOrgMembersService lists this Primary PM's own org, excluding any other
// Primary PM (including themselves) and any superadmin-tier account —
// leaving Secondary PM, faculty, coach, and participant accounts, the set
// this tab is meant to manage.
func pmOrgMembersService(callerID string) ([]OrgMemberDTO, error) {
	orgID, ok, err := primaryPMOwnOrgID(callerID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errForbidden
	}
	all, err := listOrgMembers(orgID)
	if err != nil {
		return nil, err
	}
	out := make([]OrgMemberDTO, 0, len(all))
	for _, m := range all {
		if m.IsPrimaryPM || m.BaseRole == shared.RoleSuperAdmin {
			continue
		}
		out = append(out, m)
	}
	return out, nil
}

// pmMemberPermissionsService returns one org member's current effective
// permissions — same underlying lookup as the superadmin path
// (resolveMemberPermissions), gated by "caller is this org's Primary PM" and
// "target actually belongs to this org and isn't a PM/superadmin" instead of
// requireSuperadmin.
func pmMemberPermissionsService(callerID, targetUserID string) (*MemberPermissionsDTO, error) {
	orgID, ok, err := primaryPMOwnOrgID(callerID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errForbidden
	}
	if err := requireTargetInOrgAndManageable(targetUserID, orgID); err != nil {
		return nil, err
	}
	return resolveMemberPermissions(targetUserID)
}

// pmUpdateMemberPermissionsService applies a permission edit to one org
// member, via the exact same write path as the superadmin editor
// (applyMemberPermissionsUpdate — personal-role create-or-update, atomic
// reassignment, audit.LogActor with before/after diff), after: (1) the same
// caller/target guards as pmMemberPermissionsService, and (2) an escalation
// ceiling — the requested grant is intersected against the Primary PM's OWN
// currently-resolved permissions, so they can never hand out a permission
// they don't hold themselves. Keys outside that ceiling are silently
// dropped rather than erroring the whole request, mirroring how the grid's
// Save already only ever submits keys the UI actually exposed.
func pmUpdateMemberPermissionsService(callerID, targetUserID string, perms []string) (*MemberPermissionsDTO, error) {
	orgID, ok, err := primaryPMOwnOrgID(callerID)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, errForbidden
	}
	if err := requireTargetInOrgAndManageable(targetUserID, orgID); err != nil {
		return nil, err
	}

	callerPerms, err := resolveMemberPermissions(callerID)
	if err != nil {
		return nil, err
	}
	capped := perms
	if !callerPerms.Full {
		allowed := make(map[string]bool, len(callerPerms.Permissions))
		for _, p := range callerPerms.Permissions {
			allowed[p] = true
		}
		capped = make([]string, 0, len(perms))
		for _, p := range perms {
			if allowed[p] {
				capped = append(capped, p)
			}
		}
	}

	return applyMemberPermissionsUpdate(orgID, targetUserID, capped, shared.RoleProgramManager, callerID)
}

// ── Organization Access Rules ─────────────────────────────────────────────────

func getAccessRuleService(orgID, callerRole string) (*OrgAccessRuleDTO, error) {
	if err := requireSuperadmin(callerRole); err != nil {
		return nil, err
	}
	r, err := getAccessRuleByOrg(orgID)
	if err != nil {
		return nil, err
	}
	return accessRuleToDTO(*r), nil
}

func upsertAccessRuleService(req UpsertAccessRuleRequest, callerRole, callerID string) (*OrgAccessRuleDTO, error) {
	if err := requireSuperadmin(callerRole); err != nil {
		return nil, err
	}
	orgID, err := uuid.Parse(req.OrgID)
	if err != nil {
		return nil, errors.New("invalid org_id")
	}

	ipJSON, err := marshalPerms(req.IPAllowlist)
	if err != nil {
		return nil, errors.New("invalid ip_allowlist")
	}
	allowJSON, err := marshalPerms(req.AllowedCountries)
	if err != nil {
		return nil, errors.New("invalid allowed_countries")
	}
	blockJSON, err := marshalPerms(req.BlockedCountries)
	if err != nil {
		return nil, errors.New("invalid blocked_countries")
	}

	rule := &OrgAccessRule{
		OrgID:            orgID,
		IPAllowlist:      ipJSON,
		AllowedCountries: allowJSON,
		BlockedCountries: blockJSON,
	}
	if req.Enforce != nil {
		rule.Enforce = *req.Enforce
	}
	if cid, err := parseUUIDPtr(callerID); err == nil {
		rule.UpdatedBy = cid
	}

	if err := upsertAccessRule(rule); err != nil {
		return nil, err
	}
	saved, err := getAccessRuleByOrg(req.OrgID)
	if err != nil {
		return nil, err
	}
	return accessRuleToDTO(*saved), nil
}

// ── Mapping & helpers ─────────────────────────────────────────────────────────

func roleToDTO(r CustomRole) *CustomRoleDTO {
	grants := unmarshalPerms(r.Permissions)
	dto := &CustomRoleDTO{
		ID:             r.ID.String(),
		Name:           r.Name,
		Description:    r.Description,
		BaseRole:       r.BaseRole,
		Color:          r.Color,
		Permissions:    grants,
		Effective:      effectivePermissions(r.BaseRole, grants),
		PermissionGrid: gridForCustom(grants),
		IsSystem:       r.IsSystem,
		CreatedAt:      r.CreatedAt.Format(time.RFC3339),
		UpdatedAt:      r.UpdatedAt.Format(time.RFC3339),
	}
	if r.OrgID != nil {
		dto.OrgID = r.OrgID.String()
	}
	if r.CreatedBy != nil {
		dto.CreatedBy = r.CreatedBy.String()
	}
	return dto
}

func assignmentToDTO(a RoleAssignment, roleNames map[string]string) *RoleAssignmentDTO {
	dto := &RoleAssignmentDTO{
		ID:        a.ID.String(),
		UserID:    a.UserID.String(),
		Active:    assignmentActive(a),
		CreatedAt: a.CreatedAt.Format(time.RFC3339),
	}
	if a.RoleID != nil {
		dto.RoleID = a.RoleID.String()
		dto.RoleName = roleNames[a.RoleID.String()]
	}
	if a.BaseRole != nil {
		dto.BaseRole = *a.BaseRole
	}
	if a.OrgID != nil {
		dto.OrgID = a.OrgID.String()
	}
	if a.ProgramID != nil {
		dto.ProgramID = a.ProgramID.String()
	}
	if a.ValidFrom != nil {
		dto.ValidFrom = a.ValidFrom.Format(time.RFC3339)
	}
	if a.ValidUntil != nil {
		dto.ValidUntil = a.ValidUntil.Format(time.RFC3339)
	}
	if a.AssignedBy != nil {
		dto.AssignedBy = a.AssignedBy.String()
	}
	return dto
}

func accessRuleToDTO(r OrgAccessRule) *OrgAccessRuleDTO {
	dto := &OrgAccessRuleDTO{
		ID:               r.ID.String(),
		OrgID:            r.OrgID.String(),
		IPAllowlist:      unmarshalPerms(r.IPAllowlist),
		AllowedCountries: unmarshalPerms(r.AllowedCountries),
		BlockedCountries: unmarshalPerms(r.BlockedCountries),
		Enforce:          r.Enforce,
		UpdatedAt:        r.UpdatedAt.Format(time.RFC3339),
	}
	if r.UpdatedBy != nil {
		dto.UpdatedBy = r.UpdatedBy.String()
	}
	return dto
}

func assignmentActive(a RoleAssignment) bool {
	now := time.Now()
	if a.ValidFrom != nil && now.Before(*a.ValidFrom) {
		return false
	}
	if a.ValidUntil != nil && now.After(*a.ValidUntil) {
		return false
	}
	return true
}

func collectRoleIDs(rows []RoleAssignment) []string {
	var ids []string
	for _, r := range rows {
		if r.RoleID != nil {
			ids = append(ids, r.RoleID.String())
		}
	}
	return ids
}

func marshalPerms(perms []string) (string, error) {
	if perms == nil {
		perms = []string{}
	}
	b, err := json.Marshal(perms)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func unmarshalPerms(raw string) []string {
	if raw == "" {
		return []string{}
	}
	var out []string
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return []string{}
	}
	return out
}

func parseUUIDPtr(s string) (*uuid.UUID, error) {
	if s == "" {
		return nil, nil
	}
	id, err := uuid.Parse(s)
	if err != nil {
		return nil, err
	}
	return &id, nil
}

func parseTimePtr(s string) (*time.Time, error) {
	if s == "" {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339, s)
	if err != nil {
		return nil, err
	}
	return &t, nil
}
