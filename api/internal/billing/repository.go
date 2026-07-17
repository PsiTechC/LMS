package billing

import (
	"github.com/xa-lms/api/pkg/database"
)

// participantEnrollmentRow is the raw scan target for listParticipantEnrollments.
type participantEnrollmentRow struct {
	UserID       string
	Name         string
	Email        string
	ProgramTitle string
	EnrolledAt   string  // date-formatted by the query itself
	CompletedAt  *string // nullable
}

// listParticipantEnrollments reads directly against users/cohorts/programs/
// enrollments — tables this module doesn't own, matching the established
// cross-domain raw-SQL read convention used elsewhere in this codebase (e.g.
// the roles module querying org_members/users directly) rather than
// importing another module's Go package. Read-only: this module never
// writes to any of these tables.
//
// Scope: every participant-role enrollment in a program with is_open=TRUE —
// both paid and free open-program enrollees, regardless of any
// payment_orders row (per product decision: Billing's Participants view is
// "who's using an open program," not "who paid for one").
func listParticipantEnrollments() ([]participantEnrollmentRow, error) {
	var rows []participantEnrollmentRow
	err := database.DB.Raw(`
		SELECT
			u.id::text                                   AS user_id,
			u.name                                        AS name,
			u.email                                        AS email,
			p.title                                        AS program_title,
			to_char(e.enrolled_at, 'YYYY-MM-DD')           AS enrolled_at,
			to_char(e.completed_at, 'YYYY-MM-DD')          AS completed_at
		FROM enrollments e
		JOIN cohorts c  ON c.id = e.cohort_id
		JOIN programs p ON p.id = c.program_id
		JOIN users u    ON u.id = e.user_id
		WHERE p.is_open = TRUE AND e.role = 'participant'
		ORDER BY e.enrolled_at DESC
	`).Scan(&rows).Error
	return rows, err
}
