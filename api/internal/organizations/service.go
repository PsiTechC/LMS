package organizations

import (
	"errors"
	"strings"

	"github.com/xa-lms/api/internal/auth"
	"github.com/xa-lms/api/pkg/database"
	"gorm.io/gorm"
)

func listOrgsService() ([]OrgResponse, error) {
	orgs, err := listOrgs()
	if err != nil {
		return nil, err
	}
	result := make([]OrgResponse, 0, len(orgs))
	for _, o := range orgs {
		result = append(result, orgToDTO(o))
	}
	return result, nil
}

func createOrgService(req CreateOrgRequest) (*CreateOrgResponse, error) {
	if strings.TrimSpace(req.Name) == "" {
		return nil, errors.New("organization name is required")
	}
	if strings.TrimSpace(req.Slug) == "" {
		return nil, errors.New("slug is required")
	}
	if strings.TrimSpace(req.AdminName) == "" {
		return nil, errors.New("admin name is required")
	}
	if strings.TrimSpace(req.AdminEmail) == "" {
		return nil, errors.New("admin email is required")
	}
	if strings.TrimSpace(req.AdminPassword) == "" {
		return nil, errors.New("admin password is required")
	}

	slug := strings.ToLower(strings.TrimSpace(req.Slug))
	taken, err := slugExists(slug)
	if err != nil {
		return nil, err
	}
	if taken {
		return nil, ErrSlugTaken
	}

	plan := req.Plan
	if plan == "" {
		plan = "starter"
	}
	seats := req.Seats
	if seats <= 0 {
		seats = 50
	}

	var industry, size *string
	if req.Industry != "" {
		v := req.Industry
		industry = &v
	}
	if req.Size != "" {
		v := req.Size
		size = &v
	}

	org := &Organization{
		Name:     req.Name,
		Slug:     slug,
		Plan:     plan,
		Status:   "active",
		Seats:    seats,
		Industry: industry,
		Size:     size,
	}

	hash, err := auth.HashPassword(req.AdminPassword)
	if err != nil {
		return nil, err
	}

	adminUser := &auth.User{
		Email:        req.AdminEmail,
		Name:         req.AdminName,
		PasswordHash: hash,
		Role:         "program_manager",
		IsActive:     true,
	}

	if err := database.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(org).Error; err != nil {
			return err
		}
		if err := tx.Create(adminUser).Error; err != nil {
			return err
		}
		member := &OrgMember{
			OrgID:  org.ID,
			UserID: adminUser.ID,
			Role:   "admin",
		}
		return tx.Create(member).Error
	}); err != nil {
		return nil, err
	}

	return &CreateOrgResponse{
		Organization: orgToDTO(*org),
		AdminUserID:  adminUser.ID.String(),
	}, nil
}

func updateOrgService(id string, req UpdateOrgRequest) (*OrgResponse, error) {
	fields := map[string]any{}
	if req.Name != "" {
		fields["name"] = req.Name
	}
	if req.Plan != "" {
		fields["plan"] = req.Plan
	}
	if req.Status != "" {
		fields["status"] = req.Status
	}
	if req.Seats > 0 {
		fields["seats"] = req.Seats
	}
	if req.Industry != "" {
		fields["industry"] = req.Industry
	}
	if req.Size != "" {
		fields["size"] = req.Size
	}
	if len(fields) == 0 {
		return nil, errors.New("no fields to update")
	}
	if err := updateOrg(id, fields); err != nil {
		return nil, err
	}
	org, err := getOrgByID(id)
	if err != nil {
		return nil, err
	}
	dto := orgToDTO(*org)
	return &dto, nil
}

func orgToDTO(o Organization) OrgResponse {
	r := OrgResponse{
		ID:     o.ID.String(),
		Name:   o.Name,
		Slug:   o.Slug,
		Plan:   o.Plan,
		Status: o.Status,
		Seats:  o.Seats,
	}
	if o.Industry != nil {
		r.Industry = *o.Industry
	}
	if o.Size != nil {
		r.Size = *o.Size
	}
	return r
}
