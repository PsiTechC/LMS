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
	"programs:create": {RoleSuperAdmin, RoleProgramManager},
	"programs:update": {RoleSuperAdmin, RoleProgramManager},
	"programs:delete": {RoleSuperAdmin, RoleProgramManager},
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
