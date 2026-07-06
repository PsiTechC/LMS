package shared

// Role constants matching the DB enum
const (
	RoleSuperAdmin     = "superadmin"
	RoleProgramManager = "program_manager"
	RoleFaculty        = "faculty"
	RoleCoach          = "coach"
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
	"programs:read":   {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleCoach, RoleParticipant},
	"programs:create": {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"programs:update": {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"programs:delete": {RoleSuperAdmin, RoleProgramManager},

	// Cohorts — Faculty can manage cohorts (create + allocate participants) per
	// the shared Cohort Management flow; delete stays superadmin-only.
	"cohorts:read":   {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleCoach, RoleParticipant},
	"cohorts:create": {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"cohorts:update": {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"cohorts:delete": {RoleSuperAdmin},

	// Sessions (class_sessions table)
	"sessions:read":   {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleCoach, RoleParticipant},
	"sessions:create": {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"sessions:update": {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"sessions:delete": {RoleSuperAdmin, RoleProgramManager},

	// Submissions
	"submissions:read":   {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleParticipant},
	"submissions:create": {RoleParticipant},
	"submissions:grade":  {RoleSuperAdmin, RoleFaculty},

	// Grading admin — cross-org aggregate of submissions + capstones (superadmin-only)
	"grading:admin": {RoleSuperAdmin},

	// Coaching notes
	"coaching:read":   {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleCoach},
	"coaching:write":  {RoleSuperAdmin, RoleFaculty, RoleCoach},
	"coaching:manage": {RoleSuperAdmin, RoleProgramManager},
	// Participant reads only their OWN coaching (assigned coach, goals, session notes).
	"coaching:self_read": {RoleParticipant, RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleCoach},

	// Competencies
	"competencies:read":   {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"competencies:create": {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"competencies:update": {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"competencies:delete": {RoleSuperAdmin, RoleProgramManager},

	// Analytics
	"analytics:read":  {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"analytics:write": {RoleSuperAdmin, RoleProgramManager, RoleFaculty},

	// Discussions
	"discussions:read":     {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleParticipant},
	"discussions:create":   {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleParticipant},
	"discussions:manage":   {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"discussions:announce": {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	// Cross-org discussion admin + moderation (superadmin-only)
	"discussions:admin": {RoleSuperAdmin},

	// Audit logs
	"audit:read": {RoleSuperAdmin, RoleProgramManager},
	// Central audit event log query surface — superadmin-only
	"audit:admin": {RoleSuperAdmin},

	// Communications
	"communications:read":   {RoleSuperAdmin, RoleProgramManager},
	"communications:manage": {RoleSuperAdmin, RoleProgramManager},
	"communications:send":   {RoleSuperAdmin, RoleProgramManager},
	"notifications:read":    {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleCoach, RoleParticipant},

	// Compliance & Governance
	"compliance:read":   {RoleSuperAdmin, RoleProgramManager},
	"compliance:manage": {RoleSuperAdmin, RoleProgramManager},

	// Branding
	"branding:read":   {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleParticipant},
	"branding:manage": {RoleProgramManager},

	// Content Library — participants may read (view) assets referenced by their
	// program activities; create/update/delete stay with staff roles.
	"content:read":   {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleParticipant},
	"content:create": {RoleSuperAdmin, RoleProgramManager},
	"content:update": {RoleSuperAdmin, RoleProgramManager},
	"content:delete": {RoleSuperAdmin},

	// Activity progress — a participant's own consumption progress + notes.
	"activity_progress:read":  {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleParticipant},
	"activity_progress:write": {RoleParticipant},

	// 360° Feedback — participant manages their own cycle & raters; staff read
	// for reporting. Rater submission is a separate public token endpoint.
	"feedback_360:read":  {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleParticipant},
	"feedback_360:write": {RoleParticipant},
	// Cross-org 360 aggregate (superadmin-only)
	"feedback_360:admin": {RoleSuperAdmin},

	// Capstone — participant reads their team's capstone and submits/peer-reviews.
	// Panel feedback authoring stays with faculty/staff (write add later).
	"capstone:read":  {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleParticipant},
	"capstone:write": {RoleParticipant},

	// Leaderboard / gamification — participant reads their cohort standing &
	// toggles their own privacy. Staff read for oversight.
	"leaderboard:read":  {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleParticipant},
	"leaderboard:write": {RoleParticipant},
	// Cross-org leaderboard rankings (superadmin-only)
	"leaderboard:admin": {RoleSuperAdmin},

	// Surveys — participant reads their surveys & submits responses; PM/faculty
	// author the question sets.
	"surveys:read":   {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleParticipant},
	"surveys:write":  {RoleParticipant},
	"surveys:manage": {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	// Cross-org survey admin aggregate (superadmin-only)
	"surveys:admin": {RoleSuperAdmin},

	// Role Management — custom roles & scoped role assignments (superadmin-only)
	"roles:read":   {RoleSuperAdmin},
	"roles:manage": {RoleSuperAdmin},

	// Organization access rules — IP allowlist & geo-restriction (superadmin-only)
	"org_access:read":   {RoleSuperAdmin},
	"org_access:manage": {RoleSuperAdmin},

	// System Health — metrics & dependency status (superadmin-only)
	"system:read": {RoleSuperAdmin},

	// Faculty Management — profiles, onboarding invites, program-assignment attrs
	"faculty_mgmt:read":   {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"faculty_mgmt:manage": {RoleSuperAdmin, RoleProgramManager},
	// Onboard Faculty flow (creates users) — superadmin-only
	"faculty_onboard:create": {RoleSuperAdmin},
	// Faculty roster + dashboard reads — superadmin-only
	"faculty_roster:read": {RoleSuperAdmin},
}

// RoleHierarchy ranks the base personas from lowest to highest privilege.
// Permission inheritance flows upward: a higher role inherits every permission
// granted to the roles below it
// (Super Admin > Program Manager > Faculty > Coach > Participant).
// Coach sits just below Faculty so a Faculty member inherits every coaching
// permission (a faculty can also coach), while a pure Coach does NOT inherit
// faculty-only surfaces like grading, competencies, or analytics.
var RoleHierarchy = map[string]int{
	RoleParticipant:    0,
	RoleCoach:          1,
	RoleFaculty:        2,
	RoleProgramManager: 3,
	RoleSuperAdmin:     4,
}

// PermissionKeyCount returns the number of distinct resource:action permissions
// defined in the RBAC matrix — the real "permissions defined" total.
func PermissionKeyCount() int { return len(permissionMatrix) }

// PermissionsForRole returns every "resource:action" key the given base role is
// directly permitted to perform in the static matrix. Callers compose this
// across an inheritance chain to compute a role's effective permission set.
func PermissionsForRole(role string) []string {
	keys := make([]string, 0)
	for key, allowed := range permissionMatrix {
		for _, r := range allowed {
			if r == role {
				keys = append(keys, key)
				break
			}
		}
	}
	return keys
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
