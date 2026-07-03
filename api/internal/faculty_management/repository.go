package faculty_management

import (
	"log"
	"time"

	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

// fixSchema creates the faculty-management tables and extends activity_faculty
// idempotently on startup, mirroring migrations/000026_faculty_management.up.sql
// (same pattern as compliance/roles/audit/systemhealth).
func fixSchema() {
	db := database.DB
	sqls := []string{
		`CREATE TABLE IF NOT EXISTS faculty_profiles (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
			specialization TEXT NOT NULL DEFAULT '',
			certifications JSONB NOT NULL DEFAULT '[]',
			bio TEXT NOT NULL DEFAULT '',
			delivery_modes JSONB NOT NULL DEFAULT '[]',
			location TEXT NOT NULL DEFAULT '',
			linkedin_url TEXT NOT NULL DEFAULT '',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_faculty_profiles_user ON faculty_profiles (user_id)`,
		`ALTER TABLE activity_faculty ADD COLUMN IF NOT EXISTS role_on_program TEXT NOT NULL DEFAULT ''`,
		`ALTER TABLE activity_faculty ADD COLUMN IF NOT EXISTS sessions_planned INT NOT NULL DEFAULT 0`,
		`ALTER TABLE activity_faculty ADD COLUMN IF NOT EXISTS availability JSONB NOT NULL DEFAULT '{}'`,
		`CREATE TABLE IF NOT EXISTS onboarding_invites (
			id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			faculty_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'accepted')),
			sent_at TIMESTAMPTZ,
			access_level TEXT NOT NULL DEFAULT 'standard' CHECK (access_level IN ('standard', 'advanced', 'admin')),
			created_by UUID REFERENCES users(id) ON DELETE SET NULL,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)`,
		`CREATE INDEX IF NOT EXISTS idx_onboarding_invites_faculty ON onboarding_invites (faculty_user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_onboarding_invites_status ON onboarding_invites (status)`,
	}
	for _, sql := range sqls {
		if err := db.Exec(sql).Error; err != nil {
			log.Printf("faculty_management fixSchema: %v", err)
		}
	}
	log.Println("faculty_management: schema ready")
}

// ── Faculty Profiles ─────────────────────────────────────────────────────────

func getProfileByUser(userID string) (*FacultyProfile, error) {
	var p FacultyProfile
	if err := database.DB.Where("user_id = ?", userID).First(&p).Error; err != nil {
		return nil, err
	}
	return &p, nil
}

func listProfiles() ([]FacultyProfile, error) {
	var rows []FacultyProfile
	err := database.DB.Order("updated_at desc").Find(&rows).Error
	return rows, err
}

// upsertProfile inserts or updates a faculty profile keyed on user_id.
func upsertProfile(p *FacultyProfile) error {
	sql := `
		INSERT INTO faculty_profiles
			(user_id, specialization, certifications, bio, delivery_modes, location, linkedin_url, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			specialization = EXCLUDED.specialization,
			certifications = EXCLUDED.certifications,
			bio            = EXCLUDED.bio,
			delivery_modes = EXCLUDED.delivery_modes,
			location       = EXCLUDED.location,
			linkedin_url   = EXCLUDED.linkedin_url,
			updated_at     = NOW()`
	return database.DB.Exec(sql, p.UserID, p.Specialization, p.Certifications, p.Bio,
		p.DeliveryModes, p.Location, p.LinkedinURL).Error
}

// ── Onboarding Invites ───────────────────────────────────────────────────────

func insertInvite(i *OnboardingInvite) error {
	return database.DB.Create(i).Error
}

func getInviteByID(id string) (*OnboardingInvite, error) {
	var i OnboardingInvite
	if err := database.DB.Where("id = ?", id).First(&i).Error; err != nil {
		return nil, err
	}
	return &i, nil
}

func listInvites(facultyUserID string) ([]OnboardingInvite, error) {
	var rows []OnboardingInvite
	q := database.DB.Order("created_at desc")
	if facultyUserID != "" {
		q = q.Where("faculty_user_id = ?", facultyUserID)
	}
	err := q.Find(&rows).Error
	return rows, err
}

func updateInvite(id string, fields map[string]any) error {
	return database.DB.Model(&OnboardingInvite{}).Where("id = ?", id).Updates(fields).Error
}

// ── activity_faculty extension ───────────────────────────────────────────────

// updateAssignmentFields updates the program-level attributes on an existing
// activity_faculty row. Uses a Table() update so this module never imports the
// programs package's model. Returns rows affected.
func updateAssignmentFields(activityID, facultyUserID string, fields map[string]any) (int64, error) {
	res := database.DB.Table("activity_faculty").
		Where("activity_id = ? AND faculty_user_id = ?", activityID, facultyUserID).
		Updates(fields)
	return res.RowsAffected, res.Error
}

// firstActivityForProgram resolves a representative activity in a program to
// hang an activity_faculty assignment on — preferring coaching activities, then
// any activity by sort order. Returns "" if the program has no activities.
func firstActivityForProgram(programID string) (string, error) {
	var id string
	err := database.DB.Raw(`
		SELECT a.id::text
		FROM activities a
		JOIN program_phases ph ON ph.id = a.phase_id
		WHERE ph.program_id = ?
		ORDER BY (a.type = 'coaching') DESC, a.sort_order ASC, a.created_at ASC
		LIMIT 1
	`, programID).Scan(&id).Error
	return id, err
}

// ── Onboard Faculty transaction ──────────────────────────────────────────────

// emailExistsActive reports whether the email is already taken by any user
// (the users.email unique constraint is global, so we check all rows).
func emailExistsActive(email string) (bool, error) {
	var n int64
	err := database.DB.Raw(`SELECT COUNT(*) FROM users WHERE email = ?`, email).Scan(&n).Error
	return n > 0, err
}

// onboardTxParams carries the fully-prepared data for the onboarding transaction.
type onboardTxParams struct {
	Email, Name, Phone, Location, PasswordHash string
	OrgID                                      string
	Specialization, Bio, LinkedinURL           string
	CertificationsJSON, DeliveryModesJSON      string
	AccessLevel, InviteStatus, CreatedBy       string
	Assignments                                []onboardAssignmentRow
}

type onboardAssignmentRow struct {
	ActivityID, CohortID, Role, RoleOnProgram string
	SessionsPlanned                           int
	AvailabilityJSON                          string
}

// runOnboardTx creates the user (role=faculty), faculty_profile, optional
// org_members row, activity_faculty assignments, and the onboarding_invites
// record — all atomically. Returns the new user id + invite id + assignments made.
func runOnboardTx(p onboardTxParams) (userID, inviteID string, assignmentsMade int, err error) {
	err = database.DB.Transaction(func(tx *gorm.DB) error {
		// 1. User (role = faculty), verified & active so emailed credentials work immediately.
		if e := tx.Raw(`
			INSERT INTO users (email, name, role, password_hash, is_active, is_verified, phone, location)
			VALUES (?, ?, 'faculty', ?, true, true, NULLIF(?, ''), NULLIF(?, ''))
			RETURNING id
		`, p.Email, p.Name, p.PasswordHash, p.Phone, p.Location).Scan(&userID).Error; e != nil {
			return e
		}
		if userID == "" {
			return gorm.ErrInvalidData
		}

		// 2. Optional org membership.
		if p.OrgID != "" {
			tx.Exec(`
				INSERT INTO org_members (org_id, user_id, role)
				VALUES (?, ?, 'faculty')
				ON CONFLICT (org_id, user_id) DO NOTHING
			`, p.OrgID, userID)
		}

		// 3. Faculty profile.
		if e := tx.Exec(`
			INSERT INTO faculty_profiles
				(user_id, specialization, certifications, bio, delivery_modes, location, linkedin_url)
			VALUES (?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (user_id) DO UPDATE SET
				specialization = EXCLUDED.specialization,
				certifications = EXCLUDED.certifications,
				bio            = EXCLUDED.bio,
				delivery_modes = EXCLUDED.delivery_modes,
				location       = EXCLUDED.location,
				linkedin_url   = EXCLUDED.linkedin_url,
				updated_at     = NOW()
		`, userID, p.Specialization, p.CertificationsJSON, p.Bio, p.DeliveryModesJSON, p.Location, p.LinkedinURL).Error; e != nil {
			return e
		}

		// 4. Program assignments (activity_faculty).
		for _, a := range p.Assignments {
			role := a.Role
			if role == "" {
				role = "Lead"
			}
			avail := a.AvailabilityJSON
			if avail == "" {
				avail = "{}"
			}
			if e := tx.Exec(`
				INSERT INTO activity_faculty
					(activity_id, faculty_user_id, cohort_id, role, role_on_program, sessions_planned, availability)
				VALUES (?, ?, NULLIF(?, '')::uuid, ?, ?, ?, ?::jsonb)
				ON CONFLICT (activity_id, faculty_user_id) DO UPDATE SET
					cohort_id        = EXCLUDED.cohort_id,
					role             = EXCLUDED.role,
					role_on_program  = EXCLUDED.role_on_program,
					sessions_planned = EXCLUDED.sessions_planned,
					availability     = EXCLUDED.availability,
					updated_at       = NOW()
			`, a.ActivityID, userID, a.CohortID, role, a.RoleOnProgram, a.SessionsPlanned, avail).Error; e != nil {
				return e
			}
			assignmentsMade++
		}

		// 5. Onboarding invite carrying the access level.
		var sentAt *time.Time
		if p.InviteStatus == "sent" {
			now := time.Now()
			sentAt = &now
		}
		if e := tx.Raw(`
			INSERT INTO onboarding_invites (faculty_user_id, status, sent_at, access_level, created_by)
			VALUES (?, ?, ?, ?, NULLIF(?, '')::uuid)
			RETURNING id
		`, userID, p.InviteStatus, sentAt, p.AccessLevel, p.CreatedBy).Scan(&inviteID).Error; e != nil {
			return e
		}
		return nil
	})
	return userID, inviteID, assignmentsMade, err
}

// markInviteSent flips an invite to 'sent' after a welcome email actually goes out.
func markInviteSent(id string) error {
	return database.DB.Model(&OnboardingInvite{}).Where("id = ?", id).
		Updates(map[string]any{"status": "sent", "sent_at": time.Now(), "updated_at": time.Now()}).Error
}

// ── Roster & Dashboard (read) ────────────────────────────────────────────────

type facultyBaseRow struct {
	UserID         string
	Name           string
	Location       string
	CreatedAt      time.Time
	Specialization string
	Certifications string // JSONB
	IsActive       bool
	InviteStatus   string // latest onboarding invite status, or ''
}

// listFacultyBase returns every faculty user with profile + latest invite status.
// Location prefers the faculty_profile, falling back to users.location.
func listFacultyBase() ([]facultyBaseRow, error) {
	var rows []facultyBaseRow
	err := database.DB.Raw(`
		SELECT u.id::text AS user_id,
		       u.name,
		       COALESCE(NULLIF(fp.location, ''), u.location, '') AS location,
		       u.created_at,
		       COALESCE(fp.specialization, '')                    AS specialization,
		       COALESCE(fp.certifications, '[]')                  AS certifications,
		       u.is_active,
		       COALESCE((
		           SELECT oi.status FROM onboarding_invites oi
		           WHERE oi.faculty_user_id = u.id
		           ORDER BY oi.created_at DESC LIMIT 1
		       ), '') AS invite_status
		FROM users u
		LEFT JOIN faculty_profiles fp ON fp.user_id = u.id
		WHERE u.role = 'faculty'
		ORDER BY u.name ASC
	`).Scan(&rows).Error
	return rows, err
}

type sessionStatRow struct {
	FacultyID string
	Delivered int
	Scheduled int
}

// facultySessionStats returns delivered (completed) + upcoming (scheduled &&
// future) session counts per faculty from class_sessions.
func facultySessionStats() (map[string]sessionStatRow, error) {
	var rows []sessionStatRow
	err := database.DB.Raw(`
		SELECT faculty_id::text AS faculty_id,
		       COUNT(*) FILTER (WHERE status = 'completed')                              AS delivered,
		       COUNT(*) FILTER (WHERE status = 'scheduled' AND scheduled_at >= NOW())     AS scheduled
		FROM class_sessions
		GROUP BY faculty_id
	`).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	m := make(map[string]sessionStatRow, len(rows))
	for _, r := range rows {
		m[r.FacultyID] = r
	}
	return m, nil
}

type engagementRow struct {
	FacultyID string
	Engaged   int64
	Total     int64
}

// facultyEngagement returns attendance engagement counts per faculty:
// engaged = present+late marks, total = all attendance marks across the
// faculty's sessions.
func facultyEngagement() (map[string]engagementRow, error) {
	var rows []engagementRow
	err := database.DB.Raw(`
		SELECT cs.faculty_id::text AS faculty_id,
		       COUNT(*) FILTER (WHERE sa.status IN ('present', 'late')) AS engaged,
		       COUNT(*)                                                 AS total
		FROM session_attendance sa
		JOIN class_sessions cs ON cs.id = sa.session_id
		GROUP BY cs.faculty_id
	`).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	m := make(map[string]engagementRow, len(rows))
	for _, r := range rows {
		m[r.FacultyID] = r
	}
	return m, nil
}

// facultyPrograms returns the distinct programs each faculty is assigned to via
// activity_faculty → activities → program_phases → programs.
func facultyPrograms() (map[string][]FacultyProgramRef, error) {
	var rows []struct {
		FacultyID string
		ProgramID string
		Title     string
	}
	err := database.DB.Raw(`
		SELECT DISTINCT af.faculty_user_id::text AS faculty_id,
		       p.id::text                        AS program_id,
		       p.title                           AS title
		FROM activity_faculty af
		JOIN activities a       ON a.id  = af.activity_id
		JOIN program_phases ph  ON ph.id = a.phase_id
		JOIN programs p         ON p.id  = ph.program_id
		ORDER BY p.title ASC
	`).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	m := make(map[string][]FacultyProgramRef)
	for _, r := range rows {
		m[r.FacultyID] = append(m[r.FacultyID], FacultyProgramRef{ID: r.ProgramID, Title: r.Title})
	}
	return m, nil
}

// ── Dashboard summary aggregates ──────────────────────────────────────────────

func countFaculty() (int, error) {
	var n int
	err := database.DB.Raw(`SELECT COUNT(*) FROM users WHERE role = 'faculty'`).Scan(&n).Error
	return n, err
}

// countOnboardingFaculty counts active faculty whose latest onboarding invite is
// not yet accepted (pending/sent).
func countOnboardingFaculty() (int, error) {
	var n int
	err := database.DB.Raw(`
		SELECT COUNT(*) FROM users u
		WHERE u.role = 'faculty' AND u.is_active = true
		  AND COALESCE((
		      SELECT oi.status FROM onboarding_invites oi
		      WHERE oi.faculty_user_id = u.id
		      ORDER BY oi.created_at DESC LIMIT 1
		  ), '') IN ('pending', 'sent')
	`).Scan(&n).Error
	return n, err
}

// countSessionsDelivered sums completed class_sessions across all faculty.
func countSessionsDelivered() (int, error) {
	var n int
	err := database.DB.Raw(`
		SELECT COUNT(*)
		FROM class_sessions cs
		JOIN users u ON u.id = cs.faculty_id AND u.role = 'faculty'
		WHERE cs.status = 'completed'
	`).Scan(&n).Error
	return n, err
}
