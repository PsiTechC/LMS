package users

import (
	"time"

	"github.com/google/uuid"
)

// UserAvatar stores an uploaded profile picture's bytes directly in Postgres,
// mirroring organizations.OrganizationLogo (bytea storage, same convention as
// content.ContentAsset) — kept off the frequently-read users row so an avatar
// swap is a cheap insert + User.AvatarURL pointer update rather than
// rewriting a large row.
type UserAvatar struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	UserID    uuid.UUID `gorm:"type:uuid;not null"`
	FileName  *string
	MimeType  *string
	FileSize  *int64
	FileData  []byte `gorm:"type:bytea"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (UserAvatar) TableName() string { return "user_avatars" }
