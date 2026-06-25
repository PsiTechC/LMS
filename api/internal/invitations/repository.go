package invitations

import (
	"errors"
	"time"

	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("invitation not found")

func createInvitation(inv *Invitation) error {
	return database.DB.Create(inv).Error
}

func findByTokenHash(hash string) (*Invitation, error) {
	var inv Invitation
	err := database.DB.Where("token_hash = ?", hash).First(&inv).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &inv, err
}

// expireOldInvites marks previous pending invites for the same email+cohort as expired
// before creating a new one — prevents double-enrollment via stale links.
func expireOldInvites(email, cohortID string) error {
	return database.DB.Model(&Invitation{}).
		Where("email = ? AND cohort_id = ? AND status = 'pending'", email, cohortID).
		Update("status", "expired").Error
}

func markAccepted(inv *Invitation) error {
	now := time.Now()
	inv.Status = "accepted"
	inv.AcceptedAt = &now
	return database.DB.Save(inv).Error
}

func listByCohort(cohortID string) ([]Invitation, error) {
	var list []Invitation
	err := database.DB.
		Where("cohort_id = ?", cohortID).
		Order("created_at desc").
		Find(&list).Error
	return list, err
}

// lookupUser finds a user by email — returns nil,nil if not found.
func lookupUser(email string) (*userRow, error) {
	var row userRow
	err := database.DB.Raw(`
		SELECT id, email, name, role FROM users WHERE email = ? AND is_active = true LIMIT 1
	`, email).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	if row.ID == "" {
		return nil, nil
	}
	return &row, nil
}

type userRow struct {
	ID    string
	Email string
	Name  string
	Role  string
}

// isInOrg checks if a user is already a member of the org.
func isInOrg(userID, orgID string) (bool, error) {
	var count int64
	err := database.DB.Raw(`
		SELECT COUNT(*) FROM org_members WHERE user_id = ? AND org_id = ?
	`, userID, orgID).Scan(&count).Error
	return count > 0, err
}

// isEnrolledInCohort checks if a user is already enrolled.
func isEnrolledInCohort(userID, cohortID string) (bool, error) {
	var count int64
	err := database.DB.Raw(`
		SELECT COUNT(*) FROM enrollments WHERE user_id = ? AND cohort_id = ?
	`, userID, cohortID).Scan(&count).Error
	return count > 0, err
}

// lookupCohortOrg returns org_id and name for a cohort plus its program name.
func lookupCohortMeta(cohortID string) (*cohortMeta, error) {
	var m cohortMeta
	err := database.DB.Raw(`
		SELECT c.org_id, c.name AS cohort_name, o.name AS org_name
		FROM cohorts c
		JOIN organizations o ON o.id = c.org_id
		WHERE c.id = ?
	`, cohortID).Scan(&m).Error
	if m.OrgID == "" {
		return nil, ErrNotFound
	}
	return &m, err
}

type cohortMeta struct {
	OrgID      string
	CohortName string
	OrgName    string
}
