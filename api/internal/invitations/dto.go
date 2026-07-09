package invitations

import "time"

type SendInviteRequest struct {
	Email      string `json:"email"`
	Role       string `json:"role"` // participant | faculty
	CohortID   string `json:"cohort_id"`
	Name       string `json:"name"`
	Department string `json:"department"`
	// Variant is an optional participant sub-type. "" or "participant" = normal.
	// "participant_retail" additionally attaches the "Participant Retail" custom
	// role to the user on accept. The persona/enrollment role stays 'participant'.
	Variant string `json:"variant"`
}

type AcceptInviteRequest struct {
	Token    string `json:"token"`
	Password string `json:"password"`
	// Name lets the invitee set/correct their full name on the accept form. When
	// non-empty it takes precedence over the name baked into the invite token.
	Name string `json:"name"`
}

type InvitationDTO struct {
	ID        string     `json:"id"`
	CohortID  string     `json:"cohort_id"`
	Email     string     `json:"email"`
	Role      string     `json:"role"`
	Status    string     `json:"status"`
	ExpiresAt time.Time  `json:"expires_at"`
	CreatedAt time.Time  `json:"created_at"`
}

type AcceptResponseDTO struct {
	Message string `json:"message"`
}

// ValidateTokenDTO is returned by the token-check endpoint so the frontend
// can pre-fill the registration form without accepting the invite yet.
type ValidateTokenDTO struct {
	Email      string `json:"email"`
	Role       string `json:"role"`
	CohortID   string `json:"cohort_id"`
	OrgID      string `json:"org_id"`
	Name       string `json:"name"`
	Department string `json:"department"`
}

// SendOrgFacultyInviteRequest invites a faculty member (or coach) directly to
// the org without tying the invite to any specific cohort.
type SendOrgFacultyInviteRequest struct {
	Email string `json:"email"`
	OrgID string `json:"org_id"`
	Role  string `json:"role"` // faculty (default) | coach — ignored when role_id is set
	Name  string `json:"name"` // optional — prefilled on the accept form, editable there
	// RoleID (optional) invites the user directly into a specific CUSTOM role
	// (e.g. "Secondary PM") instead of the base faculty/coach persona. The
	// user's base persona is derived from that role's own base_role, and the
	// custom role — not the base system role — becomes their sole
	// role_assignment on accept (same mutually-exclusive pattern already used
	// for the "Participant Retail" variant).
	RoleID string `json:"role_id"`
}
