package organizations

import (
	"encoding/json"
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

func getCurrentBrandKitService(userID string) (*BrandKitDTO, error) {
	orgID, err := getOrgIDForUser(userID)
	if err != nil {
		return defaultBrandKit("XA LMS"), nil
	}
	return getBrandKitService(orgID)
}

func getBrandKitService(orgID string) (*BrandKitDTO, error) {
	org, err := getOrgByID(orgID)
	if err != nil {
		return nil, err
	}
	brand := brandKitFromOrg(*org)
	return &brand, nil
}

func updateBrandKitService(orgID string, req UpdateBrandKitRequest) (*BrandKitDTO, error) {
	org, err := getOrgByID(orgID)
	if err != nil {
		return nil, err
	}
	brand := brandKitFromOrg(*org)
	if req.Primary != nil {
		brand.Primary = strings.TrimSpace(*req.Primary)
	}
	if req.Sidebar != nil {
		brand.Sidebar = strings.TrimSpace(*req.Sidebar)
	}
	if req.Accent != nil {
		brand.Accent = strings.TrimSpace(*req.Accent)
	}
	if req.Surface != nil {
		brand.Surface = strings.TrimSpace(*req.Surface)
	}
	if req.Text != nil {
		brand.Text = strings.TrimSpace(*req.Text)
	}
	if req.Font != nil {
		brand.Font = normalizeBrandFont(*req.Font)
	}
	if req.LogoText != nil {
		brand.LogoText = strings.TrimSpace(*req.LogoText)
	}
	if req.LogoURL != nil {
		brand.LogoURL = strings.TrimSpace(*req.LogoURL)
	}
	if err := validateBrandKit(brand); err != nil {
		return nil, err
	}
	settings := map[string]any{}
	if len(org.Settings) > 0 {
		_ = json.Unmarshal(org.Settings, &settings)
	}
	settings["brand_kit"] = brand
	settingsJSON, err := json.Marshal(settings)
	if err != nil {
		return nil, err
	}
	if err := updateOrgSettings(orgID, settingsJSON); err != nil {
		return nil, err
	}
	return &brand, nil
}

func brandKitFromOrg(org Organization) BrandKitDTO {
	brand := *defaultBrandKit(org.Name)
	settings := map[string]json.RawMessage{}
	if len(org.Settings) > 0 && json.Unmarshal(org.Settings, &settings) == nil {
		if raw, ok := settings["brand_kit"]; ok {
			_ = json.Unmarshal(raw, &brand)
		}
	}
	if strings.TrimSpace(brand.LogoText) == "" {
		brand.LogoText = org.Name
	}
	brand.Font = normalizeBrandFont(brand.Font)
	return brand
}

func defaultBrandKit(name string) *BrandKitDTO {
	if strings.TrimSpace(name) == "" {
		name = "XA LMS"
	}
	return &BrandKitDTO{
		Primary:  "#EF4E24",
		Sidebar:  "#1C2551",
		Accent:   "#EF4E24",
		Surface:  "#F5F7FB",
		Text:     "#1C2551",
		Font:     "Poppins",
		LogoText: name,
		LogoURL:  "",
	}
}

func validateBrandKit(b BrandKitDTO) error {
	colors := map[string]string{
		"primary": b.Primary,
		"sidebar": b.Sidebar,
		"accent":  b.Accent,
		"surface": b.Surface,
		"text":    b.Text,
	}
	for field, value := range colors {
		if !isHexColor(value) {
			return errors.New(field + " must be a hex color")
		}
	}
	if strings.TrimSpace(b.LogoText) == "" {
		return errors.New("logo_text is required")
	}
	return nil
}

func isHexColor(s string) bool {
	if len(s) != 7 || s[0] != '#' {
		return false
	}
	for _, ch := range s[1:] {
		if !((ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f') || (ch >= 'A' && ch <= 'F')) {
			return false
		}
	}
	return true
}

func normalizeBrandFont(font string) string {
	switch strings.TrimSpace(font) {
	case "Inter", "Roboto", "Open Sans", "Montserrat", "Lato":
		return strings.TrimSpace(font)
	default:
		return "Poppins"
	}
}
