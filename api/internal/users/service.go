package users

import (
	"encoding/json"
	"errors"

	"github.com/xa-lms/api/internal/shared"
	"golang.org/x/crypto/bcrypt"
)

// ---------------------------------------------------------------------------
// Existing service functions (unchanged)
// ---------------------------------------------------------------------------

func listUsersService(callerRole, callerUserID, role, orgID string, page, limit int) ([]UserResponse, int64, error) {
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 100 {
		limit = 20
	}
	offset := (page - 1) * limit

	var rawUsers []User
	var total int64
	var err error

	if callerRole == shared.RoleSuperAdmin {
		rawUsers, total, err = listAll(role, orgID, offset, limit)
	} else {
		// program_manager: auto-scoped to their own org
		oid, lookupErr := getOrgIDForUser(callerUserID)
		if lookupErr != nil {
			return nil, 0, lookupErr
		}
		if oid == nil {
			return []UserResponse{}, 0, nil
		}
		rawUsers, total, err = listByOrg(*oid, role, offset, limit)
	}
	if err != nil {
		return nil, 0, err
	}

	result := make([]UserResponse, 0, len(rawUsers))
	for _, u := range rawUsers {
		result = append(result, userToDTO(u))
	}
	return result, total, nil
}

func getUserService(id string) (*UserResponse, error) {
	u, err := getByID(id)
	if err != nil {
		return nil, err
	}
	dto := userToDTO(*u)
	return &dto, nil
}

func updateUserService(id string, req UpdateUserRequest, callerRole string) (*UserResponse, error) {
	if req.Role == shared.RoleSuperAdmin && callerRole != shared.RoleSuperAdmin {
		return nil, errors.New("only superadmin can assign the superadmin role")
	}

	fields := map[string]any{}
	if req.Name != "" {
		fields["name"] = req.Name
	}
	if req.Role != "" {
		fields["role"] = req.Role
	}
	if req.IsActive != nil {
		fields["is_active"] = *req.IsActive
	}
	if len(fields) == 0 {
		return nil, errors.New("no fields to update")
	}

	if err := updateUser(id, fields); err != nil {
		return nil, err
	}
	return getUserService(id)
}

func userToDTO(u User) UserResponse {
	return UserResponse{
		ID:        u.ID.String(),
		Email:     u.Email,
		Name:      u.Name,
		Role:      u.Role,
		AvatarURL: u.AvatarURL,
		IsActive:  u.IsActive,
		CreatedAt: u.CreatedAt.Format("2006-01-02T15:04:05Z"),
	}
}

// ---------------------------------------------------------------------------
// Self-service profile service functions
// ---------------------------------------------------------------------------

func defaultNotifPrefs() NotificationPrefs {
	return NotificationPrefs{
		EmailNotifications: true,
		PushNotifications:  true,
		SMSAlerts:          false,
		UpcomingDeadlines:  true,
		FeedbackReceived:   true,
		SessionReminders:   true,
		WeeklyDigest:       false,
	}
}

func defaultAppearPrefs() AppearancePrefs {
	return AppearancePrefs{
		Theme:      "light",
		Density:    "comfortable",
		Language:   "en",
		DateFormat: "DD/MM/YYYY",
		Timezone:   "IST (UTC+5:30)",
	}
}

func getMeService(userID string) (*ProfileResponse, error) {
	row, err := getMe(userID)
	if err != nil {
		return nil, err
	}

	notifPrefs := defaultNotifPrefs()
	_ = json.Unmarshal([]byte(row.NotificationPrefsRaw), &notifPrefs)

	appPrefs := defaultAppearPrefs()
	_ = json.Unmarshal([]byte(row.AppearancePrefsRaw), &appPrefs)

	return &ProfileResponse{
		ID:           row.ID,
		Email:        row.Email,
		Name:         row.Name,
		Role:         row.Role,
		AvatarURL:    row.AvatarURL,
		MobileNumber: row.MobileNumber,
		About:        row.About,
		CreatedAt:    row.CreatedAt,
	}, nil
}

func updateProfileService(userID string, req UpdateProfileRequest) (*ProfileResponse, error) {
	fields := map[string]any{}
	if req.Name != "" {
		fields["name"] = req.Name
	}
	if req.MobileNumber != "" {
		fields["mobile_number"] = req.MobileNumber
	}
	if req.About != "" {
		fields["about"] = req.About
	}
	if req.AvatarURL != "" {
		fields["avatar_url"] = req.AvatarURL
	}
	if len(fields) > 0 {
		if err := updateMe(userID, fields); err != nil {
			return nil, err
		}
	}
	return getMeService(userID)
}

func changePasswordService(userID, currentPassword, newPassword string) error {
	if len(newPassword) < 8 {
		return errors.New("new password must be at least 8 characters")
	}
	storedHash, err := getPasswordHash(userID)
	if err != nil {
		return err
	}
	if err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(currentPassword)); err != nil {
		return errors.New("current password is incorrect")
	}
	newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	return changePassword(userID, string(newHash))
}

func getPrefsService(userID string) (*NotificationPrefs, *AppearancePrefs, error) {
	row, err := getMe(userID)
	if err != nil {
		return nil, nil, err
	}

	notifPrefs := defaultNotifPrefs()
	_ = json.Unmarshal([]byte(row.NotificationPrefsRaw), &notifPrefs)

	appPrefs := defaultAppearPrefs()
	_ = json.Unmarshal([]byte(row.AppearancePrefsRaw), &appPrefs)

	return &notifPrefs, &appPrefs, nil
}
