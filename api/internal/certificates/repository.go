package certificates

import (
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var (
	ErrNotFound  = errors.New("not found")
	ErrForbidden = errors.New("forbidden")
)

// enrollmentContextRow is everything render() needs about a completed
// enrollment, resolved via raw SQL so this module never imports cohorts/
// programs/users' Go packages (CLAUDE.md).
type enrollmentContextRow struct {
	EnrollmentID     string
	OrgID            string
	ProgramID        string
	ProgramTitle     string
	ParticipantID    string
	ParticipantName  string
	ParticipantEmail string
	CompletedAt      *time.Time
}

func getEnrollmentContext(enrollmentID string) (*enrollmentContextRow, error) {
	var row enrollmentContextRow
	err := database.DB.Raw(`
		SELECT e.id::text AS enrollment_id,
		       pr.org_id::text AS org_id,
		       pr.id::text AS program_id,
		       pr.title AS program_title,
		       u.id::text AS participant_id,
		       u.name AS participant_name,
		       u.email AS participant_email,
		       e.completed_at
		FROM enrollments e
		JOIN cohorts c ON c.id = e.cohort_id
		JOIN programs pr ON pr.id = c.program_id
		JOIN users u ON u.id = e.user_id
		WHERE e.id = ?::uuid
	`, enrollmentID).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	if row.EnrollmentID == "" {
		return nil, ErrNotFound
	}
	return &row, nil
}

// getEnrollmentCompletionPercent is used by the completion-hook hand-off
// (see hook.go) to confirm an enrollment is genuinely at 100% before
// issuing, rather than trusting a caller-supplied claim.
func getEnrollmentCompletionPercent(enrollmentID string) (int, error) {
	var pct int
	err := database.DB.Raw(`SELECT completion_percent FROM enrollments WHERE id = ?::uuid`, enrollmentID).Scan(&pct).Error
	return pct, err
}

// templateAssetRow is the subset of content_assets needed to render a
// certificate, read via raw SQL (never importing the content package).
type templateAssetRow struct {
	ID       string
	OrgID    string
	FileData []byte // background image bytes, if any
	MimeType *string
	Meta     []byte // JSON - unmarshalled into certificateConfig locally
}

// getActiveCertificateTemplateForProgram returns the certificate template
// asset attached to programID, if any (via content_asset_programs, the
// existing generic asset<->program junction table - see content/model.go's
// ContentAssetProgram). Program-level attachment only, v1 scope: if more
// than one certificate asset is attached, the most recently updated wins.
func getActiveCertificateTemplateForProgram(programID string) (*templateAssetRow, error) {
	var row templateAssetRow
	err := database.DB.Raw(`
		SELECT ca.id::text AS id, ca.org_id::text AS org_id, ca.file_data, ca.mime_type, ca.meta
		FROM content_assets ca
		JOIN content_asset_programs cap ON cap.asset_id = ca.id
		WHERE cap.program_id = ?::uuid
		  AND ca.asset_type = 'certificate'
		  AND ca.status != 'archived'
		ORDER BY ca.updated_at DESC
		LIMIT 1
	`, programID).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	if row.ID == "" {
		return nil, ErrNotFound
	}
	return &row, nil
}

func getTemplateAssetByID(assetID string) (*templateAssetRow, error) {
	var row templateAssetRow
	err := database.DB.Raw(`
		SELECT id::text AS id, org_id::text AS org_id, file_data, mime_type, meta
		FROM content_assets WHERE id = ?::uuid AND asset_type = 'certificate'
	`, assetID).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	if row.ID == "" {
		return nil, ErrNotFound
	}
	return &row, nil
}

// parsePlacements unmarshals a template asset's meta JSON into this module's
// local certificatePlacements shape (see placements.go for why this is a
// local copy rather than an import of content.CertificateConfig).
func parsePlacements(meta []byte) *certificatePlacements {
	if len(meta) == 0 {
		return nil
	}
	var cfg certificateConfig
	if err := json.Unmarshal(meta, &cfg); err != nil {
		return nil
	}
	return cfg.Placements
}

// ── issued_certificates CRUD ─────────────────────────────────────────────

func getIssuedCertificateByEnrollment(enrollmentID uuid.UUID) (*IssuedCertificate, error) {
	var c IssuedCertificate
	if err := database.DB.Where("enrollment_id = ?", enrollmentID).First(&c).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &c, nil
}

func createIssuedCertificate(c *IssuedCertificate) error {
	return database.DB.Create(c).Error
}

func getIssuedCertificateByID(id uuid.UUID) (*IssuedCertificate, error) {
	var c IssuedCertificate
	if err := database.DB.Where("id = ?", id).First(&c).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &c, nil
}

func getIssuedCertificateBySerial(serial string) (*IssuedCertificate, error) {
	var c IssuedCertificate
	if err := database.DB.Where("serial_code = ?", serial).First(&c).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &c, nil
}

func listIssuedCertificatesForParticipant(participantID uuid.UUID) ([]IssuedCertificate, error) {
	var rows []IssuedCertificate
	err := database.DB.
		Where("participant_id = ? AND revoked_at IS NULL", participantID).
		Order("issued_at DESC").
		Find(&rows).Error
	return rows, err
}

func revokeIssuedCertificate(id uuid.UUID) error {
	now := time.Now()
	res := database.DB.Model(&IssuedCertificate{}).Where("id = ? AND revoked_at IS NULL", id).Update("revoked_at", now)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// programParticipantNameFor is used by the verify endpoint's DTO builder.
type verifyRow struct {
	ParticipantName string
	ProgramTitle    string
}

func getVerifyContext(programID, participantID string) (*verifyRow, error) {
	var row verifyRow
	err := database.DB.Raw(`
		SELECT u.name AS participant_name, pr.title AS program_title
		FROM users u, programs pr
		WHERE u.id = ?::uuid AND pr.id = ?::uuid
	`, participantID, programID).Scan(&row).Error
	return &row, err
}
