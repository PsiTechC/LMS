package organizations

import (
	"errors"

	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("organization not found")
var ErrSlugTaken = errors.New("slug already in use")

func listOrgs() ([]Organization, error) {
	var orgs []Organization
	if err := database.DB.Order("created_at desc").Find(&orgs).Error; err != nil {
		return nil, err
	}
	return orgs, nil
}

func getOrgByID(id string) (*Organization, error) {
	var org Organization
	if err := database.DB.Where("id = ?", id).First(&org).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	return &org, nil
}

func slugExists(slug string) (bool, error) {
	var count int64
	if err := database.DB.Model(&Organization{}).Where("slug = ?", slug).Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func createOrg(org *Organization) error {
	return database.DB.Create(org).Error
}

func createOrgMember(m *OrgMember) error {
	return database.DB.Create(m).Error
}
