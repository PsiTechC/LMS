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
