package sessions

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"time"
)

// This file lets startSessionService notify participants a session went
// live WITHOUT importing the communications package - modules never import
// each other's Go packages (CLAUDE.md). All recipient-resolution, email,
// audit-log, and in-app-notification logic stays exclusively in the
// communications module; this calls its internal-only
// POST /communications/internal/session-started endpoint over loopback
// HTTP instead of duplicating any of that logic here. Mirrors
// zoom_bridge.go's ensureZoomMeeting pattern exactly.

var notifyBridgeClient = &http.Client{Timeout: 10 * time.Second}

// notifySessionStarted fires the loopback call and is itself meant to be
// invoked as `go notifySessionStarted(...)` by the caller - a slow SMTP
// provider on the receiving end must never delay startSessionService's
// response, so this never returns anything the caller needs to wait on.
func notifySessionStarted(s *ClassSession, callerID, callerRole, joinURL string) {
	token, err := mintInternalToken(callerID, callerRole)
	if err != nil {
		log.Printf("session %s: could not mint internal token for notify: %v", s.ID, err)
		return
	}

	payload := map[string]any{
		"session_id":   s.ID.String(),
		"title":        s.Title,
		"scheduled_at": s.ScheduledAt.UTC().Format(time.RFC3339),
		"meeting_type": s.MeetingType,
		"join_url":     joinURL,
		"program_id":   s.ProgramID.String(),
	}
	if s.CohortID != nil {
		payload["cohort_id"] = s.CohortID.String()
	}
	if s.EngagementID != nil {
		payload["engagement_id"] = s.EngagementID.String()
	}
	body, err := json.Marshal(payload)
	if err != nil {
		log.Printf("session %s: notify payload build failed: %v", s.ID, err)
		return
	}

	req, err := http.NewRequest(http.MethodPost, internalAPIBaseURL()+"/communications/internal/session-started", bytes.NewReader(body))
	if err != nil {
		log.Printf("session %s: notify request build failed: %v", s.ID, err)
		return
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")

	resp, err := notifyBridgeClient.Do(req)
	if err != nil {
		log.Printf("session %s: failed to reach communications module for notify: %v", s.ID, err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		log.Printf("session %s: notify call failed status=%d body=%s", s.ID, resp.StatusCode, string(b))
	}
}
