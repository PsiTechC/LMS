package sessions

import (
	"errors"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

var ErrNotFound = errors.New("session not found")

func listSessions(cohortID, facultyID, status string, offset, limit int) ([]ClassSession, int64, error) {
	db := database.DB.Model(&ClassSession{})
	if cohortID != "" {
		db = db.Where("cohort_id = ?", cohortID)
	}
	if facultyID != "" {
		db = db.Where("faculty_id = ?", facultyID)
	}
	if status != "" {
		db = db.Where("status = ?", status)
	}
	var total int64
	db.Count(&total)
	var rows []ClassSession
	err := db.Order("scheduled_at asc").Offset(offset).Limit(limit).Find(&rows).Error
	return rows, total, err
}

func getSessionByID(id string) (*ClassSession, error) {
	var s ClassSession
	if err := database.DB.Where("id = ?", id).First(&s).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &s, nil
}

func createSession(s *ClassSession) error {
	return database.DB.Create(s).Error
}

func updateSession(id string, fields map[string]any) error {
	res := database.DB.Model(&ClassSession{}).Where("id = ?", id).Updates(fields)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func listMaterials(sessionID string) ([]SessionMaterial, error) {
	var rows []SessionMaterial
	err := database.DB.Where("session_id = ?", sessionID).Order("created_at asc").Find(&rows).Error
	return rows, err
}

func addMaterial(m *SessionMaterial) error {
	return database.DB.Create(m).Error
}

func getAttendance(sessionID string) ([]SessionAttendance, error) {
	var rows []SessionAttendance
	err := database.DB.Where("session_id = ?", sessionID).Find(&rows).Error
	return rows, err
}

func markAttendance(sessionID uuid.UUID, entries []AttendanceEntry) error {
	rows := make([]SessionAttendance, 0, len(entries))
	for _, e := range entries {
		uid, err := uuid.Parse(e.UserID)
		if err != nil {
			continue
		}
		rows = append(rows, SessionAttendance{
			SessionID: sessionID,
			UserID:    uid,
			Status:    e.Status,
		})
	}
	if len(rows) == 0 {
		return nil
	}
	return database.DB.Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "session_id"}, {Name: "user_id"}},
		DoUpdates: clause.AssignmentColumns([]string{"status", "marked_at"}),
	}).Create(&rows).Error
}
