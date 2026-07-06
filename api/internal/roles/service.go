package roles

import (
	"encoding/json"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
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

func createRoleService(req CreateRoleRequest, callerRole, callerID string) (*CustomRoleDTO, error) {
	if err := requireSuperadmin(callerRole); err != nil {
		return nil, err
	}
	if req.Name == "" {
		return nil, errors.New("name is required")
	}
	if !validBaseRole(req.BaseRole) {
		return nil, errors.New("base_role must be one of none, superadmin, program_manager, faculty, participant")
	}

	permsJSON, err := marshalPerms(req.Permissions)
	if err != nil {
		return nil, err
	}

	color := req.Color
	if color == "" {
		color = "#EF4E24"
	}
	role := &CustomRole{
		Name:        req.Name,
		Description: req.Description,
		BaseRole:    req.BaseRole,
		Color:       color,
		Permissions: permsJSON,
	}
	if oid, err := parseUUIDPtr(req.OrgID); err != nil {
		return nil, errors.New("invalid org_id")
	} else {
		role.OrgID = oid
	}
	if cid, err := parseUUIDPtr(callerID); err == nil {
		role.CreatedBy = cid
	}

	if err := insertRole(role); err != nil {
		return nil, err
	}
	return roleToDTO(*role), nil
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
		br := req.BaseRole
		a.BaseRole = &br
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
