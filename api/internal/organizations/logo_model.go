package organizations

import (
	"time"

	"github.com/google/uuid"
)

// OrganizationLogo stores an uploaded org logo's bytes directly in Postgres,
// mirroring content.ContentAsset's bytea storage — kept off the frequently-
// read Organization row (branding is fetched on nearly every page load) so a
// logo swap is a cheap insert + Organization.LogoURL pointer update rather
// than rewriting a large row.
type OrganizationLogo struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID     uuid.UUID `gorm:"type:uuid;not null"`
	FileName  *string
	MimeType  *string
	FileSize  *int64
	FileData  []byte `gorm:"type:bytea"`
	CreatedAt time.Time
	UpdatedAt time.Time
}

func (OrganizationLogo) TableName() string { return "organization_logos" }
