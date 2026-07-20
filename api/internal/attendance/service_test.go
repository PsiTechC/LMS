package attendance

import (
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

// decideCheckIn is the pure decision logic CheckIn delegates to - see
// service.go. Testing it directly (no DB) matches this repo's convention for
// unit-testing service logic (see payments/checkout_service_test.go).

func TestDecideCheckIn_ValidScanSucceeds(t *testing.T) {
	sess := &AttendanceSession{ID: uuid.New(), Status: StatusActive}
	if err := decideCheckIn(sess, nil, true); err != nil {
		t.Fatalf("decideCheckIn = %v, want nil", err)
	}
}

func TestDecideCheckIn_ValidQRTokenMatchingSessionSucceeds(t *testing.T) {
	sess := &AttendanceSession{ID: uuid.New(), Status: StatusActive}
	tokenSessionID := sess.ID
	if err := decideCheckIn(sess, &tokenSessionID, true); err != nil {
		t.Fatalf("decideCheckIn = %v, want nil", err)
	}
}

func TestDecideCheckIn_TokenForDifferentSessionRejected(t *testing.T) {
	sess := &AttendanceSession{ID: uuid.New(), Status: StatusActive}
	mismatched := uuid.New() // guaranteed different from sess.ID
	err := decideCheckIn(sess, &mismatched, true)
	if !errors.Is(err, ErrInvalidToken) {
		t.Fatalf("decideCheckIn = %v, want ErrInvalidToken", err)
	}
}

func TestDecideCheckIn_EndedSessionRejected(t *testing.T) {
	sess := &AttendanceSession{ID: uuid.New(), Status: StatusEnded}
	err := decideCheckIn(sess, nil, true)
	if !errors.Is(err, ErrSessionEnded) {
		t.Fatalf("decideCheckIn = %v, want ErrSessionEnded", err)
	}
}

func TestDecideCheckIn_NotEnrolledRejected(t *testing.T) {
	sess := &AttendanceSession{ID: uuid.New(), Status: StatusActive}
	err := decideCheckIn(sess, nil, false)
	if !errors.Is(err, ErrNotEnrolled) {
		t.Fatalf("decideCheckIn = %v, want ErrNotEnrolled", err)
	}
}

func TestDecideCheckIn_EndedTakesPriorityOverEnrollment(t *testing.T) {
	// An ended session should report SESSION_ENDED even for a non-enrolled
	// caller - the session state is checked before enrollment.
	sess := &AttendanceSession{ID: uuid.New(), Status: StatusEnded}
	err := decideCheckIn(sess, nil, false)
	if !errors.Is(err, ErrSessionEnded) {
		t.Fatalf("decideCheckIn = %v, want ErrSessionEnded", err)
	}
}

// Duplicate-scan idempotency itself is enforced at the DB layer
// (insertAttendanceRecord's ON CONFLICT DO NOTHING, see repository.go) since
// it's inherently a concurrency/uniqueness property, not decision logic -
// decideCheckIn is invoked identically on a repeat scan (same active
// session, same enrolled participant) and returns nil both times, exactly as
// covered by TestDecideCheckIn_ValidScanSucceeds above; the repository's
// insert-or-return-existing query is what turns the second call into
// AlreadyCheckedIn=true instead of a duplicate row or an error.
//
// Similarly, an invalid/unknown code is rejected by getAttendanceSessionByCode
// returning ErrSessionNotFound (repository.go) before decideCheckIn is ever
// called - exercised at the handler layer (invalid code -> 404), not here.

// computeSummary is the pure present/absent aggregation service.go's
// GetSummary delegates to - tested directly (no DB), same convention as
// decideCheckIn above.

func TestComputeSummary_EighteenEnrolledTwoScanned(t *testing.T) {
	now := time.Now()
	rows := make([]rosterRow, 18)
	for i := range rows {
		rows[i] = rosterRow{ParticipantID: uuid.NewString(), Name: "Participant"}
	}
	rows[3].CheckedIn = true
	rows[3].CheckedInAt = &now
	rows[9].CheckedIn = true
	rows[9].CheckedInAt = &now

	summary := computeSummary(rows)

	if summary.TotalEnrolled != 18 {
		t.Fatalf("TotalEnrolled = %d, want 18", summary.TotalEnrolled)
	}
	if summary.PresentCount != 2 {
		t.Fatalf("PresentCount = %d, want 2", summary.PresentCount)
	}
	if summary.AbsentCount != 16 {
		t.Fatalf("AbsentCount = %d, want 16", summary.AbsentCount)
	}
	if len(summary.Participants) != 18 {
		t.Fatalf("len(Participants) = %d, want 18", len(summary.Participants))
	}

	var present, absent int
	for _, p := range summary.Participants {
		switch p.Status {
		case "present":
			present++
			if p.ScannedAt == nil {
				t.Errorf("present participant %s has no ScannedAt", p.ID)
			}
		case "absent":
			absent++
			if p.ScannedAt != nil {
				t.Errorf("absent participant %s unexpectedly has ScannedAt", p.ID)
			}
		default:
			t.Errorf("unexpected status %q for participant %s", p.Status, p.ID)
		}
	}
	if present != 2 || absent != 16 {
		t.Fatalf("participant-level counts = present:%d absent:%d, want 2/16", present, absent)
	}
}

func TestComputeSummary_NoEnrollments(t *testing.T) {
	summary := computeSummary(nil)
	if summary.TotalEnrolled != 0 || summary.PresentCount != 0 || summary.AbsentCount != 0 {
		t.Fatalf("expected all-zero summary for no enrollments, got %+v", summary)
	}
	if len(summary.Participants) != 0 {
		t.Fatalf("expected empty participants slice, got %d", len(summary.Participants))
	}
}

func TestComputeSummary_AllPresent(t *testing.T) {
	now := time.Now()
	rows := []rosterRow{
		{ParticipantID: uuid.NewString(), Name: "A", CheckedIn: true, CheckedInAt: &now},
		{ParticipantID: uuid.NewString(), Name: "B", CheckedIn: true, CheckedInAt: &now},
	}
	summary := computeSummary(rows)
	if summary.PresentCount != 2 || summary.AbsentCount != 0 || summary.TotalEnrolled != 2 {
		t.Fatalf("got present=%d absent=%d total=%d, want 2/0/2", summary.PresentCount, summary.AbsentCount, summary.TotalEnrolled)
	}
}
