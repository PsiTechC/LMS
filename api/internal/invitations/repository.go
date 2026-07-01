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
		SELECT id, email, name, role, is_verified FROM users WHERE email = ? AND is_active = true LIMIT 1
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
	ID         string
	Email      string
	Name       string
	Role       string
	IsVerified bool
}

// isInOrg checks if a user is already a member of the org.
func isInOrg(userID, orgID string) (bool, error) {
	var count int64
	err := database.DB.Raw(`
		SELECT COUNT(*) FROM org_members WHERE user_id = ? AND org_id = ?
	`, userID, orgID).Scan(&count).Error
	return count > 0, err
}

// isEnrolledInCohort checks if a user is already enrolled (any non-withdrawn status).
func isEnrolledInCohort(userID, cohortID string) (bool, error) {
	var count int64
	err := database.DB.Raw(`
		SELECT COUNT(*) FROM enrollments WHERE user_id = ? AND cohort_id = ? AND status != 'withdrawn'
	`, userID, cohortID).Scan(&count).Error
	return count > 0, err
}

// upsertPendingEnrollment creates a placeholder user (is_verified=false) + a 'pending'
// enrollment so the PM sees the invitee in the cohort table immediately after sending the invite.
// On invite accept, the user record is updated and enrollment flipped to 'enrolled'.
func upsertPendingEnrollment(email, name, department, role, orgID, cohortID string) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		// Find or create placeholder user
		var userID string
		tx.Raw(`SELECT id FROM users WHERE email = ? LIMIT 1`, email).Scan(&userID)

		if userID == "" {
			// Create placeholder — password hash is a sentinel that cannot be bcrypt-matched
			if err := tx.Exec(`
				INSERT INTO users (email, name, department, role, password_hash, is_active, is_verified)
				VALUES (?, ?, ?, ?, '$2a$10$placeholder_cannot_login', true, false)
			`, email, name, department, role).Error; err != nil {
				return err
			}
			tx.Raw(`SELECT id FROM users WHERE email = ? LIMIT 1`, email).Scan(&userID)
		} else {
			// Update name/dept on existing placeholder (may have been created by old CSV path)
			tx.Exec(`UPDATE users SET name = ?, department = ?, is_verified = false WHERE id = ? AND is_verified = false`, name, department, userID)
		}

		if userID == "" {
			return errors.New("failed to resolve user for pending enrollment")
		}

		// Add to org_members
		tx.Exec(`
			INSERT INTO org_members (org_id, user_id, role)
			VALUES (?, ?, ?)
			ON CONFLICT (org_id, user_id) DO NOTHING
		`, orgID, userID, role)

		// Create 'invited' enrollment — on conflict leave existing row as-is (may already be enrolled)
		return tx.Exec(`
			INSERT INTO enrollments (cohort_id, user_id, role, status, enrolled_at)
			VALUES (?, ?, ?, 'invited', NOW())
			ON CONFLICT (cohort_id, user_id) DO NOTHING
		`, cohortID, userID, role).Error
	})
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

// lookupOrgMeta returns org name for org-level invites (no cohort).
func lookupOrgMeta(orgID string) (string, error) {
	var name string
	err := database.DB.Raw(`SELECT name FROM organizations WHERE id = ? LIMIT 1`, orgID).Scan(&name).Error
	if name == "" {
		return "", ErrNotFound
	}
	return name, err
}

// expireOldOrgFacultyInvites marks old pending org-faculty invites as expired.
func expireOldOrgFacultyInvites(email, orgID string) error {
	return database.DB.Model(&Invitation{}).
		Where("email = ? AND org_id = ? AND status = 'pending' AND cohort_id = '00000000-0000-0000-0000-000000000000'", email, orgID).
		Update("status", "expired").Error
}
