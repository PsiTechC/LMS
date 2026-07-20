package attendance

// StartSessionRequest is the input for opening a new QR/code check-in window.
type StartSessionRequest struct {
	ClassSessionID string `json:"class_session_id"`
	Mode           string `json:"mode"` // "virtual" | "in_person"
}

// StartSessionResponse is returned after opening a check-in window. JoinURL
// and QRPayload are deliberately identical - QRPayload exists as its own
// field so the frontend never has to assume that's the case.
type StartSessionResponse struct {
	AttendanceSessionID string `json:"attendance_session_id"`
	Code                string `json:"code"`
	JoinURL             string `json:"join_url"`
	QRPayload           string `json:"qr_payload"`
}

// CheckInRequest is submitted either from a QR scan (Token present) or a
// manually-typed code (Token empty).
type CheckInRequest struct {
	Code  string `json:"code"`
	Token string `json:"token,omitempty"`
}

// CheckInResponse confirms a check-in. AlreadyCheckedIn distinguishes a fresh
// scan from a safe no-op repeat scan - both return 200, never an error.
type CheckInResponse struct {
	Status            string `json:"status"` // always "present" on success
	CheckedInAt       string `json:"checked_in_at"`
	AlreadyCheckedIn  bool   `json:"already_checked_in"`
	ClassSessionTitle string `json:"class_session_title"`
}

// RosterEntryDTO is one enrolled participant plus their check-in status, for
// a faculty's live roster view.
type RosterEntryDTO struct {
	ParticipantID string  `json:"participant_id"`
	Name          string  `json:"name"`
	Email         string  `json:"email"`
	CheckedIn     bool    `json:"checked_in"`
	CheckedInAt   *string `json:"checked_in_at,omitempty"`
}

// ParticipantStatusDTO is one enrolled participant's final attendance
// outcome for reporting. Status is always computed from CheckedIn - a
// participant with no attendance_records row is "absent" by omission, never
// a stored row, so there is no third "unknown" state.
type ParticipantStatusDTO struct {
	ID        string  `json:"id"`
	Name      string  `json:"name"`
	Status    string  `json:"status"` // "present" | "absent"
	ScannedAt *string `json:"scanned_at,omitempty"`
}

// AttendanceSummaryDTO is the finalized present/absent breakdown for a
// check-in window, for the faculty's post-save confirmation and reporting.
type AttendanceSummaryDTO struct {
	PresentCount  int                    `json:"present_count"`
	AbsentCount   int                    `json:"absent_count"`
	TotalEnrolled int                    `json:"total_enrolled"`
	Participants  []ParticipantStatusDTO `json:"participants"`
}

// MyCheckInStatusDTO is a participant's own check-in status for one
// attendance window - a lighter read than the faculty-only roster, for a
// participant's own device to poll while it displays the QR to be scanned
// externally (e.g. by their phone).
type MyCheckInStatusDTO struct {
	CheckedIn   bool    `json:"checked_in"`
	CheckedInAt *string `json:"checked_in_at,omitempty"`
}
