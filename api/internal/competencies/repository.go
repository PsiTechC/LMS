package competencies

import (
	"errors"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("not found")
var ErrForbidden = errors.New("forbidden")

// ── Competencies ──────────────────────────────────────────────────────

func listCompetencies(orgID string) ([]Competency, error) {
	var rows []Competency
	err := database.DB.Where("org_id = ?", orgID).Order("category, title").Find(&rows).Error
	return rows, err
}

func createCompetency(c *Competency) error {
	return database.DB.Create(c).Error
}

func getCompetencyByID(id string) (*Competency, error) {
	var c Competency
	if err := database.DB.Where("id = ?", id).First(&c).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &c, nil
}

func updateCompetency(id string, updates map[string]any) error {
	res := database.DB.Model(&Competency{}).Where("id = ?", id).Updates(updates)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

func deleteCompetency(id string) error {
	res := database.DB.Where("id = ?", id).Delete(&Competency{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// ── Activity ↔ Competency mapping ────────────────────────────────────

func listActivityCompetencies(activityID string) ([]ActivityCompetencyResponse, error) {
	var rows []ActivityCompetencyResponse
	err := database.DB.Raw(`
		SELECT ac.activity_id, ac.competency_id, c.title, c.category, ac.level, ac.created_at
		FROM activity_competencies ac
		JOIN competencies c ON c.id = ac.competency_id
		WHERE ac.activity_id = ?
		ORDER BY c.category, c.title
	`, activityID).Scan(&rows).Error
	return rows, err
}

func mapActivityCompetency(activityID, competencyID, level string) error {
	aID, err := uuid.Parse(activityID)
	if err != nil {
		return errors.New("invalid activity_id")
	}
	cID, err := uuid.Parse(competencyID)
	if err != nil {
		return errors.New("invalid competency_id")
	}
	lv := level
	if lv == "" {
		lv = "intermediate"
	}
	mapping := ActivityCompetency{
		ActivityID:   aID,
		CompetencyID: cID,
		Level:        lv,
	}
	return database.DB.Save(&mapping).Error
}

func unmapActivityCompetency(activityID, competencyID string) error {
	res := database.DB.
		Where("activity_id = ? AND competency_id = ?", activityID, competencyID).
		Delete(&ActivityCompetency{})
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// ── Program Templates ────────────────────────────────────────────────

func listTemplates(orgID string) ([]ProgramTemplate, error) {
	var rows []ProgramTemplate
	err := database.DB.
		Where("is_system = TRUE OR org_id = ?", orgID).
		Order("is_system DESC, title").
		Find(&rows).Error
	return rows, err
}
