package coaching

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("coaching note not found")
var ErrForbidden = errors.New("you can only edit your own notes")

func createNote(n *CoachingNote) error {
	return database.DB.Create(n).Error
}

func getByID(id string) (*CoachingNote, error) {
	var n CoachingNote
	if err := database.DB.Where("id = ?", id).First(&n).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &n, nil
}

func listBySession(sessionID string, includePrivate bool, offset, limit int) ([]CoachingNote, int64, error) {
	db := database.DB.Model(&CoachingNote{}).Where("session_id = ?", sessionID)
	if !includePrivate {
		db = db.Where("is_private = false")
	}
	var total int64
	db.Count(&total)
	var rows []CoachingNote
	err := db.Order("created_at desc").Offset(offset).Limit(limit).Find(&rows).Error
	return rows, total, err
}

func listByParticipant(participantID string, includePrivate bool, offset, limit int) ([]CoachingNote, int64, error) {
	db := database.DB.Model(&CoachingNote{}).Where("participant_id = ?", participantID)
	if !includePrivate {
		db = db.Where("is_private = false")
	}
	var total int64
	db.Count(&total)
	var rows []CoachingNote
	err := db.Order("created_at desc").Offset(offset).Limit(limit).Find(&rows).Error
	return rows, total, err
}

// â”€â”€ Coaching Participants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// listCoachingParticipants returns all unique participants whose cohort the
// faculty has led at least one session for. Pass cohortID to scope to one cohort.
func listCoachingParticipants(facultyID, cohortID string) ([]CoachingParticipantRow, error) {
	var rows []CoachingParticipantRow
	q := `
		SELECT DISTINCT
			u.id              AS user_id,
			u.name,
			u.email,
			COALESCE(u.avatar_url, '') AS avatar_url
		FROM enrollments e
		JOIN users u           ON u.id = e.user_id
		JOIN cohorts c         ON c.id = e.cohort_id
		JOIN class_sessions cs ON cs.cohort_id = c.id AND cs.faculty_id = ?
		WHERE e.role = 'participant' AND e.status != 'withdrawn'`
	args := []interface{}{facultyID}
	if cohortID != "" {
		q += " AND e.cohort_id = ?"
		args = append(args, cohortID)
	}
	q += " ORDER BY u.name ASC"
	err := database.DB.Raw(q, args...).Scan(&rows).Error
	return rows, err
}

// â”€â”€ Tracker â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

func getTrackerForParticipant(participantID, facultyID string) (*CoachingTrackerRow, error) {
	var row CoachingTrackerRow
	err := database.DB.Raw(`
		SELECT
			? ::uuid AS participant_id,
			(
				SELECT COUNT(DISTINCT cs.id)
				FROM class_sessions cs
				JOIN session_attendance sa ON sa.session_id = cs.id AND sa.user_id = ? ::uuid AND sa.status = 'present'
				WHERE cs.faculty_id = ? ::uuid
			) AS sessions_done,
			(SELECT COUNT(*) FROM participant_goals WHERE participant_id = ? ::uuid AND faculty_id = ? ::uuid) AS goals_set,
			(SELECT COUNT(*) FROM session_action_items WHERE participant_id = ? ::uuid AND status = 'open') AS actions_pending,
			(SELECT COUNT(*) FROM session_action_items WHERE participant_id = ? ::uuid) AS actions_total,
			(SELECT COUNT(*) FROM session_action_items WHERE participant_id = ? ::uuid AND status = 'completed') AS actions_complete
	`, participantID, participantID, facultyID, participantID, facultyID, participantID, participantID, participantID).
		Scan(&row).Error
	return &row, err
}

func updateNote(id string, facultyID uuid.UUID, req UpdateNoteRequest) (*CoachingNote, error) {
	n, err := getByID(id)
	if err != nil {
		return nil, err
	}
	if n.FacultyID != facultyID {
		return nil, ErrForbidden
	}
	updates := map[string]any{}
	if req.Notes != nil {
		updates["notes"] = *req.Notes
	}
	if req.IsPrivate != nil {
		updates["is_private"] = *req.IsPrivate
	}
	if len(updates) > 0 {
		if err := database.DB.Model(n).Updates(updates).Error; err != nil {
			return nil, err
		}
	}
	return getByID(id)
}

// â”€â”€ Goals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// ── Participant self-view queries ─────────────────────────────────

// myEngagementRow is the participant's own engagement joined to coach name.
type myEngagementRow struct {
	EngagementName    string
	AssignmentType    string
	Frequency         string
	Status            string
	TotalSessions     int
	CompletedSessions int
	CoachName         string
}

// getMyEngagement returns the participant's most recent active coaching
// engagement (via the engagement_participants link), with the coach's name.
// getMyEngagement returns the participant's coaching engagement. When programID
// is non-empty (from the program switcher) it scopes to that program so a
// participant coached in multiple programs sees the correct engagement.
func getMyEngagement(participantID string, programID string) (*myEngagementRow, error) {
	var row myEngagementRow
	q := `
		SELECT
			e.name                 AS engagement_name,
			e.assignment_type      AS assignment_type,
			e.frequency            AS frequency,
			e.status               AS status,
			e.total_sessions       AS total_sessions,
			e.completed_sessions   AS completed_sessions,
			u.name                 AS coach_name
		FROM coaching_engagement_participants ep
		JOIN coaching_engagements e ON e.id = ep.engagement_id
		JOIN users u ON u.id = e.coach_id
		WHERE ep.participant_id = ?`
	args := []any{participantID}
	if programID != "" {
		q += ` AND e.program_id = ?`
		args = append(args, programID)
	}
	q += ` ORDER BY e.created_at DESC LIMIT 1`

	err := database.DB.Raw(q, args...).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	if row.CoachName == "" && row.EngagementName == "" {
		return nil, ErrNotFound
	}
	return &row, nil
}

// listGoalsForParticipant returns every goal set for a participant (across
// coaches). The participant is the subject, so they see all of their goals.
func listGoalsForParticipant(participantID string) ([]ParticipantGoal, error) {
	var goals []ParticipantGoal
	err := database.DB.
		Where("participant_id = ?", participantID).
		Order("created_at desc").
		Find(&goals).Error
	return goals, err
}

// listSessionNotesForParticipant returns non-private coaching session notes
// authored about the participant (post-session notes are visible to them).
func listSessionNotesForParticipant(participantID string) ([]CoachingNote, error) {
	var notes []CoachingNote
	err := database.DB.
		Where("participant_id = ? AND is_private = false", participantID).
		Order("created_at desc").
		Find(&notes).Error
	return notes, err
}

func createGoal(g *ParticipantGoal) error {
	return database.DB.Create(g).Error
}

func getGoalByID(id string) (*ParticipantGoal, error) {
	var g ParticipantGoal
	if err := database.DB.Where("id = ?", id).First(&g).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &g, nil
}

func updateGoal(id string, facultyID uuid.UUID, req UpdateGoalRequest) (*ParticipantGoal, error) {
	g, err := getGoalByID(id)
	if err != nil {
		return nil, err
	}
	if g.FacultyID != facultyID {
		return nil, ErrForbidden
	}
	updates := map[string]any{}
	if req.Title != nil {
		updates["title"] = *req.Title
	}
	if req.Description != nil {
		updates["description"] = *req.Description
	}
	if req.Status != nil {
		updates["status"] = *req.Status
	}
	if req.PmCanView != nil {
		updates["pm_can_view"] = *req.PmCanView
	}
	if len(updates) > 0 {
		if err := database.DB.Model(g).Updates(updates).Error; err != nil {
			return nil, err
		}
	}
	return getGoalByID(id)
}

func deleteGoal(id string, facultyID uuid.UUID) error {
	g, err := getGoalByID(id)
	if err != nil {
		return err
	}
	if g.FacultyID != facultyID {
		return ErrForbidden
	}
	return database.DB.Delete(g).Error
}

// â”€â”€ Dev Notes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

func createDevNote(d *CoachingDevNote) error {
	return database.DB.Create(d).Error
}

func listDevNotes(participantID, facultyID string, callerRole string) ([]CoachingDevNote, error) {
	db := database.DB.Where("participant_id = ? AND faculty_id = ?", participantID, facultyID)
	// PM can only view notes where pm_can_view = true
	if callerRole == "program_manager" {
		db = db.Where("pm_can_view = true")
	}
	var notes []CoachingDevNote
	err := db.Order("created_at desc").Find(&notes).Error
	return notes, err
}

func getDevNoteByID(id string) (*CoachingDevNote, error) {
	var d CoachingDevNote
	if err := database.DB.Where("id = ?", id).First(&d).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &d, nil
}

func updateDevNote(id string, facultyID uuid.UUID, req UpdateDevNoteRequest) (*CoachingDevNote, error) {
	d, err := getDevNoteByID(id)
	if err != nil {
		return nil, err
	}
	if d.FacultyID != facultyID {
		return nil, ErrForbidden
	}
	updates := map[string]any{}
	if req.Content != nil {
		updates["content"] = *req.Content
	}
	if req.PmCanView != nil {
		updates["pm_can_view"] = *req.PmCanView
	}
	if len(updates) > 0 {
		if err := database.DB.Model(d).Updates(updates).Error; err != nil {
			return nil, err
		}
	}
	return getDevNoteByID(id)
}

// -- PM coaching admin ---------------------------------------------

func listAdminPrograms(orgID string) ([]CoachingAdminProgramOptionDTO, error) {
	var rows []CoachingAdminProgramOptionDTO
	query := database.DB.Table("programs").Select("id::text AS id, title")
	if orgID != "" {
		query = query.Where("org_id = ?::uuid", orgID)
	}
	err := query.Order("created_at DESC").Scan(&rows).Error
	return rows, err
}

func listAdminCohorts(orgID string) ([]CoachingAdminCohortOptionDTO, error) {
	var rows []CoachingAdminCohortOptionDTO
	query := database.DB.Table("cohorts").
		Select("id::text AS id, program_id::text AS program_id, name").
		Where("is_active = true")
	if orgID != "" {
		query = query.Where("org_id = ?::uuid", orgID)
	}
	err := query.Order("created_at DESC").Scan(&rows).Error
	return rows, err
}

func listAdminParticipants(orgID string) ([]CoachingAdminOptionDTO, error) {
	var rows []CoachingAdminOptionDTO
	if orgID == "" {
		// Superadmin "All Orgs" - every participant on the platform.
		err := database.DB.Raw(`
			SELECT DISTINCT u.id::text AS id, u.name, u.email
			FROM users u
			WHERE u.role = 'participant'
			ORDER BY u.name ASC
		`).Scan(&rows).Error
		return rows, err
	}
	err := database.DB.Raw(`
		SELECT DISTINCT u.id::text AS id, u.name, u.email
		FROM users u
		WHERE u.role = 'participant'
		  AND (
		    EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = ?::uuid AND om.user_id = u.id)
		    OR EXISTS (
		      SELECT 1 FROM enrollments e
		      JOIN cohorts c ON c.id = e.cohort_id
		      WHERE e.user_id = u.id AND c.org_id = ?::uuid AND e.status != 'withdrawn'
		    )
		  )
		ORDER BY u.name ASC
	`, orgID, orgID).Scan(&rows).Error
	return rows, err
}

// listAdminCoaches returns every user in the org who can be assigned as a coach:
// anyone with a coaches row (tagged "coach") PLUS all active faculty (tagged
// "faculty"), since a faculty member can also coach. A person who is both a
// faculty and an enrolled coach appears once, tagged "coach".
func listAdminCoaches(orgID string) ([]CoachingAdminOptionDTO, error) {
	var rows []CoachingAdminOptionDTO
	if orgID == "" {
		// Superadmin "All Orgs" - every coach/faculty on the platform.
		// DISTINCT ON (u.id) already dedupes a user who has multiple coaches
		// rows, so the outer ORDER BY can sort on the derived "type"/"is_coach"
		// value without the "SELECT DISTINCT ... ORDER BY expressions must
		// appear in select list" error a plain SELECT DISTINCT would hit here.
		err := database.DB.Raw(`
			SELECT id, name, email, type FROM (
				SELECT DISTINCT ON (u.id) u.id::text AS id, u.name, u.email,
				       CASE WHEN c.user_id IS NOT NULL THEN 'coach' ELSE 'faculty' END AS type,
				       (c.user_id IS NOT NULL) AS is_coach
				FROM users u
				LEFT JOIN coaches c ON c.user_id = u.id
				WHERE u.is_active = true
				  AND (c.user_id IS NOT NULL OR u.role = 'faculty')
				ORDER BY u.id, is_coach DESC
			) t
			ORDER BY is_coach DESC, name ASC
		`).Scan(&rows).Error
		return rows, err
	}
	err := database.DB.Raw(`
		SELECT u.id::text AS id, u.name, u.email,
		       CASE WHEN c.user_id IS NOT NULL THEN 'coach' ELSE 'faculty' END AS type
		FROM users u
		JOIN org_members om ON om.user_id = u.id AND om.org_id = ?::uuid
		LEFT JOIN coaches c ON c.user_id = u.id AND c.org_id = ?::uuid
		WHERE u.is_active = true
		  AND (c.user_id IS NOT NULL OR u.role = 'faculty')
		ORDER BY (c.user_id IS NOT NULL) DESC, u.name ASC
	`, orgID, orgID).Scan(&rows).Error
	return rows, err
}

// listOrgCoaches returns the org's enrolled coaches (coaches table) plus their
// login role tag, for the coach roster on the coaching admin tab. When orgID is
// empty (superadmin "All Orgs"), every coach across every org is returned with
// org_id/org_name populated so the roster can show each coach's organization.
//
// Every code path that makes someone a coach (faculty_management's onboard-
// coach wizard, invitations' sendOrgFacultyInviteService/acceptInviteService,
// and roles' pmGrantCoachRoleService) must insert a coaches row, or the coach
// never appears here even though they're active and assignable elsewhere -
// this was previously true for two of those three paths (see the fixes in
// faculty_management/repository.go and roles/service.go alongside this one).
func listOrgCoaches(orgID string) ([]CoachDTO, error) {
	var rows []CoachDTO
	query := database.DB.Table("coaches c").
		Select(`u.id::text AS user_id, u.name, u.email,
		       CASE WHEN u.role = 'faculty' THEN 'faculty' ELSE 'coach' END AS type,
		       o.id::text AS org_id, o.name AS org_name`).
		Joins("JOIN users u ON u.id = c.user_id").
		Joins("JOIN organizations o ON o.id = c.org_id").
		Where("u.is_active = true")
	if orgID != "" {
		query = query.Where("c.org_id = ?::uuid", orgID)
	}
	err := query.Order("u.name ASC").Scan(&rows).Error
	return rows, err
}

func listAdminEngagements(orgID string) ([]CoachingEngagementRow, error) {
	var rows []CoachingEngagementRow
	query := database.DB.Table("coaching_engagements ce").
		Select(`ce.id, ce.org_id, o.name AS org_name, ce.program_id, p.title AS program_title,
		       ce.cohort_id, c.name AS cohort_name,
		       ce.coach_id, coach.name AS coach_name,
		       ce.assigned_by AS assigned_by_id, assigner.name AS assigned_by_name,
		       ce.assignment_type, ce.name, ce.status, ce.start_date,
		       ce.frequency, ce.total_sessions, ce.completed_sessions,
		       ce.goals_json::text AS goals_json, ce.created_at, ce.updated_at`).
		Joins("JOIN programs p ON p.id = ce.program_id").
		Joins("JOIN organizations o ON o.id = ce.org_id").
		Joins("LEFT JOIN cohorts c ON c.id = ce.cohort_id").
		Joins("JOIN users coach ON coach.id = ce.coach_id").
		Joins("JOIN users assigner ON assigner.id = ce.assigned_by")
	if orgID != "" {
		query = query.Where("ce.org_id = ?::uuid", orgID)
	}
	err := query.Order("ce.created_at DESC").Scan(&rows).Error
	return rows, err
}

func listEngagementParticipants(orgID string) ([]CoachingEngagementParticipantRow, error) {
	var rows []CoachingEngagementParticipantRow
	query := database.DB.Table("coaching_engagement_participants cep").
		Select("cep.engagement_id, u.id AS user_id, u.name, u.email").
		Joins("JOIN coaching_engagements ce ON ce.id = cep.engagement_id").
		Joins("JOIN users u ON u.id = cep.participant_id")
	if orgID != "" {
		query = query.Where("ce.org_id = ?::uuid", orgID)
	}
	err := query.Order("u.name ASC").Scan(&rows).Error
	return rows, err
}

func createAdminEngagement(req CreateCoachingEngagementRequest, assignedBy uuid.UUID, goalsJSON []byte) (*CoachingEngagementRow, error) {
	engID := uuid.New()
	tx := database.DB.Begin()
	if tx.Error != nil {
		return nil, tx.Error
	}
	var cohortID any
	if req.CohortID != nil && *req.CohortID != "" {
		cohortID = *req.CohortID
	}
	if err := tx.Exec(`
		INSERT INTO coaching_engagements
		  (id, org_id, program_id, cohort_id, coach_id, assigned_by, assignment_type, name, status, start_date, frequency, total_sessions, goals_json)
		VALUES
		  (?::uuid, ?::uuid, ?::uuid, ?::uuid, ?::uuid, ?::uuid, ?, ?, 'scheduled', NULLIF(?, '')::date, ?, ?, ?::jsonb)
	`, engID.String(), req.OrgID, req.ProgramID, cohortID, req.CoachID, assignedBy.String(), req.AssignmentType, req.Name, valueOrEmpty(req.StartDate), req.Frequency, req.TotalSessions, string(goalsJSON)).Error; err != nil {
		tx.Rollback()
		return nil, err
	}
	if err := tx.Exec(`
		INSERT INTO coaching_engagement_participants (engagement_id, participant_id)
		SELECT ?::uuid, unnest(?::uuid[])
	`, engID.String(), pq.Array(req.ParticipantIDs)).Error; err != nil {
		tx.Rollback()
		return nil, err
	}
	if err := tx.Commit().Error; err != nil {
		return nil, err
	}
	var row CoachingEngagementRow
	err := database.DB.Raw(`
		SELECT ce.id, ce.org_id, o.name AS org_name, ce.program_id, p.title AS program_title,
		       ce.cohort_id, c.name AS cohort_name,
		       ce.coach_id, coach.name AS coach_name,
		       ce.assigned_by AS assigned_by_id, assigner.name AS assigned_by_name,
		       ce.assignment_type, ce.name, ce.status, ce.start_date,
		       ce.frequency, ce.total_sessions, ce.completed_sessions,
		       ce.goals_json::text AS goals_json, ce.created_at, ce.updated_at
		FROM coaching_engagements ce
		JOIN programs p ON p.id = ce.program_id
		JOIN organizations o ON o.id = ce.org_id
		LEFT JOIN cohorts c ON c.id = ce.cohort_id
		JOIN users coach ON coach.id = ce.coach_id
		JOIN users assigner ON assigner.id = ce.assigned_by
		WHERE ce.id = ?
	`, engID).Scan(&row).Error
	return &row, err
}

func countOrgProgram(orgID, programID string) (int64, error) {
	var n int64
	err := database.DB.Raw(`SELECT COUNT(*) FROM programs WHERE id = ?::uuid AND org_id = ?::uuid`, programID, orgID).Scan(&n).Error
	return n, err
}

func countOrgCohort(orgID, cohortID, programID string) (int64, error) {
	var n int64
	err := database.DB.Raw(`SELECT COUNT(*) FROM cohorts WHERE id = ?::uuid AND org_id = ?::uuid AND program_id = ?::uuid`, cohortID, orgID, programID).Scan(&n).Error
	return n, err
}

// countOrgCoach validates that coachID is assignable as a coach in the org:
// either they have a coaches row, or they are an active faculty member (a
// faculty can also coach). Mirrors listAdminCoaches' eligibility rule.
func countOrgCoach(orgID, coachID string) (int64, error) {
	var n int64
	err := database.DB.Raw(`
		SELECT COUNT(*) FROM users u
		JOIN org_members om ON om.user_id = u.id AND om.org_id = ?::uuid
		LEFT JOIN coaches c ON c.user_id = u.id AND c.org_id = ?::uuid
		WHERE u.id = ?::uuid AND u.is_active = true
		  AND (c.user_id IS NOT NULL OR u.role = 'faculty')
	`, orgID, orgID, coachID).Scan(&n).Error
	return n, err
}

func countOrgParticipants(orgID string, participantIDs []string) (int64, error) {
	var n int64
	err := database.DB.Raw(`
		SELECT COUNT(DISTINCT u.id)
		FROM users u
		WHERE u.id = ANY(?::uuid[]) AND u.role = 'participant'
		  AND (
		    EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = ?::uuid AND om.user_id = u.id)
		    OR EXISTS (
		      SELECT 1 FROM enrollments e
		      JOIN cohorts c ON c.id = e.cohort_id
		      WHERE e.user_id = u.id AND c.org_id = ?::uuid AND e.status != 'withdrawn'
		    )
		  )
	`, pq.Array(participantIDs), orgID, orgID).Scan(&n).Error
	return n, err
}

func valueOrEmpty(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

// ── Coach personal calendar blocks ─────────────────────────────────

type CoachBlockRow struct {
	ID           uuid.UUID `gorm:"column:id"`
	BlockedAt    time.Time `gorm:"column:blocked_at"`
	DurationMins int       `gorm:"column:duration_mins"`
	Label        string    `gorm:"column:label"`
}

// listCoachBlocks returns the coach's blocks whose blocked_at is in [from, to).
// Empty from/to means unbounded on that side.
func listCoachBlocks(coachID, from, to string) ([]CoachBlockRow, error) {
	var rows []CoachBlockRow
	err := database.DB.Raw(`
		SELECT id, blocked_at, duration_mins, label
		FROM coach_blocked_time
		WHERE coach_id = ?::uuid
		  AND (? = '' OR blocked_at >= ?::date)
		  AND (? = '' OR blocked_at <  (?::date + INTERVAL '1 day'))
		ORDER BY blocked_at ASC
	`, coachID, from, from, to, to).Scan(&rows).Error
	return rows, err
}

func createCoachBlock(coachID string, req CreateCoachBlockRequest) (string, error) {
	id := uuid.New()
	if req.DurationMins <= 0 {
		req.DurationMins = 60
	}
	err := database.DB.Exec(`
		INSERT INTO coach_blocked_time (id, coach_id, blocked_at, duration_mins, label)
		VALUES (?::uuid, ?::uuid, ?::timestamptz, ?, ?)
	`, id.String(), coachID, req.BlockedAt, req.DurationMins, req.Label).Error
	return id.String(), err
}

func deleteCoachBlock(coachID, id string) (int64, error) {
	res := database.DB.Exec(`DELETE FROM coach_blocked_time WHERE id = ?::uuid AND coach_id = ?::uuid`, id, coachID)
	return res.RowsAffected, res.Error
}

// ── Coach-scheduled sessions ────────────────────────────────────────
// Coaches schedule sessions against one of their OWN engagements (never an
// arbitrary program/cohort) - the engagement supplies program_id/cohort_id,
// and its participants are who the session is "with".

// EngagementOwnerRow is the minimal engagement projection needed to build a
// class_sessions row: which program/cohort it belongs to, and its title (used
// as a session title fallback).
type EngagementOwnerRow struct {
	ID        uuid.UUID  `gorm:"column:id"`
	ProgramID uuid.UUID  `gorm:"column:program_id"`
	CohortID  *uuid.UUID `gorm:"column:cohort_id"`
	Name      string     `gorm:"column:name"`
}

// getCoachEngagementForOwner returns the engagement only if it belongs to
// coachID - the authorization check for coach-initiated session scheduling.
func getCoachEngagementForOwner(coachID, engagementID string) (*EngagementOwnerRow, error) {
	var row EngagementOwnerRow
	err := database.DB.Raw(`
		SELECT id, program_id, cohort_id, name FROM coaching_engagements
		WHERE id = ?::uuid AND coach_id = ?::uuid
	`, engagementID, coachID).Scan(&row).Error
	if err != nil {
		return nil, err
	}
	if row.ID == uuid.Nil {
		return nil, ErrNotFound
	}
	return &row, nil
}

// createCoachSession inserts a class_sessions row linked to the given
// engagement, with the coach as faculty_id (so the existing
// cs.faculty_id = coachID branch in the coach calendar/upcoming queries picks
// it up too, on top of the ce.coach_id join). Returns the new session's id.
//
// meetingType is derived by the caller (createCoachSessionService) from
// req.SessionType using the exact same "virtual"->"zoom_embedded",
// "in_person"->"in_person" mapping Phase 4b established for the PM's
// ScheduleSessionModal - kept here as an explicit parameter, not
// re-derived, so there's exactly one place that mapping lives conceptually.
func createCoachSession(coachID string, eng *EngagementOwnerRow, req CreateCoachSessionRequest, virtualLink *string, meetingType string) (string, error) {
	id := uuid.New()
	var cohortID any
	if eng.CohortID != nil {
		cohortID = eng.CohortID.String()
	}
	err := database.DB.Exec(`
		INSERT INTO class_sessions
			(id, program_id, cohort_id, faculty_id, engagement_id, title, session_type, virtual_link, scheduled_at, duration_mins, status, agenda, meeting_type)
		VALUES
			(?::uuid, ?::uuid, ?::uuid, ?::uuid, ?::uuid, ?, ?, ?, ?::timestamptz, ?, 'scheduled', '[]', ?)
	`, id.String(), eng.ProgramID.String(), cohortID, coachID, eng.ID.String(), req.Title, req.SessionType, virtualLink, req.ScheduledAt, req.DurationMins, meetingType).Error
	return id.String(), err
}

// MyCoachingSessionRow is the raw projection for a participant's own coaching
// session - kept distinct from MyCoachingSessionDTO so nullable SQL columns
// (virtual_link) scan into pointer fields rather than the JSON-facing string.
type MyCoachingSessionRow struct {
	ID           uuid.UUID `gorm:"column:id"`
	Title        string    `gorm:"column:title"`
	SessionType  string    `gorm:"column:session_type"`
	VirtualLink  *string   `gorm:"column:virtual_link"`
	MeetingType  string    `gorm:"column:meeting_type"`
	ZoomJoinURL  *string   `gorm:"column:zoom_join_url"`
	ScheduledAt  time.Time `gorm:"column:scheduled_at"`
	DurationMins int       `gorm:"column:duration_mins"`
	Status       string    `gorm:"column:status"`
	CoachName    string    `gorm:"column:coach_name"`
}

// listMyCoachingSessions returns the participant's own coaching sessions
// (via coaching_engagement_participants), independent of cohort_id - a 1:1
// engagement has none, so the general /sessions?cohort_id list never surfaces
// it. This is the participant-safe read used to power "Join Session".
func listMyCoachingSessions(participantID string) ([]MyCoachingSessionRow, error) {
	var rows []MyCoachingSessionRow
	err := database.DB.Raw(`
		SELECT cs.id, cs.title, cs.session_type, cs.virtual_link, cs.meeting_type,
		       cs.zoom_join_url, cs.scheduled_at,
		       cs.duration_mins, cs.status, coach.name AS coach_name
		FROM class_sessions cs
		JOIN coaching_engagements ce ON ce.id = cs.engagement_id
		JOIN coaching_engagement_participants cep ON cep.engagement_id = ce.id AND cep.participant_id = ?::uuid
		JOIN users coach ON coach.id = ce.coach_id
		ORDER BY cs.scheduled_at ASC
	`, participantID).Scan(&rows).Error
	return rows, err
}

// ── Coach documents / psychometric reports ─────────────────────────

type CoachDocumentRow struct {
	ID            uuid.UUID `gorm:"column:id"`
	ParticipantID uuid.UUID `gorm:"column:participant_id"`
	CoacheeName   *string   `gorm:"column:coachee_name"`
	Title         string    `gorm:"column:title"`
	DocType       string    `gorm:"column:doc_type"`
	UploadedBy    string    `gorm:"column:uploaded_by"`
	URL           string    `gorm:"column:url"`
	IsShared      bool      `gorm:"column:is_shared"`
	CoachSummary  string    `gorm:"column:coach_summary"`
	HasFile       bool      `gorm:"column:has_file"`
	FileName      string    `gorm:"column:file_name"`
	FileSize      int64     `gorm:"column:file_size"`
	CreatedAt     time.Time `gorm:"column:created_at"`
}

const coachDocSelect = `
	SELECT d.id, d.participant_id, u.name AS coachee_name, d.title, d.doc_type, d.uploaded_by,
	       d.url, d.is_shared, d.coach_summary,
	       (d.file_data IS NOT NULL AND length(d.file_data) > 0) AS has_file, d.file_name, d.file_size, d.created_at
	FROM coach_documents d
	LEFT JOIN users u ON u.id = d.participant_id`

// listCoachDocuments returns the coach's documents about a specific coachee.
func listCoachDocuments(coachID, participantID string) ([]CoachDocumentRow, error) {
	var rows []CoachDocumentRow
	err := database.DB.Raw(coachDocSelect+`
		WHERE d.coach_id = ?::uuid AND d.participant_id = ?::uuid
		ORDER BY d.created_at DESC
	`, coachID, participantID).Scan(&rows).Error
	return rows, err
}

// listAllCoachDocuments returns every document the coach holds across coachees.
func listAllCoachDocuments(coachID string) ([]CoachDocumentRow, error) {
	var rows []CoachDocumentRow
	err := database.DB.Raw(coachDocSelect+`
		WHERE d.coach_id = ?::uuid
		ORDER BY d.created_at DESC
	`, coachID).Scan(&rows).Error
	return rows, err
}

// createCoachDocument inserts a document, optionally with file bytes.
func createCoachDocument(coachID string, req CreateCoachDocumentRequest, fileData []byte, fileName, mimeType string) (string, error) {
	id := uuid.New()
	err := database.DB.Exec(`
		INSERT INTO coach_documents
		  (id, participant_id, coach_id, title, doc_type, uploaded_by, url, is_shared, coach_summary, file_data, file_name, file_size, mime_type)
		VALUES (?::uuid, ?::uuid, ?::uuid, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, id.String(), req.ParticipantID, coachID, req.Title, req.DocType, req.UploadedBy, req.URL, req.IsShared, req.CoachSummary, fileData, fileName, int64(len(fileData)), mimeType).Error
	return id.String(), err
}

// getCoachDocumentFile returns the stored file bytes for the coach's document.
func getCoachDocumentFile(coachID, id string) ([]byte, string, string, error) {
	var row struct {
		FileData []byte `gorm:"column:file_data"`
		FileName string `gorm:"column:file_name"`
		MimeType string `gorm:"column:mime_type"`
	}
	err := database.DB.Raw(`
		SELECT file_data, file_name, mime_type FROM coach_documents
		WHERE id = ?::uuid AND coach_id = ?::uuid
	`, id, coachID).Scan(&row).Error
	return row.FileData, row.FileName, row.MimeType, err
}

// ── Session Notes (coach) ──────────────────────────────────────────

// CoachNoteRow is a coaching note joined to its session + coachee.
type CoachNoteRow struct {
	ID            uuid.UUID `gorm:"column:id"`
	SessionID     uuid.UUID `gorm:"column:session_id"`
	SessionTitle  string    `gorm:"column:session_title"`
	ParticipantID uuid.UUID `gorm:"column:participant_id"`
	CoacheeName   *string   `gorm:"column:coachee_name"`
	Notes         string    `gorm:"column:notes"`
	CreatedAt     time.Time `gorm:"column:created_at"`
}

// listCoachNotes returns every coaching note the coach authored, newest first.
func listCoachNotes(coachID string) ([]CoachNoteRow, error) {
	var rows []CoachNoteRow
	err := database.DB.Raw(`
		SELECT cn.id, cn.session_id, cs.title AS session_title,
		       cn.participant_id, u.name AS coachee_name,
		       cn.notes, cn.created_at
		FROM coaching_notes cn
		JOIN class_sessions cs ON cs.id = cn.session_id
		LEFT JOIN users u ON u.id = cn.participant_id
		WHERE cn.faculty_id = ?::uuid
		ORDER BY cn.created_at DESC
	`, coachID).Scan(&rows).Error
	return rows, err
}

// CoachNoteActionRow is one action item tracked against a note's session.
type CoachNoteActionRow struct {
	ID          uuid.UUID  `gorm:"column:id"`
	SessionID   uuid.UUID  `gorm:"column:session_id"`
	Description string     `gorm:"column:description"`
	DueDate     *time.Time `gorm:"column:due_date"`
	Status      string     `gorm:"column:status"`
}

// listActionsForSessions returns all action items for the given session IDs.
func listActionsForSessions(sessionIDs []string) ([]CoachNoteActionRow, error) {
	if len(sessionIDs) == 0 {
		return nil, nil
	}
	var rows []CoachNoteActionRow
	err := database.DB.Raw(`
		SELECT id, session_id, description, due_date, status
		FROM session_action_items
		WHERE session_id = ANY(?::uuid[])
		ORDER BY due_date ASC NULLS LAST
	`, pq.Array(sessionIDs)).Scan(&rows).Error
	return rows, err
}

// sessionEngagementParticipant returns the first participant of the session's
// coaching engagement (the coachee for a 1:1 note). Empty if none.
func sessionEngagementParticipant(sessionID string) (string, error) {
	var pid string
	err := database.DB.Raw(`
		SELECT cep.participant_id::text
		FROM coaching_engagement_participants cep
		JOIN class_sessions cs ON cs.engagement_id = cep.engagement_id
		WHERE cs.id = ?::uuid
		ORDER BY cep.participant_id
		LIMIT 1
	`, sessionID).Scan(&pid).Error
	return pid, err
}

// coachOwnsSession reports whether the session belongs to a coaching
// engagement this coach runs. A session where this account is merely
// faculty_id (e.g. their own unrelated Program Session as a faculty member)
// does NOT count — only genuine coaching engagement ownership does.
func coachOwnsSession(coachID, sessionID string) (bool, error) {
	var n int64
	err := database.DB.Raw(`
		SELECT COUNT(*) FROM class_sessions cs
		JOIN coaching_engagements ce ON ce.id = cs.engagement_id
		WHERE cs.id = ?::uuid AND ce.coach_id = ?::uuid
	`, sessionID, coachID).Scan(&n).Error
	return n > 0, err
}

// createCoachAction inserts a new action item on one of the coach's sessions.
func createCoachAction(coachID, sessionID, description string, dueDate, participantID *string) (*CoachNoteActionRow, error) {
	id := uuid.New()
	err := database.DB.Exec(`
		INSERT INTO session_action_items (id, session_id, participant_id, description, due_date, status, created_by)
		VALUES (?::uuid, ?::uuid, NULLIF(?, '')::uuid, ?, NULLIF(?, '')::date, 'open', ?::uuid)
	`, id.String(), sessionID, valueOrEmpty(participantID), description, valueOrEmpty(dueDate), coachID).Error
	if err != nil {
		return nil, err
	}
	var row CoachNoteActionRow
	err = database.DB.Raw(`SELECT id, session_id, description, due_date, status FROM session_action_items WHERE id = ?::uuid`, id.String()).Scan(&row).Error
	return &row, err
}

// updateCoachActionStatus flips an action item's status, but only if it
// belongs to a session tied to a coaching engagement this coach runs.
func updateCoachActionStatus(actionID, coachID, status string) (int64, error) {
	res := database.DB.Exec(`
		UPDATE session_action_items sai
		SET status = ?
		FROM class_sessions cs
		JOIN coaching_engagements ce ON ce.id = cs.engagement_id
		WHERE sai.id = ?::uuid AND sai.session_id = cs.id
		  AND ce.coach_id = ?::uuid
	`, status, actionID, coachID)
	return res.RowsAffected, res.Error
}

// -- Coach dashboard (coach-scoped, keyed by coach_id = the caller) -------------

// listEngagementsByCoach returns every engagement the given coach runs. Same
// projection as listAdminEngagements but scoped to coach_id (uses the existing
// idx_coaching_engagements_coach index) instead of org_id.
func listEngagementsByCoach(coachID string) ([]CoachingEngagementRow, error) {
	var rows []CoachingEngagementRow
	err := database.DB.Raw(`
		SELECT ce.id, ce.org_id, o.name AS org_name, ce.program_id, p.title AS program_title,
		       ce.cohort_id, c.name AS cohort_name,
		       ce.coach_id, coach.name AS coach_name,
		       ce.assigned_by AS assigned_by_id, assigner.name AS assigned_by_name,
		       ce.assignment_type, ce.name, ce.status, ce.start_date,
		       ce.frequency, ce.total_sessions, ce.completed_sessions,
		       ce.goals_json::text AS goals_json, ce.created_at, ce.updated_at
		FROM coaching_engagements ce
		JOIN programs p ON p.id = ce.program_id
		JOIN organizations o ON o.id = ce.org_id
		LEFT JOIN cohorts c ON c.id = ce.cohort_id
		JOIN users coach ON coach.id = ce.coach_id
		JOIN users assigner ON assigner.id = ce.assigned_by
		WHERE ce.coach_id = ?::uuid
		ORDER BY ce.created_at DESC
	`, coachID).Scan(&rows).Error
	return rows, err
}

// listEngagementParticipantsByCoach returns the participants of every engagement
// the given coach runs, for grouping onto CoachingEngagementDTO.
func listEngagementParticipantsByCoach(coachID string) ([]CoachingEngagementParticipantRow, error) {
	var rows []CoachingEngagementParticipantRow
	err := database.DB.Raw(`
		SELECT cep.engagement_id, u.id AS user_id, u.name, u.email
		FROM coaching_engagement_participants cep
		JOIN coaching_engagements ce ON ce.id = cep.engagement_id AND ce.coach_id = ?::uuid
		JOIN users u ON u.id = cep.participant_id
		ORDER BY u.name ASC
	`, coachID).Scan(&rows).Error
	return rows, err
}

// CoachSummaryRow aggregates the coach's headline dashboard numbers in one pass.
type CoachSummaryRow struct {
	ActiveEngagements    int `gorm:"column:active_engagements"`
	ScheduledEngagements int `gorm:"column:scheduled_engagements"`
	UpcomingSessions     int `gorm:"column:upcoming_sessions"`
	PendingActions       int `gorm:"column:pending_actions"`
	SessionsDone         int `gorm:"column:sessions_done"`
	SessionsTotal        int `gorm:"column:sessions_total"`
}

func getCoachSummary(coachID string) (*CoachSummaryRow, error) {
	var row CoachSummaryRow
	err := database.DB.Raw(`
		SELECT
			(SELECT COUNT(*) FROM coaching_engagements WHERE coach_id = ?::uuid AND status = 'active')    AS active_engagements,
			(SELECT COUNT(*) FROM coaching_engagements WHERE coach_id = ?::uuid AND status = 'scheduled') AS scheduled_engagements,
			(SELECT COUNT(*) FROM class_sessions cs
			   JOIN coaching_engagements ce ON ce.id = cs.engagement_id
			   WHERE ce.coach_id = ?::uuid AND cs.status = 'scheduled'
			     AND cs.scheduled_at >= NOW() AND cs.scheduled_at < NOW() + INTERVAL '7 days')            AS upcoming_sessions,
			(SELECT COUNT(*) FROM session_action_items sai
			   JOIN class_sessions cs ON cs.id = sai.session_id
			   JOIN coaching_engagements ce ON ce.id = cs.engagement_id
			   WHERE ce.coach_id = ?::uuid AND sai.status = 'open')          AS pending_actions,
			(SELECT COALESCE(SUM(completed_sessions), 0) FROM coaching_engagements WHERE coach_id = ?::uuid) AS sessions_done,
			(SELECT COALESCE(SUM(total_sessions), 0) FROM coaching_engagements WHERE coach_id = ?::uuid)     AS sessions_total
	`, coachID, coachID, coachID, coachID, coachID, coachID).Scan(&row).Error
	return &row, err
}

// CoachSessionRow projects an upcoming coaching session for the coach.
// EngagementType/EngagementName/CoacheeName come from the linked engagement so
// the UI can label a 1:1 by the coachee and a group by the engagement/cohort.
type CoachSessionRow struct {
	ID               uuid.UUID  `gorm:"column:id"`
	Title            string     `gorm:"column:title"`
	SessionType      string     `gorm:"column:session_type"`
	VirtualLink      *string    `gorm:"column:virtual_link"`
	ScheduledAt      time.Time  `gorm:"column:scheduled_at"`
	DurationMins     int        `gorm:"column:duration_mins"`
	Status           string     `gorm:"column:status"`
	CohortID         *uuid.UUID `gorm:"column:cohort_id"`
	CohortName       *string    `gorm:"column:cohort_name"`
	ProgramTitle     string     `gorm:"column:program_title"`
	EngagementID     *uuid.UUID `gorm:"column:engagement_id"`
	EngagementType   *string    `gorm:"column:engagement_type"`
	EngagementName   *string    `gorm:"column:engagement_name"`
	CoacheeName      *string    `gorm:"column:coachee_name"`
	ParticipantCount int        `gorm:"column:participant_count"`
	Notes            *string    `gorm:"column:notes"`
	MeetingType      string     `gorm:"column:meeting_type"`
	JoinURL          *string    `gorm:"column:zoom_join_url"`
	ZoomMeetingID    *string    `gorm:"column:zoom_meeting_id"`
}

// listUpcomingSessionsForCoach returns the coach's scheduled/live sessions from
// now onward, soonest first. A session counts as "the coach's" only when it is
// linked to a coaching engagement this coach runs (engagement.coach_id) — a
// session where this account is merely faculty_id (e.g. their own unrelated
// Program Session as a faculty member) is never "theirs" as a coach.
func listUpcomingSessionsForCoach(coachID string, limit int) ([]CoachSessionRow, error) {
	var rows []CoachSessionRow
	err := database.DB.Raw(`
		SELECT cs.id, cs.title, cs.session_type, cs.virtual_link, cs.scheduled_at,
		       cs.duration_mins, cs.status, cs.cohort_id, c.name AS cohort_name,
		       p.title AS program_title, cs.meeting_type, cs.zoom_join_url, cs.zoom_meeting_id,
		       CASE WHEN ce.coach_id = ?::uuid THEN ce.id END               AS engagement_id,
		       CASE WHEN ce.coach_id = ?::uuid THEN ce.assignment_type END  AS engagement_type,
		       CASE WHEN ce.coach_id = ?::uuid THEN ce.name END             AS engagement_name,
		       CASE WHEN ce.coach_id = ?::uuid THEN
		         (SELECT u.name FROM coaching_engagement_participants cep
		            JOIN users u ON u.id = cep.participant_id
		            WHERE cep.engagement_id = ce.id
		            ORDER BY u.name LIMIT 1)
		       END                                                          AS coachee_name,
		       CASE WHEN ce.coach_id = ?::uuid THEN
		         (SELECT COUNT(*) FROM coaching_engagement_participants cep
		            WHERE cep.engagement_id = ce.id)
		       ELSE 0 END                                                   AS participant_count
		FROM class_sessions cs
		JOIN programs p ON p.id = cs.program_id
		LEFT JOIN cohorts c ON c.id = cs.cohort_id
		JOIN coaching_engagements ce ON ce.id = cs.engagement_id
		WHERE cs.status IN ('scheduled', 'live')
		  AND cs.scheduled_at >= NOW() - INTERVAL '1 hour'
		  AND ce.coach_id = ?::uuid
		ORDER BY cs.scheduled_at ASC
		LIMIT ?
	`, coachID, coachID, coachID, coachID, coachID, coachID, limit).Scan(&rows).Error
	return rows, err
}

// listCoachSessionsInRange returns all of the coach's sessions (any status)
// whose scheduled_at falls in [from, to). Empty from/to means no bound on that
// side. Same coach/coachee resolution as listUpcomingSessionsForCoach; used by
// the calendar so past, present and future sessions all render.
func listCoachSessionsInRange(coachID, from, to string) ([]CoachSessionRow, error) {
	var rows []CoachSessionRow
	err := database.DB.Raw(`
		SELECT cs.id, cs.title, cs.session_type, cs.virtual_link, cs.scheduled_at,
		       cs.duration_mins, cs.status, cs.notes, cs.cohort_id, c.name AS cohort_name,
		       p.title AS program_title, cs.meeting_type, cs.zoom_join_url, cs.zoom_meeting_id,
		       CASE WHEN ce.coach_id = ?::uuid THEN ce.id END               AS engagement_id,
		       CASE WHEN ce.coach_id = ?::uuid THEN ce.assignment_type END  AS engagement_type,
		       CASE WHEN ce.coach_id = ?::uuid THEN ce.name END             AS engagement_name,
		       CASE WHEN ce.coach_id = ?::uuid THEN
		         (SELECT u.name FROM coaching_engagement_participants cep
		            JOIN users u ON u.id = cep.participant_id
		            WHERE cep.engagement_id = ce.id
		            ORDER BY u.name LIMIT 1)
		       END                                                          AS coachee_name,
		       CASE WHEN ce.coach_id = ?::uuid THEN
		         (SELECT COUNT(*) FROM coaching_engagement_participants cep
		            WHERE cep.engagement_id = ce.id)
		       ELSE 0 END                                                   AS participant_count
		FROM class_sessions cs
		JOIN programs p ON p.id = cs.program_id
		LEFT JOIN cohorts c ON c.id = cs.cohort_id
		LEFT JOIN coaching_engagements ce ON ce.id = cs.engagement_id
		WHERE ce.coach_id = ?::uuid
		  AND (?  = '' OR cs.scheduled_at >= ?::date)
		  AND (?  = '' OR cs.scheduled_at <  (?::date + INTERVAL '1 day'))
		ORDER BY cs.scheduled_at ASC
	`, coachID, coachID, coachID, coachID, coachID, coachID, from, from, to, to).Scan(&rows).Error
	return rows, err
}

// CoachActionRow projects one pending coachee action item for the coach.
type CoachActionRow struct {
	ID              uuid.UUID  `gorm:"column:id"`
	Description     string     `gorm:"column:description"`
	DueDate         *time.Time `gorm:"column:due_date"`
	Status          string     `gorm:"column:status"`
	ParticipantID   *uuid.UUID `gorm:"column:participant_id"`
	ParticipantName *string    `gorm:"column:participant_name"`
	SessionTitle    string     `gorm:"column:session_title"`
}

// listPendingActionsForCoach returns open action items across sessions tied
// to a coaching engagement this coach runs, soonest due first. An action item
// on this account's own unrelated Program Session (faculty_id, no coaching
// engagement) is never "theirs" as a coach.
func listPendingActionsForCoach(coachID string, limit int) ([]CoachActionRow, error) {
	var rows []CoachActionRow
	err := database.DB.Raw(`
		SELECT sai.id, sai.description, sai.due_date, sai.status,
		       sai.participant_id, u.name AS participant_name,
		       cs.title AS session_title
		FROM session_action_items sai
		JOIN class_sessions cs ON cs.id = sai.session_id
		JOIN coaching_engagements ce ON ce.id = cs.engagement_id
		LEFT JOIN users u ON u.id = sai.participant_id
		WHERE ce.coach_id = ?::uuid AND sai.status = 'open'
		ORDER BY sai.due_date ASC NULLS LAST
		LIMIT ?
	`, coachID, limit).Scan(&rows).Error
	return rows, err
}
