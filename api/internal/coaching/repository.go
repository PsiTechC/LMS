package coaching

import (
	"errors"

	"github.com/google/uuid"
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

// ── Coaching Participants ─────────────────────────────────────────

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

// ── Tracker ───────────────────────────────────────────────────────

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

// ── Goals ─────────────────────────────────────────────────────────

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

// ── Dev Notes ─────────────────────────────────────────────────────

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
