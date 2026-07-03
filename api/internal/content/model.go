package content

import (
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

type ContentAsset struct {
	ID          uuid.UUID      `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID       uuid.UUID      `gorm:"type:uuid;not null"`
	CreatedBy   uuid.UUID      `gorm:"type:uuid;not null"`
	Title       string         `gorm:"not null"`
	Description *string
	AssetType   string         `gorm:"type:asset_type;column:asset_type;not null"`
	Status      string         `gorm:"type:asset_status;not null;default:draft"`
	FileName    *string        `gorm:"column:file_name"`
	FileSize    *int64         `gorm:"column:file_size"`
	MimeType    *string        `gorm:"column:mime_type"`
	FileData    []byte         `gorm:"column:file_data;type:bytea"`
	Meta        []byte         `gorm:"type:jsonb;default:'{}'"`
	UsedInCount int            `gorm:"column:used_in_count;not null;default:0"`
	Tags        pq.StringArray `gorm:"type:text[];column:tags"`
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

func (ContentAsset) TableName() string { return "content_assets" }

type ContentAssetProgram struct {
	AssetID   uuid.UUID `gorm:"type:uuid;primaryKey"`
	ProgramID uuid.UUID `gorm:"type:uuid;primaryKey"`
}

func (ContentAssetProgram) TableName() string { return "content_asset_programs" }
