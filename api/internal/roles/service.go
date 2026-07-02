package roles

import (
	"encoding/json"
	"errors"
	"sort"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/shared"
)

var errForbidden = errors.New("only superadmin can manage roles and org access rules")

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
	_, ok := shared.RoleHierarchy[role]
	return ok
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
		return nil, errors.New("base_role must be one of superadmin, program_manager, faculty, participant")
	}

	permsJSON, err := marshalPerms(req.Permissions)
	if err != nil {
		return nil, err
	}

	role := &CustomRole{
		Name:        req.Name,
		Description: req.Description,
		BaseRole:    req.BaseRole,
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
		out = append(out, *roleToDTO(r))
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
	return roleToDTO(*r), nil
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
			return nil, errors.New("base_role must be one of superadmin, program_manager, faculty, participant")
		}
		fields["base_role"] = *req.BaseRole
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
		ID:          r.ID.String(),
		Name:        r.Name,
		Description: r.Description,
		BaseRole:    r.BaseRole,
		Permissions: grants,
		Effective:   effectivePermissions(r.BaseRole, grants),
		IsSystem:    r.IsSystem,
		CreatedAt:   r.CreatedAt.Format(time.RFC3339),
		UpdatedAt:   r.UpdatedAt.Format(time.RFC3339),
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
