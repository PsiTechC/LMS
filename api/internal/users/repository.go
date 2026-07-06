package users

import (
	"encoding/json"
	"errors"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("user not found")
var ErrEmailTaken = errors.New("a user with this email already exists")

// emailExists reports whether any user already has this email.
func emailExists(email string) (bool, error) {
	var count int64
	err := database.DB.Model(&User{}).Where("email = ?", email).Count(&count).Error
	return count > 0, err
}

// createSecondarySuperAdmin inserts a verified, active superadmin_secondary user.
func createSecondarySuperAdmin(name, email, passwordHash string) (*User, error) {
	u := &User{
		Name:         name,
		Email:        email,
		PasswordHash: passwordHash,
		Role:         "superadmin_secondary",
		IsActive:     true,
		IsVerified:   true,
	}
	if err := database.DB.Create(u).Error; err != nil {
		return nil, err
	}
	return u, nil
}

// listSecondarySuperAdmins returns all superadmin_secondary users (newest first).
func listSecondarySuperAdmins() ([]User, error) {
	var list []User
	err := database.DB.Where("role = ?", "superadmin_secondary").Order("created_at desc").Find(&list).Error
	return list, err
}

// ---------------------------------------------------------------------------
// Existing repository functions (unchanged)
// ---------------------------------------------------------------------------

func listAll(role, orgID string, offset, limit int) ([]User, int64, error) {
	db := database.DB.Model(&User{})
	if role != "" {
		db = db.Where("role = ?", role)
	}
	if orgID != "" {
		parsed, err := uuid.Parse(orgID)
		if err != nil {
			return nil, 0, errors.New("invalid org_id")
		}
		db = db.Where("id IN (SELECT user_id FROM org_members WHERE org_id = ?)", parsed)
	}
	var total int64
	db.Count(&total)
	var users []User
	err := db.Order("created_at desc").Offset(offset).Limit(limit).Find(&users).Error
	return users, total, err
}

func listByOrg(orgID uuid.UUID, role string, offset, limit int) ([]User, int64, error) {
	db := database.DB.Model(&User{}).
		Where("id IN (SELECT user_id FROM org_members WHERE org_id = ?)", orgID)
	if role != "" {
		db = db.Where("role = ?", role)
	}
	var total int64
	db.Count(&total)
	var users []User
	err := db.Order("created_at desc").Offset(offset).Limit(limit).Find(&users).Error
	return users, total, err
}

func getByID(id string) (*User, error) {
	var u User
	if err := database.DB.Where("id = ?", id).First(&u).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &u, nil
}

func updateUser(id string, fields map[string]any) error {
	res := database.DB.Model(&User{}).Where("id = ?", id).Updates(fields)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// getOrgIDForUser returns the org_id for a user's primary org membership.
// Returns nil (no error) if the user has no org membership.
func getOrgIDForUser(userID string) (*uuid.UUID, error) {
	var row struct {
		OrgID uuid.UUID
	}
	err := database.DB.Table("org_members").
		Select("org_id").
		Where("user_id = ?", userID).
		First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &row.OrgID, nil
}

// ---------------------------------------------------------------------------
// Schema fix — idempotently adds self-service columns at startup
// ---------------------------------------------------------------------------

func fixSchema() {
	database.DB.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_number TEXT DEFAULT ''`)
	database.DB.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS about TEXT DEFAULT ''`)
	database.DB.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{"email_notifications":true,"push_notifications":true,"sms_alerts":false,"upcoming_deadlines":true,"feedback_received":true,"session_reminders":true,"weekly_digest":false}'`)
	database.DB.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS appearance_prefs JSONB DEFAULT '{"theme":"light","density":"comfortable","language":"en","date_format":"DD/MM/YYYY","timezone":"IST (UTC+5:30)"}'`)
}

// ---------------------------------------------------------------------------
// Self-service profile repository
// ---------------------------------------------------------------------------

// MeRow is a scan target for the getMe raw query.
type MeRow struct {
	ID                   string  `gorm:"column:id"`
	Email                string  `gorm:"column:email"`
	Name                 string  `gorm:"column:name"`
	Role                 string  `gorm:"column:role"`
	AvatarURL            *string `gorm:"column:avatar_url"`
	MobileNumber         string  `gorm:"column:mobile_number"`
	About                string  `gorm:"column:about"`
	NotificationPrefsRaw string  `gorm:"column:notification_prefs_raw"`
	AppearancePrefsRaw   string  `gorm:"column:appearance_prefs_raw"`
	CreatedAt            string  `gorm:"column:created_at"`
}

// getMe returns the full user row including self-service columns.
func getMe(userID string) (*MeRow, error) {
	var row MeRow
	err := database.DB.Raw(`
		SELECT id, email, name, role, avatar_url,
		       COALESCE(mobile_number, '') AS mobile_number,
		       COALESCE(about, '') AS about,
		       COALESCE(notification_prefs::text, '{}') AS notification_prefs_raw,
		       COALESCE(appearance_prefs::text, '{}') AS appearance_prefs_raw,
		       created_at
		FROM users
		WHERE id = ?`, userID).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	if row.ID == "" {
		return nil, ErrNotFound
	}
	return &row, nil
}

// updateMe applies a partial field map to the authenticated user's own row.
func updateMe(userID string, fields map[string]any) error {
	res := database.DB.Model(&User{}).Where("id = ?", userID).Updates(fields)
	return res.Error
}

// updateNotificationPrefs persists serialised notification prefs via a JSONB cast.
func updateNotificationPrefs(userID string, prefs NotificationPrefs) error {
	b, err := json.Marshal(prefs)
	if err != nil {
		return err
	}
	return database.DB.Exec(
		`UPDATE users SET notification_prefs = ?::jsonb WHERE id = ?`,
		string(b), userID,
	).Error
}

// updateAppearancePrefs persists serialised appearance prefs via a JSONB cast.
func updateAppearancePrefs(userID string, prefs AppearancePrefs) error {
	b, err := json.Marshal(prefs)
	if err != nil {
		return err
	}
	return database.DB.Exec(
		`UPDATE users SET appearance_prefs = ?::jsonb WHERE id = ?`,
		string(b), userID,
	).Error
}

// getPasswordHash fetches only the bcrypt hash for a given user.
func getPasswordHash(userID string) (string, error) {
	var hash string
	err := database.DB.Raw(
		`SELECT password_hash FROM users WHERE id = ?`, userID,
	).Scan(&hash).Error
	return hash, err
}

// changePassword replaces the stored password hash for a user.
func changePassword(userID, newHash string) error {
	return database.DB.Exec(
		`UPDATE users SET password_hash = ? WHERE id = ?`, newHash, userID,
	).Error
}
