package shared

// Role constants matching the DB enum
const (
	RoleSuperAdmin     = "superadmin" // Super Admin (Primary)
	RoleProgramManager = "program_manager"
	RoleFaculty        = "faculty"
	RoleCoach          = "coach"
	RoleParticipant    = "participant"
	// RoleParticipantRetailer is a Participant variant whose workspace unlocks
	// only Assessments, 360° Feedback, and Coaching.
	RoleParticipantRetailer = "participant_retailer"
	// RoleSuperAdminSecondary is a Super Admin variant identical to the primary
	// except it cannot access Billing, System Health, Integrations, or Audit Log.
	RoleSuperAdminSecondary = "superadmin_secondary"
)

// secondarySuperAdminDenied lists the permission keys a Secondary Super Admin is
// NOT granted even though the Primary Super Admin has them (the 4 locked surfaces
// — System Health, Audit Log, Billing, Integrations; the frontend nav already
// marks all 4 `locked: true`). Integrations has no backend permission key yet
// (frontend-only tile).
var secondarySuperAdminDenied = map[string]bool{
	"system:read":  true, // System Health
	"audit:read":   true, // Audit Log
	"audit:admin":  true, // Audit Log (central event query)
	"billing:read": true, // Billing
}

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
	// Coach added for start/end (Phase 5) — a coach can only act on sessions
	// where they're the assigned faculty_id/activity_faculty owner, enforced
	// in the service layer (isFacultyAuthorisedForSession), same as faculty.
	"sessions:update": {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleCoach},
	"sessions:delete": {RoleSuperAdmin, RoleProgramManager},
	// Cross-org live sessions aggregate (superadmin-only)
	"sessions:admin": {RoleSuperAdmin},

	// Zoom (meeting creation/host mapping is faculty-owned; join signature is
	// available to anyone who can already read the session)
	"zoom:manage": {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleCoach},
	"zoom:join":   {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleCoach, RoleParticipant},

	// Org-level Zoom S2S credentials (one Zoom account per org, Superadmin-
	// entered at onboarding). Deliberately a distinct resource from
	// "organizations" so this doesn't touch that key's existing semantics —
	// only Superadmin can write; Superadmin + the org's own PM can read status.
	"org_zoom:manage": {RoleSuperAdmin},
	"org_zoom:read":   {RoleSuperAdmin, RoleProgramManager},

	// QR-based attendance: starting/ending a check-in window and reading its
	// live roster is faculty-owned, same role set as zoom:manage. Check-in
	// itself (a participant scanning/entering a code) has no dedicated
	// permission key — it only requires RequireAuth(), enforced directly in
	// attendance's handler, since any authenticated user may attempt it (the
	// service layer rejects non-enrolled participants).
	"attendance:manage": {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleCoach},

	// Internal-only, machine-to-machine: sessions' loopback call into
	// communications when a session goes live. Not user-facing — only ever
	// hit with an internally-minted token carrying the original faculty/coach
	// caller's identity (see sessions/notify_bridge.go).
	"communications:notify_internal": {RoleFaculty, RoleCoach},

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

	// AI Learning Coach — participant-facing conversational assistant.
	"ai_coach:use": {RoleParticipant, RoleParticipantRetailer},

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
	// program activities; Faculty can author their own org's library (create/
	// update) alongside PM/SA; delete stays with superadmin.
	"content:read":   {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleParticipant},
	"content:create": {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"content:update": {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"content:delete": {RoleSuperAdmin},

	// Activity progress — a participant's own consumption progress + notes.
	"activity_progress:read":  {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleParticipant},
	"activity_progress:write": {RoleParticipant},

	// 360° Feedback — participant manages their own cycle & raters; staff read
	// for reporting. Rater submission is a separate public token endpoint.
	"feedback_360:read":  {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleParticipant},
	"feedback_360:write": {RoleParticipant},
	// Admin-initiated 360 flow: configure the framework/quorum/cycle and lock it
	// (:configure), and assign/invite participants to a locked cycle (:assign).
	// Held by Superadmin (+ Secondary via init) and Program Manager (org-scoped).
	// These are distinct from the participant-facing :write key and don't collide.
	"feedback_360:configure": {RoleSuperAdmin, RoleProgramManager},
	"feedback_360:assign":    {RoleSuperAdmin, RoleProgramManager},
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

	// Assessments (quiz-taking) — participant reads their quiz-backed
	// assessments & submits answers for auto-scoring. No PM/faculty authoring
	// key here: quiz questions are authored in Content Library, not per-activity.
	"assessments:read":  {RoleSuperAdmin, RoleProgramManager, RoleFaculty, RoleParticipant},
	"assessments:write": {RoleParticipant},

	// Role Management — custom roles & scoped role assignments (superadmin-only)
	"roles:read":   {RoleSuperAdmin},
	"roles:manage": {RoleSuperAdmin},

	// Organization access rules — IP allowlist & geo-restriction (superadmin-only)
	"org_access:read":   {RoleSuperAdmin},
	"org_access:manage": {RoleSuperAdmin},

	// System Health — metrics & dependency status (superadmin-only)
	"system:read": {RoleSuperAdmin},

	// Billing — read-only cross-org reporting (Organizations plan/dates,
	// open-program participant enrollments). Superadmin-only.
	"billing:read": {RoleSuperAdmin},

	// Faculty Management — profiles, onboarding invites, program-assignment attrs
	"faculty_mgmt:read":   {RoleSuperAdmin, RoleProgramManager, RoleFaculty},
	"faculty_mgmt:manage": {RoleSuperAdmin, RoleProgramManager},
	// Onboard Faculty flow (creates users) — superadmin-only
	"faculty_onboard:create": {RoleSuperAdmin},
	// Faculty roster + dashboard reads — superadmin-only
	"faculty_roster:read": {RoleSuperAdmin},

	// Create/list Secondary Super Admins — Primary Super Admin ONLY. A secondary
	// cannot mint more superadmins.
	"superadmins:manage": {RoleSuperAdmin},
}

// participantRetailerAllow is the exact permission set a Participant Retailer is
// granted — only what the 3 unlocked tabs (Assessments, 360° Feedback, Coaching)
// plus the shell need. Least-privilege: no leaderboard/surveys/capstone/
// discussions writes (those tabs are locked in the UI).
var participantRetailerAllow = []string{
	// Assessments (runs through programs + submissions)
	"programs:read", "submissions:read", "submissions:create",
	// 360° Feedback
	"feedback_360:read", "feedback_360:write",
	// Coaching (own coaching + related sessions)
	"coaching:self_read", "sessions:read",
	// Shell baseline
	"notifications:read", "branding:read", "content:read",
	"activity_progress:read", "activity_progress:write",
}

// init derives the two variant roles from the base matrix so their permissions
// stay in lock-step with the roles they mirror:
//   - Participant Retailer gets exactly participantRetailerAllow.
//   - Secondary Super Admin gets every Super Admin permission EXCEPT the locked
//     surfaces in secondarySuperAdminDenied.
func init() {
	grant := func(key, role string) {
		for _, r := range permissionMatrix[key] {
			if r == role {
				return
			}
		}
		permissionMatrix[key] = append(permissionMatrix[key], role)
	}

	for _, key := range participantRetailerAllow {
		grant(key, RoleParticipantRetailer)
	}

	for key, roles := range permissionMatrix {
		if secondarySuperAdminDenied[key] {
			continue
		}
		for _, r := range roles {
			if r == RoleSuperAdmin {
				grant(key, RoleSuperAdminSecondary)
				break
			}
		}
	}
}

// RoleHierarchy ranks the base personas from lowest to highest privilege.
// Permission inheritance flows upward: a higher role inherits every permission
// granted to the roles below it
// (Super Admin > Program Manager > Faculty > Coach > Participant).
// Coach sits just below Faculty so a Faculty member inherits every coaching
// permission (a faculty can also coach), while a pure Coach does NOT inherit
// faculty-only surfaces like grading, competencies, or analytics.
var RoleHierarchy = map[string]int{
	RoleParticipant:         0,
	RoleParticipantRetailer: 0, // participant tier (restricted workspace)
	RoleCoach:               1,
	RoleFaculty:             2,
	RoleProgramManager:      3,
	RoleSuperAdminSecondary: 4, // super-admin tier (restricted surfaces)
	RoleSuperAdmin:          4,
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
