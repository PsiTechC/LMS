package seed

import (
	"errors"
	"log"
	"os"

	"github.com/xa-lms/api/internal/auth"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

// SuperAdmin ensures a default superadmin exists for development.
// Email/password are read from env so they can be changed without code changes.
func SuperAdmin() error {
	email := os.Getenv("SUPERADMIN_EMAIL")
	if email == "" {
		email = "superadmin@xa-lms.dev"
	}
	password := os.Getenv("SUPERADMIN_PASSWORD")
	if password == "" {
		password = "XA@SuperAdmin2025"
	}

	var existing auth.User
	err := database.DB.Where("email = ?", email).First(&existing).Error
	if err == nil {
		log.Printf("✅ Superadmin already exists: %s", email)
		return nil
	}
	if !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}

	u := &auth.User{
		Email:        email,
		Name:         "XA Super Admin",
		PasswordHash: hash,
		Role:         "superadmin",
		IsActive:     true,
	}
	if err := database.DB.Create(u).Error; err != nil {
		return err
	}

	log.Printf("✅ Default superadmin created → email: %s | password: %s", email, password)
	return nil
}
