package users

import (
	"errors"

	"github.com/google/uuid"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("user not found")

func listAll(role, orgID string, offset, limit int) ([]User, int64, error) {
	db := database.DB.Model(&User{})
	if role != "" {
		db = db.Where("role = ?", role)
	}
	if orgID != "" {
		parsed, err := uuid.Parse(orgID)
		if err != nil {
			return nil, 0, errors.New("invalid org_id")
		}
		db = db.Where("id IN (SELECT user_id FROM org_members WHERE org_id = ?)", parsed)
	}
	var total int64
	db.Count(&total)
	var users []User
	err := db.Order("created_at desc").Offset(offset).Limit(limit).Find(&users).Error
	return users, total, err
}

func listByOrg(orgID uuid.UUID, role string, offset, limit int) ([]User, int64, error) {
	db := database.DB.Model(&User{}).
		Where("id IN (SELECT user_id FROM org_members WHERE org_id = ?)", orgID)
	if role != "" {
		db = db.Where("role = ?", role)
	}
	var total int64
	db.Count(&total)
	var users []User
	err := db.Order("created_at desc").Offset(offset).Limit(limit).Find(&users).Error
	return users, total, err
}

func getByID(id string) (*User, error) {
	var u User
	if err := database.DB.Where("id = ?", id).First(&u).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &u, nil
}

func updateUser(id string, fields map[string]any) error {
	res := database.DB.Model(&User{}).Where("id = ?", id).Updates(fields)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// getOrgIDForUser returns the org_id for a user's primary org membership.
// Returns nil (no error) if the user has no org membership.
func getOrgIDForUser(userID string) (*uuid.UUID, error) {
	var row struct {
		OrgID uuid.UUID
	}
	err := database.DB.Table("org_members").
		Select("org_id").
		Where("user_id = ?", userID).
		First(&row).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &row.OrgID, nil
}
