package shared

// Role constants matching the DB enum
const (
	RoleSuperAdmin     = "superadmin"
	RoleProgramManager = "program_manager"
	RoleFaculty        = "faculty"
	RoleParticipant    = "participant"
)

// permissionMatrix maps resource:action → allowed roles
var permissionMatrix = map[string][]string{
	// Organizations
	"organizations:read":   {RoleSuperAdmin},
	"organizations:create": {RoleSuperAdmin},
	"organizations:update": {RoleSuperAdmin},
	"organizations:delete": {RoleSuperAdmin},

	// Users
	"users:read":   {RoleSuperAdmin, RoleProgramManager},
	"users:create": {RoleSuperAdmin, RoleProgramManager},
	"users:update": {RoleSuperAdmin, RoleProgramManager},
	"users:delete": {RoleSuperAdmin},

	// Programs
	"programs:read":   {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleParticipant},
	"programs:create": {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"programs:update": {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"programs:delete": {RoleSuperAdmin, RoleProgramManager},

	// Cohorts
	"cohorts:read":   {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleParticipant},
	"cohorts:create": {RoleSuperAdmin, RoleProgramManager},
	"cohorts:update": {RoleSuperAdmin, RoleProgramManager},
	"cohorts:delete": {RoleSuperAdmin},

	// Sessions (class_sessions table)
	"sessions:read":   {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleParticipant},
	"sessions:create": {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"sessions:update": {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"sessions:delete": {RoleSuperAdmin, RoleProgramManager},

	// Submissions
	"submissions:read":   {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleParticipant},
	"submissions:create": {RoleParticipant},
	"submissions:grade":  {RoleSuperAdmin, RoleFaculty},

	// Coaching notes
	"coaching:read":  {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"coaching:write": {RoleSuperAdmin, RoleFaculty},

	// Competencies
	"competencies:read":   {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"competencies:create": {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"competencies:update": {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"competencies:delete": {RoleSuperAdmin, RoleProgramManager},

	// Analytics
	"analytics:read":  {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"analytics:write": {RoleSuperAdmin, RoleProgramManager, RoleFaculty},

	// Audit logs
	"audit:read": {RoleSuperAdmin, RoleProgramManager},

	// Communications
	"communications:read":   {RoleSuperAdmin, RoleProgramManager},
	"communications:manage": {RoleSuperAdmin, RoleProgramManager},
	"communications:send":   {RoleSuperAdmin, RoleProgramManager},
	"notifications:read":    {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleParticipant},

	// Compliance & Governance
	"compliance:read":   {RoleSuperAdmin, RoleProgramManager},
	"compliance:manage": {RoleSuperAdmin, RoleProgramManager},
}

// Can returns true if role is permitted to perform resource:action
func Can(role, resource, action string) bool {
	key := resource + ":" + action
	allowed, ok := permissionMatrix[key]
	if !ok {
		return false
	}
	for _, r := range allowed {
		if r == role {
			return true
		}
	}
	return false
}
