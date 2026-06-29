package submissions

import (
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("submission not found")
var ErrDuplicate = errors.New("submission already exists for this activity")

func createSubmission(s *Submission) error {
	return database.DB.Create(s).Error
}

func getByID(id string) (*Submission, error) {
	var s Submission
	if err := database.DB.Where("id = ?", id).First(&s).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &s, nil
}

func getByParticipantAndActivity(participantID, activityID string) (*Submission, error) {
	var s Submission
	if err := database.DB.Where("participant_id = ? AND activity_id = ?", participantID, activityID).First(&s).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &s, nil
}

func listByActivity(activityID string, offset, limit int) ([]Submission, int64, error) {
	db := database.DB.Model(&Submission{}).Where("activity_id = ?", activityID)
	var total int64
	db.Count(&total)
	var rows []Submission
	err := db.Order("submitted_at desc").Offset(offset).Limit(limit).Find(&rows).Error
	return rows, total, err
}

func gradeSubmission(id string, grade float64, feedback, gradedByID string) error {
	now := time.Now()
	uid, err := uuid.Parse(gradedByID)
	if err != nil {
		return errors.New("invalid graded_by id")
	}
	res := database.DB.Model(&Submission{}).Where("id = ?", id).Updates(map[string]any{
		"grade":     grade,
		"feedback":  feedback,
		"graded_by": uid,
		"graded_at": now,
		"status":    "graded",
	})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func existsByParticipantAndActivity(participantID, activityID string) (bool, error) {
	var count int64
	err := database.DB.Model(&Submission{}).
		Where("participant_id = ? AND activity_id = ?", participantID, activityID).
		Count(&count).Error
	return count > 0, err
}
