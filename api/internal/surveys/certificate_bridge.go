package surveys

import (
	"log"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/shared"
	"github.com/xa-lms/api/pkg/database"
)

// certificate_bridge.go mirrors activityprogress/certificate_bridge.go and
// assessments/certificate_bridge.go - same loopback-HTTP pattern (modules
// never import each other's Go packages). This module's
// recomputeEnrollmentCompletion also only has (userID, programID), so the
// enrollment_id is resolved the same way assessments' bridge does.
func triggerCertificateAutoIssue(userID, programID uuid.UUID) {
	// ORDER BY enrolled_at DESC: deterministically pick the most recent
	// enrollment if the user has more than one in this program - see
	// assessments/certificate_bridge.go's identical comment.
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
		log.Printf("[surveys] certificate auto-issue bridge call failed enrollment=%s: %v", enrollmentID, err)
		return
	}
	if result.StatusCode >= 400 {
		log.Printf("[surveys] certificate auto-issue failed enrollment=%s status=%d: %s", enrollmentID, result.StatusCode, result.ErrorMsg)
	}
}
