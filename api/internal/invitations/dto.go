package invitations

import "time"

type SendInviteRequest struct {
	Email    string `json:"email"`
	Role     string `json:"role"` // participant | faculty
	CohortID string `json:"cohort_id"`
}

type AcceptInviteRequest struct {
	Token    string `json:"token"`
	Name     string `json:"name"`
	Password string `json:"password"`
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
	Email    string `json:"email"`
	Role     string `json:"role"`
	CohortID string `json:"cohort_id"`
	OrgID    string `json:"org_id"`
}

// SendOrgFacultyInviteRequest invites a faculty member directly to the org
// without tying the invite to any specific cohort.
type SendOrgFacultyInviteRequest struct {
	Email string `json:"email"`
	OrgID string `json:"org_id"`
}
