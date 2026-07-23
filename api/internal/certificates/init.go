package certificates

import "github.com/xa-lms/api/pkg/database"

// InitSchema creates the issued_certificates table idempotently, per project
// convention (only this Go code applies schema at boot - see CLAUDE.md).
func InitSchema() error {
	sqlDB, err := database.DB.DB()
	if err != nil {
		return err
	}
	_, err = sqlDB.Exec(`
		CREATE TABLE IF NOT EXISTS issued_certificates (
		    id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
		    org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
		    program_id        UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
		    enrollment_id     UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
		    participant_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		    template_asset_id UUID NOT NULL REFERENCES content_assets(id) ON DELETE RESTRICT,
		    serial_code       TEXT NOT NULL,
		    file_data         BYTEA,
		    mime_type         VARCHAR(64) NOT NULL DEFAULT 'application/pdf',
		    issued_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
		    revoked_at        TIMESTAMPTZ,
		    issued_by         UUID REFERENCES users(id) ON DELETE SET NULL
		);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_issued_certificates_enrollment ON issued_certificates(enrollment_id);
		CREATE UNIQUE INDEX IF NOT EXISTS idx_issued_certificates_serial ON issued_certificates(serial_code);
		CREATE INDEX IF NOT EXISTS idx_issued_certificates_participant ON issued_certificates(participant_id);
		CREATE INDEX IF NOT EXISTS idx_issued_certificates_program ON issued_certificates(program_id);
	`)
	return err
}
