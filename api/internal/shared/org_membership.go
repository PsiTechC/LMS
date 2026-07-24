package shared

import (
	"log"

	"github.com/xa-lms/api/pkg/database"
)

// EnsureOrgMembership safely adds a user to an organization with a specific role
// if they are not already a member. The granted_via='auto_assignment' marker
// ensures we can later distinguish and revoke these automated, multi-org grants
// safely without dropping manually added (standing) org memberships.
func EnsureOrgMembership(userID, orgID, role string) error {
	stmt := `
		INSERT INTO org_members (org_id, user_id, role, granted_via)
		VALUES (?::uuid, ?::uuid, ?, 'auto_assignment')
		ON CONFLICT (org_id, user_id) DO NOTHING
	`
	if err := database.DB.Exec(stmt, orgID, userID, role).Error; err != nil {
		log.Printf("[EnsureOrgMembership] failed for user %s in org %s: %v", userID, orgID, err)
		return err
	}
	return nil
}
