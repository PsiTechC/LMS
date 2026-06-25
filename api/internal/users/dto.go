package users

type UserResponse struct {
	ID        string  `json:"id"`
	Email     string  `json:"email"`
	Name      string  `json:"name"`
	Role      string  `json:"role"`
	AvatarURL *string `json:"avatar_url,omitempty"`
	IsActive  bool    `json:"is_active"`
	CreatedAt string  `json:"created_at"`
}

type UpdateUserRequest struct {
	Name     string `json:"name"`
	Role     string `json:"role"`
	IsActive *bool  `json:"is_active"`
}

type ListUsersQuery struct {
	Role  string `query:"role"`
	OrgID string `query:"org_id"`
	Page  int    `query:"page"`
	Limit int    `query:"limit"`
}
