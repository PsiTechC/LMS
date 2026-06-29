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
