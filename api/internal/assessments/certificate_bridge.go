package assessments

import (
	"log"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/shared"
	"github.com/xa-lms/api/pkg/database"
)

// certificate_bridge.go mirrors activityprogress/certificate_bridge.go -
// same loopback-HTTP pattern (modules never import each other's Go
// packages), duplicated here because recomputeEnrollmentCompletion's own
// query is already duplicated per-module (see its doc comment at
// repository.go:167) rather than centralized, so this bridge follows suit.
//
// Unlike activityprogress, this module's recomputeEnrollmentCompletion only
// has (userID, programID), not an enrollment_id - resolve it via the same
// cohorts join the recompute query itself uses.
func triggerCertificateAutoIssue(userID, programID uuid.UUID) {
	// ORDER BY enrolled_at DESC: a user can in principle have more than one
	// enrollment in the same program (re-enrolled after a transfer, etc.) -
	// deterministically pick the most recent one rather than an arbitrary
	// row, since that's the enrollment whose completion_percent the recompute
	// above actually just updated.
	var enrollmentID uuid.UUID
	err := database.DB.Raw(`
		SELECT e.id FROM enrollments e
		JOIN cohorts c ON c.id = e.cohort_id
		WHERE c.program_id = ? AND e.user_id = ?
		ORDER BY e.enrolled_at DESC
		LIMIT 1
	`, programID, userID).Scan(&enrollmentID).Error
	if err != nil || enrollmentID == uuid.Nil {
		return
	}

	result, err := shared.InternalPost(
		"/certificates/internal/"+enrollmentID.String()+"/auto-issue",
		userID.String(), shared.RoleParticipant, nil,
	)
	if err != nil {
		log.Printf("[assessments] certificate auto-issue bridge call failed enrollment=%s: %v", enrollmentID, err)
		return
	}
	if result.StatusCode >= 400 {
		log.Printf("[assessments] certificate auto-issue failed enrollment=%s status=%d: %s", enrollmentID, result.StatusCode, result.ErrorMsg)
	}
}
