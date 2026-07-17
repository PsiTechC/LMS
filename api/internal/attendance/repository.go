package attendance

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

// classSessionForAttendance is the subset of class_sessions needed here, read
// via raw SQL so this module never imports the sessions package (modules
// never import each other's Go packages — CLAUDE.md).
type classSessionForAttendance struct {
	ID           uuid.UUID
	CohortID     *uuid.UUID
	ProgramID    uuid.UUID
	FacultyID    uuid.UUID
	Title        string
	ScheduledAt  time.Time
	DurationMins int
}

func getClassSessionForAttendance(id uuid.UUID) (*classSessionForAttendance, error) {
	var row struct {
		ID           string
		CohortID     *string
		ProgramID    string
		FacultyID    string
		Title        string
		ScheduledAt  time.Time
		DurationMins int
	}
	err := database.DB.Raw(`
		SELECT id::text AS id, cohort_id::text AS cohort_id, program_id::text AS program_id,
		       faculty_id::text AS faculty_id, title, scheduled_at, duration_mins
		FROM class_sessions WHERE id = ?::uuid
	`, id).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	if row.ID == "" {
		return nil, ErrClassSessionNotFound
	}
	out := &classSessionForAttendance{
		ID:           uuid.MustParse(row.ID),
		ProgramID:    uuid.MustParse(row.ProgramID),
		FacultyID:    uuid.MustParse(row.FacultyID),
		Title:        row.Title,
		ScheduledAt:  row.ScheduledAt,
		DurationMins: row.DurationMins,
	}
	if row.CohortID != nil && *row.CohortID != "" {
		cid := uuid.MustParse(*row.CohortID)
		out.CohortID = &cid
	}
	return out, nil
}

// resolveOrgIDForClassSession derives the owning org via the cohort if
// present, else the program, so attendance_sessions.org_id can be
// denormalized onto the row directly (matches payment_orders' convention —
// see internal/payments/model.go).
func resolveOrgIDForClassSession(cs *classSessionForAttendance) (uuid.UUID, error) {
	var orgIDStr string
	var err error
	if cs.CohortID != nil {
		err = database.DB.Raw(`SELECT org_id::text FROM cohorts WHERE id = ?::uuid`, cs.CohortID).Scan(&orgIDStr).Error
	} else {
		err = database.DB.Raw(`SELECT org_id::text FROM programs WHERE id = ?::uuid`, cs.ProgramID).Scan(&orgIDStr).Error
	}
	if err != nil {
		return uuid.Nil, err
	}
	if orgIDStr == "" {
		return uuid.Nil, ErrClassSessionNotFound
	}
	return uuid.Parse(orgIDStr)
}

func createAttendanceSession(id, orgID, classSessionID uuid.UUID, mode, code, token string) error {
	return database.DB.Create(&AttendanceSession{
		ID:             id,
		OrgID:          orgID,
		ClassSessionID: classSessionID,
		Mode:           mode,
		Code:           code,
		Token:          token,
		StartedAt:      time.Now(),
		Status:         StatusActive,
	}).Error
}

func getAttendanceSessionByID(id uuid.UUID) (*AttendanceSession, error) {
	var s AttendanceSession
	err := database.DB.Where("id = ?", id).First(&s).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrSessionNotFound
	}
	return &s, err
}

// getActiveAttendanceSessionForClassSession finds the most recently opened
// still-active window for classSessionID, so a caller re-opening the
// Attendance panel can reuse it instead of opening a duplicate.
func getActiveAttendanceSessionForClassSession(classSessionID uuid.UUID) (*AttendanceSession, error) {
	var s AttendanceSession
	err := database.DB.Where("class_session_id = ? AND status = ?", classSessionID, StatusActive).
		Order("started_at DESC").First(&s).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrSessionNotFound
	}
	return &s, err
}

func getAttendanceSessionByCode(code string) (*AttendanceSession, error) {
	var s AttendanceSession
	err := database.DB.Where("code = ?", code).First(&s).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrSessionNotFound
	}
	return &s, err
}

func endAttendanceSession(id uuid.UUID) error {
	res := database.DB.Model(&AttendanceSession{}).Where("id = ? AND status = ?", id, StatusActive).Updates(map[string]any{
		"status":   StatusEnded,
		"ended_at": time.Now(),
	})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrSessionNotFound
	}
	return nil
}

// isParticipantEnrolledForClassSession checks enrollment against the class
// session's cohort. A cohort-less (program-level) session has no roster to
// check against, so callers get ErrNoCohort rather than a silent false.
func isParticipantEnrolledForClassSession(cs *classSessionForAttendance, participantID string) (bool, error) {
	if cs.CohortID == nil {
		return false, ErrNoCohort
	}
	var count int64
	err := database.DB.Table("enrollments AS e").
		Where("e.cohort_id = ? AND e.user_id = ? AND e.status <> ?", cs.CohortID, participantID, "withdrawn").
		Count(&count).Error
	return count > 0, err
}

// insertAttendanceRecord is idempotent: a duplicate scan (same session +
// participant) is a safe no-op via ON CONFLICT DO NOTHING, never an error.
// Returns inserted=false (with the existing scan time) when it was already
// recorded — the classic single-round-trip "insert or return existing" CTE.
func insertAttendanceRecord(attendanceSessionID, participantID uuid.UUID) (inserted bool, scannedAt time.Time, err error) {
	var row struct {
		ScannedAt time.Time
		Inserted  bool
	}
	err = database.DB.Raw(`
		WITH ins AS (
			INSERT INTO attendance_records (attendance_session_id, participant_id)
			VALUES (?, ?)
			ON CONFLICT (attendance_session_id, participant_id) DO NOTHING
			RETURNING scanned_at, true AS inserted
		)
		SELECT scanned_at, inserted FROM ins
		UNION ALL
		SELECT scanned_at, false AS inserted FROM attendance_records
		WHERE attendance_session_id = ? AND participant_id = ? AND NOT EXISTS (SELECT 1 FROM ins)
		LIMIT 1
	`, attendanceSessionID, participantID, attendanceSessionID, participantID).Scan(&row).Error
	if err != nil {
		return false, time.Time{}, err
	}
	return row.Inserted, row.ScannedAt, nil
}

// getMyAttendanceRecord looks up a single participant's own check-in row for
// attendanceSessionID. No row (Scan leaves ScannedAt nil, no error) simply
// means they have not checked in yet.
func getMyAttendanceRecord(attendanceSessionID, participantID uuid.UUID) (*time.Time, error) {
	var row struct {
		ScannedAt *time.Time
	}
	err := database.DB.Raw(`
		SELECT scanned_at FROM attendance_records
		WHERE attendance_session_id = ? AND participant_id = ?
	`, attendanceSessionID, participantID).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	return row.ScannedAt, nil
}

// rosterRow is one enrolled participant, annotated with check-in status.
type rosterRow struct {
	ParticipantID string
	Name          string
	Email         string
	CheckedIn     bool
	CheckedInAt   *time.Time
}

func listRosterWithCheckIns(attendanceSessionID, cohortID uuid.UUID) ([]rosterRow, error) {
	var rows []rosterRow
	err := database.DB.Raw(`
		SELECT u.id::text AS participant_id, u.name, u.email,
		       (ar.id IS NOT NULL) AS checked_in, ar.scanned_at AS checked_in_at
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		LEFT JOIN attendance_records ar
		       ON ar.attendance_session_id = ? AND ar.participant_id = e.user_id
		WHERE e.cohort_id = ? AND e.role = 'participant' AND e.status <> 'withdrawn'
		ORDER BY u.name
	`, attendanceSessionID, cohortID).Scan(&rows).Error
	return rows, err
}
