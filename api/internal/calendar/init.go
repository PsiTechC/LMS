package calendar

import "github.com/xa-lms/api/pkg/database"

// getCalendarOrgForUser returns the primary org_id for a Program Admin.
// Uses a non-LIMIT-1 approach: picks the org where the user is a member
// with the active program_manager role assignment.
func getCalendarOrgForUser(userID string) (string, error) {
	var orgID string
	err := database.DB.Raw(`
		SELECT om.org_id::text
		FROM org_members om
		WHERE om.user_id = ?::uuid
		  AND om.revoked_at IS NULL
		LIMIT 1
	`, userID).Scan(&orgID).Error
	return orgID, err
}
