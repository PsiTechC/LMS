package rag

import (
	"time"

	"github.com/google/uuid"
)

// DocChunk is one embedded, retrievable slice of a source document
// (currently: a content_assets record). SourceType/SourceID let future
// corpora (e.g. discussion threads, program outlines) reuse the same table.
type DocChunk struct {
	ID         uuid.UUID  `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID      *uuid.UUID `gorm:"type:uuid"`
	ProgramID  *uuid.UUID `gorm:"type:uuid"`
	SourceType string     `gorm:"not null"` // content_asset
	SourceID   uuid.UUID  `gorm:"type:uuid;not null"`
	ChunkIndex int        `gorm:"not null"`
	Title      string     `gorm:"not null;default:''"`
	Content    string     `gorm:"not null"`
	CreatedAt  time.Time  `gorm:"not null;default:now()"`
}

func (DocChunk) TableName() string { return "ai_doc_chunks" }
