package coaching

import (
	"errors"

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

func listGoals(participantID, facultyID string) ([]ParticipantGoal, error) {
	var goals []ParticipantGoal
	err := database.DB.
		Where("participant_id = ? AND faculty_id = ?", participantID, facultyID).
		Order("created_at desc").
		Find(&goals).Error
	return goals, err
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
	err := database.DB.Raw(`
		SELECT id::text AS id, title
		FROM programs
		WHERE org_id = ?
		ORDER BY created_at DESC
	`, orgID).Scan(&rows).Error
	return rows, err
}

func listAdminCohorts(orgID string) ([]CoachingAdminCohortOptionDTO, error) {
	var rows []CoachingAdminCohortOptionDTO
	err := database.DB.Raw(`
		SELECT id::text AS id, program_id::text AS program_id, name
		FROM cohorts
		WHERE org_id = ? AND is_active = true
		ORDER BY created_at DESC
	`, orgID).Scan(&rows).Error
	return rows, err
}

func listAdminParticipants(orgID string) ([]CoachingAdminOptionDTO, error) {
	var rows []CoachingAdminOptionDTO
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

func listAdminCoaches(orgID string) ([]CoachingAdminOptionDTO, error) {
	var rows []CoachingAdminOptionDTO
	err := database.DB.Raw(`
		SELECT DISTINCT u.id::text AS id, u.name, u.email
		FROM users u
		JOIN org_members om ON om.user_id = u.id AND om.org_id = ?::uuid
		WHERE u.role = 'faculty' AND u.is_active = true
		ORDER BY u.name ASC
	`, orgID).Scan(&rows).Error
	return rows, err
}

func listAdminEngagements(orgID string) ([]CoachingEngagementRow, error) {
	var rows []CoachingEngagementRow
	err := database.DB.Raw(`
		SELECT ce.id, ce.org_id, ce.program_id, p.title AS program_title,
		       ce.cohort_id, c.name AS cohort_name,
		       ce.coach_id, coach.name AS coach_name,
		       ce.assigned_by AS assigned_by_id, assigner.name AS assigned_by_name,
		       ce.assignment_type, ce.name, ce.status, ce.start_date,
		       ce.frequency, ce.total_sessions, ce.completed_sessions,
		       ce.goals_json::text AS goals_json, ce.created_at, ce.updated_at
		FROM coaching_engagements ce
		JOIN programs p ON p.id = ce.program_id
		LEFT JOIN cohorts c ON c.id = ce.cohort_id
		JOIN users coach ON coach.id = ce.coach_id
		JOIN users assigner ON assigner.id = ce.assigned_by
		WHERE ce.org_id = ?::uuid
		ORDER BY ce.created_at DESC
	`, orgID).Scan(&rows).Error
	return rows, err
}

func listEngagementParticipants(orgID string) ([]CoachingEngagementParticipantRow, error) {
	var rows []CoachingEngagementParticipantRow
	err := database.DB.Raw(`
		SELECT cep.engagement_id, u.id AS user_id, u.name, u.email
		FROM coaching_engagement_participants cep
		JOIN coaching_engagements ce ON ce.id = cep.engagement_id AND ce.org_id = ?::uuid
		JOIN users u ON u.id = cep.participant_id
		ORDER BY u.name ASC
	`, orgID).Scan(&rows).Error
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
		SELECT ce.id, ce.org_id, ce.program_id, p.title AS program_title,
		       ce.cohort_id, c.name AS cohort_name,
		       ce.coach_id, coach.name AS coach_name,
		       ce.assigned_by AS assigned_by_id, assigner.name AS assigned_by_name,
		       ce.assignment_type, ce.name, ce.status, ce.start_date,
		       ce.frequency, ce.total_sessions, ce.completed_sessions,
		       ce.goals_json::text AS goals_json, ce.created_at, ce.updated_at
		FROM coaching_engagements ce
		JOIN programs p ON p.id = ce.program_id
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

func countOrgCoach(orgID, coachID string) (int64, error) {
	var n int64
	err := database.DB.Raw(`
		SELECT COUNT(*) FROM users u
		JOIN org_members om ON om.user_id = u.id AND om.org_id = ?::uuid
		WHERE u.id = ?::uuid AND u.role = 'faculty' AND u.is_active = true
	`, orgID, coachID).Scan(&n).Error
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
