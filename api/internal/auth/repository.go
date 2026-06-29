package auth

import (
	"errors"

	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("user not found")

func findUserByEmail(email string) (*User, error) {
	var u User
	if err := database.DB.Where("email = ? AND is_active = true", email).First(&u).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &u, nil
}

func findUserByID(id string) (*User, error) {
	var u User
	if err := database.DB.Where("id = ? AND is_active = true", id).First(&u).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &u, nil
}

func createUser(u *User) error {
	return database.DB.Create(u).Error
}

func userExistsByEmail(email string) (bool, error) {
	var count int64
	if err := database.DB.Model(&User{}).Where("email = ?", email).Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

// findOrgIDForUser returns the first org_id the user belongs to, or nil if none.
func findOrgIDForUser(userID string) *string {
	var orgID string
	err := database.DB.
		Table("org_members").
		Select("org_id").
		Where("user_id = ?", userID).
		Limit(1).
		Scan(&orgID).Error
	if err != nil || orgID == "" {
		return nil
	}
	return &orgID
}

func findUserByVerificationToken(token string) (*User, error) {
	var u User
	if err := database.DB.Where("verification_token = ?", token).First(&u).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &u, nil
}

func markUserVerified(userID string) error {
	return database.DB.Model(&User{}).
		Where("id = ?", userID).
		Updates(map[string]interface{}{
			"is_verified":             true,
			"verification_token":      nil,
			"verification_expires_at": nil,
		}).Error
}

func setVerificationToken(userID, token string, expiresAt interface{}) error {
	return database.DB.Model(&User{}).
		Where("id = ?", userID).
		Updates(map[string]interface{}{
			"verification_token":      token,
			"verification_expires_at": expiresAt,
		}).Error
}
