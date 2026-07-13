package zoom

import (
	"time"

	"github.com/google/uuid"
)

// ZoomAccount maps a faculty/coach user to their licensed Zoom user id, so
// meetings are hosted under the individual's own Zoom account rather than a
// shared "me" account. One row per user.
type ZoomAccount struct {
	ID                    uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	UserID                uuid.UUID `gorm:"type:uuid;not null;uniqueIndex"`
	ZoomUserID            string    `gorm:"not null"`
	ZoomEmail             *string
	EncryptedAccessToken  *string
	EncryptedRefreshToken *string
	TokenExpiresAt        *time.Time
	Status                string `gorm:"not null;default:'disconnected'"`
	ConnectedAt           *time.Time
	CreatedAt             time.Time
	UpdatedAt             time.Time
}

// Zoom account connection statuses.
const (
	ZoomAccountStatusActive       = "active"
	ZoomAccountStatusExpired      = "expired"
	ZoomAccountStatusDisconnected = "disconnected"
)

func (ZoomAccount) TableName() string { return "zoom_accounts" }
