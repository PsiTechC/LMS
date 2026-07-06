package cohorts

import (
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/xa-lms/api/internal/rbac"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("not found")
var ErrAlreadyEnrolled = errors.New("user already enrolled in this cohort")

// fixSchema idempotently adds columns and tables at startup.
func fixSchema() {
	// Demographic columns on users
	database.DB.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS seniority_level TEXT`)
	database.DB.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS function_col TEXT`)
	database.DB.Exec(`ALTER TABLE users ADD COLUMN IF NOT EXISTS location TEXT`)

	// cohort_groups table
	database.DB.Exec(`
		CREATE TABLE IF NOT EXISTS cohort_groups (
			id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
			cohort_id  UUID NOT NULL REFERENCES cohorts(id) ON DELETE CASCADE,
			name       TEXT NOT NULL,
			group_type TEXT NOT NULL DEFAULT 'coaching_circle',
			sort_order INT  NOT NULL DEFAULT 0,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	database.DB.Exec(`CREATE INDEX IF NOT EXISTS idx_cohort_groups_cohort ON cohort_groups(cohort_id)`)

	// Nullable group_id on enrollments
	database.DB.Exec(`ALTER TABLE enrollments ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES cohort_groups(id) ON DELETE SET NULL`)
	database.DB.Exec(`CREATE INDEX IF NOT EXISTS idx_enrollments_group_id ON enrollments(group_id)`)

	// cohort_id on activity_faculty so PM can scope a session assignment to a specific cohort
	database.DB.Exec(`ALTER TABLE activity_faculty ADD COLUMN IF NOT EXISTS cohort_id UUID REFERENCES cohorts(id) ON DELETE SET NULL`)
	database.DB.Exec(`CREATE INDEX IF NOT EXISTS idx_activity_faculty_cohort ON activity_faculty(cohort_id)`)
}

// findOrCreateUser looks up a user by email (case-insensitive).
// If not found, creates one with a random password hash (they'll use invite flow to set their password).
func findOrCreateUser(name, email, department, seniority, function_, location string) (string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	var userID string
	err := database.DB.Raw(`SELECT id FROM users WHERE LOWER(email) = ?`, email).Scan(&userID).Error
	if err != nil {
		return "", err
	}
	if userID != "" {
		// Update demographic fields if provided
		updates := map[string]any{}
		if department != "" {
			updates["department"] = department
		}
		if seniority != "" {
			updates["seniority_level"] = seniority
		}
		if function_ != "" {
			updates["function_col"] = function_
		}
		if location != "" {
			updates["location"] = location
		}
		if len(updates) > 0 {
			database.DB.Table("users").Where("id = ?", userID).Updates(updates)
		}
		return userID, nil
	}
	// Create new user (pending password set via invite) AND its base-persona
	// role_assignment atomically. This is the enroll-by-email / CSV creation path —
	// participant is a cut-over persona, so without the assignment the user resolves
	// to zero permissions and is denied everywhere until they happen to accept an
	// invite. Because these users are created already-active/usable (unlike the
	// unverified signup flow), the assignment MUST land with the user or not at all;
	// wrapping both in one tx prevents a DB error from leaving an orphaned participant.
	newID := uuid.New()
	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		if e := tx.Exec(`
			INSERT INTO users (id, email, name, password_hash, role, department, seniority_level, function_col, location, is_active, is_verified)
			VALUES (?, ?, ?, ?, 'participant', ?, ?, ?, ?, true, false)
		`, newID, email, strings.TrimSpace(name), "$2a$10$placeholder", department, seniority, function_, location).Error; e != nil {
			return e
		}
		return rbac.EnsureBaseRoleAssignment(tx, newID.String(), "participant", "")
	}); err != nil {
		return "", err
	}
	return newID.String(), nil
}

// ── Cohorts ───────────────────────────────────────────────────────

func listCohortsByOrg(orgID string) ([]Cohort, error) {
	var list []Cohort
	err := database.DB.Where("org_id = ?", orgID).Order("created_at desc").Find(&list).Error
	return list, err
}

func listCohortsByProgram(programID string) ([]Cohort, error) {
	var list []Cohort
	err := database.DB.Where("program_id = ?", programID).Order("created_at desc").Find(&list).Error
	return list, err
}

func getCohortByID(id string) (*Cohort, error) {
	var c Cohort
	err := database.DB.Where("id = ?", id).First(&c).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &c, err
}

func createCohort(c *Cohort) error {
	return database.DB.Create(c).Error
}

func saveCohort(c *Cohort) error {
	return database.DB.Save(c).Error
}

func countEnrollments(cohortID string) (int, error) {
	var count int64
	err := database.DB.Model(&Enrollment{}).
		Where("cohort_id = ? AND status != 'withdrawn'", cohortID).
		Count(&count).Error
	return int(count), err
}

// ── Enrollments ───────────────────────────────────────────────────

func listParticipants(cohortID string) ([]EnrollmentRow, error) {
	var rows []EnrollmentRow
	err := database.DB.Raw(`
		SELECT
			e.id              AS enrollment_id,
			u.id              AS user_id,
			u.name            AS name,
			u.email           AS email,
			u.avatar_url      AS avatar_url,
			u.department      AS department,
			e.role            AS role,
			e.status          AS status,
			e.completion_percent AS completion_percent,
			e.risk_level      AS risk_level,
			e.enrolled_at     AS enrolled_at,
			e.nudged_at       AS nudged_at
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		WHERE e.cohort_id = ?
		ORDER BY e.enrolled_at ASC
	`, cohortID).Scan(&rows).Error
	return rows, err
}

func enrollUser(e *Enrollment) error {
	// Check for duplicate
	var count int64
	database.DB.Model(&Enrollment{}).
		Where("cohort_id = ? AND user_id = ?", e.CohortID, e.UserID).
		Count(&count)
	if count > 0 {
		return ErrAlreadyEnrolled
	}
	if err := database.DB.Create(e).Error; err != nil {
		return err
	}
	// Ensure the user is in org_members so they appear in pool queries for this org.
	var orgID string
	database.DB.Raw(`SELECT org_id FROM cohorts WHERE id = ?`, e.CohortID).Scan(&orgID)
	if orgID != "" {
		database.DB.Exec(`
			INSERT INTO org_members (org_id, user_id, role)
			VALUES (?, ?, 'participant')
			ON CONFLICT (org_id, user_id) DO NOTHING
		`, orgID, e.UserID)
	}
	return nil
}

func getEnrollmentByID(id string) (*Enrollment, error) {
	var e Enrollment
	err := database.DB.Where("id = ?", id).First(&e).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &e, err
}

func saveEnrollment(e *Enrollment) error {
	return database.DB.Save(e).Error
}

func setNudgedAt(enrollmentID string) error {
	return database.DB.Model(&Enrollment{}).
		Where("id = ?", enrollmentID).
		Update("nudged_at", gorm.Expr("NOW()")).Error
}

func getCohortStats(cohortID string) (*CohortStatsDTO, error) {
	type row struct {
		Status            string
		Count             int
		AvgCompletion     float64
		AtRiskCount       int
		MediumRiskCount   int
	}
	var rows []row
	err := database.DB.Raw(`
		SELECT
			status,
			COUNT(*)                                           AS count,
			COALESCE(AVG(completion_percent),0)::int          AS avg_completion,
			SUM(CASE WHEN risk_level='high'   THEN 1 ELSE 0 END) AS at_risk_count,
			SUM(CASE WHEN risk_level='medium' THEN 1 ELSE 0 END) AS medium_risk_count
		FROM enrollments
		WHERE cohort_id = ?
		GROUP BY status
	`, cohortID).Scan(&rows).Error
	if err != nil {
		return nil, err
	}

	stats := &CohortStatsDTO{CohortID: cohortID}
	var totalCompletion int64
	var totalRows int
	for _, r := range rows {
		switch r.Status {
		case "completed":
			stats.Completed = r.Count
		case "active", "enrolled":
			stats.Active += r.Count
		case "withdrawn":
			stats.Withdrawn = r.Count
		case "on_hold":
			stats.OnHold = r.Count
		}
		stats.TotalEnrolled += r.Count
		stats.AtRiskCount += r.AtRiskCount
		stats.MediumRiskCount += r.MediumRiskCount
		totalCompletion += int64(r.AvgCompletion * float64(r.Count))
		totalRows += r.Count
	}
	if totalRows > 0 {
		stats.AvgCompletion = int(totalCompletion / int64(totalRows))
	}
	return stats, nil
}

// ── Pool & Transfer ───────────────────────────────────────────────

// listPoolForProgram returns participant users linked to the org who are NOT yet enrolled
// in any cohort of this program. "Linked to org" means: in org_members OR already enrolled
// in any other cohort of this org (handles find-or-create users who bypass org_members).
func listPoolForProgram(programID, orgID string) ([]PoolParticipantDTO, error) {
	var rows []PoolParticipantDTO
	err := database.DB.Raw(`
		SELECT DISTINCT u.id AS user_id, u.name, u.email, u.department
		FROM users u
		WHERE u.role = 'participant'
		  AND (
		    EXISTS (
		      SELECT 1 FROM org_members om
		      WHERE om.user_id = u.id AND om.org_id = ?
		    )
		    OR EXISTS (
		      SELECT 1 FROM enrollments e2
		      JOIN cohorts c2 ON c2.id = e2.cohort_id
		      JOIN programs p2 ON p2.id = c2.program_id
		      WHERE e2.user_id = u.id AND p2.org_id = ? AND e2.status != 'withdrawn'
		    )
		  )
		  AND NOT EXISTS (
		    SELECT 1 FROM enrollments e
		    JOIN cohorts c ON c.id = e.cohort_id
		    WHERE e.user_id = u.id AND c.program_id = ? AND e.status != 'withdrawn'
		  )
		ORDER BY u.name ASC
	`, orgID, orgID, programID).Scan(&rows).Error
	return rows, err
}

// transferParticipant withdraws a user from fromCohortID and enrolls in toCohortID.
// If fromCohortID is empty, it just enrolls (from pool).
func transferParticipant(userID, fromCohortID, toCohortID string) error {
	if fromCohortID != "" && fromCohortID != toCohortID {
		// Withdraw from old cohort
		database.DB.Exec(
			`UPDATE enrollments SET status = 'withdrawn' WHERE user_id = ? AND cohort_id = ?`,
			userID, fromCohortID,
		)
	}
	// Check if already enrolled in target
	var count int64
	database.DB.Raw(
		`SELECT COUNT(*) FROM enrollments WHERE user_id = ? AND cohort_id = ? AND status != 'withdrawn'`,
		userID, toCohortID,
	).Scan(&count)
	if count > 0 {
		return nil // already there
	}
	uid, err := uuid.Parse(userID)
	if err != nil {
		return err
	}
	cid, err := uuid.Parse(toCohortID)
	if err != nil {
		return err
	}
	e := &Enrollment{
		CohortID: cid,
		UserID:   uid,
		Role:     "participant",
		Status:   "enrolled",
	}
	return database.DB.Create(e).Error
}

// listEnrolledUserIDsForProgram returns all active participant user_ids across all cohorts of a program.
func listEnrolledUserIDsForProgram(programID string) ([]string, error) {
	var ids []string
	err := database.DB.Raw(`
		SELECT DISTINCT e.user_id::TEXT
		FROM enrollments e
		JOIN cohorts c ON c.id = e.cohort_id
		WHERE c.program_id = ? AND e.role = 'participant' AND e.status != 'withdrawn'
	`, programID).Scan(&ids).Error
	return ids, err
}

// withdrawAllFromProgram sets all participant enrollments in a program to withdrawn.
func withdrawAllFromProgram(programID string) error {
	return database.DB.Exec(`
		UPDATE enrollments SET status = 'withdrawn'
		WHERE cohort_id IN (SELECT id FROM cohorts WHERE program_id = ?)
		  AND role = 'participant'
	`, programID).Error
}

// listCohortIDsForProgram returns all cohort IDs for a program.
func listCohortIDsForProgram(programID string) ([]string, error) {
	var ids []string
	err := database.DB.Raw(
		`SELECT id::TEXT FROM cohorts WHERE program_id = ? AND is_active = true ORDER BY created_at ASC`,
		programID,
	).Scan(&ids).Error
	return ids, err
}

// ── Groups ────────────────────────────────────────────────────────

func listGroups(cohortID string) ([]CohortGroup, error) {
	var groups []CohortGroup
	err := database.DB.Where("cohort_id = ?", cohortID).Order("sort_order asc, created_at asc").Find(&groups).Error
	return groups, err
}

func createGroup(g *CohortGroup) error {
	return database.DB.Create(g).Error
}

func getGroupByID(id string) (*CohortGroup, error) {
	var g CohortGroup
	err := database.DB.Where("id = ?", id).First(&g).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &g, err
}

func deleteGroup(id string) error {
	// Ungroup all members first (group_id SET NULL via FK, but be explicit)
	database.DB.Exec(`UPDATE enrollments SET group_id = NULL WHERE group_id = ?`, id)
	res := database.DB.Where("id = ?", id).Delete(&CohortGroup{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func listGroupMembers(groupID string) ([]GroupMemberRow, error) {
	var rows []GroupMemberRow
	err := database.DB.Raw(`
		SELECT e.id AS enrollment_id, u.id AS user_id, u.name, u.email, u.department,
		       g.id AS group_id, g.name AS group_name
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		JOIN cohort_groups g ON g.id = e.group_id
		WHERE e.group_id = ? AND e.role = 'participant' AND e.status != 'withdrawn'
		ORDER BY u.name ASC
	`, groupID).Scan(&rows).Error
	return rows, err
}

// listGroupsWithMembers returns all groups for a cohort with their members pre-loaded in 2 queries.
func listGroupsWithMembers(cohortID string) ([]GroupDTO, error) {
	groups, err := listGroups(cohortID)
	if err != nil {
		return nil, err
	}
	if len(groups) == 0 {
		return []GroupDTO{}, nil
	}

	groupIDs := make([]string, len(groups))
	for i, g := range groups {
		groupIDs[i] = g.ID.String()
	}

	var memberRows []GroupMemberRow
	err = database.DB.Raw(`
		SELECT e.id AS enrollment_id, u.id AS user_id, u.name, u.email, u.department,
		       g.id AS group_id, g.name AS group_name
		FROM enrollments e
		JOIN users u ON u.id = e.user_id
		JOIN cohort_groups g ON g.id = e.group_id
		WHERE e.group_id IN ? AND e.role = 'participant' AND e.status != 'withdrawn'
		ORDER BY g.sort_order ASC, u.name ASC
	`, groupIDs).Scan(&memberRows).Error
	if err != nil {
		return nil, err
	}

	// Index members by group_id
	byGroup := map[string][]GroupMemberDTO{}
	for _, r := range memberRows {
		byGroup[r.GroupID] = append(byGroup[r.GroupID], GroupMemberDTO{
			EnrollmentID: r.EnrollmentID,
			UserID:       r.UserID,
			Name:         r.Name,
			Email:        r.Email,
			Department:   r.Department,
		})
	}

	result := make([]GroupDTO, 0, len(groups))
	for _, g := range groups {
		result = append(result, GroupDTO{
			ID: g.ID.String(), CohortID: g.CohortID.String(),
			Name: g.Name, GroupType: g.GroupType, SortOrder: g.SortOrder,
			Members: func() []GroupMemberDTO {
				if m, ok := byGroup[g.ID.String()]; ok { return m }
				return []GroupMemberDTO{}
			}(),
		})
	}
	return result, nil
}

// listUngroupedEnrollments returns enrolled participant enrollment IDs with no group assigned.
func listUngroupedEnrollments(cohortID string) ([]string, error) {
	var ids []string
	err := database.DB.Raw(`
		SELECT e.id FROM enrollments e
		WHERE e.cohort_id = ? AND e.role = 'participant'
		  AND e.status != 'withdrawn' AND e.group_id IS NULL
		ORDER BY e.enrolled_at ASC
	`, cohortID).Scan(&ids).Error
	return ids, err
}

func assignEnrollmentToGroup(enrollmentID, groupID string) error {
	res := database.DB.Exec(`UPDATE enrollments SET group_id = ? WHERE id = ?`, groupID, enrollmentID)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func unassignEnrollmentFromGroup(enrollmentID string) error {
	return database.DB.Exec(`UPDATE enrollments SET group_id = NULL WHERE id = ?`, enrollmentID).Error
}

func reshuffleGroup(cohortID string) error {
	// Ungroup everyone in this cohort first, then caller re-assigns
	return database.DB.Exec(`UPDATE enrollments SET group_id = NULL WHERE cohort_id = ? AND role = 'participant'`, cohortID).Error
}

func deleteAllGroupsForCohort(cohortID string) error {
	database.DB.Exec(`UPDATE enrollments SET group_id = NULL WHERE cohort_id = ?`, cohortID)
	return database.DB.Where("cohort_id = ?", cohortID).Delete(&CohortGroup{}).Error
}

func countGroupsForCohort(cohortID string) (int64, error) {
	var count int64
	err := database.DB.Model(&CohortGroup{}).Where("cohort_id = ?", cohortID).Count(&count).Error
	return count, err
}

func getMyEnrollments(userID string) ([]MyEnrollmentRow, error) {
	var rows []MyEnrollmentRow
	err := database.DB.Raw(`
		-- Real cohort enrollments (participants and directly enrolled faculty)
		SELECT
			e.id::text            AS enrollment_id,
			e.cohort_id::text     AS cohort_id,
			e.role::text          AS role,
			e.status::text        AS status,
			e.completion_percent  AS completion_percent,
			e.risk_level          AS risk_level,
			e.enrolled_at         AS enrolled_at,
			c.name                AS cohort_name,
			c.start_date          AS cohort_start_date,
			c.end_date            AS cohort_end_date,
			c.program_id::text    AS program_id,
			p.title               AS program_title,
			p.description         AS program_description,
			p.color               AS program_color,
			p.duration_weeks      AS program_duration_weeks,
			p.status              AS program_status
		FROM enrollments e
		JOIN cohorts c ON c.id = e.cohort_id
		JOIN programs p ON p.id = c.program_id
		WHERE e.user_id = ?::uuid AND e.status != 'withdrawn'

		UNION

		-- Faculty assigned to program activities via activity_faculty —
		-- surface every active cohort in those programs so they appear in
		-- the dashboard and can manage sessions.
		SELECT DISTINCT
			'af-' || c.id::text   AS enrollment_id,
			c.id::text            AS cohort_id,
			'faculty'::text       AS role,
			'active'::text        AS status,
			0                     AS completion_percent,
			'low'                 AS risk_level,
			af.created_at         AS enrolled_at,
			c.name                AS cohort_name,
			c.start_date          AS cohort_start_date,
			c.end_date            AS cohort_end_date,
			c.program_id::text    AS program_id,
			p.title               AS program_title,
			p.description         AS program_description,
			p.color               AS program_color,
			p.duration_weeks      AS program_duration_weeks,
			p.status              AS program_status
		FROM activity_faculty af
		JOIN activities a ON a.id = af.activity_id
		JOIN program_phases ph ON ph.id = a.phase_id
		JOIN programs p ON p.id = ph.program_id
		JOIN cohorts c ON c.program_id = p.id
		WHERE af.faculty_user_id = ?::uuid
		AND NOT EXISTS (
			SELECT 1 FROM enrollments e WHERE e.user_id = ?::uuid AND e.cohort_id = c.id
		)

		ORDER BY enrolled_at DESC
	`, userID, userID, userID).Scan(&rows).Error
	return rows, err
}
