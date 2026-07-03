package faculty_management

import "encoding/json"

// ── Faculty Profiles ─────────────────────────────────────────────────────────

type FacultyProfileDTO struct {
	ID             string   `json:"id"`
	UserID         string   `json:"user_id"`
	Specialization string   `json:"specialization"`
	Certifications []string `json:"certifications"`
	Bio            string   `json:"bio"`
	DeliveryModes  []string `json:"delivery_modes"` // virtual | in-person | hybrid
	Location       string   `json:"location"`
	LinkedinURL    string   `json:"linkedin_url"`
	CreatedAt      string   `json:"created_at"`
	UpdatedAt      string   `json:"updated_at"`
}

// UpsertProfileRequest is the body for POST /faculty_profiles (create-or-update
// keyed on user_id).
type UpsertProfileRequest struct {
	UserID         string   `json:"user_id" validate:"required"`
	Specialization string   `json:"specialization"`
	Certifications []string `json:"certifications"`
	Bio            string   `json:"bio"`
	DeliveryModes  []string `json:"delivery_modes"`
	Location       string   `json:"location"`
	LinkedinURL    string   `json:"linkedin_url"`
}

// ── Onboarding Invites ───────────────────────────────────────────────────────

type OnboardingInviteDTO struct {
	ID            string `json:"id"`
	FacultyUserID string `json:"faculty_user_id"`
	Status        string `json:"status"`
	SentAt        string `json:"sent_at,omitempty"`
	AccessLevel   string `json:"access_level"`
	CreatedBy     string `json:"created_by,omitempty"`
	CreatedAt     string `json:"created_at"`
	UpdatedAt     string `json:"updated_at"`
}

// CreateInviteRequest is the body for POST /onboarding_invites.
type CreateInviteRequest struct {
	FacultyUserID string `json:"faculty_user_id" validate:"required"`
	AccessLevel   string `json:"access_level"` // defaults to standard
}

// UpdateInviteRequest is the body for PATCH /onboarding_invites/:id. Optional fields.
type UpdateInviteRequest struct {
	Status      *string `json:"status"`       // pending | sent | accepted
	AccessLevel *string `json:"access_level"` // standard | advanced | admin
}

// ── Roster & Dashboard (read) ────────────────────────────────────────────────

type FacultyProgramRef struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

// FacultyRosterItemDTO is one row of the faculty roster.
type FacultyRosterItemDTO struct {
	UserID            string              `json:"user_id"`
	Name              string              `json:"name"`
	Location          string              `json:"location"`
	JoinedAt          string              `json:"joined_at"`
	Specialization    string              `json:"specialization"`
	Certifications    []string            `json:"certifications"`
	Status            string              `json:"status"` // active | onboarding | inactive
	SessionsDelivered int                 `json:"sessions_delivered"`
	SessionsScheduled int                 `json:"sessions_scheduled"`
	EngagementPct     float64             `json:"engagement_pct"`
	AssignedPrograms  []FacultyProgramRef `json:"assigned_programs"`
}

// FacultyDashboardSummaryDTO powers the faculty dashboard summary cards.
type FacultyDashboardSummaryDTO struct {
	TotalFaculty           int     `json:"total_faculty"`
	OnboardingCount        int     `json:"onboarding_count"`
	TotalSessionsDelivered int     `json:"total_sessions_delivered"`
	AvgEngagementPct       float64 `json:"avg_engagement_pct"`
}

// ── Onboard Faculty (4-step wizard, single submit) ───────────────────────────

// OnboardAssignmentInput is one activity_faculty assignment created during onboarding.
type OnboardAssignmentInput struct {
	ActivityID      string          `json:"activity_id" validate:"required"`
	CohortID        string          `json:"cohort_id"`
	Role            string          `json:"role"` // delivery role: Lead | Co-Facilitator | Observer
	RoleOnProgram   string          `json:"role_on_program"`
	SessionsPlanned int             `json:"sessions_planned"`
	Availability    json.RawMessage `json:"availability"`
}

// OnboardFacultyRequest is the single payload submitted at step 4 of the wizard.
// It carries all four steps' data (matching the single-submit pattern used by
// CreateOrgWizard).
type OnboardFacultyRequest struct {
	// Step 1 — Basic
	Name     string `json:"name" validate:"required"`
	Email    string `json:"email" validate:"required"`
	Phone    string `json:"phone"`
	Location string `json:"location"`
	OrgID    string `json:"org_id"`
	// Step 2 — Profile
	Specialization string   `json:"specialization"`
	Certifications []string `json:"certifications"`
	Bio            string   `json:"bio"`
	DeliveryModes  []string `json:"delivery_modes"`
	LinkedinURL    string   `json:"linkedin_url"`
	// Step 3 — Program assignments
	Assignments []OnboardAssignmentInput `json:"assignments"`
	// Step 4 — Access & welcome
	AccessLevel      string `json:"access_level"` // standard | advanced | admin (default standard)
	SendWelcomeEmail bool   `json:"send_welcome_email"`
}

// OnboardFacultyResponse summarises what was created.
type OnboardFacultyResponse struct {
	UserID             string `json:"user_id"`
	InviteID           string `json:"invite_id"`
	Email              string `json:"email"`
	AccessLevel        string `json:"access_level"`
	AssignmentsCreated int    `json:"assignments_created"`
	WelcomeEmailSent   bool   `json:"welcome_email_sent"`
	// TemporaryPassword is returned ONLY when no welcome email was sent, so the
	// superadmin can relay credentials manually. Omitted when emailed.
	TemporaryPassword string `json:"temporary_password,omitempty"`
}

// ── activity_faculty extension ───────────────────────────────────────────────

// UpdateAssignmentRequest sets the program-level attributes on an existing
// activity_faculty row (identified by activity_id + faculty_user_id).
type UpdateAssignmentRequest struct {
	ActivityID      string          `json:"activity_id" validate:"required"`
	FacultyUserID   string          `json:"faculty_user_id" validate:"required"`
	RoleOnProgram   *string         `json:"role_on_program"`
	SessionsPlanned *int            `json:"sessions_planned"`
	Availability    json.RawMessage `json:"availability"` // structured availability object
}
