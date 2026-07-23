package certificates

import (
	"time"

	"github.com/google/uuid"
)

// IssuedCertificate is a rendered, persisted certificate given to a
// participant on program completion (or via manual PM/SA override). One row
// per completed enrollment (UNIQUE(enrollment_id) - v1 scope is program-level
// only, matching one certificate per program completion, not per phase).
type IssuedCertificate struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey;default:uuid_generate_v4()"`
	OrgID           uuid.UUID `gorm:"type:uuid;not null"`
	ProgramID       uuid.UUID `gorm:"type:uuid;not null"`
	EnrollmentID    uuid.UUID `gorm:"type:uuid;not null;uniqueIndex"`
	ParticipantID   uuid.UUID `gorm:"type:uuid;not null"`
	TemplateAssetID uuid.UUID `gorm:"type:uuid;not null;column:template_asset_id"`
	SerialCode      string    `gorm:"column:serial_code;not null;uniqueIndex"`
	FileData        []byte    `gorm:"column:file_data;type:bytea"`
	MimeType        string    `gorm:"column:mime_type;not null;default:'application/pdf'"`
	IssuedAt        time.Time `gorm:"column:issued_at;not null"`
	// RevokedAt nil = active. Set by a PM/SA manual revoke - the row is kept
	// (not deleted) so the verify endpoint can still report "revoked" rather
	// than "unknown code" for a certificate that was once genuinely issued.
	RevokedAt *time.Time `gorm:"column:revoked_at"`
	// IssuedBy nil = auto-issued by the completion hook. Non-nil = a PM/SA
	// manually issued this certificate (bypassing the 100%-completion gate).
	IssuedBy *uuid.UUID `gorm:"type:uuid;column:issued_by"`
}

func (IssuedCertificate) TableName() string { return "issued_certificates" }
