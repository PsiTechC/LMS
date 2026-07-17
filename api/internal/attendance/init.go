package attendance

import "github.com/xa-lms/api/pkg/database"

// InitSchema applies the QR-based attendance tables safely at startup.
func InitSchema() error {
	sqlDB, err := database.DB.DB()
	if err != nil {
		return err
	}
	_, err = sqlDB.Exec(`
		CREATE TABLE IF NOT EXISTS attendance_sessions (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), org_id UUID NOT NULL REFERENCES organizations(id), class_session_id UUID NOT NULL REFERENCES class_sessions(id), mode TEXT NOT NULL CHECK (mode IN ('virtual', 'in_person')), code TEXT NOT NULL UNIQUE, token TEXT NOT NULL UNIQUE, started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), ended_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended'))
		);
		CREATE TABLE IF NOT EXISTS attendance_records (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), attendance_session_id UUID NOT NULL REFERENCES attendance_sessions(id), participant_id UUID NOT NULL REFERENCES users(id), scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (attendance_session_id, participant_id)
		);
		CREATE INDEX IF NOT EXISTS idx_attendance_sessions_org_id ON attendance_sessions(org_id);
		CREATE INDEX IF NOT EXISTS idx_attendance_sessions_class_session_id ON attendance_sessions(class_session_id);
		CREATE INDEX IF NOT EXISTS idx_attendance_sessions_status ON attendance_sessions(status);
		CREATE INDEX IF NOT EXISTS idx_attendance_records_attendance_session_id ON attendance_records(attendance_session_id);
		CREATE INDEX IF NOT EXISTS idx_attendance_records_participant_id ON attendance_records(participant_id);
	`)
	return err
}
