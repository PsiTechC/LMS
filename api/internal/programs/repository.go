package programs

import (
	"errors"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("not found")

// ── Programs ──────────────────────────────────────────────────────

func listProgramsByOrg(orgID string) ([]Program, error) {
	var programs []Program
	err := database.DB.
		Where("org_id = ?", orgID).
		Order("created_at desc").
		Find(&programs).Error
	return programs, err
}

func listAllPrograms() ([]Program, error) {
	var programs []Program
	err := database.DB.Order("created_at desc").Find(&programs).Error
	return programs, err
}

func listActivePrograms() ([]Program, error) {
	var programs []Program
	err := database.DB.
		Where("status IN ('active','upcoming')").
		Order("created_at desc").
		Find(&programs).Error
	return programs, err
}

func getProgramByID(id string) (*Program, error) {
	var p Program
	err := database.DB.Where("id = ?", id).First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &p, err
}

func getProgramWithPhases(id string) (*Program, error) {
	var p Program
	err := database.DB.
		Preload("Phases", func(db *gorm.DB) *gorm.DB {
			return db.Order("phase_number asc")
		}).
		Preload("Phases.Activities", func(db *gorm.DB) *gorm.DB {
			return db.Order("sort_order asc")
		}).
		Where("id = ?", id).First(&p).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &p, err
}

func createProgram(p *Program) error {
	return database.DB.Create(p).Error
}

func saveProgram(p *Program) error {
	return database.DB.Save(p).Error
}

func duplicateProgram(srcID string, newTitle string, createdBy string) (*Program, error) {
	src, err := getProgramWithPhases(srcID)
	if err != nil {
		return nil, err
	}
	newProg := &Program{
		OrgID:         src.OrgID,
		CreatedBy:     uuid.MustParse(createdBy),
		Title:         newTitle,
		Description:   src.Description,
		Status:        "draft",
		Color:         src.Color,
		DurationWeeks: src.DurationWeeks,
	}
	err = database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(newProg).Error; err != nil {
			return err
		}
		for _, ph := range src.Phases {
			newPhase := ProgramPhase{
				ProgramID:   newProg.ID,
				Title:       ph.Title,
				Description: ph.Description,
				PhaseNumber: ph.PhaseNumber,
				WeekLabel:   ph.WeekLabel,
				Color:       ph.Color,
			}
			if err := tx.Create(&newPhase).Error; err != nil {
				return err
			}
			for _, act := range ph.Activities {
				newAct := Activity{
					PhaseID:      newPhase.ID,
					Title:        act.Title,
					Description:  act.Description,
					Type:         act.Type,
					DeliveryMode: act.DeliveryMode,
					SortOrder:    act.SortOrder,
					DurationMins: act.DurationMins,
					DueDayOffset: act.DueDayOffset,
					IsMandatory:  act.IsMandatory,
					ConfigJSON:   act.ConfigJSON,
				}
				if err := tx.Create(&newAct).Error; err != nil {
					return err
				}
			}
		}
		return nil
	})
	return newProg, err
}

func countPhasesAndActivities(programID string) (int, int, error) {
	var phaseCount int64
	if err := database.DB.Model(&ProgramPhase{}).Where("program_id = ?", programID).Count(&phaseCount).Error; err != nil {
		return 0, 0, err
	}
	var actCount int64
	err := database.DB.Model(&Activity{}).
		Joins("JOIN program_phases ph ON ph.id = activities.phase_id").
		Where("ph.program_id = ?", programID).
		Count(&actCount).Error
	return int(phaseCount), int(actCount), err
}

// ── Phases ────────────────────────────────────────────────────────

func getPhaseByID(id string) (*ProgramPhase, error) {
	var ph ProgramPhase
	err := database.DB.Where("id = ?", id).First(&ph).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &ph, err
}

func createPhase(ph *ProgramPhase) error {
	return database.DB.Create(ph).Error
}

func savePhase(ph *ProgramPhase) error {
	return database.DB.Save(ph).Error
}

func deletePhase(id string) error {
	return database.DB.Where("id = ?", id).Delete(&ProgramPhase{}).Error
}

func reorderPhases(programID string, orderedIDs []string) error {
	return database.DB.Transaction(func(tx *gorm.DB) error {
		for i, id := range orderedIDs {
			if err := tx.Model(&ProgramPhase{}).
				Where("id = ? AND program_id = ?", id, programID).
				Update("phase_number", i).Error; err != nil {
				return err
			}
		}
		return nil
	})
}

// ── Activities ────────────────────────────────────────────────────

func getActivityByID(id string) (*Activity, error) {
	var a Activity
	err := database.DB.Where("id = ?", id).First(&a).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, ErrNotFound
	}
	return &a, err
}

func createActivity(a *Activity) error {
	return database.DB.Create(a).Error
}

func saveActivity(a *Activity) error {
	return database.DB.Save(a).Error
}

func deleteActivity(id string) error {
	return database.DB.Where("id = ?", id).Delete(&Activity{}).Error
}

func nextActivitySortOrder(phaseID string) (int, error) {
	var count int64
	err := database.DB.Model(&Activity{}).Where("phase_id = ?", phaseID).Count(&count).Error
	return int(count), err
}
