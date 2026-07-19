package users

// UserResponse is the admin-facing user DTO (existing, do not remove).
type UserResponse struct {
	ID        string  `json:"id"`
	Email     string  `json:"email"`
	Name      string  `json:"name"`
	Role      string  `json:"role"`
	AvatarURL *string `json:"avatar_url,omitempty"`
	IsActive  bool    `json:"is_active"`
	CreatedAt string  `json:"created_at"`
}

// UpdateUserRequest is used by admins to update any user (existing, do not remove).
type UpdateUserRequest struct {
	Name     string `json:"name"`
	Role     string `json:"role"`
	IsActive *bool  `json:"is_active"`
}

// ListUsersQuery holds query params for the list endpoint (existing, do not remove).
type ListUsersQuery struct {
	Role  string `query:"role"`
	OrgID string `query:"org_id"`
	Page  int    `query:"page"`
	Limit int    `query:"limit"`
}

// CreateSecondarySuperAdminRequest is the payload the Primary Super Admin sends
// to mint a Secondary Super Admin from Settings.
type CreateSecondarySuperAdminRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// ProfileResponse is the self-service profile DTO (richer than UserResponse).
type ProfileResponse struct {
	ID           string  `json:"id"`
	Email        string  `json:"email"`
	Name         string  `json:"name"`
	Role         string  `json:"role"`
	AvatarURL    *string `json:"avatar_url"`
	MobileNumber string  `json:"mobile_number"`
	About        string  `json:"about"`
	CreatedAt    string  `json:"created_at"`
}

// UpdateProfileRequest lets a user update their own name/mobile/about.
// avatar_url is deliberately not settable through this generic PATCH — see
// the comment in updateProfileService; POST /users/me/avatar is the only
// validated write path for that field.
type UpdateProfileRequest struct {
	Name         string `json:"name"`
	MobileNumber string `json:"mobile_number"`
	About        string `json:"about"`
}

// AvatarUploadResponseDTO is returned by POST /users/me/avatar — a servable
// path, not a raw URL, since the backend owns the serving route (mirrors
// organizations.LogoUploadResponseDTO).
type AvatarUploadResponseDTO struct {
	AvatarURL string `json:"avatar_url"`
}

// ChangePasswordRequest holds the current and new passwords for self-service change.
type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// NotificationPrefs stores per-user notification settings.
type NotificationPrefs struct {
	EmailNotifications bool `json:"email_notifications"`
	PushNotifications  bool `json:"push_notifications"`
	SMSAlerts          bool `json:"sms_alerts"`
	UpcomingDeadlines  bool `json:"upcoming_deadlines"`
	FeedbackReceived   bool `json:"feedback_received"`
	SessionReminders   bool `json:"session_reminders"`
	WeeklyDigest       bool `json:"weekly_digest"`
}

// AppearancePrefs stores per-user UI appearance settings.
type AppearancePrefs struct {
	Theme      string `json:"theme"`
	Density    string `json:"density"`
	Language   string `json:"language"`
	DateFormat string `json:"date_format"`
	Timezone   string `json:"timezone"`
}
