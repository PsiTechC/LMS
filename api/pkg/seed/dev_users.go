package seed

import (
	"errors"
	"log"

	"github.com/xa-lms/api/internal/auth"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

type devUser struct {
	email    string
	name     string
	role     string
	password string
}

var devUsers = []devUser{
	{
		email:    "priya.mehta@xa-lms.dev",
		name:     "Priya Mehta",
		role:     "faculty",
		password: "Faculty@2025",
	},
	{
		email:    "arjun.das@xa-lms.dev",
		name:     "Arjun Das",
		role:     "participant",
		password: "Participant@2025",
	},
}

// DevUsers seeds one faculty and one participant for local development.
// Skips any user that already exists.
func DevUsers() error {
	for _, u := range devUsers {
		var existing auth.User
		err := database.DB.Where("email = ?", u.email).First(&existing).Error
		if err == nil {
			log.Printf("✅ Dev user already exists: %s", u.email)
			continue
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		hash, err := auth.HashPassword(u.password)
		if err != nil {
			return err
		}

		newUser := &auth.User{
			Email:        u.email,
			Name:         u.name,
			PasswordHash: hash,
			Role:         u.role,
			IsActive:     true,
		}
		if err := database.DB.Create(newUser).Error; err != nil {
			return err
		}
		log.Printf("✅ Dev user created → email: %s | password: %s | role: %s", u.email, u.password, u.role)
	}
	return nil
}
