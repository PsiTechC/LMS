package auth

type LoginRequest struct {
	Email    string `json:"email"    validate:"required,email"`
	Password string `json:"password" validate:"required,min=6"`
}

type RegisterRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"` // participant | program_manager
}

type LoginResponse struct {
	AccessToken string   `json:"access_token"`
	User        UserDTO  `json:"user"`
}

type UserDTO struct {
	ID        string  `json:"id"`
	Email     string  `json:"email"`
	Name      string  `json:"name"`
	Role      string  `json:"role"`
	AvatarURL *string `json:"avatar_url"`
	OrgID     *string `json:"org_id"` // null for superadmin
}
