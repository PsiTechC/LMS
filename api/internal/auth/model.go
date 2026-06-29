package auth

import (
	"time"

	"github.com/google/uuid"
)

type User struct {
	ID                     uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	Email                  string     `gorm:"type:citext;uniqueIndex;not null"`
	Name                   string     `gorm:"not null"`
	PasswordHash           string     `gorm:"not null"`
	Role                   string     `gorm:"type:user_role;not null;default:participant"`
	AvatarURL              *string
	IsActive               bool       `gorm:"not null;default:true"`
	IsVerified             bool       `gorm:"not null;default:false"`
	VerificationToken      *string    `gorm:"uniqueIndex"`
	VerificationExpiresAt  *time.Time
	CreatedAt              time.Time
	UpdatedAt              time.Time
}

func (User) TableName() string { return "users" }

type Session struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	UserID       uuid.UUID `gorm:"type:uuid;not null"`
	RefreshToken string    `gorm:"uniqueIndex;not null"`
	ExpiresAt    time.Time `gorm:"not null"`
	IPAddress    *string
	UserAgent    *string
	CreatedAt    time.Time
}

func (Session) TableName() string { return "sessions" }
