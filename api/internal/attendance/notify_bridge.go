package attendance

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
)

// This file lets StartSession tell participants that attendance just opened
// WITHOUT importing the communications package - modules never import each
// other's Go packages (CLAUDE.md). It reuses communications' existing,
// already-built generic single-recipient in-app notification endpoint
// (POST /communications/internal/notify - see assessments/notify_bridge.go
// and capstone/notify_bridge.go for the same established convention) - no
// email, no new communications-module code. mintInternalToken/
// internalAPIBaseURL are this package's own (see zoom_bridge.go).

var attendanceNotifyClient = &http.Client{Timeout: 10 * time.Second}

// notifyAttendanceOpened is fire-and-forget (invoked as
// `go notifyAttendanceOpened(...)` by StartSession) - a slow notify call
// must never delay the caller's response. Purely informational: it never
// gates or affects the meeting join link, which is resolved independently
// of attendance. Only called for a class session that has a cohort -
// attendance for a cohort-less/program-wide session has no roster to
// notify (mirrors the cs.CohortID == nil guard already used elsewhere in
// this module, e.g. isParticipantEnrolledForClassSession).
func notifyAttendanceOpened(attendanceSessionID uuid.UUID, cs *classSessionForAttendance, callerID, callerRole string) {
	if cs.CohortID == nil {
		return
	}
	roster, err := listRosterWithCheckIns(attendanceSessionID, *cs.CohortID)
	if err != nil {
		log.Printf("attendance: could not resolve roster for cohort %s: %v", cs.CohortID, err)
		return
	}
	if len(roster) == 0 {
		return
	}

	token, err := mintInternalToken(callerID, callerRole)
	if err != nil {
		log.Printf("attendance: could not mint internal token for notify: %v", err)
		return
	}

	body := fmt.Sprintf("Attendance is now open for \"%s\". Check in from your Sessions tab - you can still join the session without checking in.", cs.Title)
	for _, r := range roster {
		payload := map[string]any{
			"user_id": r.ParticipantID,
			"title":   "Attendance is open",
			"body":    body,
			"type":    "attendance_open",
			"link":    "/dashboard/participant?tab=sessions",
		}
		reqBody, err := json.Marshal(payload)
		if err != nil {
			continue
		}
		req, err := http.NewRequest(http.MethodPost, internalAPIBaseURL()+"/communications/internal/notify", bytes.NewReader(reqBody))
		if err != nil {
			continue
		}
		req.Header.Set("Authorization", "Bearer "+token)
		req.Header.Set("Content-Type", "application/json")

		resp, err := attendanceNotifyClient.Do(req)
		if err != nil {
			log.Printf("attendance: notify failed for user %s: %v", r.ParticipantID, err)
			continue
		}
		if resp.StatusCode >= 400 {
			b, _ := io.ReadAll(resp.Body)
			log.Printf("attendance: notify call failed user=%s status=%d body=%s", r.ParticipantID, resp.StatusCode, string(b))
		}
		resp.Body.Close()
	}
}
