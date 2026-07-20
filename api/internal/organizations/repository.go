package organizations

import (
	"errors"

	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

var ErrNotFound = errors.New("organization not found")
var ErrSlugTaken = errors.New("slug already in use")
var ErrEmailTaken = errors.New("a user with this email already exists")
var ErrOrgNameTaken = errors.New("an organization with this name already exists")

// ValidationError wraps a hand-authored, safe-to-display validation message -
// distinct from opaque DB/driver errors, which must never reach the client
// (see handler.go's isValidationErr / the "no raw error into HTTP body" rule
// in the repo's security guardrails).
type ValidationError struct{ msg string }

func (e *ValidationError) Error() string { return e.msg }

func NewValidationError(msg string) error { return &ValidationError{msg: msg} }

func IsValidationError(err error) bool {
	var ve *ValidationError
	return errors.As(err, &ve)
}

func adminEmailExists(email string) (bool, error) {
	var count int64
	if err := database.DB.Table("users").Where("email = ?", email).Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

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

func orgNameExists(name string) (bool, error) {
	var count int64
	if err := database.DB.Model(&Organization{}).Where("LOWER(name) = LOWER(?)", name).Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func createOrg(org *Organization) error {
	return database.DB.Create(org).Error
}

func deleteOrganization(id string) error {
	return database.DB.Where("id = ?", id).Delete(&Organization{}).Error
}

func createOrgMember(m *OrgMember) error {
	return database.DB.Create(m).Error
}

func updateOrg(id string, fields map[string]any) error {
	res := database.DB.Model(&Organization{}).Where("id = ?", id).Updates(fields)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}

// getPrimaryPMName resolves a single org's Primary PM display name, for the
// single-org response paths (get/create/update). Returns "" (not an error)
// when the org has no is_primary_pm=true assignment yet.
func getPrimaryPMName(orgID string) (string, error) {
	var name string
	err := database.DB.Raw(`
		SELECT u.name FROM role_assignments ra
		JOIN users u ON u.id = ra.user_id
		WHERE ra.org_id = ? AND ra.is_primary_pm = TRUE
		LIMIT 1`, orgID).Scan(&name).Error
	return name, err
}

// listPrimaryPMNames batch-resolves Primary PM names for every org in
// orgIDs in a single query, avoiding an N+1 per-org lookup on the
// Organizations list/Billing table. Orgs with no Primary PM simply have no
// entry in the returned map.
func listPrimaryPMNames(orgIDs []string) (map[string]string, error) {
	out := map[string]string{}
	if len(orgIDs) == 0 {
		return out, nil
	}
	type row struct {
		OrgID string
		Name  string
	}
	var rows []row
	err := database.DB.Raw(`
		SELECT ra.org_id::text AS org_id, u.name AS name
		FROM role_assignments ra
		JOIN users u ON u.id = ra.user_id
		WHERE ra.org_id IN ? AND ra.is_primary_pm = TRUE`, orgIDs).Scan(&rows).Error
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		out[r.OrgID] = r.Name
	}
	return out, nil
}

func getOrgIDForUser(userID string) (string, error) {
	var orgID string
	err := database.DB.Table("org_members").Select("org_id::text").Where("user_id = ?", userID).Limit(1).Scan(&orgID).Error
	if err != nil {
		return "", err
	}
	if orgID == "" {
		return "", ErrNotFound
	}
	return orgID, nil
}

func updateOrgSettings(id string, settings []byte) error {
	res := database.DB.Model(&Organization{}).Where("id = ?", id).Update("settings", settings)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		return ErrNotFound
	}
	return nil
}
