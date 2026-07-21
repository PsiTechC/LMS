package attendance

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/xa-lms/api/internal/shared"
)

// maxCodeGenerationAttempts bounds retries on a code collision against
// attendance_sessions' unique constraint - vanishingly unlikely to ever be
// exhausted at this alphabet size (31^6 ≈ 887M combinations).
const maxCodeGenerationAttempts = 8

// StartSession creates a new attendance check-in window for classSessionID.
// If mode is virtual, it also ensures a Zoom meeting exists for the
// underlying class session by calling the zoom module's own HTTP endpoint
// (see zoom_bridge.go) rather than duplicating any of its logic here.
func StartSession(classSessionID uuid.UUID, mode, callerID, callerRole, joinBaseURL string) (*StartSessionResponse, error) {
	if mode != ModeVirtual && mode != ModeInPerson {
		return nil, ErrInvalidMode
	}

	cs, err := getClassSessionForAttendance(classSessionID)
	if err != nil {
		return nil, err
	}
	if !isOwnerOrAdmin(cs.FacultyID, callerID, callerRole) {
		return nil, ErrForbidden
	}

	orgID, err := resolveOrgIDForClassSession(cs)
	if err != nil {
		return nil, err
	}

	if mode == ModeVirtual && cs.MeetingType == "zoom_embedded" {
		if _, err := ensureZoomMeetingForClassSession(cs.ID.String(), cs.Title, cs.ScheduledAt, cs.DurationMins, callerID, callerRole); err != nil {
			if errors.Is(err, ErrZoomAccountNotLinked) {
				return nil, ErrZoomAccountNotLinked
			}
			return nil, &ZoomLinkError{Err: err}
		}
	}

	if mode == ModeVirtual && cs.MeetingType == "microsoft_teams" &&
		(cs.VirtualLink == nil || strings.TrimSpace(*cs.VirtualLink) == "") {
		return nil, ErrTeamsMeetingNotReady
	}

	id := uuid.New()
	token, err := GenerateSignedToken(id)
	if err != nil {
		return nil, err
	}

	var code string
	var lastErr error
	for attempt := 0; attempt < maxCodeGenerationAttempts; attempt++ {
		code, lastErr = GenerateSessionCode()
		if lastErr != nil {
			return nil, lastErr
		}
		lastErr = createAttendanceSession(id, orgID, classSessionID, mode, code, token)
		if lastErr == nil {
			break
		}
		if !isUniqueViolation(lastErr) {
			return nil, lastErr
		}
		// Collision on code (or, vanishingly unlikely, token) - retry with a
		// freshly generated code.
	}
	if lastErr != nil {
		return nil, lastErr
	}

	joinURL := joinBaseURL + "/join/" + code + "?t=" + token
	return &StartSessionResponse{
		AttendanceSessionID: id.String(),
		Code:                code,
		JoinURL:             joinURL,
		QRPayload:           joinURL,
	}, nil
}

// GetActiveSessionForClassSession returns the currently active attendance
// window for classSessionID, if one exists, reconstructing the same
// join_url/qr_payload shape StartSession returns - lets a caller re-opening
// the Attendance panel reuse it instead of opening a duplicate window.
// Returns ErrSessionNotFound if no window is currently active.
func GetActiveSessionForClassSession(classSessionID uuid.UUID, callerID, callerRole, joinBaseURL string) (*StartSessionResponse, error) {
	cs, err := getClassSessionForAttendance(classSessionID)
	if err != nil {
		return nil, err
	}
	if !isOwnerOrAdmin(cs.FacultyID, callerID, callerRole) {
		return nil, ErrForbidden
	}
	sess, err := getActiveAttendanceSessionForClassSession(classSessionID)
	if err != nil {
		return nil, err
	}
	joinURL := joinBaseURL + "/join/" + sess.Code + "?t=" + sess.Token
	return &StartSessionResponse{
		AttendanceSessionID: sess.ID.String(),
		Code:                sess.Code,
		JoinURL:             joinURL,
		QRPayload:           joinURL,
	}, nil
}

// GetActiveSessionForParticipant returns the currently active attendance
// window's QR/code for classSessionID, for display on a participant's own
// device - e.g. to be scanned by their phone, distinct from the browser
// showing it. Unlike GetActiveSessionForClassSession (faculty-only), this
// checks the caller's own enrollment instead of faculty ownership.
func GetActiveSessionForParticipant(classSessionID uuid.UUID, participantID, joinBaseURL string) (*StartSessionResponse, error) {
	cs, err := getClassSessionForAttendance(classSessionID)
	if err != nil {
		return nil, err
	}
	enrolled, err := isParticipantEnrolledForClassSession(cs, participantID)
	if err != nil {
		return nil, err
	}
	if !enrolled {
		return nil, ErrForbidden
	}
	sess, err := getActiveAttendanceSessionForClassSession(classSessionID)
	if err != nil {
		return nil, err
	}
	joinURL := joinBaseURL + "/join/" + sess.Code + "?t=" + sess.Token
	return &StartSessionResponse{
		AttendanceSessionID: sess.ID.String(),
		Code:                sess.Code,
		JoinURL:             joinURL,
		QRPayload:           joinURL,
	}, nil
}

// GetMyCheckInStatus reports whether callerID has checked into
// attendanceSessionID yet, for their own device to poll while it displays
// the QR/code to be scanned externally.
func GetMyCheckInStatus(attendanceSessionID uuid.UUID, callerID string) (*MyCheckInStatusDTO, error) {
	pid, err := uuid.Parse(callerID)
	if err != nil {
		return nil, err
	}
	scannedAt, err := getMyAttendanceRecord(attendanceSessionID, pid)
	if err != nil {
		return nil, err
	}
	if scannedAt == nil {
		return &MyCheckInStatusDTO{CheckedIn: false}, nil
	}
	s := scannedAt.Format(time.RFC3339)
	return &MyCheckInStatusDTO{CheckedIn: true, CheckedInAt: &s}, nil
}

// EndSession marks an attendance session ended. Only the faculty who started
// it (or an admin-tier role) may end it. After this, check-in attempts
// against it are rejected (ErrSessionEnded).
func EndSession(attendanceSessionID uuid.UUID, callerID, callerRole string) error {
	sess, err := getAttendanceSessionByID(attendanceSessionID)
	if err != nil {
		return err
	}
	cs, err := getClassSessionForAttendance(sess.ClassSessionID)
	if err != nil {
		return err
	}
	if !isOwnerOrAdmin(cs.FacultyID, callerID, callerRole) {
		return ErrForbidden
	}
	return endAttendanceSession(attendanceSessionID)
}

// CheckIn records participantID's attendance via code (+ optional token from
// a QR scan). Idempotent: scanning twice never errors, the second call just
// reports AlreadyCheckedIn=true.
func CheckIn(code, token, participantID string) (*CheckInResponse, error) {
	sess, err := getAttendanceSessionByCode(code)
	if err != nil {
		return nil, err
	}

	var tokenSessionID *uuid.UUID
	if token != "" {
		sid, err := VerifySignedToken(token)
		if err != nil {
			return nil, err
		}
		tokenSessionID = &sid
	}

	cs, err := getClassSessionForAttendance(sess.ClassSessionID)
	if err != nil {
		return nil, err
	}
	enrolled, err := isParticipantEnrolledForClassSession(cs, participantID)
	if err != nil {
		return nil, err
	}

	if err := decideCheckIn(sess, tokenSessionID, enrolled); err != nil {
		return nil, err
	}

	pid, err := uuid.Parse(participantID)
	if err != nil {
		return nil, err
	}
	inserted, scannedAt, err := insertAttendanceRecord(sess.ID, pid)
	if err != nil {
		return nil, err
	}
	return &CheckInResponse{
		Status:            "present",
		CheckedInAt:       scannedAt.Format(time.RFC3339),
		AlreadyCheckedIn:  !inserted,
		ClassSessionTitle: cs.Title,
	}, nil
}

// decideCheckIn is the pure decision logic for a check-in attempt, kept
// separate from DB access so it's unit-testable without a live database
// (matches this repo's convention - see payments/checkout_service_test.go).
func decideCheckIn(sess *AttendanceSession, tokenSessionID *uuid.UUID, enrolled bool) error {
	if tokenSessionID != nil && *tokenSessionID != sess.ID {
		return ErrInvalidToken
	}
	if sess.Status != StatusActive {
		return ErrSessionEnded
	}
	if !enrolled {
		return ErrNotEnrolled
	}
	return nil
}

// ListRecords returns the enrolled roster for attendanceSessionID's cohort,
// each entry annotated with whether/when they checked in. Faculty-only -
// same ownership rule as Start/EndSession.
func ListRecords(attendanceSessionID uuid.UUID, callerID, callerRole string) ([]RosterEntryDTO, error) {
	sess, err := getAttendanceSessionByID(attendanceSessionID)
	if err != nil {
		return nil, err
	}
	cs, err := getClassSessionForAttendance(sess.ClassSessionID)
	if err != nil {
		return nil, err
	}
	if !isOwnerOrAdmin(cs.FacultyID, callerID, callerRole) {
		return nil, ErrForbidden
	}
	if cs.CohortID == nil {
		return nil, ErrNoCohort
	}

	rows, err := listRosterWithCheckIns(attendanceSessionID, *cs.CohortID)
	if err != nil {
		return nil, err
	}
	out := make([]RosterEntryDTO, 0, len(rows))
	for _, r := range rows {
		var checkedAt *string
		if r.CheckedInAt != nil {
			s := r.CheckedInAt.Format(time.RFC3339)
			checkedAt = &s
		}
		out = append(out, RosterEntryDTO{
			ParticipantID: r.ParticipantID,
			Name:          r.Name,
			Email:         r.Email,
			CheckedIn:     r.CheckedIn,
			CheckedInAt:   checkedAt,
		})
	}
	return out, nil
}

// GetSummary returns the finalized present/absent breakdown for
// attendanceSessionID's cohort - same ownership/cohort rules as ListRecords,
// reusing the identical roster query.
func GetSummary(attendanceSessionID uuid.UUID, callerID, callerRole string) (*AttendanceSummaryDTO, error) {
	sess, err := getAttendanceSessionByID(attendanceSessionID)
	if err != nil {
		return nil, err
	}
	cs, err := getClassSessionForAttendance(sess.ClassSessionID)
	if err != nil {
		return nil, err
	}
	if !isOwnerOrAdmin(cs.FacultyID, callerID, callerRole) {
		return nil, ErrForbidden
	}
	if cs.CohortID == nil {
		return nil, ErrNoCohort
	}

	rows, err := listRosterWithCheckIns(attendanceSessionID, *cs.CohortID)
	if err != nil {
		return nil, err
	}
	return computeSummary(rows), nil
}

// computeSummary is the pure present/absent aggregation, kept separate from
// DB access so it's unit-testable without a live database (matches this
// repo's convention - see payments/checkout_service_test.go). A participant
// with no attendance_records row (CheckedIn=false) is computed as "absent"
// here - never stored as a row anywhere.
func computeSummary(rows []rosterRow) *AttendanceSummaryDTO {
	summary := &AttendanceSummaryDTO{
		TotalEnrolled: len(rows),
		Participants:  make([]ParticipantStatusDTO, 0, len(rows)),
	}
	for _, r := range rows {
		status := "absent"
		var scannedAt *string
		if r.CheckedIn {
			status = "present"
			summary.PresentCount++
			if r.CheckedInAt != nil {
				s := r.CheckedInAt.Format(time.RFC3339)
				scannedAt = &s
			}
		} else {
			summary.AbsentCount++
		}
		summary.Participants = append(summary.Participants, ParticipantStatusDTO{
			ID:        r.ParticipantID,
			Name:      r.Name,
			Status:    status,
			ScannedAt: scannedAt,
		})
	}
	return summary
}

// isOwnerOrAdmin mirrors the same rule used by the zoom module: the faculty
// who owns the underlying class session, or an admin-tier role, may manage
// its attendance window.
func isOwnerOrAdmin(facultyID uuid.UUID, callerUserID, callerRole string) bool {
	if callerRole == shared.RoleSuperAdmin || callerRole == shared.RoleSuperAdminSecondary || callerRole == shared.RoleProgramManager {
		return true
	}
	return facultyID.String() == callerUserID
}

// isUniqueViolation detects a Postgres unique-constraint violation (SQLSTATE
// 23505) so StartSession can retry on a code collision without treating any
// other DB error the same way.
func isUniqueViolation(err error) bool {
	var pqErr *pq.Error
	if errors.As(err, &pqErr) {
		return pqErr.Code == "23505"
	}
	return false
}
