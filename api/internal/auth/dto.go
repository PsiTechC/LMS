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

type VerifyEmailRequest struct {
	Token string `json:"token"`
}

type ResendVerificationRequest struct {
	Email string `json:"email"`
}

// ── Developer OTP login (gated by ENABLE_OTP_LOGIN) ───────────────
type SendOTPRequest struct {
	Email string `json:"email"`
}

type OTPLoginRequest struct {
	Email string `json:"email"`
	OTP   string `json:"otp"`
}

type LoginResponse struct {
	AccessToken string  `json:"access_token"`
	User        UserDTO `json:"user"`
}

// RegisterResponse is returned on signup — no token yet, user must verify email first.
type RegisterResponse struct {
	Message string `json:"message"`
	Email   string `json:"email"`
}

type UserDTO struct {
	ID         string  `json:"id"`
	Email      string  `json:"email"`
	Name       string  `json:"name"`
	Role       string  `json:"role"`
	AvatarURL  *string `json:"avatar_url"`
	OrgID      *string `json:"org_id"` // null for superadmin
	IsVerified bool    `json:"is_verified"`
}
