package communications

import (
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
)

// withSessionNotifySeams swaps every DB/email seam notifySessionStartedService
// depends on for fakes, restoring the originals on test cleanup - same
// pattern as zoom/org_token_cache_test.go's withOrgCacheSeams.
func withSessionNotifySeams(t *testing.T, fakes struct {
	engagementParticipants func(string) ([]recipientRow, error)
	engagementOrgID        func(string) (string, error)
	recipients             func(string, string) ([]recipientRow, error)
	cohortMeta             func(string) (*cohortMetaRow, error)
	recipientsByProgram    func(string) ([]recipientRow, error)
	programOrgID           func(string) (string, error)
	createLog              func(*NotificationLog) error
	createInApp            func(*InAppNotification) error
	emailSend              func(string, string, string) error
}) {
	t.Helper()
	origEngagementParticipants := sessionNotifyGetEngagementParticipants
	origEngagementOrgID := sessionNotifyGetEngagementOrgID
	origRecipients := sessionNotifyGetRecipients
	origCohortMeta := sessionNotifyGetCohortMeta
	origRecipientsByProgram := sessionNotifyGetRecipientsByProgram
	origProgramOrgID := sessionNotifyGetProgramOrgID
	origCreateLog := sessionNotifyCreateLog
	origCreateInApp := sessionNotifyCreateInAppNotification
	origEmailSend := sessionNotifyEmailSend

	if fakes.engagementParticipants != nil {
		sessionNotifyGetEngagementParticipants = fakes.engagementParticipants
	}
	if fakes.engagementOrgID != nil {
		sessionNotifyGetEngagementOrgID = fakes.engagementOrgID
	}
	if fakes.recipients != nil {
		sessionNotifyGetRecipients = fakes.recipients
	}
	if fakes.cohortMeta != nil {
		sessionNotifyGetCohortMeta = fakes.cohortMeta
	}
	if fakes.recipientsByProgram != nil {
		sessionNotifyGetRecipientsByProgram = fakes.recipientsByProgram
	}
	if fakes.programOrgID != nil {
		sessionNotifyGetProgramOrgID = fakes.programOrgID
	}
	if fakes.createLog != nil {
		sessionNotifyCreateLog = fakes.createLog
	}
	if fakes.createInApp != nil {
		sessionNotifyCreateInAppNotification = fakes.createInApp
	}
	if fakes.emailSend != nil {
		sessionNotifyEmailSend = fakes.emailSend
	}

	t.Cleanup(func() {
		sessionNotifyGetEngagementParticipants = origEngagementParticipants
		sessionNotifyGetEngagementOrgID = origEngagementOrgID
		sessionNotifyGetRecipients = origRecipients
		sessionNotifyGetCohortMeta = origCohortMeta
		sessionNotifyGetRecipientsByProgram = origRecipientsByProgram
		sessionNotifyGetProgramOrgID = origProgramOrgID
		sessionNotifyCreateLog = origCreateLog
		sessionNotifyCreateInAppNotification = origCreateInApp
		sessionNotifyEmailSend = origEmailSend
	})
}

// ── resolveSessionStartedRecipients: which path gets picked ──────

func TestResolveSessionStartedRecipients_EngagementPath(t *testing.T) {
	want := []recipientRow{{UserID: uuid.NewString(), Email: "coachee@example.com", Name: "Coachee"}}
	withSessionNotifySeams(t, struct {
		engagementParticipants func(string) ([]recipientRow, error)
		engagementOrgID        func(string) (string, error)
		recipients             func(string, string) ([]recipientRow, error)
		cohortMeta             func(string) (*cohortMetaRow, error)
		recipientsByProgram    func(string) ([]recipientRow, error)
		programOrgID           func(string) (string, error)
		createLog              func(*NotificationLog) error
		createInApp            func(*InAppNotification) error
		emailSend              func(string, string, string) error
	}{
		engagementParticipants: func(engagementID string) ([]recipientRow, error) {
			if engagementID != "eng-1" {
				t.Fatalf("unexpected engagementID %q", engagementID)
			}
			return want, nil
		},
		engagementOrgID: func(string) (string, error) { return "org-1", nil },
		recipients: func(string, string) ([]recipientRow, error) {
			t.Fatal("cohort path should not be called when EngagementID is set")
			return nil, nil
		},
		recipientsByProgram: func(string) ([]recipientRow, error) {
			t.Fatal("program-wide path should not be called when EngagementID is set")
			return nil, nil
		},
	})

	got, orgID, err := resolveSessionStartedRecipients(SessionStartedNotifyRequest{EngagementID: "eng-1"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if orgID != "org-1" {
		t.Errorf("orgID = %q, want org-1", orgID)
	}
	if len(got) != 1 || got[0].Email != "coachee@example.com" {
		t.Errorf("recipients = %+v", got)
	}
}

func TestResolveSessionStartedRecipients_CohortPath(t *testing.T) {
	want := []recipientRow{{UserID: uuid.NewString(), Email: "p1@example.com"}}
	withSessionNotifySeams(t, struct {
		engagementParticipants func(string) ([]recipientRow, error)
		engagementOrgID        func(string) (string, error)
		recipients             func(string, string) ([]recipientRow, error)
		cohortMeta             func(string) (*cohortMetaRow, error)
		recipientsByProgram    func(string) ([]recipientRow, error)
		programOrgID           func(string) (string, error)
		createLog              func(*NotificationLog) error
		createInApp            func(*InAppNotification) error
		emailSend              func(string, string, string) error
	}{
		recipients: func(cohortID, audience string) ([]recipientRow, error) {
			if cohortID != "cohort-1" {
				t.Fatalf("unexpected cohortID %q", cohortID)
			}
			if audience != "all_participants" {
				t.Fatalf("expected audience 'all_participants', got %q", audience)
			}
			return want, nil
		},
		cohortMeta: func(cohortID string) (*cohortMetaRow, error) {
			return &cohortMetaRow{CohortName: "Cohort A", ProgramTitle: "Program", OrgID: "org-cohort"}, nil
		},
		recipientsByProgram: func(string) ([]recipientRow, error) {
			t.Fatal("program-wide path should not be called when CohortID is set")
			return nil, nil
		},
	})

	got, orgID, err := resolveSessionStartedRecipients(SessionStartedNotifyRequest{CohortID: "cohort-1"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if orgID != "org-cohort" {
		t.Errorf("orgID = %q, want org-cohort", orgID)
	}
	if len(got) != 1 || got[0].Email != "p1@example.com" {
		t.Errorf("recipients = %+v", got)
	}
}

// TestResolveSessionStartedRecipients_ProgramWidePathSpansMultipleCohorts is
// the trickiest resolution path: a session with cohort_id IS NULL must reach
// every cohort under the program, not just one. The fake here returns
// recipients from two distinct (fake) cohorts to prove the branch delegates
// to getRecipientsByProgram rather than any single-cohort query.
func TestResolveSessionStartedRecipients_ProgramWidePathSpansMultipleCohorts(t *testing.T) {
	want := []recipientRow{
		{UserID: uuid.NewString(), Email: "cohortA-participant@example.com"},
		{UserID: uuid.NewString(), Email: "cohortB-participant@example.com"},
	}
	withSessionNotifySeams(t, struct {
		engagementParticipants func(string) ([]recipientRow, error)
		engagementOrgID        func(string) (string, error)
		recipients             func(string, string) ([]recipientRow, error)
		cohortMeta             func(string) (*cohortMetaRow, error)
		recipientsByProgram    func(string) ([]recipientRow, error)
		programOrgID           func(string) (string, error)
		createLog              func(*NotificationLog) error
		createInApp            func(*InAppNotification) error
		emailSend              func(string, string, string) error
	}{
		recipients: func(string, string) ([]recipientRow, error) {
			t.Fatal("cohort path should not be called when only ProgramID is set")
			return nil, nil
		},
		recipientsByProgram: func(programID string) ([]recipientRow, error) {
			if programID != "program-1" {
				t.Fatalf("unexpected programID %q", programID)
			}
			return want, nil
		},
		programOrgID: func(string) (string, error) { return "org-program", nil },
	})

	got, orgID, err := resolveSessionStartedRecipients(SessionStartedNotifyRequest{ProgramID: "program-1"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if orgID != "org-program" {
		t.Errorf("orgID = %q, want org-program", orgID)
	}
	if len(got) != 2 {
		t.Fatalf("expected recipients from both cohorts under the program, got %d: %+v", len(got), got)
	}
	emails := map[string]bool{got[0].Email: true, got[1].Email: true}
	if !emails["cohortA-participant@example.com"] || !emails["cohortB-participant@example.com"] {
		t.Errorf("missing a cohort's participant: %+v", got)
	}
}

func TestResolveSessionStartedRecipients_NoIdentifiersErrors(t *testing.T) {
	_, _, err := resolveSessionStartedRecipients(SessionStartedNotifyRequest{})
	if err == nil {
		t.Fatal("expected an error when none of engagement_id/cohort_id/program_id are set")
	}
}

func TestResolveSessionStartedRecipients_EngagementTakesPriorityOverCohort(t *testing.T) {
	withSessionNotifySeams(t, struct {
		engagementParticipants func(string) ([]recipientRow, error)
		engagementOrgID        func(string) (string, error)
		recipients             func(string, string) ([]recipientRow, error)
		cohortMeta             func(string) (*cohortMetaRow, error)
		recipientsByProgram    func(string) ([]recipientRow, error)
		programOrgID           func(string) (string, error)
		createLog              func(*NotificationLog) error
		createInApp            func(*InAppNotification) error
		emailSend              func(string, string, string) error
	}{
		engagementParticipants: func(string) ([]recipientRow, error) { return nil, nil },
		engagementOrgID:        func(string) (string, error) { return "org-eng", nil },
		recipients: func(string, string) ([]recipientRow, error) {
			t.Fatal("cohort path must not run when EngagementID is also set")
			return nil, nil
		},
	})

	_, orgID, err := resolveSessionStartedRecipients(SessionStartedNotifyRequest{EngagementID: "eng-1", CohortID: "cohort-1"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if orgID != "org-eng" {
		t.Errorf("expected the engagement path to win, got orgID=%q", orgID)
	}
}

// ── buildSessionStartedContent: subject/body formatting ──────────

func TestBuildSessionStartedContent_VirtualIncludesJoinLink(t *testing.T) {
	req := SessionStartedNotifyRequest{
		Title:       "Leadership 101",
		MeetingType: "zoom_embedded",
		JoinURL:     "https://zoom.example/j/123",
		ScheduledAt: time.Date(2026, 7, 12, 15, 0, 0, 0, time.UTC),
	}
	subject, body := buildSessionStartedContent(req)
	if subject != "Session started: Leadership 101" {
		t.Errorf("subject = %q", subject)
	}
	if !containsAll(body, "https://zoom.example/j/123", "Join now", "Leadership 101") {
		t.Errorf("body missing expected content: %s", body)
	}
}

func TestBuildSessionStartedContent_InPersonHasNoLink(t *testing.T) {
	req := SessionStartedNotifyRequest{
		Title:       "Onsite Workshop",
		MeetingType: "in_person",
		ScheduledAt: time.Date(2026, 7, 12, 15, 0, 0, 0, time.UTC),
	}
	subject, body := buildSessionStartedContent(req)
	if subject != "Session started: Onsite Workshop" {
		t.Errorf("subject = %q", subject)
	}
	if containsAll(body, "href") {
		t.Errorf("in-person body should not contain a link: %s", body)
	}
	if !containsAll(body, "in-person location") {
		t.Errorf("in-person body should mention the location: %s", body)
	}
}

func TestBuildSessionStartedContent_VirtualWithoutJoinURLFallsBackToLocationOnly(t *testing.T) {
	// zoom_embedded but no join URL yet (e.g. meeting creation raced) - must
	// not emit a broken/empty link.
	req := SessionStartedNotifyRequest{
		Title:       "Edge Case",
		MeetingType: "zoom_embedded",
		JoinURL:     "",
		ScheduledAt: time.Now(),
	}
	_, body := buildSessionStartedContent(req)
	if containsAll(body, "href") {
		t.Errorf("body should not contain a link when JoinURL is empty: %s", body)
	}
}

func containsAll(haystack string, needles ...string) bool {
	for _, n := range needles {
		if !contains(haystack, n) {
			return false
		}
	}
	return true
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (substr == "" || indexOf(s, substr) >= 0)
}

func indexOf(s, substr string) int {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return i
		}
	}
	return -1
}

// ── sendSessionStartedNotifications: the write path, synchronous ─

func TestSendSessionStartedNotifications_WritesLogAndInAppPerRecipient(t *testing.T) {
	var loggedEmails []string
	var inAppTitles []string
	var sentTo []string

	withSessionNotifySeams(t, struct {
		engagementParticipants func(string) ([]recipientRow, error)
		engagementOrgID        func(string) (string, error)
		recipients             func(string, string) ([]recipientRow, error)
		cohortMeta             func(string) (*cohortMetaRow, error)
		recipientsByProgram    func(string) ([]recipientRow, error)
		programOrgID           func(string) (string, error)
		createLog              func(*NotificationLog) error
		createInApp            func(*InAppNotification) error
		emailSend              func(string, string, string) error
	}{
		createLog: func(l *NotificationLog) error {
			loggedEmails = append(loggedEmails, l.RecipientEmail)
			if l.Status != "sent" {
				t.Errorf("expected status 'sent', got %q", l.Status)
			}
			return nil
		},
		createInApp: func(n *InAppNotification) error {
			inAppTitles = append(inAppTitles, n.Title)
			if n.Type != "session_started" {
				t.Errorf("expected type 'session_started', got %q", n.Type)
			}
			return nil
		},
		emailSend: func(to, subject, body string) error {
			sentTo = append(sentTo, to)
			return nil
		},
	})

	recipients := []recipientRow{
		{UserID: uuid.NewString(), Email: "a@example.com"},
		{UserID: uuid.NewString(), Email: "b@example.com"},
	}
	req := SessionStartedNotifyRequest{SessionID: "sess-1", Title: "Test Session", MeetingType: "in_person"}
	sendSessionStartedNotifications(req, recipients, uuid.New())

	if len(sentTo) != 2 || len(loggedEmails) != 2 || len(inAppTitles) != 2 {
		t.Fatalf("expected 2 emails/logs/in-app rows, got sent=%d logs=%d inapp=%d", len(sentTo), len(loggedEmails), len(inAppTitles))
	}
	if sentTo[0] != "a@example.com" || sentTo[1] != "b@example.com" {
		t.Errorf("sentTo = %v", sentTo)
	}
}

func TestSendSessionStartedNotifications_EmailFailureStillLogsAndContinues(t *testing.T) {
	var statuses []string
	var errMsgs []string
	var inAppCount int

	withSessionNotifySeams(t, struct {
		engagementParticipants func(string) ([]recipientRow, error)
		engagementOrgID        func(string) (string, error)
		recipients             func(string, string) ([]recipientRow, error)
		cohortMeta             func(string) (*cohortMetaRow, error)
		recipientsByProgram    func(string) ([]recipientRow, error)
		programOrgID           func(string) (string, error)
		createLog              func(*NotificationLog) error
		createInApp            func(*InAppNotification) error
		emailSend              func(string, string, string) error
	}{
		createLog: func(l *NotificationLog) error {
			statuses = append(statuses, l.Status)
			errMsgs = append(errMsgs, l.ErrorMsg)
			return nil
		},
		createInApp: func(n *InAppNotification) error {
			inAppCount++
			return nil
		},
		emailSend: func(to, subject, body string) error {
			if to == "fails@example.com" {
				return errors.New("smtp rejected recipient")
			}
			return nil
		},
	})

	recipients := []recipientRow{
		{UserID: uuid.NewString(), Email: "fails@example.com"},
		{UserID: uuid.NewString(), Email: "ok@example.com"},
	}
	sendSessionStartedNotifications(SessionStartedNotifyRequest{SessionID: "sess-1", Title: "T"}, recipients, uuid.New())

	if len(statuses) != 2 {
		t.Fatalf("expected both recipients to get a log row despite one email failure, got %d", len(statuses))
	}
	if statuses[0] != "failed" || errMsgs[0] != "smtp rejected recipient" {
		t.Errorf("first recipient: status=%q errMsg=%q", statuses[0], errMsgs[0])
	}
	if statuses[1] != "sent" {
		t.Errorf("second recipient should still succeed: status=%q", statuses[1])
	}
	// In-app notification must still be created for both, including the one
	// whose email failed - email failure must not block the in-app channel.
	if inAppCount != 2 {
		t.Errorf("expected 2 in-app notifications, got %d", inAppCount)
	}
}

func TestSendSessionStartedNotifications_SkipsRecipientWithUnparsableUserID(t *testing.T) {
	var logCount, inAppCount int
	withSessionNotifySeams(t, struct {
		engagementParticipants func(string) ([]recipientRow, error)
		engagementOrgID        func(string) (string, error)
		recipients             func(string, string) ([]recipientRow, error)
		cohortMeta             func(string) (*cohortMetaRow, error)
		recipientsByProgram    func(string) ([]recipientRow, error)
		programOrgID           func(string) (string, error)
		createLog              func(*NotificationLog) error
		createInApp            func(*InAppNotification) error
		emailSend              func(string, string, string) error
	}{
		createLog:   func(*NotificationLog) error { logCount++; return nil },
		createInApp: func(*InAppNotification) error { inAppCount++; return nil },
		emailSend:   func(string, string, string) error { return nil },
	})

	recipients := []recipientRow{{UserID: "not-a-uuid", Email: "bad@example.com"}}
	sendSessionStartedNotifications(SessionStartedNotifyRequest{SessionID: "sess-1", Title: "T"}, recipients, uuid.New())

	if logCount != 0 || inAppCount != 0 {
		t.Errorf("expected a malformed recipient to be skipped entirely, got logCount=%d inAppCount=%d", logCount, inAppCount)
	}
}

// ── notifySessionStartedService: validation + org-parse guard ────

func TestNotifySessionStartedService_RequiresSessionIDAndTitle(t *testing.T) {
	if err := notifySessionStartedService(SessionStartedNotifyRequest{}); err == nil {
		t.Fatal("expected error when session_id and title are missing")
	}
}

func TestNotifySessionStartedService_InvalidOrgIDIsRejected(t *testing.T) {
	withSessionNotifySeams(t, struct {
		engagementParticipants func(string) ([]recipientRow, error)
		engagementOrgID        func(string) (string, error)
		recipients             func(string, string) ([]recipientRow, error)
		cohortMeta             func(string) (*cohortMetaRow, error)
		recipientsByProgram    func(string) ([]recipientRow, error)
		programOrgID           func(string) (string, error)
		createLog              func(*NotificationLog) error
		createInApp            func(*InAppNotification) error
		emailSend              func(string, string, string) error
	}{
		engagementParticipants: func(string) ([]recipientRow, error) { return nil, nil },
		engagementOrgID:        func(string) (string, error) { return "not-a-uuid", nil },
	})

	err := notifySessionStartedService(SessionStartedNotifyRequest{
		SessionID: "sess-1", Title: "T", EngagementID: "eng-1",
	})
	if err == nil {
		t.Fatal("expected an error when the resolved org id does not parse as a UUID")
	}
}
