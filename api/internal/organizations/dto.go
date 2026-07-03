package organizations

type CreateOrgRequest struct {
	Name          string `json:"name"`
	Slug          string `json:"slug"`
	Industry      string `json:"industry"`
	Size          string `json:"size"`
	Plan          string `json:"plan"`
	Seats         int    `json:"seats"`
	AdminName     string `json:"admin_name"`
	AdminEmail    string `json:"admin_email"`
	AdminPhone    string `json:"admin_phone"`
	AdminPassword string `json:"admin_password"`
}

type OrgResponse struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Slug     string `json:"slug"`
	Plan     string `json:"plan"`
	Status   string `json:"status"`
	Seats    int    `json:"seats"`
	Industry string `json:"industry,omitempty"`
	Size     string `json:"size,omitempty"`
}

type CreateOrgResponse struct {
	Organization OrgResponse `json:"organization"`
	AdminUserID  string      `json:"admin_user_id"`
}

type UpdateOrgRequest struct {
	Name     string `json:"name"`
	Plan     string `json:"plan"`
	Status   string `json:"status"`
	Seats    int    `json:"seats"`
	Industry string `json:"industry"`
	Size     string `json:"size"`
}

type BrandKitDTO struct {
	Primary  string `json:"primary"`
	Sidebar  string `json:"sidebar"`
	Accent   string `json:"accent"`
	Surface  string `json:"surface"`
	Text     string `json:"text"`
	Font     string `json:"font"`
	LogoText string `json:"logo_text"`
	LogoURL  string `json:"logo_url"`
}

type UpdateBrandKitRequest struct {
	Primary  *string `json:"primary,omitempty"`
	Sidebar  *string `json:"sidebar,omitempty"`
	Accent   *string `json:"accent,omitempty"`
	Surface  *string `json:"surface,omitempty"`
	Text     *string `json:"text,omitempty"`
	Font     *string `json:"font,omitempty"`
	LogoText *string `json:"logo_text,omitempty"`
	LogoURL  *string `json:"logo_url,omitempty"`
}
