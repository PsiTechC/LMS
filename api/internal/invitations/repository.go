package invitations

import (
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("invitation not found")

// fixSchema adds the nullable assign_role_id column idempotently on startup
// (see CLAUDE.md → Database Migrations). Safe to run on a DB that already has it.
func fixSchema() {
	database.DB.Exec(`ALTER TABLE invitations ADD COLUMN IF NOT EXISTS assign_role_id UUID`)
}

const unassignedCohortName = "Unassigned"

// ensureUnassignedCohort returns the id of the program's default "Unassigned"
// cohort, creating it once if it doesn't exist. Participants enrolled to a
// program (without a chosen cohort) land here until moved via Cohort Management.
func ensureUnassignedCohort(orgID, programID string) (string, error) {
	var id string
	err := database.DB.Raw(`
		SELECT id::text FROM cohorts
		WHERE program_id = ? AND name = ?
		LIMIT 1
	`, programID, unassignedCohortName).Scan(&id).Error
	if err != nil {
		return "", err
	}
	if id != "" {
		return id, nil
	}
	err = database.DB.Raw(`
		INSERT INTO cohorts (program_id, org_id, name, max_seats, is_active)
		VALUES (?, ?, ?, 500, true)
		RETURNING id::text
	`, programID, orgID, unassignedCohortName).Scan(&id).Error
	if err != nil {
		return "", err
	}
	if id == "" {
		return "", errors.New("failed to create default cohort")
	}
	return id, nil
}

func createInvitation(inv *Invitation) error {
	return database.DB.Create(inv).Error
}

// lookupParticipantRetailRoleID resolves the platform-global "Participant
// Retail" custom role id. Returns (nil, nil) if it doesn't exist — callers treat
// that as "fall back to a normal participant invite" rather than erroring.
func lookupParticipantRetailRoleID() (*uuid.UUID, error) {
	var raw string
	err := database.DB.Raw(`
		SELECT id::text FROM custom_roles
		WHERE lower(name) = 'participant retail' AND org_id IS NULL AND is_system = false
		LIMIT 1`).Scan(&raw).Error
	if err != nil || raw == "" {
		return nil, err
	}
	id, perr := uuid.Parse(raw)
	if perr != nil {
		return nil, nil
	}
	return &id, nil
}

// assignCustomRole idempotently links a user to a custom role via a
// role_assignments row (NOT EXISTS guard — there is no unique constraint). The
// enrollment/persona role is unaffected. tx may be the request DB or a txn.
func assignCustomRole(tx *gorm.DB, userID string, roleID uuid.UUID) error {
	return tx.Exec(`
		INSERT INTO role_assignments (user_id, role_id, org_id, assigned_by)
		SELECT ?::uuid, ?::uuid, NULL, NULL
		WHERE NOT EXISTS (
			SELECT 1 FROM role_assignments ra
			WHERE ra.user_id = ?::uuid AND ra.role_id = ?::uuid
		)`, userID, roleID.String(), userID, roleID.String()).Error
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

// upsertCoach ensures a coaches row exists for (org, user, program). Idempotent.
// programID scopes the coach to a specific program; empty = org-wide (program_id
// NULL). Called both when enrolling an existing org member as a coach and when a
// coach invite is accepted.
func upsertCoach(userID, orgID, programID string) error {
	var progID interface{}
	if strings.TrimSpace(programID) != "" {
		progID = programID
	}
	return database.DB.Exec(`
		INSERT INTO coaches (org_id, user_id, program_id)
		VALUES (?::uuid, ?::uuid, ?::uuid)
		ON CONFLICT DO NOTHING
	`, orgID, userID, progID).Error
}

// lookupProgramOrg returns the org_id that owns a program (for program-scoped
// coach invites, so the coach lands in the program's org).
func lookupProgramOrg(programID string) (string, error) {
	var orgID string
	err := database.DB.Raw(`SELECT org_id::text FROM programs WHERE id = ? LIMIT 1`, programID).Scan(&orgID).Error
	if orgID == "" {
		return "", ErrNotFound
	}
	return orgID, err
}

// lookupCustomRoleBase resolves a custom role's base_role + display name, for
// validating a role_id-based org invite (e.g. "Secondary PM"). Excludes
// personal per-account roles (owner_user_id set) — those are never
// invite-assignable.
func lookupCustomRoleBase(roleID string) (baseRole, name string, err error) {
	var row struct{ BaseRole, Name string }
	err = database.DB.Raw(`
		SELECT base_role, name FROM custom_roles
		WHERE id = ? AND owner_user_id IS NULL
		LIMIT 1`, roleID).Scan(&row).Error
	if err != nil {
		return "", "", err
	}
	if row.Name == "" {
		return "", "", ErrNotFound
	}
	return row.BaseRole, row.Name, nil
}

// expireOldOrgFacultyInvites marks old pending org-faculty invites as expired.
func expireOldOrgFacultyInvites(email, orgID string) error {
	return database.DB.Model(&Invitation{}).
		Where("email = ? AND org_id = ? AND status = 'pending' AND cohort_id IS NULL", email, orgID).
		Update("status", "expired").Error
}
