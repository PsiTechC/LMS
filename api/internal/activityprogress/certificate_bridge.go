package activityprogress

import (
	"log"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/shared"
)

// certificate_bridge.go lets recomputeEnrollmentCompletion's callers trigger
// certificate auto-issuance WITHOUT importing the certificates package -
// modules never import each other's Go packages (CLAUDE.md). Calls
// certificates' own POST /certificates/internal/:enrollment_id/auto-issue
// endpoint over loopback HTTP via shared.InternalPost, same bridge pattern
// sessions/zoom_bridge.go established for its one call site.
//
// Every caller here is always the participant themselves (activity_progress
// routes are RoleParticipant-only - see handler.go), so callerRole is fixed
// rather than threaded through from the original request.
func triggerCertificateAutoIssue(enrollmentID, userID uuid.UUID) {
	result, err := shared.InternalPost(
		"/certificates/internal/"+enrollmentID.String()+"/auto-issue",
		userID.String(), shared.RoleParticipant, nil,
	)
	if err != nil {
		log.Printf("[activityprogress] certificate auto-issue bridge call failed enrollment=%s: %v", enrollmentID, err)
		return
	}
	if result.StatusCode >= 400 {
		log.Printf("[activityprogress] certificate auto-issue failed enrollment=%s status=%d: %s", enrollmentID, result.StatusCode, result.ErrorMsg)
	}
}
